import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const require=createRequire(import.meta.url);
const code=ts.transpileModule(readFileSync(new URL('../src/results.tsx',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const exports={};vm.runInNewContext(code,{exports,require:name=>name==='lucide-react'?{ArrowUpRight:()=>null}:require(name)});
const sources=[{id:'original',title:'Sample title',url:'https://original.example/story',publisher:'Original',text:'Reported text.'},{id:'s1',title:'Other report',url:'https://other.example/story',publisher:'Other',text:'Other report text.'}];
const finding={title:'Decision',detail:'The sample council approves a pilot.',evidence:[{source_id:'original',quote:'The sample council approves a pilot.'}]};
test('Original summary and takeaways render without alternative coverage',()=>{
 const html=renderToStaticMarkup(createElement(exports.OriginalAnalysis,{report:{original_analysis:{summary:[finding],takeaways:[finding],entities:[],claims:[],language:[],uncertainties:[]}},sources:[sources[0]]}));
 assert.match(html,/Article summary/);assert.match(html,/Key takeaways/);assert.match(html,/approves a pilot/);assert.match(html,/https:\/\/original.example\/story/);
});
test('Additional coverage renders with citations and explicitly avoids claiming omissions',()=>{
 const html=renderToStaticMarkup(createElement(exports.AdditionalContext,{report:{additional_context:[{...finding,evidence:[{source_id:'s1',quote:'Other report text.'}]}]},sources}));
 assert.match(html,/Additional same-event reporting/);assert.match(html,/does not establish/);assert.match(html,/https:\/\/other.example\/story/);
});
test('Missing comparison state explains incomplete extraction rather than blank output',()=>{
 const html=renderToStaticMarkup(createElement(exports.SectionEmpty,{section:'missing'}));
 assert.match(html,/extracted article text may be incomplete/);assert.match(html,/Broader-topic links cannot establish omissions/);
});

test('Entity rail clearly separates people, organizations and places with their citations',()=>{
 const entities=[{...finding,title:'Jane Doe',category:'person'},{...finding,title:'City Council',category:'organization'},{...finding,title:'Paris',category:'place'}];
 const html=renderToStaticMarkup(createElement(exports.EntityGroups,{entities,sources}));
 for(const label of ['People','Organizations','Places'])assert.match(html,new RegExp(`aria-label="${label}"`));
 assert.match(html,/Jane Doe/);assert.match(html,/City Council/);assert.match(html,/Paris/);
});
test('Uncategorized older findings stay unclassified rather than guessing a person or place',()=>{
 const html=renderToStaticMarkup(createElement(exports.EntityGroups,{entities:[finding],sources}));
 assert.match(html,/Other mentions/);assert.doesNotMatch(html,/aria-label="People"/);
});

test('Repeated evidence from one article renders one citation link and retains different excerpts',()=>{
 const html=renderToStaticMarkup(createElement(exports.FindingCard,{finding:{...finding,evidence:[{source_id:'original',quote:'First supporting excerpt.'},{source_id:'original',quote:'Second supporting excerpt.'},{source_id:'original',quote:'First supporting excerpt.'}]},index:0,sources}));
 assert.equal((html.match(/href="https:\/\/original.example\/story"/g)||[]).length,1);
 assert.equal((html.match(/<blockquote>/g)||[]).length,2);
});
