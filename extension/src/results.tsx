import {useState} from 'react';
import {ArrowUpRight} from 'lucide-react';
import type {Source,Finding,Report,EntityFinding} from './types';
function sourceOrigin(source:Source){
 try{const url=new URL(source.url);return /^https?:$/.test(url.protocol)&&!url.username&&!url.password?url.origin:''}catch{return ''}
}
export function PublisherIcon({source}:{source:Source}){
 const origin=sourceOrigin(source);
 const [failed,setFailed]=useState('');
 const initials=source.publisher.replace(/^Sample\s*·\s*/i,'').split(/\s+/).filter(Boolean).slice(0,2).map(word=>word[0]).join('').toUpperCase()||'N';
 return <span className="publisher-icon" aria-hidden="true"><span>{initials}</span>{origin&&failed!==origin&&<img src={`${origin}/favicon.ico`} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>setFailed(origin)}/>}</span>;
}
export function PublisherIdentity({source}:{source:Source}){
 const origin=sourceOrigin(source);
 return <div className="publisher-identity"><PublisherIcon source={source}/><div><strong>{source.publisher|| (origin?new URL(origin).hostname:'Source')}</strong><span>{origin?new URL(origin).hostname.replace(/^www\./,''):'Fictional demo source'}{source.same_publisher?' · Same publisher':''}</span></div></div>;
}
export function SourceLink({source}:{source:Source}) {
 return source.url?<a className="publisher-link" href={source.url} target="_blank" rel="noreferrer"><PublisherIcon source={source}/><span>{source.publisher}</span><ArrowUpRight size={13}/></a>:<span className="sample-link">{source.publisher} · fictional</span>;
}

export function FindingCard({finding,index,sources}:{finding:Finding;index:number;sources:Source[]}) {
 const citations=new Map<string,{source:Source;quotes:Set<string>}>();
 for(const evidence of finding.evidence){
  const source=sources.find(source=>source.id===evidence.source_id);
  if(!source)continue;
  let key=source.id;
  if(source.url){try{
   const url=new URL(source.url);url.hash='';
   const params:string[]=[];url.searchParams.forEach((_,param)=>params.push(param));
   for(const param of params)if(param.startsWith('utm_')||['fbclid','gclid'].includes(param))url.searchParams.delete(param);
   url.hostname=url.hostname.replace(/^www\./,'');url.pathname=url.pathname.replace(/\/$/,'')||'/';url.searchParams.sort();key=url.href;
  }catch{key=source.url}}
  if(!citations.has(key))citations.set(key,{source,quotes:new Set()});
  citations.get(key)!.quotes.add(evidence.quote);
 }
 return <article className="finding"><span className="number">{String(index+1).padStart(2,'0')}</span><div><h3>{finding.title}</h3><p>{finding.detail}</p><div className="citations">{[...citations].map(([key,{source,quotes}])=><details key={key}><summary><SourceLink source={source}/></summary>{[...quotes].map(quote=><blockquote key={quote}>“{quote}”</blockquote>)}</details>)}</div></div></article>;
}

export function RelatedArticles({sources,broader=[]}:{sources:Source[];broader?:Source[]}){
 if(!sources.length&&!broader.length)return <p className="mini-note">No relevant alternative coverage was available. No source links have been invented.</p>;
 return <><h3>Likely same-event reporting</h3>{!sources.length&&<p className="mini-note">No same-event alternatives were found. Broader-topic links below are not evidence of omissions.</p>}<div className="related-grid">{sources.map(source=><article className="source-card" key={source.id}><PublisherIdentity source={source}/><h3>{source.title}</h3><small>{source.date||'Date unavailable'} · {source.content_kind==='extracted'?'Extracted article text (may be partial)':'Snippet only'}</small><p>{source.summary||source.text.slice(0,240)}</p><SourceLink source={source}/></article>)}</div>{broader.length>0&&<section><h3>Broader-topic coverage</h3><p className="mini-note">Related background; not verified coverage of this specific event and excluded from AI comparisons.</p><div className="related-grid">{broader.map(source=><article className="source-card" key={source.id}><PublisherIdentity source={source}/><h3>{source.title}</h3><small>{source.date||'Date unavailable'}</small><p>{source.summary||source.text}</p><SourceLink source={source}/></article>)}</div></section>}</>;
}

export function EntityGroups({entities,sources}:{entities:EntityFinding[];sources:Source[]}){
 const groups=[['person','People'],['organization','Organizations'],['place','Places'],['date','Dates'],['other','Other mentions']] as const;
 return <section className="analysis-card entities-card"><h3>Who & where</h3>{groups.map(([category,label])=>{
  const entries=entities.filter(entity=>(entity.category||'other')===category);
  if(!entries.length)return null;
  return <section className="entity-group" key={category} aria-label={label}><h4>{label}<span>{entries.length}</span></h4>{entries.map((finding,index)=><FindingCard key={index} finding={finding} index={index} sources={sources}/>)}</section>;
 })}</section>;
}

export function OriginalAnalysis({report,sources}:{report:Report;sources:Source[]}){
 const original=report.original_analysis;
 if(!original)return null;
 const sections=[['summary','Article summary'],['takeaways','Key takeaways'],['entities','People, organizations, places & dates'],['claims','Claims made in this article'],['language','Language & framing'],['uncertainties','Uncertainties']] as const;
 const renderSection=(key:typeof sections[number][0],label:string)=><section key={key} className={`analysis-card analysis-card--${key}${key==='entities'?' entities-card':''}`}><h3>{label}</h3>{original[key].map((finding,index)=><FindingCard key={index} finding={finding} index={index} sources={sources}/>)}</section>;
 return <section className={`summary-layout${original.entities.length?' summary-layout--with-entities':''}`} aria-label="Original article analysis">{original.entities.length>0&&<aside className="original-analysis entity-rail" aria-label="People, organizations, places and dates"><EntityGroups entities={original.entities} sources={sources}/></aside>}<div className="original-analysis narrative-analysis">{sections.filter(([key])=>key!=='entities'&&original[key].length>0).map(([key,label])=>renderSection(key,label))}{!original.summary.length&&<p className="mini-note">Insufficient evidence: no supported summary could be produced from the available extracted text.</p>}</div></section>;
}
export function SectionEmpty({section}:{section:string}){
 const text=section==='missing'?'A verified omission comparison is unavailable: extracted article text may be incomplete. See Compare Coverage for supported additional reporting. Broader-topic links cannot establish omissions.':section==='bigger_picture'?'Insufficient evidence: no supported additional background was available in the supplied sources.':section==='overview'?'No supported same-event comparison is available. Original-article analysis is shown separately when supported.':'No additional supported framing differences were returned. Shared facts appear in Overview; supported additional details appear in What You’re Missing.';
 return <p className="mini-note" role="status">{text}</p>;
}

export function AdditionalContext({report,sources}:{report:Report;sources:Source[]}){
 return report.additional_context?.length?<section className="additional-context-section"><h3>Additional same-event reporting</h3><p className="mini-note">These details appear in alternative coverage. This does not establish that the original full article omitted them.</p><div className="context-cards">{report.additional_context.map((finding,index)=><FindingCard key={index} finding={finding} index={index} sources={sources}/>)}</div></section>:null;
}
