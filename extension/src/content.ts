import { detectArticle,readArticle } from './article';

// Only the top frame injects; a guard also protects against accidental reinjection.
const guard = '__newsNinjaActive';
const globals = globalThis as unknown as Record<string,unknown>;
if (window.top === window && !globals[guard]) {
  globals[guard]=true;
  let host:HTMLElement|null=null, shadow:ShadowRoot|null=null, frame:HTMLIFrameElement|null=null;
  let currentUrl=location.href, tabId=0, expanded=false, generation=0, disposed=false;
  let timer:ReturnType<typeof setTimeout>|undefined, retry:ReturnType<typeof setTimeout>|undefined;
  let panelState='closed';
  const request=async(message:Record<string,unknown>)=>{
    try { if(!chrome.runtime.id)throw Error('Extension reloaded'); return await chrome.runtime.sendMessage(message); }
    catch { cleanup();return null; }
  };
  function cleanup(){disposed=true;delete globals[guard];host?.remove();clearTimeout(timer);clearTimeout(retry);clearInterval(navigation);document.removeEventListener('keydown',escape);document.removeEventListener('visibilitychange',visible);}
  function shell(){
    if(shadow)return shadow;
    host=document.createElement('div');host.id='newsninja-root';
    host.style.cssText='all:initial!important;position:fixed!important;inset:0!important;z-index:2147483646!important;pointer-events:none!important;display:block!important;';
    shadow=host.attachShadow({mode:'closed'});
    const style=document.createElement('style');
    style.textContent=`.brand-mark{display:block;width:28px;height:28px;object-fit:contain;object-position:center;flex-shrink:0}.launcher,.brand{display:flex;align-items:center;justify-content:center;gap:8px}.brand{width:fit-content}:host{color-scheme:light;font-family:system-ui,sans-serif}.launcher{font-family:system-ui,sans-serif}*{box-sizing:border-box}button{font:inherit;cursor:pointer}button:focus-visible,a:focus-visible{outline:2px solid #874957;outline-offset:3px}button{border:1px solid #e5cdd2;border-radius:7px;padding:9px 12px;background:#F6E8E7;color:#653e49;font-size:12px}button:hover{background:#efd9dd}.launcher{pointer-events:auto;position:fixed;right:18px;bottom:24px;background:#ffffff;box-shadow:0 5px 25px #422A3220;border-radius:30px;padding:12px 17px;font-weight:600}.prompt{pointer-events:auto;position:fixed;top:22px;right:18px;width:min(340px,calc(100vw - 32px));padding:22px;background:#fffafb;color:#422A32;border:1px solid #ead6db;border-radius:13px;box-shadow:0 12px 45px #422A3220;font:13px/1.6 system-ui,sans-serif;animation:enter .2s ease-out}.brand{font-size:12px;color:#874957;font-weight:650;margin-bottom:12px}.prompt h2{font-size:18px;line-height:1.4;margin:5px 0}.prompt p{color:#79656d;margin:10px 0 18px}.actions{display:flex;gap:8px}.primary{background:#874957;color:white}.close{position:absolute;top:10px;right:10px;background:none;border:0;padding:3px 8px;font-size:20px}.frame{pointer-events:auto;position:fixed;right:18px;top:24px;bottom:24px;width:min(360px,calc(100vw - 24px));height:calc(100dvh - 48px);border:1px solid #e5cdd2;border-radius:13px;background:#FCF8F7;box-shadow:0 15px 60px #422A3225;animation:enter .2s ease-out}.frame.expanded{width:min(780px,calc(100vw - 24px))}@media(max-width:500px){.frame{right:12px;top:12px;height:calc(100dvh - 24px)}.prompt{right:12px}}@keyframes enter{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){*{animation:none!important}}`;
    shadow.append(style);document.documentElement.append(host);return shadow;
  }
  function button(label:string,action:()=>void,className=''){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.className=className;b.addEventListener('click',action);return b;
  }
  function save(state:string){panelState=state;void request({type:'NN_PANEL_STATE',state})}
  function dismiss(){shadow?.querySelector('.prompt')?.remove();launcher();}
  function brandLogo(){const image=document.createElement('img');image.src=chrome.runtime.getURL('newsninja-logo.png');image.alt='';image.className='brand-mark';return image;}
  function launcher(){
    if(frame && panelState==='open')return;
    const root=shell();if(root.querySelector('.launcher'))return;
    const launch=button('',()=>void open(false),'launcher');const label=document.createElement('span');label.textContent='NewsNinja';launch.append(brandLogo(),label);launch.setAttribute('aria-label','Open NewsNinja analysis panel');root.append(launch);
  }
  async function open(analyze:boolean){
    const route=generation;
    if(analyze){const response=await request({type:'NN_INTENT'});if(!response?.ok||route!==generation)return;}
    if(disposed||route!==generation)return;
    const root=shell();root.querySelector('.prompt')?.remove();root.querySelector('.launcher')?.remove();
    if(!frame){
      frame=document.createElement('iframe');frame.className='frame';frame.title='NewsNinja article analysis';
      frame.src=chrome.runtime.getURL(`index.html?embedded=1&sourceTab=${tabId}`);
      root.append(frame);
    }
    frame.hidden=false;save('open');frame.focus();
  }
  function minimize(close=false){if(frame)frame.hidden=true;shadow?.querySelector('.prompt')?.remove();save(close?'closed':'minimized');launcher();(shadow?.querySelector('.launcher') as HTMLButtonElement)?.focus()}
  function escape(e:KeyboardEvent){if(e.key==='Escape'&&panelState==='open')minimize()}
  document.addEventListener('keydown',escape);
  chrome.runtime.onMessage.addListener((message,sender,reply)=>{
    if(!disposed&&sender.id===chrome.runtime.id&&message?.type==='NN_PAGE_URL'){reply({url:location.href});return;}
    if(!disposed&&sender.id===chrome.runtime.id&&message?.type==='NN_READ_ARTICLE'){
      try{reply({ok:true,article:readArticle()})}catch{reply({ok:false,code:'ARTICLE_NOT_FOUND',error:'Article extraction failed. Wait for the page to finish loading and retry.'})}
      return;
    }
    if(disposed||sender.id!==chrome.runtime.id||message?.type!=='NN_CONTROL')return;
    if(message.action==='expand'){expanded=!expanded;frame?.classList.toggle('expanded',expanded)}
    else if(message.action==='minimize')minimize();else if(message.action==='close')minimize(true);
  });
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.autoPrompts?.newValue===false)shadow?.querySelector('.prompt')?.remove()});
  async function detect(){
    const route=generation;
    if(disposed||document.visibilityState==='hidden')return;
    if(!detectArticle())return;
    const hello=await request({type:'NN_HELLO'});
    if(!hello?.ok||route!==generation||disposed)return;
    tabId=hello.tabId;
    launcher();
    if(hello.state?.state==='open'){await open(false);return;}
    if(hello.state){panelState=hello.state.state;return;}
    if(!hello.autoPrompts)return;
    const claim=await request({type:'NN_CLAIM_PROMPT'});
    if(!claim?.show||route!==generation||disposed)return;
    const prompt=document.createElement('section');prompt.className='prompt';prompt.setAttribute('role','region');prompt.setAttribute('aria-label','NewsNinja invitation');
    const brand=document.createElement('div');brand.className='brand';const label=document.createElement('span');label.textContent='NewsNinja';brand.append(brandLogo(),label);
    const heading=document.createElement('h2');heading.textContent='Want another perspective?';
    const description=document.createElement('p');description.textContent='NewsNinja can help you find other reporting on this story.';
    const actions=document.createElement('div');actions.className='actions';actions.append(button('Analyze article',()=>void open(true),'primary'),button('Not now',dismiss));
    const close=button('×',dismiss,'close');close.setAttribute('aria-label','Dismiss NewsNinja prompt');
    prompt.append(brand,heading,description,actions,close);shell().append(prompt);
  }
  function schedule(){clearTimeout(timer);clearTimeout(retry);timer=setTimeout(()=>void detect(),3000);retry=setTimeout(()=>{if(!disposed&&!host)void detect()},8000)}
  function visible(){if(!disposed&&document.visibilityState==='visible')schedule()}
  document.addEventListener('visibilitychange',visible);
  // A URL-only check is cheap and catches pushState/replaceState without patching the host page.
  const navigation=setInterval(()=>{
    if(disposed)return;
    if(!chrome.runtime.id){cleanup();return;}
    if(location.href!==currentUrl){currentUrl=location.href;generation++;host?.remove();host=null;shadow=null;frame=null;panelState='closed';expanded=false;schedule()}
  },1000);
  // One delayed scan, with a bounded retry for client-rendered publishers; no mutation observer.
  schedule();
}
