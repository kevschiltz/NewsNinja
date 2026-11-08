"""Provider-mocked regression tests: no API charges."""
import asyncio
import httpx
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app import service
from app.models import Article,ArticleAnalysis,Report,Draft,Finding,Evidence,Source,SourceSummary
from app.discovery import Discovery

TEXT='The council approved twenty electric buses on Monday. The pilot will cost twelve million dollars. Workers requested driver training before launch. '
ARTICLE=Article(title='Council approves electric bus pilot',url='https://original.example/buses',text=TEXT*3)
def finding(source='original',quote='The council approved twenty electric buses on Monday.'):
    return Finding(title='Reported decision',detail='The article reports approval of a twenty-bus pilot.',evidence=[Evidence(source_id=source,quote=quote)])
def basic():
    return ArticleAnalysis(summary=[finding()],takeaways=[finding()],entities=[finding()],claims=[finding()],language=[],uncertainties=[])
def source(id):
    return Source(id=id,title='Electric bus pilot approved by council',url=f'https://{id}.example/buses',text=TEXT)

@pytest.fixture(autouse=True)
def environment(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY','test');monkeypatch.setenv('NEWS_API_KEY','test');service._CACHE.clear()

def setup(monkeypatch,same=(),background=(),fail=None,empty=False):
    calls=[]
    async def discover(article,client,http):return Discovery(list(same),list(background))
    async def structured(client,schema,instruction,data):
        calls.append(data)
        assert schema is Draft
        if fail: raise fail
        comparisons=[] if empty or not same else [finding(same[0].id)]
        context=[finding(background[0].id)] if background else []
        report=Report(original_analysis=basic(),overview=comparisons,missing=[],additional_context=comparisons,comparisons=comparisons,bigger_picture=context)
        return Draft(report=report,summaries=[SourceSummary(source_id=s.id,summary='Reports a bus pilot.') for s in [*same,*background]])
    monkeypatch.setattr(service,'discover',discover);monkeypatch.setattr(service,'structured',structured)
    return calls

def test_a_single_article_has_summary_without_alternatives(monkeypatch):
    calls=setup(monkeypatch)
    sources,report=asyncio.run(service.analyze(ARTICLE))
    assert not sources and report.original_analysis.summary and report.original_analysis.claims
    assert len(calls)==1 and calls[0]['same_event']==[] and calls[0]['broader_background']==[]

def test_b_same_event_comparison_and_additional_context(monkeypatch):
    calls=setup(monkeypatch,same=[source('s1'),source('s2')])
    sources,report=asyncio.run(service.analyze(ARTICLE))
    assert len(sources)==2 and report.overview and report.comparisons and report.additional_context
    assert report.original_analysis.summary and len(calls)==1

def test_c_background_contributes_context_not_omissions(monkeypatch):
    calls=setup(monkeypatch,background=[source('b1')])
    sources,report=asyncio.run(service.analyze(ARTICLE))
    assert not sources and len(sources.broader)==1
    assert report.original_analysis.summary and report.bigger_picture and not report.missing and not report.comparisons
    assert calls[0]['broader_background'][0]['id']=='b1'
    assert calls[0]['original']['excerpts'] and 'text' not in calls[0]['original']
    assert sources.broader[0].summary=='Reports a bus pilot.'

def test_d_failed_openai_is_api_error_not_empty_success(monkeypatch):
    calls=setup(monkeypatch,fail=RuntimeError('Provider unavailable'))
    response=TestClient(app).post('/analyze',json={'article':ARTICLE.model_dump(mode='json')})
    assert response.status_code==502 and 'report' not in response.json() and len(calls)==1

def test_e_empty_comparisons_do_not_erase_original_summary(monkeypatch):
    setup(monkeypatch,same=[source('s1')],empty=True)
    _,report=asyncio.run(service.analyze(ARTICLE))
    assert not report.comparisons and report.original_analysis.summary

def test_f_malformed_ai_is_not_silent_empty_success(monkeypatch):
    async def bad(*args):return Draft.model_validate({'report':{'overview':'not a findings list'}})
    setup(monkeypatch);monkeypatch.setattr(service,'structured',bad)
    response=TestClient(app).post('/analyze',json={'article':ARTICLE.model_dump(mode='json')})
    assert response.status_code==502 and not service._CACHE

def test_cached_completion_needs_no_second_paid_call(monkeypatch):
    calls=setup(monkeypatch)
    asyncio.run(service.analyze(ARTICLE));asyncio.run(service.analyze(ARTICLE))
    assert len(calls)==1
    changed=ARTICLE.model_copy(update={'text':ARTICLE.text+' A later update.'})
    asyncio.run(service.analyze(changed));assert len(calls)==2

def test_evidence_source_classes_and_original_only_fields():
    report=Report(original_analysis=basic(),overview=[finding('b1')],missing=[finding('s1')],additional_context=[finding('b1')],comparisons=[finding('b1')],bigger_picture=[finding('b1')])
    report.original_analysis.claims=[finding('s1')]
    cleaned=service.validate_evidence(report,[Source(**ARTICLE.model_dump(),id='original'),source('s1'),source('b1')],{'s1'})
    assert cleaned.original_analysis.summary and not cleaned.original_analysis.claims
    assert not cleaned.overview and not cleaned.missing and not cleaned.additional_context and not cleaned.comparisons
    assert cleaned.bigger_picture

def test_continuing_event_does_not_fail_only_for_earlier_publication():
    from app.discovery import relevance
    original=Article(title='Paris police protests continue despite orders',url='https://original.example/paris',date='2026-11-07',text='Ongoing Paris police protests against government bans continue. Protesters demonstrate against government bans.')
    candidate=Source(id='s1',title='Paris protests continue as police enforce government bans',url='https://other.example/paris',date='2026-10-10',text='Ongoing Paris police protests against government bans continue.')
    assert relevance(original,candidate,'Paris police protests')[0]=='same_event'

def test_missing_news_key_still_allows_original_summary(monkeypatch):
    setup(monkeypatch);monkeypatch.delenv('NEWS_API_KEY',raising=False)
    response=TestClient(app).post('/analyze',json={'article':ARTICLE.model_dump(mode='json')})
    assert response.status_code==200
    assert response.json()['report']['original_analysis']['summary']
    assert any('NewsAPI authentication' in message for message in response.json()['limitations'])


def test_numbered_excerpt_is_resolved_to_exact_source_text():
    original=Source(**ARTICLE.model_dump(),id='original')
    report=Report(original_analysis=basic(),overview=[],missing=[],comparisons=[],bigger_picture=[])
    report.original_analysis.summary[0].evidence=[Evidence(source_id='original',excerpt_id='e1',quote='')]
    exact='The council approved twenty electric buses on Monday.'
    validated=service.validate_evidence(report,[original],set(),{('original','e1'):exact})
    assert validated.original_analysis.summary[0].evidence[0].quote==exact
    report.original_analysis.summary[0].evidence[0].excerpt_id='invented'
    assert not service.validate_evidence(report,[original],set(),{('original','e1'):exact}).original_analysis.summary
