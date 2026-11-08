import {Logo} from './Logo';
import {useSectionBadges} from './useSectionBadges';
import {useEffect,useRef,useState} from 'react';
import {Layers3,Minus,Maximize2,X,ExternalLink,LoaderCircle} from 'lucide-react';
import {useAnalysis} from './useAnalysis';
import {FindingCard,SourceLink,RelatedArticles,OriginalAnalysis,SectionEmpty,AdditionalContext} from './results';
import {demo} from './demo';
import type {Source} from './types';

export function Settings(){
  const [enabled,setEnabled]=useState(true),[loaded,setLoaded]=useState(false),[error,setError]=useState('');
  useEffect(()=>{if(!globalThis.chrome?.storage){setError('Settings are available in the installed Chrome extension.');return}void chrome.storage.local.get('autoPrompts').then(data=>{setEnabled(data.autoPrompts!==false);setLoaded(true)}).catch(()=>setError('Could not load settings. Reopen the extension.'))},[]);
  async function toggle(value:boolean){try{await chrome.storage.local.set({autoPrompts:value});setEnabled(value)}catch{setError('Could not save the setting. Please retry.')}}
  return <main className="settings-page"><div className="brand"><Logo/> NewsNinja</div><h1>Reading preferences</h1><label><input type="checkbox" checked={enabled} disabled={!loaded} onChange={e=>void toggle(e.target.checked)}/> Offer another perspective on news articles</label><p>Show a one-time invitation after about three seconds on likely articles. Turning this off keeps the small manual NewsNinja button available.</p><p>NewsNinja never starts live analysis until you choose Analyze article. Article text is sent to your configured backend and AI provider only for live analysis.</p>{error&&<p role="alert">{error}</p>}</main>;
}
export function MiniPanel(){
  const {article,result,busy,error,setError,analyze,loadAnalysis,ready,retryRead}=useAnalysis();
  const [tab,setTab]=useState<'overview'|'missing'|'comparisons'|'bigger_picture'>('overview');
  const {unread,markRead,resetUnread}=useSectionBadges(result);
  const [controlError,setControlError]=useState('');
  const intent=useRef(false);
  const tabId=Number(new URLSearchParams(location.search).get('sourceTab'));
  async function command(type:string,action?:string){try{const response=await chrome.runtime.sendMessage({type,action,tabId});if(!response?.ok)throw Error(response?.error||'Could not control panel')}catch{setControlError('Extension connection lost. Refresh this article after reloading NewsNinja.')}}
  useEffect(()=>{if(!ready||intent.current)return;intent.current=true;void chrome.runtime.sendMessage({type:'NN_TAKE_INTENT',tabId}).then(response=>{if(response?.analyze)void analyze()}).catch(()=>setControlError('Refresh this article to reconnect NewsNinja.'))},[ready]);
  useEffect(()=>{setTab('overview')},[result]);
  const allSources:Source[]=result?[{...result.article,id:'original',summary:''},...result.sources,...(result.broader_sources||[]).slice(0,3)]:[];
  const items=[['overview','Overview'],['missing',"What You’re Missing"],['comparisons','Source Comparison'],['bigger_picture','Bigger Picture']] as const;
  return <div className="mini-panel" onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();void command('NN_PANEL_CONTROL','minimize')}}}>
    <header className="mini-header"><strong><Logo/> NewsNinja</strong><div><button aria-label="Minimize NewsNinja" onClick={()=>void command('NN_PANEL_CONTROL','minimize')}><Minus size={16}/></button><button aria-label="Toggle expanded panel" onClick={()=>void command('NN_PANEL_CONTROL','expand')}><Maximize2 size={15}/></button><button aria-label="Close NewsNinja" onClick={()=>void command('NN_PANEL_CONTROL','close')}><X size={17}/></button></div></header>
    <div className="mini-body"><div className="eyebrow purple">ANOTHER PERSPECTIVE</div><h1>{(result?.article||article)?.title||'News in context'}</h1><p className="mini-source">{(result?.article||article)?.publisher||'Reading the current page…'}</p>
    <div className="mini-status" role="status">{busy?<><LoaderCircle size={14} className="spin"/> Loading · Comparing coverage…</>:error?'Error · Analysis unavailable':result?(result.mode==='live'&&!result.report.original_analysis?.summary.length&&!result.report.overview.length?'Insufficient evidence · ':'Success · ')+(result.mode==='demo'?'Fictional demo':'Live analysis'):'Idle · Ready when you are'}</div>
    <button className="primary" disabled={busy||!ready} onClick={()=>void analyze()}>{busy?'Analyzing…':'Analyze article'}</button>
    <button className="mini-demo" disabled={busy} onClick={()=>{resetUnread();void loadAnalysis(demo);setError('')}}>Load fictional sample · free demo</button>
    {(error||controlError)&&<div className="error" role="alert">{error||controlError}<button className="mini-full" disabled={!ready||busy} onClick={()=>void retryRead()}>Retry reading article (no API call)</button></div>}
    {busy&&<p className="mini-note">Finding relevant sources and checking evidence. This may take a few minutes. Minimize to keep reading.</p>}
    {!busy&&result&&<><div className="mini-tabs" aria-label="Analysis sections">{items.map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>{if(tab==='overview'&&key!=='overview')markRead('overview');setTab(key);markRead(key)}}>{label}{unread(key)>0&&<span className="badge" aria-label={`${unread(key)} unread items`}>{unread(key)}</span>}</button>)}</div>
    {<>{tab==='overview'&&<OriginalAnalysis report={result.report} sources={allSources}/>}
 {tab==='missing'&&<AdditionalContext report={result.report} sources={allSources}/>}
 {tab==='comparisons'&&<><article className="comparison-original"><span className="step-label">ORIGINAL ARTICLE</span><h3>{result.article.title}</h3><SourceLink source={allSources[0]}/></article><RelatedArticles sources={result.sources} broader={result.broader_sources}/></>}{result.report[tab].length?result.report[tab].map((finding,index)=><FindingCard key={index} finding={finding} index={index} sources={allSources}/>):<SectionEmpty section={tab}/>}</>}
    <div className="limitations">{result.limitations.map((text,i)=><p key={i}>{text}</p>)}</div></>}
    {!result&&!busy&&<p className="mini-note">Find other reporting, missing context, and language differences. Every finding links to its evidence. No numerical bias scores.</p>}
    <button className="mini-full" onClick={()=>void command('NN_OPEN_FULL')}>Open full analysis <ExternalLink size={13}/></button>
    <button className="mini-demo" onClick={()=>void chrome.runtime.openOptionsPage()}>Automatic prompt settings</button>
    </div></div>;
}
