import {readArticle} from './article';
export class AccessError extends Error {
  constructor(public code:string,message:string){super(message)}
}
// Never log query strings, fragments, article text or credentials.
export function accessLog(event:string,data:Record<string,unknown>){console.info('[NewsNinja access]',event,data)}
export async function accessArticle(tabId:number){
  let tab:chrome.tabs.Tab;
  try{tab=await chrome.tabs.get(tabId)}catch{throw new AccessError('TAB_UNAVAILABLE','The article tab was closed or is unavailable. Open NewsNinja from the article again.')}
  const url=tab.url;
  if(url&&!/^https?:\/\//.test(url))throw new AccessError('RESTRICTED_PAGE','Chrome does not allow reading this browser page. Open a public HTTP or HTTPS news article.');
  if(url&&/^https?:\/\/(chromewebstore.google.com|chrome.google.com\/webstore)/.test(url))throw new AccessError('RESTRICTED_PAGE','Chrome blocks extensions from reading the Chrome Web Store.');
  const parsed=url?new URL(url):null;
  const siteAccess=parsed?await chrome.permissions.contains({origins:[parsed.origin+'/*']}):false;
  accessLog('tab',{tabId,url:parsed?parsed.origin+parsed.pathname:'URL hidden by Chrome',siteAccess});
  let response;
  try{response=await chrome.tabs.sendMessage(tabId,{type:'NN_READ_ARTICLE'},{frameId:0});accessLog('content response',{received:!!response})}
  catch{accessLog('content response',{received:false})}
  if(!response){
    // Toolbar activeTab can authorize recovery; automatic launchers cannot grant it.
    try{
      await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},files:['content.js']});
      accessLog('injection',{success:true});
      try{response=await chrome.tabs.sendMessage(tabId,{type:'NN_READ_ARTICLE'},{frameId:0})}catch{response=undefined}
      if(!response){
        // Older injected scripts may not implement the new message after an update.
        const results=await chrome.scripting.executeScript({target:{tabId,frameIds:[0]},func:readArticle});
        response={ok:true,article:results[0]?.result};
      }
    }catch(e){
      accessLog('injection',{success:false,siteAccess});
      const reason=e instanceof Error?e.message:'';
      if(/permission|cannot access|must request/i.test(reason)||!siteAccess)
        throw new AccessError('SITE_PERMISSION','NewsNinja has no usable site access. Allow this site in Chrome’s extension Site access settings, or click the NewsNinja toolbar icon on the article, then retry. Refresh after an extension update.');
      throw new AccessError('CONTENT_SCRIPT_MISSING','The article content script did not respond. Refresh the article after reloading NewsNinja, then retry reading it.');
    }
  }
  if(!response?.ok)throw new AccessError(response?.code||'CONTENT_SCRIPT_FAILURE',response?.error||'The content script could not read this page. Refresh the article and retry.');
  const article=response.article;
  const extractedUrl=article?.url?new URL(article.url):null;
  accessLog('extraction',{url:extractedUrl?extractedUrl.origin+extractedUrl.pathname:undefined,titleFound:!!article?.title,bodyFound:!!article?.text,bodyCharacters:article?.text?.length||0});
  if(!article?.title||!article?.text||article.text.trim().length<200)
    throw new AccessError('ARTICLE_NOT_FOUND','No readable article body was found. Wait for the page to finish loading and retry. A paywall, consent screen, video-only page, or inaccessible frame may prevent extraction.');
  return article;
}

export async function sourceUrl(tabId:number):Promise<string>{
  const tab=await chrome.tabs.get(tabId);
  if(tab.url)return tab.url;
  const response=await chrome.tabs.sendMessage(tabId,{type:'NN_PAGE_URL'},{frameId:0});
  if(!response?.url)throw new AccessError('CONTENT_SCRIPT_MISSING','The article tab URL is unavailable. Refresh the article and reopen NewsNinja.');
  return response.url;
}
