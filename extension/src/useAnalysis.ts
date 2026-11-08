import {useEffect,useRef,useState} from 'react';
import type {Analysis,Article} from './types';
import {extractArticle} from './extract';
import {analyzeArticle} from './api';
export function useAnalysis(){
  const [article,setArticle]=useState<Article|null>(null),[result,setResult]=useState<Analysis|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [ready,setReady]=useState(false);
  const controller=useRef<AbortController|null>(null), epoch=useRef(0), current=useRef<Article|null>(null);
  const tabId=Number(new URLSearchParams(location.search).get('sourceTab'));
  const key=`analysis:v5:${tabId}`, runningKey=`running:${tabId}`;
  async function loadAnalysis(value:Analysis){
    setResult(value);setError('');
    if(globalThis.chrome?.storage?.session&&current.current)await chrome.storage.session.set({[key]:{url:current.current.url,result:value}}).catch(()=>{});
  }
  async function retryRead(){
    setReady(false);setError('');
    try{const extracted=await extractArticle();current.current=extracted;setArticle(extracted)}
    catch(e){setArticle(null);setError(e instanceof Error?e.message:'Article access failed. Refresh the page and retry.')}
    finally{setReady(true)}
  }
  useEffect(()=>{
    let alive=true;
    async function initialize(){try{
      const extracted=await extractArticle();if(!alive)return;
      current.current=extracted;setArticle(extracted);
      const stored=globalThis.chrome?.storage?.session?await chrome.storage.session.get([key,runningKey]):{};
      if(!alive)return;
      if(stored[key]?.url===extracted.url)setResult(stored[key].result);
      const running=stored[runningKey];
      setBusy(running?.url===extracted.url&&Date.now()-running.at<195000);
    }catch(e){if(alive)setError(e instanceof Error?e.message:'Could not read this article.')}finally{if(alive)setReady(true)}}
    void initialize();
    function changed(changes:Record<string,chrome.storage.StorageChange>,area:string){
      if(!alive||area!=='session'||!current.current)return;
      const cached=changes[key]?.newValue;
      if(cached?.url===current.current.url){setResult(cached.result);setError('')}
      if(changes[runningKey]){const running=changes[runningKey].newValue;setBusy(!!running&&running.url===current.current.url&&Date.now()-running.at<195000)}
    }
    globalThis.chrome?.storage?.onChanged.addListener(changed);
    // URL checks only: no repeated DOM scanning. Final extraction also guards stale responses.
    const interval=setInterval(()=>{if(!globalThis.chrome?.runtime?.id||!tabId||!current.current)return;void chrome.runtime.sendMessage({type:'NN_SOURCE_URL',tabId}).then(response=>{
      if(!alive)return;
      if(!response?.ok){setError(response?.error||'Extension communication failed. Refresh the article and retry.');return;}
      if(current.current&&response.url!==current.current.url){epoch.current++;controller.current?.abort();current.current=null;setArticle(null);setResult(null);setBusy(false);setError('The source article changed or became unavailable. Reopen NewsNinja from the current article.');}
      // Recover loading indicators if the extension page doing the work was closed.
      void chrome.storage.session.get(runningKey).then(data=>{if(alive&&data[runningKey]&&Date.now()-data[runningKey].at>=195000)setBusy(false)}).catch(()=>{});
    }).catch(()=>{if(alive){epoch.current++;controller.current?.abort();setBusy(false);setError('Extension connection lost. Refresh the article and reopen NewsNinja.')}})},5000);
    return()=>{alive=false;epoch.current++;controller.current?.abort();clearInterval(interval);globalThis.chrome?.storage?.onChanged.removeListener(changed)};
  },[key,runningKey,tabId]);
  async function analyze(){
    if(busy)return;
    const version=++epoch.current;
    controller.current?.abort();const abort=new AbortController();controller.current=abort;
    const timeout=setTimeout(()=>abort.abort(),190000);
    let token:string|undefined;
    setBusy(true);setError('');setResult(null);
    try{
      const extracted=await extractArticle();if(version!==epoch.current)return;
      current.current=extracted;setArticle(extracted);
      const lock=await chrome.runtime.sendMessage({type:'NN_BEGIN_ANALYSIS',tabId,url:extracted.url});
      if(!lock?.ok)throw Error('The source article is unavailable. Refresh the page and retry.');
      if(!lock.started){setError('This article is already being analyzed in another NewsNinja view. Results will appear here when ready.');return;}
      token=lock.token;
      const value=await analyzeArticle(extracted,abort.signal);
      const latest=await extractArticle();
      if(version!==epoch.current||latest.url!==extracted.url)throw Error('The article changed during analysis. Reopen NewsNinja and retry.');
      await loadAnalysis(value);
    }catch(e){if(version===epoch.current)setError(e instanceof Error?e.message:'Analysis failed. Please retry.')}
    finally{clearTimeout(timeout);if(token)await chrome.runtime.sendMessage({type:'NN_END_ANALYSIS',tabId,token}).catch(()=>{});if(version===epoch.current)setBusy(false)}
  }
  return {article,result,busy,error,setError,analyze,loadAnalysis,ready,retryRead};
}
