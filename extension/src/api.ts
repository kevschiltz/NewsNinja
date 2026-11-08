import type { Analysis, Article } from './types';
export async function analyzeArticle(article:Article,signal:AbortSignal):Promise<Analysis>{
  try{
    const response=await fetch('http://localhost:8000/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({article}),signal});
    const body=await response.json();
    if(!response.ok)throw Error(typeof body.detail==='string'?body.detail:'The backend could not analyze this article.');
    return body;
  }catch(e){if(e instanceof TypeError)throw Error('Cannot reach the backend. Start FastAPI on localhost:8000 and add this extension’s origin to ALLOWED_ORIGINS.');throw e}
}
