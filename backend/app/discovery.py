"""Bounded NewsAPI discovery with auditable, conservative relevance heuristics."""
import logging
import os
import re
from collections import Counter
from datetime import datetime
from difflib import SequenceMatcher
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from pydantic import ValidationError
from .models import Article, Source

logger = logging.getLogger('uvicorn.error')
STOP = set('a an the and or not to of in on for at by with from as is are was were be been this that it its says said new latest live updates news after over amid how why what more into about'.split())
EVENTS = {
    'approve': {'approve','approves','approved','approval','pass','passes','passed'},
    'protest': {'protest','protests','protesting','demonstrators','demonstrations'},
    'launch': {'launch','launches','launched','launching','debut'},
    'election': {'election','elections','vote','votes','voting','elected'},
    'quake': {'earthquake','quake','tremor'},
    'crash': {'crash','crashes','crashed','collision'},
    'deal': {'deal','agreement','merger','acquisition','acquire','acquires'},
    'announce': {'announce','announces','announced','announcement','unveil','unveils','unveiled'},
    'rate': {'rate','rates','interest'},
    'cut': {'cut','cuts','cutting','reduce','reduces','reduction'},
    'win': {'win','wins','won','victory','defeat','defeats'},
    'ruling': {'ruling','rules','ruled','court','judgment'},
}
ALIASES = {word: event for event, words in EVENTS.items() for word in words}

def tokens(text):
    return {ALIASES.get(w, w) for w in re.findall(r'[a-z0-9]+', text.casefold()) if len(w)>2 and w not in STOP}

def canonical_url(value):
    p = urlsplit(str(value))
    if p.scheme not in ('http','https') or not p.hostname or p.username or p.password:
        raise ValueError('invalid URL')
    host = p.hostname.casefold().removeprefix('www.')
    port = p.port
    if port not in (None,80,443):
        raise ValueError('unsupported port')
    query = sorted((k,v) for k,v in parse_qsl(p.query) if not k.casefold().startswith('utm_') and k.casefold() not in {'fbclid','gclid','ref','output','amp'})
    path = p.path.rstrip('/') or '/'
    if path.endswith('/amp'): path=path[:-4] or '/'
    return urlunsplit(('https',host,path,urlencode(query),''))

def publisher_key(source):
    host = urlsplit(str(source.url)).hostname or ''
    parts = host.casefold().split('.')
    # Lightweight approximation; not a media-ownership database.
    size = 3 if len(parts)>2 and '.'.join(parts[-2:]) in {'co.uk','com.au','co.in','co.jp'} else 2
    return '.'.join(parts[-size:])

def safe(value):
    text = str(value)
    for key in ('NEWS_API_KEY','OPENAI_API_KEY'):
        secret=os.getenv(key)
        if secret: text=text.replace(secret,'[redacted]')
    return text[:400]

class NewsAPIError(Exception):
    def __init__(self, status, code, provider_message=''):
        self.status=status
        self.code=re.sub(r'[^A-Za-z0-9_-]','',safe(code))[:60] or 'unknown'
        if self.code in {'apiKeyMissing','apiKeyInvalid','apiKeyDisabled'} or status==401:
            message='NewsAPI authentication failed. Check NEWS_API_KEY and its account status.'
        elif self.code=='apiKeyExhausted':
            message='NewsAPI request quota is exhausted. Wait for your quota reset or check your NewsAPI account.'
        elif self.code=='rateLimited' or status==429:
            message='NewsAPI is rate limiting requests. Wait before retrying.'
        elif status==403 or self.code in {'parameterInvalid','maximumResultsReached','planRestricted','upgradeRequired'}:
            message='NewsAPI denied this search. Check your account plan, permitted date history, and /v2/everything access.'
        elif status==426:
            message='NewsAPI requires an account upgrade or different permitted usage for this request. Check your plan.'
        elif self.code=='networkError':
            message='NewsAPI could not be reached. Check backend network access and retry.'
        else:
            message='NewsAPI could not complete the search. Check the server diagnostic status and your account.'
        self.public_message=f'{message} (NewsAPI: {self.code}; HTTP {status})'
        if provider_message: self.public_message+=' '+safe(provider_message)
        super().__init__(self.public_message)

class Discovery(list):
    def __init__(self, sources=(), broader=(), diagnostics=None):
        super().__init__(sources)
        self.broader=list(broader)
        self.diagnostics=diagnostics

async def search(http, query):
    try:
        response=await http.get('https://newsapi.org/v2/everything',params={
            'q':query,'language':'en','sortBy':'relevancy','pageSize':50},headers={'X-Api-Key':os.environ['NEWS_API_KEY']})
    except httpx.HTTPError as exc:
        logger.warning('NewsAPI network failure query=%r',safe(query))
        raise NewsAPIError(0,'networkError') from exc
    try: payload=response.json()
    except ValueError: payload={}
    code=payload.get('code','httpError') if isinstance(payload,dict) else 'invalidResponse'
    if not response.is_success or not isinstance(payload,dict) or payload.get('status')!='ok':
        error=NewsAPIError(response.status_code,code,payload.get('message','') if isinstance(payload,dict) else '')
        logger.warning('NewsAPI query=%r status=%s error=%s detail=%s',safe(query),response.status_code,safe(error.code),safe(error.public_message))
        raise error
    articles=payload.get('articles')
    if not isinstance(articles,list): raise NewsAPIError(response.status_code,'invalidResponse')
    logger.info('NewsAPI query=%r status=%s raw_count=%s total_results=%s',safe(query),response.status_code,len(articles),safe(payload.get('totalResults')))
    return articles,response.status_code

def queries(query, title):
    # Never forward an entire generated headline, boolean expression, or quoted sentence.
    words=[]
    for word in re.findall(r'[\w-]+',query,flags=re.UNICODE):
        if word.casefold() not in STOP and len(word)>1 and word.casefold() not in [w.casefold() for w in words]: words.append(word)
    if len(words)<2:
        words=[w for w in re.findall(r'[\w-]+',title) if w.casefold() not in STOP][:6]
    words=words[:6]
    if len(words)<2: return []
    plans=[words,words[:max(2,len(words)-2)],words[:2]]
    return list(dict.fromkeys(' AND '.join(plan) for plan in plans))[:3]

def date_distance(a,b):
    try: return abs((datetime.fromisoformat(a.replace('Z','+00:00')).date()-datetime.fromisoformat(b.replace('Z','+00:00')).date()).days)
    except (ValueError,TypeError): return None

def relevance(original, candidate, query):
    title=tokens(original.title); other=tokens(candidate.title); snippet=tokens(candidate.text)
    overlap=title & other
    query_terms=tokens(query)
    entities=tokens(' '.join(re.findall(r'\b[A-Z][\w-]{2,}\b',original.title)))
    entity_matches=entities & other
    event_matches=(title & set(EVENTS)) & (other|snippet)
    title_ratio=len(overlap)/max(1,min(len(title),8))
    query_ratio=len(query_terms & (other|snippet))/max(1,len(query_terms))
    score=.55*title_ratio+.25*query_ratio+.15*len(entity_matches)/max(1,len(entities))
    distance=date_distance(original.date,candidate.date)
    if distance is not None: score+=.05 if distance<=7 else (-.2 if distance>14 else 0)
    similar=SequenceMatcher(None,original.title.casefold(),candidate.title.casefold()).ratio()
    same=(score>=.30 and len(overlap)>=2 and (bool(event_matches and entity_matches) or len(overlap)>=3 and query_ratio>=.3)) or similar>=.78
    context_overlap=tokens(original.text[:6000]) & snippet
    continuing=bool(tokens(original.title+' '+original.text[:3000]) & {'ongoing','continues','continuing','renew','renewed'})
    context_entities=entities & (other|snippet)
    continuing_match=continuing and bool(event_matches) and len(context_entities)>=1 and len(context_overlap)>=4
    contextual_match=continuing_match and query_ratio>=.6 and len(context_overlap)>=5
    if continuing_match and distance is not None and distance<=90 and (score>=.25 or contextual_match): same=True
    if distance is not None and distance>180: same=False
    # Nearby headlines can still be different events/angles (polls, background, chatbot stories).
    background_words={'history','historical','survey','poll','chatbots','chatbot','opinion'}
    if (other & background_words) - title: same=False
    if distance is not None and distance>3 and len(overlap)<=3 and similar<.78 and not continuing_match: same=False
    if same: return 'same_event',round(score,3)
    if len(title & (other|snippet))>=2 or entity_matches and query_ratio>=.3: return 'broader_topic',round(score,3)
    return 'irrelevant',round(score,3)

def ranked_unique(candidates, original, limit):
    ranked=sorted(candidates,key=lambda item:item[1],reverse=True)
    original_key=publisher_key(original)
    original_name=original.publisher.casefold().strip()
    independent=[]; remaining=[]; publishers=set(); names=set()
    for source,score in ranked:
        domain=publisher_key(source); name=source.publisher.casefold().strip()
        same_publisher=domain==original_key or bool(original_name and name==original_name)
        source.same_publisher=same_publisher
        if not same_publisher and domain not in publishers and name not in names:
            independent.append(source);publishers.add(domain);names.add(name)
        else: remaining.append(source)
    return (independent+remaining)[:limit]

async def discover_news(article, query, http, max_queries=3):
    seen={canonical_url(article.url)}; same=[]; broader=[]; attempts=[]
    for query_string in queries(query,article.title)[:max(1,min(3,max_queries))]:
        raw,status=await search(http,query_string)
        rejected=Counter(); decisions=[]
        for item in raw:
            reason='invalid_metadata'; score=0
            try:
                if not isinstance(item,dict): raise ValueError('invalid metadata')
                url=canonical_url(item.get('url',''))
                title=item.get('title')
                if not isinstance(title,str) or title=='[Removed]': raise ValueError('missing title')
                if url in seen:
                    rejected['original_or_duplicate_url']+=1;continue
                source_info=item.get('source') or {}
                source=Source(id=f's{len(seen)}',title=title,url=item['url'],
                    publisher=source_info.get('name') or (urlsplit(item['url']).hostname or ''),
                    date=item.get('publishedAt') or '',text=(item.get('description') or item.get('content') or '')[:3000])
                seen.add(url)
                reason,score=relevance(article,source,query)
                if reason=='same_event': same.append((source,score))
                elif reason=='broader_topic': broader.append((source,score));rejected['broader_topic']+=1
                else: rejected[reason]+=1
                decisions.append({'source_id':source.id,'classification':reason,'score':score})
            except (ValueError,TypeError,AttributeError,ValidationError): rejected['invalid_metadata']+=1
        selected=ranked_unique(same,article,5)
        logger.info('NewsAPI accepted_count=%s broader_count=%s rejected_reasons=%s',len(selected),len(broader),dict(rejected))
        attempts.append({'query':safe(query_string),'http_status':status,'raw_count':len(raw),'accepted_count':len(selected),'rejected_reasons':dict(rejected),'candidates':decisions})
        # Enough independent publications: stop consuming NewsAPI quota.
        if len({publisher_key(s) for s in selected if not s.same_publisher})>=3: break
    diagnostics={'attempts':attempts,'accepted_count':len(ranked_unique(same,article,5))} if os.getenv('APP_ENV')=='development' and os.getenv('DISCOVERY_DIAGNOSTICS')=='1' else None
    return Discovery(ranked_unique(same,article,5),ranked_unique(broader,article,5),diagnostics)
