import asyncio
import logging
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models import Article
from app.discovery import discover_news, NewsAPIError, canonical_url, queries, relevance

ORIGINAL=Article(title='NASA launches Artemis II crewed mission around Moon',url='https://original.example/story',publisher='Original',date='2026-04-01',text='NASA launches Artemis II crewed mission around Moon. '*10)
def item(title='NASA launches Artemis II mission with crew around Moon',url='https://other.example/story',name='Other',date='2026-04-02'):
    return {'title':title,'url':url,'source':{'name':name},'publishedAt':date,'description':'NASA astronauts launch on Artemis II mission around Moon.'}
def discover(monkeypatch,pages):
    monkeypatch.setenv('NEWS_API_KEY','secret-not-for-logs');requests=[]
    async def run():
        def respond(request):
            requests.append(request);status,payload=pages[min(len(requests)-1,len(pages)-1)]
            return httpx.Response(status,json=payload)
        async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
            return await discover_news(ORIGINAL,'NASA Artemis II launch Moon',client)
    return asyncio.run(run()),requests

def test_success_stops_at_three_independent_sources(monkeypatch,caplog):
    with caplog.at_level(logging.INFO):
        found,requests=discover(monkeypatch,[(200,{'status':'ok','totalResults':3,'articles':[item(url=f'https://news{i}.example/story',name=f'News {i}') for i in range(3)]})])
    assert len(found)==3 and len(requests)==1
    assert 'secret-not-for-logs' not in caplog.text
    assert 'raw_count=3' in caplog.text and 'accepted_count=3' in caplog.text
    request=requests[0];assert request.url.path=='/v2/everything'
    assert request.headers['X-Api-Key']=='secret-not-for-logs' and 'apiKey' not in request.url.params
    assert dict(request.url.params)=={'q':'NASA AND Artemis AND II AND launch AND Moon','language':'en','sortBy':'relevancy','pageSize':'50'}

def test_empty_broadens_but_is_bounded(monkeypatch):
    found,requests=discover(monkeypatch,[(200,{'status':'ok','articles':[]})])
    assert not found and len(requests)==3
    assert len({r.url.params['q'] for r in requests})==3

def test_retry_after_empty_recovers_sources(monkeypatch):
    found,requests=discover(monkeypatch,[(200,{'status':'ok','articles':[]}),(200,{'status':'ok','articles':[item(url=f'https://n{i}.example/story',name=f'N{i}') for i in range(3)]})])
    assert len(found)==3 and len(requests)==2

@pytest.mark.parametrize('status,code,message',[(401,'apiKeyInvalid','authentication'),(403,'planRestricted','plan'),(429,'apiKeyExhausted','quota'),(429,'rateLimited','rate limiting'),(426,'upgradeRequired','plan'),(200,'apiKeyExhausted','quota'),(400,'parameterInvalid','plan')])
def test_errors_are_not_empty_results(monkeypatch,status,code,message):
    with pytest.raises(NewsAPIError,match=message): discover(monkeypatch,[(status,{'status':'error','code':code,'message':'Never echo secret-not-for-logs'})])

def test_deduplication_and_publisher_filtering_after_scoring(monkeypatch):
    unrelated=item(title='Coffee futures rise',url='https://other.example/unrelated');unrelated['description']='Brazil coffee prices.'
    found,_=discover(monkeypatch,[(200,{'status':'ok','articles':[
        item(url='http://www.original.example/story/?utm_source=mail#top'),unrelated,
        item(url='https://other.example/story?utm_campaign=feed'),item(url='http://www.other.example/story/#top'),
        item(url='https://third.example/story',name='Third'),item(url='https://fourth.example/story',name='Fourth')]})])
    assert len(found)==3 and len({canonical_url(s.url) for s in found})==3
    assert all('original.example' not in str(s.url) for s in found)
    assert any('other.example/story' in str(s.url) for s in found)

def test_irrelevant_and_background_separate(monkeypatch):
    unrelated=item(title='Banana prices rise in Brazil',url='https://unrelated.example/story');unrelated['description']='Brazil banana prices increase.'
    background=item(title='NASA Artemis history and future missions');background['description']='NASA Artemis history.'
    found,_=discover(monkeypatch,[(200,{'status':'ok','articles':[unrelated,background]})])
    assert not found and len(found.broader)==1

def test_distant_event_is_background(monkeypatch):
    found,_=discover(monkeypatch,[(200,{'status':'ok','articles':[item(date='2024-04-01')]})])
    assert not found and len(found.broader)==1

def test_diagnostics_development_only(monkeypatch):
    monkeypatch.setenv('APP_ENV','production');monkeypatch.setenv('DISCOVERY_DIAGNOSTICS','1')
    assert discover(monkeypatch,[(200,{'status':'ok','articles':[]})])[0].diagnostics is None
    monkeypatch.setenv('APP_ENV','development')
    found,_=discover(monkeypatch,[(200,{'status':'ok','articles':[item()]})])
    assert found.diagnostics['attempts'][0]['raw_count']==1

def test_invalid_metadata_keeps_valid_results(monkeypatch):
    found,_=discover(monkeypatch,[(200,{'status':'ok','articles':[None,{'url':'javascript:bad'},item()]})])
    assert len(found)==1

def test_error_reaches_frontend(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','test');monkeypatch.setenv('NEWS_API_KEY','test')
    async def fail(article):raise NewsAPIError(401,'apiKeyInvalid')
    monkeypatch.setattr('app.main.analyze',fail)
    response=TestClient(app).post('/analyze',json={'article':ORIGINAL.model_dump(mode='json')})
    assert response.status_code==502 and 'NewsAPI authentication' in response.json()['detail']
    assert 'sources' not in response.json()

def test_short_query_and_tracking():
    assert len(queries('NASA Artemis II launches crewed mission around the Moon news update','fallback')[0].split(' AND '))<=6
    assert canonical_url('http://www.example.org/story/?utm_source=x#top')=='https://example.org/story'

def test_paris_headline_paraphrase():
    from app.models import Source
    original=Article(title='Paris agitators defy police orders, renew nationwide protests centered in Paris',url='https://original.example/paris')
    alternative=Source(id='s1',title='French police confront demonstrators as protests spread across Paris',url='https://other.example/paris')
    assert relevance(original,alternative,'Paris protests police')[0]=='same_event'

def test_provider_message_is_actionable_and_redacted(monkeypatch):
    with pytest.raises(NewsAPIError) as caught:
        discover(monkeypatch,[(403,{'status':'error','code':'planRestricted','message':'History access forbidden: secret-not-for-logs'})])
    assert 'History access forbidden' in str(caught.value)
    assert 'secret-not-for-logs' not in str(caught.value)


def test_same_publisher_results_are_retained_but_labeled(monkeypatch):
    found,_=discover(monkeypatch,[(200,{'status':'ok','articles':[item(url='https://original.example/another-article',name='Original')]})])
    assert len(found)==1 and found[0].same_publisher

def test_live_smoke_regressions_do_not_promote_adjacent_stories():
    from app.models import Source
    original=Article(title="Americans head to the polls for elections that could define Trump's closing chapter",url='https://original.example/vote',date='2026-11-03')
    candidate=Source(id='s1',title='About 6 in 10 Americans confident election will be conducted fairly, accurately: Poll',url='https://other.example/poll',date='2026-10-20',text='Most Americans are not confident Trump will accept midterm results if GOP loses.')
    assert relevance(original,candidate,'Trump midterm elections')[0]=='broader_topic'
    original=Article(title='France gears up for strikes and protests as unions promise national mobilisation',url='https://original.example/strike',date='2026-11-05')
    candidate=Source(id='s2',title='Macron blames seditious far left for unrest as France bans some protests',url='https://other.example/bans',date='2026-10-22',text='Planned demonstrations are outlawed in Paris.')
    assert relevance(original,candidate,'France strikes protests')[0]=='broader_topic'
