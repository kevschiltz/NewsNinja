import {accessArticle,AccessError,sourceUrl} from './access';
const extensionPage = (sender: chrome.runtime.MessageSender) => sender.id===chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL('index.html'));
const webPage = (sender: chrome.runtime.MessageSender) => sender.id===chrome.runtime.id && sender.frameId===0 && /^https?:\/\//.test(sender.url||'') && sender.tab?.id!==undefined;
const locks = new Map<string,Promise<unknown>>();
function serial<T>(key:string, action:()=>Promise<T>):Promise<T>{
  const task=(locks.get(key)||Promise.resolve()).catch(()=>{}).then(action);
  locks.set(key,task); void task.finally(()=>{if(locks.get(key)===task)locks.delete(key)}).catch(()=>{}); return task;
}
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
  if(sender.id!==chrome.runtime.id || !message || typeof message.type!=='string')return;
  const run = async () => {
    if(message.type==='NN_HELLO' && webPage(sender)){
      const {autoPrompts=true}=await chrome.storage.local.get('autoPrompts');
      const key=`panel:${sender.tab!.id}`;
      const state=(await chrome.storage.session.get(key))[key];
      return {ok:true,tabId:sender.tab!.id,autoPrompts,state:state?.url===sender.url?state:null};
    }
    if(message.type==='NN_CLAIM_PROMPT' && webPage(sender)){
      // Atomic in this worker even if the same article is opened in two tabs.
      const key='promptedArticles';
      return serial(key,async()=>{
        const data=await chrome.storage.session.get(key);
        const urls:string[]=data[key]||[];
        const url=new URL(sender.url!);url.hash='';
        if(urls.includes(url.href))return {ok:true,show:false};
        const {autoPrompts=true}=await chrome.storage.local.get('autoPrompts');
        if(!autoPrompts)return {ok:true,show:false};
        await chrome.storage.session.set({[key]:[...urls,url.href]});
        return {ok:true,show:true};
      });
    }
    if(message.type==='NN_PANEL_STATE' && webPage(sender)){
      if(!['open','minimized','closed'].includes(message.state))throw Error('Invalid panel state');
      await chrome.storage.session.set({[`panel:${sender.tab!.id}`]:{url:sender.url,state:message.state}});
      return {ok:true};
    }
    if(message.type==='NN_INTENT' && webPage(sender)){
      await chrome.storage.session.set({[`intent:${sender.tab!.id}`]:{url:sender.url,at:Date.now()}});
      return {ok:true};
    }
    if(!extensionPage(sender))throw Error('Unsupported message sender');
    const tabId=Number(message.tabId);
    if(!Number.isInteger(tabId)||tabId<=0)throw Error('Invalid source tab');
    // A web-accessible iframe may only access its own enclosing tab, never a different tab.
    if(sender.frameId && sender.tab?.id!==tabId)throw Error('Invalid source tab');
    if(message.type==='NN_SOURCE_URL'){return {ok:true,url:await sourceUrl(tabId)};}
    if(message.type==='NN_BEGIN_ANALYSIS'){
      return serial(`running:${tabId}`,async()=>{
        const key=`running:${tabId}`;const state=(await chrome.storage.session.get(key))[key];
        const url=await sourceUrl(tabId);
        if(url!==message.url)throw Error('Source article changed');
        if(state?.url===message.url&&Date.now()-state.at<195000)return {ok:true,started:false};
        const token=crypto.randomUUID();
        await chrome.storage.session.set({[key]:{url:message.url,at:Date.now(),token}});
        return {ok:true,started:true,token};
      });
    }
    if(message.type==='NN_END_ANALYSIS'){
      return serial(`running:${tabId}`,async()=>{
        const key=`running:${tabId}`;const state=(await chrome.storage.session.get(key))[key];
        if(state?.token===message.token)await chrome.storage.session.remove(key);
        return {ok:true};
      });
    }
    if(message.type==='NN_EXTRACT'){
      return {ok:true,article:await accessArticle(tabId)};
    }
    if(message.type==='NN_TAKE_INTENT'){
      const key=`intent:${tabId}`;const data=(await chrome.storage.session.get(key))[key];
      await chrome.storage.session.remove(key);
      const url=await sourceUrl(tabId);
      return {ok:true,analyze:!!data && data.url===url && Date.now()-data.at<15000};
    }
    if(message.type==='NN_PANEL_CONTROL'){
      if(!['minimize','expand','close'].includes(message.action))throw Error('Invalid control');
      await chrome.tabs.sendMessage(tabId,{type:'NN_CONTROL',action:message.action},{frameId:0});return {ok:true};
    }
    if(message.type==='NN_OPEN_FULL'){
      await chrome.tabs.create({url:chrome.runtime.getURL(`index.html?sourceTab=${tabId}`)});return {ok:true};
    }
    throw Error('Unsupported message');
  };
  void run().then(reply).catch(error=>reply({ok:false,code:error instanceof AccessError?error.code:'EXTENSION_MESSAGE_ERROR',error:error instanceof AccessError?error.message:'Extension communication failed. Refresh the article and reopen NewsNinja. The request may refer to a stale or different tab.'}));
  return true;
});
chrome.action.onClicked.addListener(tab=>{if(tab.id)void chrome.tabs.create({url:chrome.runtime.getURL(`index.html?sourceTab=${tab.id}`)})});
chrome.tabs.onRemoved.addListener(tabId=>void chrome.storage.session.remove([`panel:${tabId}`,`intent:${tabId}`,`analysis:${tabId}`,`analysis:v2:${tabId}`,`analysis:v5:${tabId}`,`running:${tabId}`]));
