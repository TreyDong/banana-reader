import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {DOMParser} from '@xmldom/xmldom';
import {isNativeReadingToggle, readingToggleAction, readingTogglePane, readingHijackEligible, shouldTakeOverReading} from '../src/reading-hijack';

function header(type='markdown', icon='lucide-book-open', label='Editing view\nSwitch to reading view', withIcon=true){
  const html=`<div class="workspace-leaf-content" data-type="${type}"><div class="view-header"><div class="view-actions"><button class="clickable-icon view-action" aria-label="${label}">${withIcon?`<svg class="svg-icon lucide lucide-${icon}"></svg>`:''}</button><button class="clickable-icon view-action" aria-label="More options"><svg class="svg-icon lucide lucide-more-vertical"></svg></button></div></div></div>`;
  return new DOMParser().parseFromString(html,'text/html');
}

test("only Obsidian's own reading-mode button counts as the native toggle",()=>{
  const doc=header();
  const buttons=doc.getElementsByTagName('button'),toggle=buttons[0],more=buttons[1];
  const icon=doc.getElementsByTagName('svg')[0];
  assert.equal(isNativeReadingToggle(toggle),true);
  assert.equal(isNativeReadingToggle(icon),true);
  assert.equal(isNativeReadingToggle(more),false);
  assert.equal(isNativeReadingToggle(doc.getElementsByTagName('div')[0]),false);
  assert.equal(isNativeReadingToggle(null),false);
  assert.equal(isNativeReadingToggle({nodeType:3,textContent:'toggle'}),false);
});

test('the toggle is recognised in a Markdown pane only, and by tooltip when the icon set changes',()=>{
  const markdown=header();
  assert.equal(markdown.getElementsByTagName('div')[0].getAttribute('data-type'),'markdown');
  assert.equal(readingTogglePane(markdown.getElementsByTagName('button')[0]),markdown.getElementsByTagName('div')[0]);
  assert.equal(readingToggleAction(markdown.getElementsByTagName('button')[1]).getAttribute('aria-label'),'More options');
  assert.equal(isNativeReadingToggle(header('pdf','lucide-book-open').getElementsByTagName('button')[0]),false);
  assert.equal(isNativeReadingToggle(header('markdown','lucide-book-open-text','打开 Banana Reader').getElementsByTagName('button')[0]),false);
  assert.equal(isNativeReadingToggle(header('markdown','lucide-book-open','Switch to reading view',false).getElementsByTagName('button')[0]),true);
  assert.equal(isNativeReadingToggle(header('markdown','lucide-book-open','打开 Banana Reader',false).getElementsByTagName('button')[0]),false);
  assert.equal(readingTogglePane(markdown.getElementsByTagName('button')[1]).getAttribute('data-type'),'markdown');
});

test('protected folders and non-Markdown files never reach the reader',()=>{
  assert.equal(readingHijackEligible('Notes/one.md','md'),true);
  assert.equal(readingHijackEligible('日记/one.md','md'),false);
  assert.equal(readingHijackEligible('60_工作库/one.md','md'),false);
  assert.equal(readingHijackEligible('20_投资库/one.md','md'),false);
  assert.equal(readingHijackEligible('A1_交易数据/one.md','md'),false);
  assert.equal(readingHijackEligible('Notes/one.pdf','pdf'),false);
  assert.equal(readingHijackEligible('Notes/one.epub','epub'),false);
});

test('the takeover needs the setting, a readable note and a button that starts reading',()=>{
  assert.equal(shouldTakeOverReading({enabled:false,path:'Notes/one.md',extension:'md'}),false);
  assert.equal(shouldTakeOverReading({enabled:true,path:'Notes/one.md',extension:'md',mode:'source'}),true);
  assert.equal(shouldTakeOverReading({enabled:true,path:'Notes/one.md',extension:'md',mode:'preview'}),false);
  assert.equal(shouldTakeOverReading({enabled:true,path:'日记/one.md',extension:'md'}),false);
  assert.equal(shouldTakeOverReading({enabled:true,path:'Notes/one.pdf',extension:'pdf'}),false);
});

async function loadPlugin(extra:Record<string,unknown>={}){
  const output=await build({entryPoints:[fileURLToPath(new URL('../src/main.ts',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',target:'es2022',external:['obsidian','electron'],logLevel:'silent'});
  const clicks:((event:any)=>void)[]=[];
  const fakeDocument={addEventListener:(type:string,handler:any)=>{if(type==='click')clicks.push(handler);},removeEventListener:()=>{}};
  const writes:unknown[]=[];
  class TFile{constructor(public path:string,public extension='md'){}}
  class Plugin{
    app={vault:{adapter:{getBasePath:()=>'/synthetic-banana-reader'},configDir:'.obsidian',on:()=>()=>{}},workspace:{on:()=>()=>{},onLayoutReady:()=>{},getLeavesOfType:()=>[] as any[]},secretStorage:{getSecret:()=>''},plugins:{enabledPlugins:new Set<string>()}};
    manifest={id:'gloss-reader',dir:'.obsidian/plugins/gloss-reader',version:'0.14.9'};
    async loadData(){return{version:5,settings:{language:'zh-CN',services:[{id:'local',name:'我的服务',kind:'codex',path:'',protocol:'openai',base:'https://api.openai.com/v1',models:[{id:'model-a',name:'自定义模型',type:'chat'}]}],taskModels:{default:{serviceId:'local',modelId:'model-a'},summary:{serviceId:'local',modelId:'model-a'}},translationEngine:'google',translationTarget:'ja',commands:[{id:'explain',name:'自定解释',prompt:'请保留 {{selection}} 原文。',builtin:true}],taskPrompts:{default:'我的问答提示词',summary:'我的总结提示词'},embedding:{topK:8,autoIndex:false},...extra},documents:{}};}
    saveData(value:unknown){writes.push(value);return Promise.resolve();}
    registerView(){}registerExtensions(){}addSettingTab(){}registerEvent(){}registerObsidianProtocolHandler(){}addRibbonIcon(){return{};}addCommand(){}removeCommand(){}
  }
  const stub={Notice:class{},TFile,Plugin,ItemView:class{},FileView:class{},FuzzySuggestModal:class{},Modal:class{},PluginSettingTab:class{},getLanguage:()=>'zh'};
  const nativeRequire=createRequire(import.meta.url);
  const context:any={module:{exports:{}},exports:{},crypto:globalThis.crypto,console,URL,AbortController,setTimeout,clearTimeout,document:fakeDocument,require:(id:string)=>id==='obsidian'?stub:nativeRequire(id)};
  Object.assign(context,{window:context});
  vm.runInNewContext(output.outputFiles[0].text,context);
  const plugin=new (context.module.exports as any).default();
  await plugin.onload();
  return{plugin,clicks,writes,TFile};
}

function leafFor(path:string,mode='source',extension='md'){
  const doc=header();
  const pane=doc.getElementsByTagName('div')[0];
  return{doc,pane,toggle:doc.getElementsByTagName('button')[0],leaf:{view:{containerEl:pane,file:undefined as any},getViewState:()=>({type:'markdown',state:{mode}})},path,extension};
}

test('the native reading button opens the note in Banana Reader when the takeover is enabled',async()=>{
  const run=await loadPlugin({takeOverReading:true});
  const scene=leafFor('Notes/one.md');
  const file=new run.TFile(scene.path,scene.extension);
  scene.leaf.view.file=file;
  run.plugin.app.workspace.getLeavesOfType=(type:string)=>type==='markdown'?[scene.leaf]:[];
  const opened:string[]=[];
  run.plugin.openFile=async(value:any)=>{opened.push(value.path);return{} as any;};
  let prevented=false,stopped=false,immediate=false;
  run.clicks[0]({target:scene.toggle,preventDefault(){prevented=true;},stopPropagation(){stopped=true;},stopImmediatePropagation(){immediate=true;}});
  assert.deepEqual(opened,[scene.path]);
  assert.equal(prevented,true);assert.equal(stopped,true);assert.equal(immediate,true);
});

test('without the takeover, or on a protected note, or back to editing, Obsidian keeps its own reading view',async()=>{
  for(const[settings,path,mode]of[[{},'Notes/one.md','source'],[{takeOverReading:true},'日记/one.md','source'],[{takeOverReading:true},'Notes/one.md','preview']]as [Record<string,unknown>,string,string][]){
    const run=await loadPlugin(settings);
    const scene=leafFor(path,mode);
    scene.leaf.view.file=new run.TFile(path,'md');
    run.plugin.app.workspace.getLeavesOfType=(type:string)=>type==='markdown'?[scene.leaf]:[];
    const opened:string[]=[];
    run.plugin.openFile=async(value:any)=>{opened.push(value.path);return{} as any;};
    let prevented=false;
    run.clicks[0]({target:scene.toggle,preventDefault(){prevented=true;},stopPropagation(){},stopImmediatePropagation(){}});
    assert.deepEqual(opened,[]);
    assert.equal(prevented,false);
  }
});

test('other header buttons and other panes are left to Obsidian',async()=>{
  const run=await loadPlugin({takeOverReading:true});
  const scene=leafFor('Notes/one.md');
  scene.leaf.view.file=new run.TFile(scene.path,'md');
  run.plugin.app.workspace.getLeavesOfType=(type:string)=>type==='markdown'?[scene.leaf]:[];
  const opened:string[]=[];
  run.plugin.openFile=async(value:any)=>{opened.push(value.path);return{} as any;};
  const other=scene.doc.getElementsByTagName('button')[1];
  let prevented=false;
  run.clicks[0]({target:other,preventDefault(){prevented=true;},stopPropagation(){},stopImmediatePropagation(){}});
  assert.deepEqual(opened,[]);
  assert.equal(prevented,false);
});
