import type { Article } from './types';

// Self-contained so Chrome can serialize this function for executeScript.
export function readArticle(): Article {
  const meta = (name: string) => document.querySelector<HTMLMetaElement>(`meta[property="${name}"],meta[name="${name}"]`)?.content || '';
  let structured: Record<string, unknown> | undefined;
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object' || structured) return;
    if (Array.isArray(value)) { value.forEach(visit); return; }
    const obj = value as Record<string, unknown>;
    const types = [obj['@type']].flat();
    if (types.some(t => typeof t === 'string' && /^(NewsArticle|Article|ReportageNewsArticle|AnalysisNewsArticle)$/.test(t))) structured = obj;
    else if (obj['@graph']) visit(obj['@graph']);
  };
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0, 20)) {
    try { if ((script.textContent?.length || 0) < 200000) visit(JSON.parse(script.textContent || 'null')); } catch { /* Invalid publisher metadata. */ }
  }
  const data = structured as Record<string, unknown> | undefined;
  const selectors=['[itemprop="articleBody"]','.article-body','.article-content','[data-component="text-block"]','[data-testid="article-body"]','article','main'];
  let body='';
  for(const selector of selectors){
    const root=document.querySelector(selector);
    const paragraphs=Array.from(root?.querySelectorAll('p')||[]).filter(p=>!p.closest('nav,aside,footer,header'));
    const text=paragraphs.map(p=>p.textContent?.trim()).filter(Boolean).join('\n');
    if(text.length>body.length)body=text;
    if(body.length>=700&&selector!=='[data-component="text-block"]')break;
  }
  const author = data?.author as { name?: string } | undefined;
  const publisher = data?.publisher as { name?: string } | undefined;
  return {
    title: String(data?.headline || meta('og:title') || document.querySelector('h1')?.textContent?.trim() || document.title).slice(0,500),
    publisher: String(publisher?.name || meta('og:site_name') || location.hostname).slice(0,200),
    author: String(author?.name || meta('author')).slice(0,300),
    date: String(data?.datePublished || meta('article:published_time') || document.querySelector('time')?.getAttribute('datetime') || '').slice(0,100),
    url: location.href, text: String(data?.articleBody || body).slice(0,50000), full_text: false,
  };
}

export interface DetectionSignals { path: string; search: string; schema: boolean; ogArticle: boolean; article: boolean; headline: boolean; date: boolean; textLength: number; paragraphs: number; linkDensity: number; newsHint?: boolean }
export function likelyNewsArticle(s: DetectionSignals): boolean {
  if (/^\/$/.test(s.path) || /\/(search|tag|tags|category|categories|topics?|author|about|contact|login|shop|product|recipes?|docs)(\/|$)/i.test(s.path) || /[?&](q|query|search)=/i.test(s.search)) return false;
  if (!s.headline || s.textLength < 700 || s.paragraphs < 3 || s.linkDensity > .35) return false;
  // Metadata alone on a homepage/listicle is insufficient. Unmarked pages need an article + publication date.
  return s.schema || (!!s.newsHint && (s.ogArticle || (s.article && s.date && s.textLength >= 1200)));
}
export function detectArticle(): boolean {
  const root = document.querySelector('[itemprop="articleBody"],article,main');
  if (!root) return false;
  const text = root.textContent || '';
  const linked = Array.from(root.querySelectorAll('a')).reduce((sum,a)=>sum+(a.textContent?.length||0),0);
  const schema = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).slice(0,20).some(s => {
    if ((s.textContent?.length || 0) > 200000) return false;
    try { const visit = (v: unknown): boolean => {
      if (!v || typeof v !== 'object') return false;
      if (Array.isArray(v)) return v.some(visit);
      const o = v as Record<string,unknown>;
      return [o['@type']].flat().some(t => typeof t==='string' && /^(NewsArticle|ReportageNewsArticle|AnalysisNewsArticle)$/.test(t)) || visit(o['@graph']);
    }; return visit(JSON.parse(s.textContent || 'null')); } catch { return false; }
  });
  return likelyNewsArticle({newsHint: /(^|[.\/-])(news|politics|world|business|sport|sports|science|technology|health|breaking|story|stories)([.\/-]|$)/i.test(location.hostname+location.pathname) || !!document.querySelector('meta[property="article:section"]'), path:location.pathname, search:location.search, schema,
    ogArticle:document.querySelector('meta[property="og:type"]')?.getAttribute('content')==='article',
    article:!!document.querySelector('article,[itemprop="articleBody"]'), headline:!!root.querySelector('h1')||!!document.querySelector('h1'),
    date:!!document.querySelector('time[datetime],meta[property="article:published_time"]'),
    textLength:Array.from(root.querySelectorAll('p')).reduce((n,p)=>n+(p.textContent?.length||0),0), paragraphs:root.querySelectorAll('p').length, linkDensity:linked/Math.max(text.length,1)});
}
