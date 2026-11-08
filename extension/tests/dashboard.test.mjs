import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const code=ts.transpileModule(readFileSync(new URL('../src/dashboard.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const exports={};const icons=new Proxy({},{get:()=>()=>null});
vm.runInNewContext(code,{exports,URL,require:name=>name==='lucide-react'?icons:require(name)});
const render=(component,props)=>renderToStaticMarkup(createElement(component,props));
test('URL input rejects unsafe protocols and embedded credentials',()=>{
 for(const url of ['javascript:alert(1)','file:///etc/passwd','https://user:secret@example.org/story','not a url'])assert.throws(()=>exports.articleUrl(url));
 assert.equal(exports.articleUrl(' https://example.org/story ').href,'https://example.org/story');
});
test('Analyzer has a labeled URL field and honest two-step extraction guidance',()=>{
 const html=render(exports.ArticleAnalyzer,{article:null,busy:false,onAnalyze:async()=>{}});
 assert.match(html,/Article URL/);assert.match(html,/type="url"/);assert.match(html,/analyze the one you/);assert.match(html,/Paywalls are not bypassed/);
});
test('Coverage counts come from backend data and fictional mode remains visible',()=>{
 const html=render(exports.CoverageSnapshot,{result:{mode:'demo',sources:[{id:'s1'},{id:'s2'}],broader_sources:[{id:'b1'}]}});
 assert.match(html,/Same-event reports<\/dt><dd>2/);assert.match(html,/Background articles<\/dt><dd>1/);assert.match(html,/Fictional demonstration/);
});
test('Valid but unsupported reports show limited evidence instead of success',()=>{
 const html=render(exports.AnalysisStatus,{result:{mode:'live',report:{overview:[],original_analysis:null}}});
 assert.match(html,/Limited evidence/);assert.doesNotMatch(html,/Analysis complete/);
});
test('Loading state is accessible without invented percentage progress',()=>{
 const html=render(exports.LoadingAnalysis,{});
 assert.match(html,/aria-busy="true"/);assert.match(html,/role="status"/);assert.doesNotMatch(html,/[0-9]+%/);
});
