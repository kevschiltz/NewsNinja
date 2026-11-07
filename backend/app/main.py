import asyncio
import logging
import os
from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from .models import AnalyzeRequest, Analysis
from .service import analyze

app = FastAPI(title='NewsNinja', version='1.0.0')
app.add_middleware(CORSMiddleware, allow_origins=os.getenv('ALLOWED_ORIGINS', 'http://localhost:5173').split(','), allow_methods=['GET', 'POST'], allow_headers=['Content-Type'])
semaphore = asyncio.Semaphore(3)

@app.get('/health')
def health():
    return {'status': 'ok', 'configured': bool(os.getenv('OPENAI_API_KEY') and os.getenv('NEWS_API_KEY'))}

@app.post('/analyze', response_model=Analysis)
async def analysis(request: AnalyzeRequest):
    if not os.getenv('OPENAI_API_KEY') or not os.getenv('NEWS_API_KEY'):
        raise HTTPException(503, 'Set OPENAI_API_KEY and NEWS_API_KEY in backend/.env, or use the labeled demo.')
    if len(request.article.text.strip()) < 200:
        raise HTTPException(422, 'Not enough article text. This page may be blocked, paywalled, or not an article.')
    try:
        async with semaphore:
            sources, report = await asyncio.wait_for(analyze(request.article), timeout=180)
        limitations = ['Extracted text may be incomplete. Additional coverage does not establish intentional bias.', 'Retrieved pages may contain only excerpts; inspect the original sources.']
        if len(sources) < 3:
            limitations.append(f'Only {len(sources)} relevant alternative sources were available; findings are limited.')
        return Analysis(mode='live', article=request.article, sources=sources, report=report, limitations=limitations)
    except Exception as exc:
        logging.getLogger(__name__).exception('Analysis failed')
        raise HTTPException(502, 'Analysis could not complete. Check backend logs, API credentials, quotas and network access, then retry.') from exc
