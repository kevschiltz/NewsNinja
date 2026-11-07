import asyncio
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.models import Report, Source, Finding, Evidence
from app.service import validate_evidence, public_url, extract

ARTICLE = {'title':'A specific news event', 'url':'https://example.org/news', 'text':'A reported event with enough article text. ' * 10}

def test_health_and_missing_keys(monkeypatch):
    monkeypatch.delenv('OPENAI_API_KEY', raising=False)
    monkeypatch.delenv('NEWS_API_KEY', raising=False)
    client = TestClient(app)
    assert client.get('/health').json()['configured'] is False
    assert client.post('/analyze', json={'article':ARTICLE}).status_code == 503

def test_unsupported_evidence_is_removed():
    source = Source(id='s1',title='Source headline',url='https://example.org',text='The budget is twelve million dollars.')
    good = Finding(title='Budget',detail='Reported cost',evidence=[Evidence(source_id='s1',quote='The budget is twelve million dollars.')])
    bad = Finding(title='False',detail='Fabrication',evidence=[Evidence(source_id='s1',quote='The budget is twenty million dollars.')])
    unknown = Finding(title='Unknown',detail='Unknown',evidence=[Evidence(source_id='fake',quote='A nonexistent source quotation')])
    report = Report(overview=[good,bad,unknown],missing=[],comparisons=[],bigger_picture=[])
    assert len(validate_evidence(report,[source]).overview) == 1

@pytest.mark.parametrize('url',['http://127.0.0.1/admin','http://169.254.169.254','file:///etc/passwd','http://[::1]/','https://user:pass@example.org'])
def test_private_urls_blocked(url):
    with pytest.raises(ValueError):
        asyncio.run(public_url(url))

def test_full_route_with_provider_mock(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','test')
    monkeypatch.setenv('NEWS_API_KEY','test')
    async def fake_analyze(article):
        return [], Report(overview=[],missing=[],comparisons=[],bigger_picture=[])
    monkeypatch.setattr('app.main.analyze',fake_analyze)
    response = TestClient(app).post('/analyze',json={'article':ARTICLE})
    assert response.status_code == 200
    body = response.json()
    assert body['mode']=='live'
    assert any('Only 0' in l for l in body['limitations'])

def test_short_and_invalid_article(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','test')
    monkeypatch.setenv('NEWS_API_KEY','test')
    client=TestClient(app)
    assert client.post('/analyze',json={'article':{**ARTICLE,'text':'short'}}).status_code==422
    assert client.post('/analyze',json={'article':{**ARTICLE,'url':'javascript:alert(1)'}}).status_code==422

def test_blocked_extraction_preserves_snippet(monkeypatch):
    async def allow(url): pass
    monkeypatch.setattr('app.service.public_url',allow)
    async def run():
        source=Source(id='s1',title='Headline',url='https://example.org',text='A snippet')
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request:httpx.Response(403))) as client:
            result=await extract(source,client)
            assert result.text=='A snippet'
            assert result.content_kind=='snippet'
    asyncio.run(run())

def test_discovery_to_report_pipeline(monkeypatch):
    from app.models import Article, Topic, Selection, Draft, SourceSummary
    from app import service
    monkeypatch.setenv('OPENAI_API_KEY','test')
    monkeypatch.setenv('NEWS_API_KEY','test')
    async def allow(url): pass
    monkeypatch.setattr(service,'public_url',allow)
    async def fake_structured(client,schema,instruction,data):
        if schema is Topic:
            return Topic(query='specific council vote')
        if schema is Selection:
            return Selection(source_ids=['s1','s2','s3','invented'])
        quote='The pilot includes twenty buses and a public review after two years.'
        return Draft(report=Report(overview=[Finding(title='The pilot',detail='Coverage discusses a pilot.',evidence=[Evidence(source_id='s1',quote=quote)])],missing=[],comparisons=[],bigger_picture=[]), summaries=[SourceSummary(source_id='s1',summary='The pilot includes twenty buses.')])
    monkeypatch.setattr(service,'structured',fake_structured)
    def transport(request):
        if request.url.host=='newsapi.org':
            return httpx.Response(200,json={'articles':[{'title':f'Council pilot report {i}','url':f'https://news{i}.example/story','description':'A pilot report.','source':{'name':f'News {i}'}} for i in range(1,5)]})
        return httpx.Response(200,headers={'content-type':'text/html'},text='<article>'+('<p>The pilot includes twenty buses and a public review after two years.</p>'*10)+'</article>')
    real_client=httpx.AsyncClient
    monkeypatch.setattr(service.httpx,'AsyncClient',lambda **kwargs:real_client(transport=httpx.MockTransport(transport),**kwargs))
    sources,report=asyncio.run(service.analyze(Article(**ARTICLE)))
    assert len(sources)==3
    assert all(s.content_kind=='extracted' for s in sources)
    assert sources[0].summary=='The pilot includes twenty buses.'
    assert len(report.overview)==1


def test_partial_invalid_citation_drops_entire_finding():
    source=Source(id='s1',title='Headline',url='https://example.org',text='A valid source quotation is present.')
    finding=Finding(title='Mixed',detail='A finding with mixed evidence',evidence=[Evidence(source_id='s1',quote=source.text),Evidence(source_id='fake',quote='Unretrieved source quotation')])
    report=Report(overview=[finding],missing=[],comparisons=[],bigger_picture=[])
    assert not validate_evidence(report,[source]).overview
