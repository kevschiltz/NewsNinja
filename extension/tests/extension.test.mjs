import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {webcrypto} from 'node:crypto';

function load(file,globals={},imports={}){
  const exports={};
  const code=ts.transpileModule(readFileSync(new URL('../src/'+file,import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:name=>imports[name],URL,console,setTimeout,clearTimeout,...globals});return exports;
}
const {likelyNewsArticle,readArticle}=load('article.ts');
const signals={path:'/news/council-vote',search:'',schema:true,ogArticle:true,article:true,headline:true,date:true,textLength:2400,paragraphs:8,linkDensity:.05,newsHint:true};
test('NewsArticle and strong unstructured news evidence are detected',()=>{
  assert.equal(likelyNewsArticle(signals),true);
  assert.equal(likelyNewsArticle({...signals,schema:false,ogArticle:false}),true);
});
for(const [name,override] of Object.entries({homepage:{path:'/'},search:{search:'?q=story'},category:{path:'/category/world'},short:{textLength:300},listing:{linkDensity:.6},noHeadline:{headline:false},unrelatedBlog:{schema:false,newsHint:false},documentation:{path:'/docs/article'}})){
  test(`Rejects ${name}`,()=>assert.equal(likelyNewsArticle({...signals,...override}),false));
}
test('Extraction handles metadata and does not claim full-text completeness',()=>{
  const paragraphs=[{textContent:'A reported event with factual context.',closest:()=>null},{textContent:'Another paragraph with supporting reporting.',closest:()=>null}];
  const doc={title:'Fallback',querySelectorAll:()=>[],querySelector:selector=>{
    if(selector==='article')return {querySelectorAll:()=>paragraphs};
    if(selector==='h1')return {textContent:'Council approves pilot'};
    if(selector.includes('og:site_name'))return {content:'Local News'};
    return null;
  }};
  const {readArticle:extract}=load('article.ts',{document:doc,location:{href:'https://news.example/story',hostname:'news.example'}});
  const article=extract();assert.equal(article.title,'Council approves pilot');assert.equal(article.publisher,'Local News');assert.match(article.text,/Another paragraph/);assert.equal(article.full_text,false);
});
function worker(){
  const session={},local={},listeners=[],removed=[];let extracted=0;
  const area=data=>({get:async key=>typeof key==='string'?{[key]:data[key]}:Object.fromEntries(key.map(k=>[k,data[k]])),set:async value=>Object.assign(data,structuredClone(value)),remove:async keys=>{for(const k of [keys].flat())delete data[k]}});
  const chrome={action:{onClicked:{addListener:()=>{}}},runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener:f=>listeners.push(f)}},
    permissions:{contains:async()=>false},storage:{session:area(session),local:area(local)},tabs:{get:async id=>({id,url:'https://news.example/story'}),create:async()=>{},sendMessage:async(id,msg)=>{if(msg.type==='NN_READ_ARTICLE'){extracted++;return {ok:true,article:{title:'Story',url:'https://news.example/story',text:'Reporting '.repeat(50)}}}},onRemoved:{addListener:f=>removed.push(f)}},
    scripting:{executeScript:async()=>{throw Error('Cannot access contents: host permission required')}}};
  const access=load('access.ts',{chrome},{'./article':{readArticle}});
  load('background.ts',{chrome,crypto:webcrypto},{'./access':access});
  const content=(tab=1)=>({id:'test',frameId:0,url:'https://news.example/story',tab:{id:tab}});
  const page={id:'test',frameId:1,url:'chrome-extension://test/index.html?embedded=1',tab:{id:1}};
  const send=(msg,sender=content())=>new Promise(resolve=>{const handled=listeners[0](msg,sender,resolve);if(!handled)resolve(undefined)});
  return {chrome,session,local,send,content,page,removed,get extracted(){return extracted}};
}
test('Prompt is claimed once per article across concurrent tabs',async()=>{
  const w=worker();const results=await Promise.all([w.send({type:'NN_CLAIM_PROMPT'}),w.send({type:'NN_CLAIM_PROMPT'},w.content(2))]);
  assert.equal(results.filter(r=>r.show).length,1);
  assert.equal((await w.send({type:'NN_CLAIM_PROMPT'})).show,false);
  assert.equal(w.extracted,0);
});
test('Disabling prompts persists and does not disable manual state',async()=>{
  const w=worker();w.local.autoPrompts=false;
  assert.equal((await w.send({type:'NN_CLAIM_PROMPT'})).show,false);
  await w.send({type:'NN_PANEL_STATE',state:'minimized'});
  const hello=await w.send({type:'NN_HELLO'});assert.equal(hello.autoPrompts,false);assert.equal(hello.state.state,'minimized');
});
test('Content scripts cannot invoke privileged extraction; foreign senders and cross-tab frames are rejected',async()=>{
  const w=worker();assert.equal((await w.send({type:'NN_EXTRACT',tabId:1})).ok,false);
  assert.equal(await w.send({type:'NN_HELLO'},{...w.content(),id:'foreign'}),undefined);
  assert.equal((await w.send({type:'NN_EXTRACT',tabId:2},w.page)).ok,false);
  assert.equal(w.extracted,0);
  assert.equal((await w.send({type:'NN_EXTRACT',tabId:1},w.page)).ok,true);assert.equal(w.extracted,1);
});
test('A user analysis intent is single-use and navigation-bound',async()=>{
  const w=worker();assert.equal((await w.send({type:'NN_TAKE_INTENT',tabId:1},w.page)).analyze,false);
  await w.send({type:'NN_INTENT'});
  assert.equal((await w.send({type:'NN_TAKE_INTENT',tabId:1},w.page)).analyze,true);
  assert.equal((await w.send({type:'NN_TAKE_INTENT',tabId:1},w.page)).analyze,false);
  w.session['intent:1']={url:'https://news.example/old',at:Date.now()};
  assert.equal((await w.send({type:'NN_TAKE_INTENT',tabId:1},w.page)).analyze,false);
});
test('Analysis lease prevents duplicate paid requests and checks the source URL',async()=>{
  const w=worker(),message={type:'NN_BEGIN_ANALYSIS',tabId:1,url:'https://news.example/story'};
  const first=await w.send(message,w.page);assert.equal(first.started,true);
  assert.equal((await w.send(message,w.page)).started,false);
  await w.send({type:'NN_END_ANALYSIS',tabId:1,token:'wrong'},w.page);
  assert.equal((await w.send(message,w.page)).started,false);
  await w.send({type:'NN_END_ANALYSIS',tabId:1,token:first.token},w.page);
  assert.equal((await w.send(message,w.page)).started,true);
  assert.equal((await w.send({...message,url:'https://news.example/stale'},w.page)).ok,false);
});
test('Closed tab removes per-tab cache and intents',async()=>{
  const w=worker();w.session['analysis:1']={};w.session['running:1']={};await w.send({type:'NN_INTENT'});w.removed[0](1);await new Promise(r=>setTimeout(r,0));assert.equal(Object.keys(w.session).length,0);
});
test('Packaged manifest has all local entry files and no external code',()=>{
  const base=new URL('../dist/',import.meta.url);const manifest=JSON.parse(readFileSync(new URL('manifest.json',base),'utf8'));
  for(const file of [manifest.background.service_worker,...manifest.content_scripts.flatMap(c=>c.js)])assert.ok(existsSync(new URL(file,base)),file);
  assert.equal(manifest.background.type,'module');assert.ok(manifest.permissions.includes('storage'));
  assert.doesNotMatch(readFileSync(new URL('content.js',base),'utf8'),/import\s*\(/);
  assert.ok(existsSync(new URL('index.html',base)));
});

function contentHarness({prompts=true}={}){
  class Element{
    constructor(tag){this.tag=tag;this.children=[];this.style={};this.events={};this.hidden=false;this.className='';this.classList={toggle:(name,on)=>{this.className=on?this.className+' '+name:this.className.replace(' '+name,'')}}}
    append(...children){for(const child of children){child.parent=this;this.children.push(child)}}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(e=>e!==this)}
    setAttribute(name,value){this[name]=value}
    addEventListener(name,action){this.events[name]=action}
    attachShadow(){this.shadow=new Element('shadow');return this.shadow}
    querySelector(selector){return this.children.find(e=>e.className.split(' ').includes(selector.slice(1)))||this.children.map(e=>e.querySelector(selector)).find(Boolean)||null}
    focus(){this.focused=true}
  }
  const timers=[],intervals=[],messages=[],handlers=[],root=new Element('html');
  const doc={documentElement:root,visibilityState:'visible',createElement:tag=>new Element(tag),addEventListener:()=>{},removeEventListener:()=>{}};
  const win={};win.top=win;
  let claimed=false;
  const location={href:'https://news.example/story'};
  const chrome={runtime:{id:'test',getURL:path=>'chrome-extension://test/'+path,onMessage:{addListener:f=>handlers.push(f)},sendMessage:async msg=>{
    messages.push(msg);
    if(msg.type==='NN_HELLO')return {ok:true,tabId:1,autoPrompts:prompts};
    if(msg.type==='NN_CLAIM_PROMPT'){const show=!claimed;claimed=true;return {ok:true,show}}
    return {ok:true};
  }},storage:{onChanged:{addListener:()=>{}}}};
  load('content.ts',{window:win,document:doc,location,chrome,setTimeout:(fn,delay)=>{timers.push({fn,delay});return timers.length},clearTimeout:()=>{},setInterval:fn=>{intervals.push(fn);return 1},clearInterval:()=>{}},{'./article':{detectArticle:()=>true}});
  const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve()};
  return {root,timers,intervals,messages,handlers,location,flush};
}
test('Automatic invitation makes no analysis request; user opens, minimizes, expands and reopens one panel',async()=>{
  const h=contentHarness();assert.equal(h.timers[0].delay,3000);h.timers[0].fn();await h.flush();
  const shadow=h.root.children[0].shadow;
  const prompt=shadow.querySelector('.prompt');assert.ok(prompt);
  assert.equal(h.messages.some(m=>m.type==='NN_INTENT'),false);
  const actions=prompt.querySelector('.actions');actions.children[0].events.click();await h.flush();
  assert.equal(h.messages.filter(m=>m.type==='NN_INTENT').length,1);
  const frame=shadow.querySelector('.frame');assert.ok(frame);assert.match(frame.src,/embedded=1&sourceTab=1/);
  h.handlers[0]({type:'NN_CONTROL',action:'minimize'},{id:'test'});assert.equal(frame.hidden,true);
  shadow.querySelector('.launcher').events.click();await h.flush();assert.equal(frame.hidden,false);
  assert.equal(shadow.children.filter(e=>e.tag==='iframe').length,1);
  h.handlers[0]({type:'NN_CONTROL',action:'expand'},{id:'test'});assert.match(frame.className,/expanded/);
  h.handlers[0]({type:'NN_CONTROL',action:'close'},{id:'test'});assert.equal(frame.hidden,true);assert.ok(shadow.querySelector('.launcher'));
});
test('Dismissal keeps manual launcher; disabled prompts never appear; SPA navigation removes old panel',async()=>{
  const h=contentHarness();h.timers[0].fn();await h.flush();
  const shadow=h.root.children[0].shadow;
  shadow.querySelector('.prompt').querySelector('.close').events.click();assert.equal(shadow.querySelector('.prompt'),null);assert.ok(shadow.querySelector('.launcher'));
  h.location.href='https://news.example/new-story';h.intervals[0]();assert.equal(h.root.children.length,0);
  const disabled=contentHarness({prompts:false});disabled.timers[0].fn();await disabled.flush();
  const other=disabled.root.children[0].shadow;assert.equal(other.querySelector('.prompt'),null);assert.ok(other.querySelector('.launcher'));
});

test('Floating frame reads existing content script without activeTab or broad host permission',async()=>{
  const w=worker();const result=await w.send({type:'NN_EXTRACT',tabId:1},w.page);
  assert.equal(result.ok,true);assert.equal(result.article.title,'Story');assert.equal(w.extracted,1);
  const full={id:'test',frameId:0,url:'chrome-extension://test/index.html?sourceTab=1'};
  assert.equal((await w.send({type:'NN_EXTRACT',tabId:1},full)).article.text,result.article.text);
});
test('Missing site access and missing body have distinct errors',async()=>{
  const w=worker();w.chrome.tabs.sendMessage=async()=>{throw Error('Receiving end does not exist')};
  const denied=await w.send({type:'NN_EXTRACT',tabId:1},w.page);assert.equal(denied.code,'SITE_PERMISSION');
  w.chrome.tabs.sendMessage=async()=>({ok:true,article:{title:'Video',text:''}});
  assert.equal((await w.send({type:'NN_EXTRACT',tabId:1},w.page)).code,'ARTICLE_NOT_FOUND');
});
test('Toolbar permission can recover when content script is absent',async()=>{
  const w=worker();let injected=false;
  w.chrome.tabs.sendMessage=async()=>{if(!injected)throw Error('No receiving end');return {ok:true,article:{title:'Recovered',text:'Article reporting. '.repeat(30)}}};
  w.chrome.scripting.executeScript=async()=>{injected=true;return []};
  assert.equal((await w.send({type:'NN_EXTRACT',tabId:1},w.page)).article.title,'Recovered');
});
test('Restricted URL is diagnosed before injecting',async()=>{
  const w=worker();w.chrome.tabs.get=async()=>({id:1,url:'chrome://extensions'});
  assert.equal((await w.send({type:'NN_EXTRACT',tabId:1},w.page)).code,'RESTRICTED_PAGE');
});

test('Hidden tabs metadata does not invalidate floating extraction or analysis lease',async()=>{
  const w=worker();w.chrome.tabs.get=async()=>({id:1});
  w.chrome.tabs.sendMessage=async(id,msg)=>msg.type==='NN_PAGE_URL'?{url:'https://news.example/story'}:{ok:true,article:{title:'Public story',url:'https://news.example/story',text:'Public reporting '.repeat(40)}};
  assert.equal((await w.send({type:'NN_SOURCE_URL',tabId:1},w.page)).url,'https://news.example/story');
  assert.equal((await w.send({type:'NN_EXTRACT',tabId:1},w.page)).ok,true);
  assert.equal((await w.send({type:'NN_BEGIN_ANALYSIS',tabId:1,url:'https://news.example/story'},w.page)).started,true);
});
