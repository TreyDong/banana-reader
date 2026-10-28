import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {pdfNoEval,assertNoDynamicCode,buildPlugin} from '../scripts/build.mjs';
import {parseApiEvent,parseClaudeLine,parseCodexLine,parsePiLine,usageFromEvent,normalizeModels} from '../src/agent';
import {configureMobileTransport} from '../src/agent';
import {embedTexts} from '../src/rag';
import {documentWindow} from '../src/core';

function pdfFixture(){
 const line='This original source paragraph remains selectable and readable without dynamic compilation. ';
 const content='BT /F1 12 Tf 48 750 Td 16 TL\n'+Array.from({length:9},(_,i)=>'('+line+i+') Tj T*').join('\n')+'\nET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Length '+content.length+' >>\nstream\n'+content+'\nendstream'];
 let text='%PDF-1.4\n';const offsets=[0];for(const [i,object]of objects.entries()){offsets.push(text.length);text+=(i+1)+' 0 obj\n'+object+'\nendobj\n';}
 const xref=text.length;text+='xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF\n';return new TextEncoder().encode(text);
}

test('the shipped PDF engine extracts real source text with dynamic code generation blocked',async()=>{
 const built=await build({entryPoints:[fileURLToPath(new URL('../src/pdf-engine.ts',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'browser',target:'es2022',plugins:[pdfNoEval],logLevel:'silent'});
 const source=built.outputFiles[0].text;assertNoDynamicCode(source);
 const context:any={module:{exports:{}},exports:{},console,URL,URLSearchParams,TextEncoder,TextDecoder,AbortController,AbortSignal,ReadableStream,structuredClone,queueMicrotask,setTimeout,clearTimeout};context.window=context;
 vm.createContext(context,{codeGeneration:{strings:false,wasm:false}});vm.runInContext(source,context);
 const book=await context.module.exports.parsePdfFile(pdfFixture());assert.equal(book.kind,'pdf');assert.ok(book.sections.flatMap((s:any)=>s.blocks).some((block:any)=>block.text.includes('original source paragraph')));
});

test('the installation bundle rejects eval and Function constructors and retains a single host import',async()=>{
 assert.throws(()=>assertNoDynamicCode('new Function("return 1")'),/Dynamic code/);assert.throws(()=>assertNoDynamicCode('eval("1")'),/Dynamic code/);
 await buildPlugin();const source=await readFile(new URL('../main.js',import.meta.url),'utf8');assertNoDynamicCode(source);
 assert.doesNotMatch(source,/\b(?:new\s+Function|eval\s*\()/);
 assert.deepEqual([...new Set([...source.matchAll(/require\("([^"\n]+)"\)/g)].map(m=>m[1]))],['obsidian']);
});

test('malformed provider structures never become executable text, object strings or fabricated usage',()=>{
 for(const value of [null,[],true,'private response',{choices:{},content:[null,{}, {type:'text',text:{secret:'value'}}]},{candidates:[{content:{parts:[null,{text:{secret:'value'}}]}}]}]){
  for(const protocol of ['openai','responses','anthropic','gemini'] as const){const parsed=parseApiEvent(protocol,value);assert.ok(parsed.delta===undefined||typeof parsed.delta==='string');assert.ok(parsed.final===undefined||typeof parsed.final==='string');assert.ok(!JSON.stringify(parsed).includes('secret'));}
  assert.equal(usageFromEvent('openai',value),undefined);
 }
 for(const parse of [parseCodexLine,parseClaudeLine,parsePiLine])assert.deepEqual(parse('null'),{});
 assert.deepEqual(normalizeModels([null,{},['fake'],{id:'bad\u0001id'},'valid']),[{id:'valid',name:'valid'}]);
});

test('embedding responses require every vector once and reject missing, repeated and mismatched indices',async()=>{
 const settings={base:'https://example.test/v1',model:'vec',dimensions:0,topK:6};
 try{
  for(const data of [[{index:1,embedding:[1,0]},{index:1,embedding:[0,1]}],[{index:0,embedding:[1,0]},{index:2,embedding:[0,1]}],[{index:0,embedding:[1,0]},null],[{index:0,embedding:[1,0]},{index:1,embedding:[1,0,0]}]]){
   configureMobileTransport(async()=>({status:200,text:JSON.stringify({data})}));await assert.rejects(embedTexts(settings,'test',['one','two'],new AbortController().signal),/格式或向量维度无效/);
  }
 }finally{configureMobileTransport();}
});

test('DOM helpers select the owning document window even when another window is active',()=>{
 const main={},popout={createEl:()=>assert.fail('not called during lookup')};assert.equal(documentWindow({win:popout} as unknown as Document),popout);assert.notEqual(documentWindow({win:popout} as unknown as Document),main);
});
