import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import ts from 'typescript';
import {ENGLISH,normalizeLanguage,resolveLanguage,translate,commandName,relativeTime,receiptText,notebookSummary} from '../src/i18n';

test('language preference follows Obsidian, supports explicit overrides and normalizes old data',()=>{
 for(const value of [undefined,null,'invalid',{},'auto'])assert.equal(normalizeLanguage(value),'auto');
 for(const host of ['zh','zh-CN','zh-TW','zh_Hant','ZH-cn'])assert.equal(resolveLanguage('auto',host),'zh-CN');
 for(const host of ['en','en-US','ja',''])assert.equal(resolveLanguage(undefined,host),'en');
 assert.equal(resolveLanguage('en','zh'),'en');assert.equal(resolveLanguage('zh-CN','en'),'zh-CN');
});
test('UI labels switch languages while placeholders and unknown user values remain literal',()=>{
 assert.equal(translate('zh-CN','模型服务'),'模型服务');assert.equal(translate('en','模型服务'),'Model services');
 assert.equal(translate('en','{0} 分钟阅读 · {1} 个段落',3,8),'3 min read · 8 paragraphs');
 assert.equal(translate('zh-CN','阅读 · {0}','My {1} <book>'),'阅读 · My {1} <book>');
 assert.equal(translate('en','我的自定义名称'),'我的自定义名称');
 assert.ok(translate('en','可用变量：{{selection}} 选中文本 · {{title}} 文档名').includes('{{selection}}'));
});
test('only unedited built-in command names are translated',()=>{
 assert.equal(commandName({id:'explain',name:'解释'},'en'),'Explain');
 assert.equal(commandName({id:'explain',name:'我的解释'},'en'),'我的解释');
 assert.equal(commandName({id:'custom',name:'解释'},'en'),'解释');
 assert.equal(commandName({id:'explain',name:'解释'},'zh-CN'),'解释');
});
test('generated time and usage metadata localize without touching source text',()=>{
 const now=Date.UTC(2026,9,20,12);
 assert.equal(relativeTime(now-10_000,now,'en'),'Just now');
 assert.equal(relativeTime(now-120_000,now,'en'),'2 min ago');
 assert.equal(relativeTime(now-7200_000,now,'zh-CN'),'2 小时前');
 assert.equal(receiptText('1,200 输入 · 30 输出','en'),'1,200 input · 30 output');
 assert.equal(receiptText('用量未返回','en'),'Usage not returned');
 assert.equal(receiptText('用量未返回','zh-CN'),'用量未返回');
 assert.equal(notebookSummary(0,1,'en'),'0 questions, 1 mark');assert.equal(notebookSummary(1,2,'en'),'1 question, 2 marks');
});
test('every explicit UI message has an English catalog entry with matching format slots',async()=>{
 const text=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
 const source=ts.createSourceFile('main.ts',text,ts.ScriptTarget.Latest,true);let checked=0;
 const slots=(s:string)=>(s.match(/\{\d+\}/g)||[]).sort();
 function visit(n:ts.Node){
  if(ts.isCallExpression(n)&&ts.isIdentifier(n.expression)&&n.expression.text==='ui'&&n.arguments[0]&&ts.isStringLiteral(n.arguments[0])){
   const key=n.arguments[0].text;assert.ok(Object.hasOwn(ENGLISH,key),'Missing English UI message: '+key);
   assert.deepEqual(slots(ENGLISH[key]),slots(key),key);checked++;
  }
  ts.forEachChild(n,visit);
 }
 visit(source);assert.ok(checked>450);
});

async function loadPlugin(saved:unknown,host='zh'){
 const output=await build({entryPoints:[fileURLToPath(new URL('../src/main.ts',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',target:'es2022',external:['obsidian','electron'],logLevel:'silent'});
 const views=new Map<string,(leaf:any)=>any>();const commands=new Map<string,{id:string;name:string}>();const writes:any[]=[];let failSave=false;let modelCalls=0;
 const source=structuredClone(saved);
 const vault={adapter:{getBasePath:()=>'/synthetic-banana-reader'},configDir:'.obsidian',on:()=>()=>{}};
 class Plugin{
  app={vault,workspace:{on:()=>()=>{},onLayoutReady:()=>{}},secretStorage:{getSecret:()=>''}};
  manifest={id:'gloss-reader',dir:'.obsidian/plugins/gloss-reader',version:'0.12.5'};
  loadData(){return Promise.resolve(structuredClone(source));}
  saveData(value:unknown){if(failSave)return Promise.reject(new Error('Synthetic save failure'));writes.push(structuredClone(value));return Promise.resolve();}
  registerView(id:string,factory:(leaf:any)=>any){views.set(id,factory);}registerExtensions(){}addSettingTab(){}registerEvent(){}registerObsidianProtocolHandler(){}
  addRibbonIcon(){return{setAttribute(){}};}
  addCommand(command:{id:string;name:string}){commands.set(command.id,command);return command;}
  removeCommand(id:string){commands.delete(id);}
 }
 const nativeRequire=createRequire(import.meta.url);
 const stub={Plugin,ItemView:class{},FileView:class{},FuzzySuggestModal:class{},Modal:class{},PluginSettingTab:class{},getLanguage:()=>host};
 const context={module:{exports:{}},exports:{},crypto:globalThis.crypto,console,URL,AbortController,setTimeout,clearTimeout,require:(id:string)=>{
  if(id==='obsidian')return stub;
  if(['node:child_process','node:http','node:https'].includes(id))return new Proxy({}, {get:()=>()=>{modelCalls++;throw new Error('Language changes must not call a model service');}});
  return nativeRequire(id);
 }};
 vm.runInNewContext(output.outputFiles[0].text,context);
 const Constructor=(context.module.exports as any).default;const plugin=new Constructor();await plugin.onload();
 return{plugin,commands,writes,views,fail:()=>{failSave=true;},modelCalls:()=>modelCalls};
}
const fixture=()=>({version:5,settings:{language:'zh-CN',services:[{id:'local',name:'我的服务',kind:'codex',path:'',protocol:'openai',base:'https://api.openai.com/v1',models:[{id:'model-a',name:'自定义模型',type:'chat'}]}],taskModels:{default:{serviceId:'local',modelId:'model-a'},summary:{serviceId:'local',modelId:'model-a'}},translationEngine:'google',translationTarget:'ja',commands:[{id:'explain',name:'自定解释',prompt:'请保留 {{selection}} 原文。',builtin:true}],taskPrompts:{default:'我的问答提示词',summary:'我的总结提示词'},embedding:{topK:8,autoIndex:false}},documents:{'sample.md':{progress:.42,draft:'尚未发送的问题',updated:1,highlights:[{id:'h',anchor:{start:0,quote:'原文'},note:'我的批注',color:'yellow',created:1}],threads:[{id:'t',messages:[{role:'user',content:'问题'},{role:'assistant',content:'回答',model:'model-a'}],created:1}]}}});
test('real plugin language setting persists and changes commands without rewriting models, prompts or documents',async()=>{
 const run=await loadPlugin(fixture());const before=structuredClone(run.plugin.store);
 assert.equal(run.commands.get('open-reader')?.name,'进入沉浸阅读');
 await run.plugin.changeLanguage('en');
 assert.equal(run.plugin.store.settings.language,'en');assert.equal(run.commands.get('open-reader')?.name,'Enter immersive reading');
 const after=structuredClone(run.plugin.store);after.settings.language=before.settings.language;
 assert.deepEqual(after,before);assert.equal(run.writes.at(-1).settings.language,'en');assert.equal(run.modelCalls(),0);assert.equal(run.commands.size,4);
 const reopened=await loadPlugin(run.writes.at(-1),'zh');assert.equal(reopened.plugin.store.settings.language,'en');assert.equal(reopened.commands.get('open-reader')?.name,'Enter immersive reading');
 await run.plugin.changeLanguage('zh-CN');assert.equal(run.commands.get('open-reader')?.name,'进入沉浸阅读');
});
test('failed language persistence restores the active language and existing command labels',async()=>{
 const run=await loadPlugin(fixture());run.fail();await assert.rejects(run.plugin.changeLanguage('en'),/Synthetic save failure/);
 assert.equal(run.plugin.store.settings.language,'zh-CN');assert.equal(run.commands.get('open-reader')?.name,'进入沉浸阅读');assert.equal(run.modelCalls(),0);
});

test('English UI leaves PDF page identity and active selections intact',async()=>{
 const data=fixture();data.settings.language='en';const run=await loadPlugin(data);
 const view=run.views.get('gloss-reader')!({});view.path='sample.md';
 view.passages=[{source:'PDF 第 1 页'}];view.pdf={blocks:[],text:'Original page',passages:[{source:'PDF 第 1 页'}],page:1};
 view.activeHighlight='h';view.selected={pdfPage:1,start:0,quote:'Original page'};
 view.syncPdfPage();assert.equal(view.activeHighlight,'h');assert.equal(view.selected.quote,'Original page');
});
