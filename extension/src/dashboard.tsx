import {useEffect,useState,type FormEvent} from 'react';
import {ArrowUpRight,BookOpen,CheckCircle2,ExternalLink,Link2,LoaderCircle,ShieldCheck,Sparkles} from 'lucide-react';
import type {Analysis,Article} from './types';

export function articleUrl(value:string):URL {
  const url=new URL(value.trim());
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw Error('Enter a public article URL beginning with https:// or http://.');
  return url;
}
export function ArticleAnalyzer({article,busy,onAnalyze}:{article:Article|null;busy:boolean;onAnalyze:()=>Promise<void>}){
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{setUrl(article?.url||'');setError('');setNotice('')},[article?.url]);
 const different=url.trim()!==''&&url.trim()!==article?.url;
 async function submit(e:FormEvent){
  e.preventDefault();setError('');setNotice('');
  try{
   if(different){
    const target=articleUrl(url);
    if(globalThis.chrome?.runtime?.id){await chrome.tabs.create({url:target.href})}
    else {window.open(target.href,'_blank','noopener,noreferrer');}
    setNotice('Article opened in a new tab. Click the NewsNinja toolbar icon or floating button there to analyze its available text.');
   }else if(article){await onAnalyze()}
   else {throw Error('Paste an article URL to open it, or open NewsNinja from a news article in Chrome.')}
  }catch(e){setError(e instanceof Error?e.message:'Could not open the article. Please retry.')}
 }
 return <section className="analyzer-surface" id="analyzer" aria-labelledby="analyzer-heading">
  <div className="analyzer-label"><span className="step-label">01 / ARTICLE ANALYZER</span><span className="privacy-note"><ShieldCheck size={14}/> Analysis starts with you</span></div>
  <h2 id="analyzer-heading">Start with a story.</h2><p className="supporting-text">Paste a link to open a new article, or analyze the one you’re reading.</p>
  <form className="url-form" onSubmit={e=>void submit(e)}>
   <label className="url-field"><span>Article URL</span><div><Link2 size={18} aria-hidden="true"/><input type="url" inputMode="url" autoComplete="url" value={url} onChange={e=>{setUrl(e.target.value);setError('');setNotice('')}} placeholder="https://publication.com/news/article" aria-describedby="url-help" disabled={busy}/></div></label>
   <button className="primary" type="submit" disabled={busy}>{busy?<LoaderCircle size={17} className="spin"/>:different?<ExternalLink size={17}/>:<Sparkles size={17}/>} {busy?'Analyzing article…':different?'Open article':'Analyze article'}</button>
  </form>
  <p id="url-help" className="field-help">{different?'After opening, use NewsNinja on the article page. No analysis runs automatically.':'Available article text is compared with retrieved reporting. Paywalls are not bypassed.'}</p>
  {article&&<div className="attached-article"><span className="attached-icon"><BookOpen size={18}/></span><div><span className="step-label">ATTACHED ARTICLE · {article.publisher}</span><h3>{article.title}</h3><p>{[article.author,article.date||'Date unavailable'].filter(Boolean).join(' · ')}</p></div></div>}
  {error&&<p className="field-error" role="alert">{error}</p>}{notice&&<p className="field-notice" role="status">{notice}</p>}
 </section>;
}
export function AnalysisStatus({result}:{result:Analysis}){
 const enough=!!result.report.original_analysis?.summary.length||result.report.overview.length>0;
 return <div className="result-status" role="status"><span className={`status-label ${result.mode==='demo'?'demo':enough?'complete':'limited'}`}><CheckCircle2 size={15}/>{result.mode==='demo'?'Fictional sample analysis':enough?'Analysis complete':'Limited evidence'}</span><span>Extracted coverage may be incomplete · Review original sources</span></div>;
}
export function CoverageSnapshot({result}:{result:Analysis}){
 return <aside className="coverage-snapshot" aria-label="Coverage at a glance"><div><span className="step-label">COVERAGE AT A GLANCE</span><p>Reporting, with the evidence attached.</p></div><dl><div><dt>Original article</dt><dd>1</dd></div><div><dt>Same-event reports</dt><dd>{result.sources.length}</dd></div><div><dt>Background articles</dt><dd>{result.broader_sources?.length||0}</dd></div></dl><span className="snapshot-note">{result.mode==='demo'?'Fictional demonstration data':'Counts reflect the retrieved backend response'}</span></aside>;
}
export function LoadingAnalysis(){
 return <section className="analysis-loading" aria-label="Analysis in progress" aria-busy="true"><div className="loading-intro" role="status"><span className="loading-orbit"><LoaderCircle size={24} className="spin"/></span><div><h2>Bringing the story into focus.</h2><p>Reading available coverage and checking the supporting evidence. This can take a few minutes.</p></div></div><div className="skeleton-grid" aria-hidden="true">{[0,1].map(i=><div className="skeleton-card" key={i}><span/><span/><span/><span/></div>)}</div></section>;
}
export function SectionHeading({eyebrow,title,description}:{eyebrow:string;title:string;description:string}){
 return <header className="insight-heading"><span className="step-label">{eyebrow}</span><h2>{title}</h2><p>{description}</p></header>;
}
export function DemoLink({onClick,disabled=false}:{onClick:()=>void;disabled?:boolean}){
 return <div className="demo-callout"><span><span className="demo-tag">DEMO</span>Curious? Explore a clearly labeled fictional example.</span><button onClick={onClick} disabled={disabled}>Try sample analysis <ArrowUpRight size={15}/></button></div>;
}
