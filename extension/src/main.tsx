import {Logo} from './Logo';
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ArrowRight,BookOpen,Compass,Layers3,Settings2,ShieldCheck,Sparkles} from 'lucide-react';
import type {Source} from './types';
import {demo} from './demo';
import {SourceLink,FindingCard,RelatedArticles,OriginalAnalysis,SectionEmpty,AdditionalContext} from './results';
import {useAnalysis} from './useAnalysis';
import {useSectionBadges,type Section} from './useSectionBadges';
import {MiniPanel,Settings} from './panel';
import {ArticleAnalyzer,AnalysisStatus,CoverageSnapshot,LoadingAnalysis,SectionHeading,DemoLink} from './dashboard';
import './style.css';
import './material.css';

const views={
 overview:{title:'The story, simplified.',label:'Article Summary',eyebrow:'02 / ARTICLE INSIGHTS',description:'A grounded summary of the claims, people, and details that matter.'},
 comparisons:{title:'One event. Different angles.',label:'Source Comparison',eyebrow:'03 / COMPARE COVERAGE',description:'Read headlines side by side, then explore supported differences in reporting.'},
 missing:{title:'Look beyond the headline.',label:'Missing Context',eyebrow:'04 / ADDITIONAL CONTEXT',description:'Details other reporting brings into focus, with evidence you can inspect.'},
 bigger_picture:{title:'Understand the bigger picture.',label:'Bigger Picture',eyebrow:'BACKGROUND & CONTEXT',description:'Supported background and uncertainty, beyond a single headline.'},
};
function App(){
 const {article,result,busy,error,setError,analyze,loadAnalysis:storeAnalysis,retryRead}=useAnalysis();
 const [tab,setTab]=useState<Section>('overview');
 const [showAnalyzer,setShowAnalyzer]=useState(true);
 const {unread,markRead,resetUnread}=useSectionBadges(result);
 function openTab(next:Section){setShowAnalyzer(false);if(result){if(tab==='overview'&&next!=='overview')markRead('overview');markRead(next)}setTab(next)}
 function openAnalyzer(){if(result&&tab==='overview'&&!showAnalyzer)markRead('overview');setShowAnalyzer(true)}
 function loadDemo(){setShowAnalyzer(false);void storeAnalysis(demo);resetUnread();setTab('overview');setError('')}
 useEffect(()=>{if(result){setTab('overview');setShowAnalyzer(false)}},[result]);
 const current=result?.mode==='demo'?article:result?.article||article;
 const allSources:Source[]=result?[{...result.article,id:'original',summary:''},...result.sources,...(result.broader_sources||[]).slice(0,3)]:[];
 const heading=views[tab];
 const Badge=({section}:{section:Section})=>unread(section)>0?<span className="badge" aria-label={`${unread(section)} unread items`}>{unread(section)}</span>:null;
 const navButton=(section:Section)=><button onClick={()=>openTab(section)} className={!showAnalyzer&&tab===section?'selected':''} aria-current={!showAnalyzer&&tab===section?'page':undefined}>{views[section].label}<Badge section={section}/></button>;
 return <div className="app material-dashboard">
  <a className="skip-link" href="#analysis-content">Skip to analysis</a>
  <header className="dashboard-header"><a className="brand" href="#analyzer" onClick={e=>{e.preventDefault();openAnalyzer()}} aria-label="NewsNinja article analyzer"><Logo/>NewsNinja<span className="brand-caption">News intelligence</span></a><nav aria-label="Main navigation"><button onClick={openAnalyzer} className={showAnalyzer?'selected':''} aria-current={showAnalyzer?'page':undefined}>Analyzer</button>{navButton('overview')}{navButton('comparisons')}{navButton('missing')}{navButton('bigger_picture')}</nav><button className="icon-button" aria-label="Open NewsNinja settings" onClick={()=>globalThis.chrome?.runtime?.id?void chrome.runtime.openOptionsPage():window.location.assign('?settings=1')}><Settings2 size={20}/></button></header>
  <main className="content">{showAnalyzer&&<><section className="dashboard-hero"><div><span className="hero-chip"><span/> YOUR DAILY DOSE OF PERSPECTIVE</span><h1>Read the story.<br/><span>See the bigger picture.</span></h1><p>Go beyond one headline. Understand the reporting, compare the evidence, and find the context that matters.</p></div><div className="hero-motif hero-ninja" aria-hidden="true"><Logo/></div></section>
   <ArticleAnalyzer article={current||null} busy={busy} onAnalyze={analyze}/>
   <DemoLink onClick={loadDemo} disabled={busy}/></>}
   {error&&<section className="error dashboard-error" role="alert"><div><strong>We couldn’t complete that step.</strong><p>{error}</p></div><button className="tonal-button" disabled={busy} onClick={()=>void retryRead()}>Retry reading article</button></section>}
   <div id="analysis-content" tabIndex={-1}>
    {busy&&<LoadingAnalysis/>}
    {!busy&&result&&!showAnalyzer&&<><AnalysisStatus result={result}/>
     <SectionHeading {...heading}/>
     {tab==='overview'&&<><CoverageSnapshot result={result}/><OriginalAnalysis report={result.report} sources={allSources}/></>}
     {tab==='missing'&&<AdditionalContext report={result.report} sources={allSources}/>}
     {tab==='comparisons'&&<><article className="comparison-original"><span className="step-label">ORIGINAL ARTICLE</span><h3>{result.article.title}</h3><SourceLink source={allSources[0]}/></article><RelatedArticles sources={result.sources} broader={result.broader_sources}/></>}
     {<div className="findings">{result.report[tab].length?result.report[tab].map((f,i)=><FindingCard key={i} finding={f} index={i} sources={allSources}/>):<SectionEmpty section={tab}/>}</div>}
     {tab==='overview'&&<section className="context-callout"><span className="context-symbol"><Sparkles size={25}/></span><div><span className="step-label">KEEP EXPLORING</span><h3>There may be more to the story.</h3><p>Explore supported additional reporting and the evidence behind it.</p></div><button className="primary" onClick={()=>openTab('missing')}>Explore context <ArrowRight size={16}/></button></section>}
     <details className="limitations disclosure"><summary><ShieldCheck size={17}/> About the evidence and its limits</summary><div>{result.limitations.map((l,i)=><p key={i}>{l}</p>)}</div></details>
    </>}
    {!busy&&!result&&<section className="getting-started"><SectionHeading eyebrow="A CLEARER WAY TO READ" title="Perspective starts with evidence." description="Your analysis will appear here. Start with an article or explore the fictional demo."/><div className="getting-started-grid">{[{icon:BookOpen,title:'Understand the article',text:'A concise summary, supported takeaways, and the claims being made.'},{icon:Layers3,title:'Compare the reporting',text:'Real source links and differences grounded in the available coverage.'},{icon:Compass,title:'Find the context',text:'Additional details, background, and clear explanations of uncertainty.'}].map((item,i)=><article key={item.title}><item.icon size={22}/><span>0{i+1}</span><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></section>}
   </div>
   <footer><span className="brand-small"><Logo/>NewsNinja <span>· Read critically. Understand fully.</span></span><span><ShieldCheck size={14}/> Evidence over labels.</span></footer>
  </main>
 </div>;
}
const params=new URLSearchParams(location.search);
createRoot(document.getElementById('root')!).render(<React.StrictMode>{params.has('settings')?<Settings/>:params.has('embedded')?<MiniPanel/>:<App/>}</React.StrictMode>);
