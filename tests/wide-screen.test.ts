import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {DEFAULT_READING_LAYOUT,WIDE_READING_LAYOUT,WIDE_CLASS,WIDE_MIN_WIDTH,WIDE_COLUMNS_WIDTH,WIDE_STEPS,GRID_PAD,RAIL_COL,applyReadingLayout,availableTextWidth,bandWidth,effectiveReadSize,layoutVariables,lineCharacters,measureWidth,readingLayout,readingLayoutFor,resolvedTextWidth} from '../src/reading-layout';
import {hasMarginCards} from '../src/reading-ui';

test('the default layout keeps the current measure, type size and margin column',()=>{
 assert.deepEqual(readingLayout(false),DEFAULT_READING_LAYOUT);
 assert.equal(DEFAULT_READING_LAYOUT.measureMult,1);
 assert.equal(DEFAULT_READING_LAYOUT.marginCol,340);
 assert.equal(DEFAULT_READING_LAYOUT.readScale,1);
 assert.equal(DEFAULT_READING_LAYOUT.noteScale,1);
 // min(800px, 20px * 32) — the column width of the reading view before wide mode.
 assert.equal(measureWidth(DEFAULT_READING_LAYOUT,20,32),640);
 assert.equal(effectiveReadSize(DEFAULT_READING_LAYOUT,20),20);
 // Wide mode off never widens the column, however wide the reader is.
 assert.equal(resolvedTextWidth(false,3840,DEFAULT_READING_LAYOUT,true,20,32),640);
 assert.equal(resolvedTextWidth(false,3840,DEFAULT_READING_LAYOUT,false,20,32),640);
});
test('wide mode widens the text column and the margin column, and keeps the line readable',()=>{
 const wide=readingLayout(true);
 assert.deepEqual(wide,WIDE_READING_LAYOUT);
 assert.ok(wide.marginCol>DEFAULT_READING_LAYOUT.marginCol);
 assert.ok(wide.gutterCol>=DEFAULT_READING_LAYOUT.gutterCol);
 assert.ok(wide.noteGap>DEFAULT_READING_LAYOUT.noteGap);
 const width=measureWidth(wide,20,32);
 assert.ok(width>measureWidth(DEFAULT_READING_LAYOUT,20,32));
 // 32 characters per line become 56; a long line is never stretched to 1200px.
 assert.equal(width,1120);
 assert.equal(lineCharacters(wide,20,32),56);
 // A large font hits the cap instead of pushing the line further.
 assert.equal(measureWidth(wide,28,37),1120);
 assert.equal(measureWidth(wide,15,28),756);
 assert.equal(measureWidth(DEFAULT_READING_LAYOUT,28,37),800);
});
test('the steps choose the type size and the column cap, not whether wide mode applies',()=>{
 for(const container of [1440,2199])assert.deepEqual(readingLayoutFor(true,container),WIDE_READING_LAYOUT);
 assert.deepEqual(readingLayoutFor(true,2200),WIDE_STEPS[0].layout);
 assert.deepEqual(readingLayoutFor(true,2759),WIDE_STEPS[0].layout);
 assert.deepEqual(readingLayoutFor(true,2760),WIDE_STEPS[1].layout);
 // Off, or below the wide threshold, the default layout is untouched: no type change.
 assert.deepEqual(readingLayoutFor(false,3840),DEFAULT_READING_LAYOUT);
 assert.deepEqual(readingLayoutFor(true,WIDE_MIN_WIDTH-1),DEFAULT_READING_LAYOUT);
 assert.deepEqual(readingLayoutFor(true,WIDE_COLUMNS_WIDTH-1),DEFAULT_READING_LAYOUT);
 // The type grows with the column so the line keeps 50-60 characters.
 const tiers=[[WIDE_READING_LAYOUT,20],[WIDE_STEPS[0].layout,25],[WIDE_STEPS[1].layout,32]] as const;
 for(const [layout,font] of tiers){
  assert.equal(effectiveReadSize(layout,20),font);
  for(const measure of [28,32,37]){
   const characters=lineCharacters(layout,20,measure);
   assert.ok(characters>=50&&characters<=60,'characters per line '+characters);
  }
 }
 // A 4K reader fills about 70% of the width instead of a narrow band.
 const band4k=availableTextWidth(3840,WIDE_STEPS[1].layout,true);
 const band2560=availableTextWidth(2560,WIDE_STEPS[0].layout,true);
 assert.ok(bandWidth(WIDE_STEPS[1].layout,band4k)>=3840*.7);
 assert.ok(bandWidth(WIDE_STEPS[0].layout,band2560)>=2560*.7);
 assert.ok(bandWidth(WIDE_READING_LAYOUT,availableTextWidth(1470,WIDE_READING_LAYOUT,true))>bandWidth(DEFAULT_READING_LAYOUT,640));
 // The margin notes grow with their column instead of stretching to long lines.
 assert.ok(WIDE_STEPS[0].layout.noteScale>1&&WIDE_STEPS[1].layout.noteScale>WIDE_STEPS[0].layout.noteScale);
});
test('wide mode fills the available width from 1200px, and a missing margin column returns its space',()=>{
 // 1470px reader with margin cards: content box minus padding, rail, gutter, gap and margin column.
 assert.equal(availableTextWidth(1470,WIDE_READING_LAYOUT,true),778);
 assert.equal(1470-GRID_PAD*2-RAIL_COL-WIDE_READING_LAYOUT.gutterCol-WIDE_READING_LAYOUT.noteGap-WIDE_READING_LAYOUT.marginCol,778);
 // Reed notes collapse the column, so the text column takes the space back (capped by m-max).
 assert.equal(availableTextWidth(1470,WIDE_READING_LAYOUT,false),1120);
 assert.equal(availableTextWidth(3840,WIDE_STEPS[1].layout,false),1856);
 assert.equal(availableTextWidth(3840,WIDE_STEPS[1].layout,true),1856);
 // Between 1200 and 1439 the type size stays the default, but the column already uses the room.
 assert.deepEqual(readingLayoutFor(true,1300),DEFAULT_READING_LAYOUT);
 assert.equal(availableTextWidth(1300,DEFAULT_READING_LAYOUT,true),760);
 assert.equal(availableTextWidth(1300,DEFAULT_READING_LAYOUT,false),800);
 // The resolved width only leaves the character measure past the wide threshold.
 assert.equal(resolvedTextWidth(true,1470,WIDE_READING_LAYOUT,true,20,32),778);
 assert.equal(resolvedTextWidth(true,1470,WIDE_READING_LAYOUT,false,20,32),1120);
 assert.equal(resolvedTextWidth(true,1300,DEFAULT_READING_LAYOUT,true,20,32),760);
 assert.equal(resolvedTextWidth(true,1199,DEFAULT_READING_LAYOUT,true,20,32),640);
 // Below the threshold nothing moves, with or without notes.
 assert.equal(resolvedTextWidth(true,1100,DEFAULT_READING_LAYOUT,false,20,32),640);
});
test('the margin column is only reserved when the document has cards for it',()=>{
 assert.equal(hasMarginCards([],[]),false);
 assert.equal(hasMarginCards([{id:'t'} as never],[]),true);
 assert.equal(hasMarginCards([],[{id:'h'} as never]),true);
});
test('toggling wide mode writes the default variables and the class onto the reader root',()=>{
 const classes=new Set<string>(),values=new Map<string,string>();
 const root={style:{setProperty:(name:string,value:string)=>{values.set(name,value);}},toggleClass:(name:string,value:boolean)=>{value?classes.add(name):classes.delete(name);}};
 applyReadingLayout(root as never,true);
 assert.ok(classes.has(WIDE_CLASS));
 // The wide values live in styles.css; the root keeps the default variables so turning the switch off restores them.
 assert.deepEqual([...values.entries()].sort(),Object.entries(layoutVariables(DEFAULT_READING_LAYOUT)).sort());
 applyReadingLayout(root as never,false);
 assert.equal(classes.has(WIDE_CLASS),false);
 assert.deepEqual([...values.entries()].sort(),Object.entries(layoutVariables(DEFAULT_READING_LAYOUT)).sort());
});
test('the stylesheet carries the same steps, the available-width rule and the empty-margin collapse',async()=>{
 const css=await readFile(new URL('../styles.css',import.meta.url),'utf8');
 assert.ok(css.includes('--read-size:calc(var(--read-base)*var(--read-scale))'));
 assert.ok(css.includes('--m:min(var(--m-max),calc(var(--read-size)*var(--measure-k)*var(--measure-mult)))'));
 assert.ok(css.includes('grid-template-columns:var(--rail-col) var(--gutter-col) minmax(0,var(--m)) var(--note-gap) var(--margin-col)'));
 assert.ok(css.includes('--grid-pad:24px'));
 // Wide mode takes whatever is left after the fixed columns, capped by m-max.
 const available=css.match(new RegExp('@container\\(min-width:'+WIDE_MIN_WIDTH+'px\\)\\{\\.gloss-root\\.gloss-wide \\.gloss-reader-grid\\{([^}]*)\\}\\}'))?.[1]||'';
 assert.ok(available,'missing available-width rule');
 assert.ok(available.includes('100cqw'));
 for(const name of ['--grid-pad','--rail-col','--gutter-col','--note-gap','--margin-col'])assert.ok(available.includes('var('+name+')'),'available-width rule missing '+name);
 // The steps only set the type size and the column caps.
 for(const step of WIDE_STEPS){
  const rule=css.match(new RegExp('@container\\(min-width:'+step.minWidth+'px\\)\\{\\.gloss-root\\.gloss-wide \\.gloss-reader-grid\\{([^}]*)\\}\\}'))?.[1]||'';
  assert.ok(rule,'missing container query for '+step.minWidth);
  for(const [name,value] of Object.entries(layoutVariables(step.layout)))assert.ok(rule.includes(name+':'+value),step.minWidth+' missing '+name);
  assert.ok(!rule.includes('--m:'),'step '+step.minWidth+' must not gate the text width');
 }
 const columns=css.match(new RegExp('@container\\(min-width:'+WIDE_COLUMNS_WIDTH+'px\\)\\{\\.gloss-root\\.gloss-wide \\.gloss-reader-grid\\{([^}]*)\\}\\}'))?.[1]||'';
 for(const [name,value] of Object.entries(layoutVariables(WIDE_READING_LAYOUT)))if(value!=='1')assert.ok(columns.includes(name+':'+value),'wide columns missing '+name);
 // The collapse has to come after the steps: same specificity, so source order decides.
 const collapse=css.indexOf('.gloss-root.gloss-no-margin .gloss-reader-grid{--margin-col:0px;--note-gap:0px;}');
 assert.ok(collapse>0,'missing empty-margin collapse');
 assert.ok(collapse>css.indexOf('@container(min-width:2760px)'),'collapse must follow the steps');
 // Narrow templates read the same variables, so the collapse reaches them too.
 assert.ok(css.includes('grid-template-columns:var(--rail-col) minmax(0,var(--m)) var(--note-gap) var(--margin-col)'));
});

function memoryStorage(){
 const files=new Map<string,string>(),directories=new Set<string>();
 const storage={exists:async(path:string)=>files.has(path)||directories.has(path),stat:async(path:string)=>files.has(path)?{size:files.get(path)!.length}:null,read:async(path:string)=>{if(!files.has(path))throw new Error('Missing '+path);return files.get(path)!;},write:async(path:string,data:string)=>{files.set(path,data);},mkdir:async(path:string)=>{directories.add(path);},rename:async(from:string,to:string)=>{if(!files.has(from))throw new Error('Missing '+from);files.set(to,files.get(from)!);files.delete(from);},remove:async(path:string)=>{files.delete(path);}};
 return{storage};
}
test('wide mode is a stored setting that defaults to off and reaches the reader root',async()=>{
 const result=await build({entryPoints:[fileURLToPath(new URL('../src/main.ts',import.meta.url))],bundle:true,write:false,format:'cjs',platform:'node',target:'es2022',external:['obsidian','electron'],logLevel:'silent'});
 let saved:any=null;const views=new Map<string,any>();
 const m=memoryStorage();
 const app={vault:{adapter:m.storage,configDir:'.obsidian',on:()=>()=>{}},workspace:{on:()=>()=>{},onLayoutReady:()=>{},getLeavesOfType:()=>[]}};
 class Plugin{app=app;manifest={id:'gloss-reader',dir:'.obsidian/plugins/gloss-reader'};loadData=async()=>saved;saveData=async(data:any)=>{saved=data;};registerView=(id:string,factory:any)=>views.set(id,factory);registerExtensions(){}addSettingTab(){}registerEvent(){}registerObsidianProtocolHandler(){}addRibbonIcon(){return{};}addCommand(){}removeCommand(){}}
 const obsidian={Plugin,Platform:{isMobile:true},TFile:class{},ItemView:class{},FileView:class{},FuzzySuggestModal:class{},Modal:class{},PluginSettingTab:class{},getLanguage:()=>'zh'};
 const context={module:{exports:{}},exports:{},console,crypto:globalThis.crypto,TextEncoder,TextDecoder,URL,AbortController,setTimeout,clearTimeout,require:(id:string)=>{assert.equal(id,'obsidian','Unexpected module '+id);return obsidian;}};
 Object.assign(context,{window:context});
 vm.runInNewContext(result.outputFiles[0].text,context);
 const plugin=new (context.module.exports as any).default();
 await plugin.onload();
 assert.equal(plugin.store.settings.wide,false);
 plugin.store.settings.wide=true;
 await plugin.persist();
 assert.equal(saved.settings.wide,true);

 const view=views.get('gloss-reader')({});
 const classes=new Set<string>(),values=new Map<string,string>();
 view.root={dataset:{} as any,style:{setProperty:(name:string,value:string)=>{values.set(name,value);}},toggleClass:(name:string,value:boolean)=>{value?classes.add(name):classes.delete(name);},ownerDocument:{defaultView:{matchMedia:()=>({matches:false})}},isConnected:true};
 view.syncChrome=()=>{};view.scheduleLayout=()=>{};
 view.applyAppearance();
 assert.ok(classes.has(WIDE_CLASS));
 assert.equal(values.get('--read-base'),'20px');
 // The switch only toggles the class; the wide column values come from styles.css.
 assert.equal(values.get('--margin-col'),'340px');
 assert.equal(values.get('--m-max'),'800px');
 assert.equal(values.get('--read-scale'),'1');
 plugin.store.settings.wide=false;
 view.applyAppearance();
 assert.equal(classes.has(WIDE_CLASS),false);
 assert.equal(values.get('--margin-col'),'340px');
});
