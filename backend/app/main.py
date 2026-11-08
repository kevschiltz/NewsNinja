import asyncio
import logging
import os
from dotenv import load_dotenv
load_dotenv()
from openai import RateLimitError
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .models import AnalyzeRequest, Analysis
from .service import analyze
from .discovery import NewsAPIError

app = FastAPI(title='NewsNinja', version='1.0.0')
app.add_middleware(CORSMiddleware, allow_origins=os.getenv('ALLOWED_ORIGINS', 'http://localhost:5173').split(','), allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])
semaphore = asyncio.Semaphore(3)

@app.get('/health')
def health():
    return {'status': 'ok', 'configured': bool(os.getenv('OPENAI_API_KEY') and os.getenv('NEWS_API_KEY'))}

@app.post('/analyze', response_model=Analysis)
async def analysis(request: AnalyzeRequest):
    if not os.getenv('OPENAI_API_KEY'):
        raise HTTPException(503, 'Set OPENAI_API_KEY in backend/.env, or use the labeled demo. NEWS_API_KEY additionally enables related coverage.')
    if len(request.article.text.strip()) < 200:
        raise HTTPException(422, 'Not enough article text. This page may be blocked, paywalled, or not an article.')
    try:
        async with semaphore:
            sources, report = await asyncio.wait_for(analyze(request.article), timeout=180)
        limitations = ['Extracted text may be incomplete. Additional coverage does not establish intentional bias.', 'Retrieved pages may contain only excerpts; inspect the original sources.']
        if getattr(sources,'discovery_error',None): limitations.append(sources.discovery_error)
        limitations.append('Potentially incomplete extraction cannot verify article-level omissions. Additional reporting appears in Compare Coverage.')
        if len(request.article.text)<700: limitations.append('Very little article text was extracted; the summary and takeaways may be limited.')
        if len(sources) < 3:
            limitations.append(f'Only {len(sources)} relevant alternative sources were available; findings are limited.')
        return Analysis(mode='live', article=request.article, sources=sources, report=report, limitations=limitations, broader_sources=getattr(sources,'broader',[]), discovery_diagnostics=getattr(sources,'diagnostics',None))
    except NewsAPIError as exc:
        raise HTTPException(429 if exc.status==429 else 502, exc.public_message) from exc
    except RateLimitError as exc:
        if exc.code in ('insufficient_quota', 'credit_balance_exhausted') or exc.type == 'insufficient_quota':
            raise HTTPException(503, 'OpenAI API credits are exhausted. Add credits at platform.openai.com/settings/organization/billing/ or use Load sample analysis for the free demo.') from exc
        raise HTTPException(429, 'OpenAI is temporarily rate limiting requests. Wait a moment and retry.') from exc
    except Exception as exc:
        logging.getLogger(__name__).error('Analysis failed: type=%s status=%s',type(exc).__name__,getattr(exc,'status_code',None))
        raise HTTPException(502, 'Analysis could not complete. Check backend logs, API credentials, quotas and network access, then retry.') from exc
