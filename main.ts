import { Plugin, ItemView, WorkspaceLeaf, TFile, Notice, MarkdownRenderer, Component, PluginSettingTab, App, FuzzySuggestModal, Modal, getFrontMatterInfo, normalizePath, setIcon } from 'obsidian';
import { type Anchor, type Thread, type Message, regenerationHistory, tokenReceipt, tokenDetails, type Reading, type Passage, type Highlight, freshReading, makeAnchor, resolveAnchor, indexPassages, contextFor, blockedPath, exportReading, MARK_STYLES, markStyle, referenceTokens, type MarkStyle } from './core';
import { type AgentSettings, type ApiProtocol, API_DEFAULTS, apiEndpoint, askAgent, discoverCodexModels, discoverApiModels, discoverPiModels, mergeModels, normalizeModels, type ModelOption } from './agent';

import {type ModelService,type ModelRef,type ModelSetup,type ServiceKind,SERVICE_NAMES,SERVICE_ICONS,newService,serviceChoices,resolveModel,serviceSettings,migrateSetup,pruneAssignments} from './services';

import {placeMarginItems, anchorRange, paintMarks, type TextMark, type MarginItem, railMagnification} from './reading-ui';

import {DEFAULT_COMMANDS,MAX_COMMANDS,normalizeCommands,saveCommand,renderCommand,type ReadingCommand} from './prompts';

import {notebookCounts,notebookEntries,notebookTime,threadType,type NotebookFilter} from './notebook';

import {briefHash,briefPrompt,briefRanges,parseBrief} from './brief';

const VIEW = 'gloss-reader';
interface Settings extends AgentSettings, ModelSetup {modelLists:Record<string,ModelOption[]>; markStyle:MarkStyle; customFont:string; theme: string; fontSize: number; font: string; lineHeight: number; context: string; maxContext: number; marker: string; pen: string; measure: number; numbers: boolean; commands:ReadingCommand[]; apiProfiles:Record<string,{base:string;model:string}> }
interface Store { version: number; settings: Settings; documents: Record<string, Reading> }
const DEFAULTS: Settings = {services:[],taskModels:{},modelLists:{},markStyle:'highlight',customFont:'',commands:DEFAULT_COMMANDS.map(c=>({...c})),apiProfiles:{},claudePath:'',claudeModel:'',apiProtocol:'openai',provider: 'codex', codexPath: '', codexModel: '', apiBase: 'https://api.openai.com/v1', apiModel: '', apiKey: '', theme: 'paper', fontSize: 20, font: 'serif', lineHeight: 1.64, context: 'nearby', maxContext: 60000, marker: 'yellow', pen: 'vermilion', measure: 32, numbers: false};
const uid = () => crypto.randomUUID();
const modelKey=(s:AgentSettings,provider=s.provider)=>provider==='api'?'api:'+(s.apiProtocol||'openai'):provider;
const modelId=(s:AgentSettings,provider=s.provider)=>provider==='codex'?s.codexModel:provider==='claude'?s.claudeModel||'':provider==='pi'?s.piModel||'':s.apiModel;
const setModel=(s:AgentSettings,id:string)=>{if(s.provider==='codex')s.codexModel=id;else if(s.provider==='claude')s.claudeModel=id;else s.apiModel=id;};
const providerName=(provider:string)=>({codex:'Codex CLI',claude:'Claude CLI',pi:'Pi',api:'API'}[provider]||provider);

function button(parent: HTMLElement, text: string, action: () => void | Promise<void>, cls = ''): HTMLButtonElement {
  const b = parent.createEl('button', {text, cls}); b.type = 'button';
  b.addEventListener('click', () => {try {Promise.resolve(action()).catch(showError);} catch(e) {showError(e);}}); return b;
}
function showError(e: unknown) {new Notice(e instanceof Error ? e.message : String(e), 6000);}
function passiveEmbeds(md: string): string {
  // Do not expand other notes into the reading/AI context without the user opening them.
  return md.replace(/!\[\[([^\]]+)\]\]/g, (all, target: string) => /\.(png|jpe?g|gif|svg|webp|avif|bmp|mp3|mp4|wav|ogg)(\||$)/i.test(target) ? all : `（嵌入内容需打开原笔记查看：${target.replace(/[<>]/g, '')}）`);
}

export default class GlossPlugin extends Plugin {
  store!: Store;
  unloading = false;
  sessionKeys=new Map<string,string>();
  serviceKey(id:string){return this.app.secretStorage?.getSecret('reader-'+id)||this.sessionKeys.get(id)||'';}
  saveServiceKey(id:string,key:string){if(this.app.secretStorage)this.app.secretStorage.setSecret('reader-'+id,key);else this.sessionKeys.set(id,key);}
  private saveQueue: Promise<void> = Promise.resolve();
  async onload() {
    const saved = await this.loadData();
    this.store = {version: 3, settings: {...DEFAULTS, ...saved?.settings, apiKey: ''}, documents: saved?.documents || {}};
    this.store.settings.commands=normalizeCommands(saved?.settings?.commands);
    const settings=this.store.settings;settings.markStyle=markStyle(settings.markStyle);settings.modelLists={...(saved?.settings?.modelLists||{})};
    if(saved?.settings&&!Array.isArray(saved.settings.services)){
    const local=await discoverCodexModels();settings.modelLists.codex=settings.modelLists.codex===undefined?local:normalizeModels(settings.modelLists.codex);
    settings.modelLists.claude=settings.modelLists.claude===undefined?[{id:'sonnet',name:'Claude Sonnet'},{id:'opus',name:'Claude Opus'},{id:'haiku',name:'Claude Haiku'}]:normalizeModels(settings.modelLists.claude);
    for(const provider of ['codex','claude','api']){const key=modelKey(settings,provider),id=modelId(settings,provider);settings.modelLists[key]=mergeModels(normalizeModels(settings.modelLists[key]),id?[{id,name:id}]:[]);if(!id&&settings.modelLists[key].length){const previous=settings.provider;settings.provider=provider;setModel(settings,settings.modelLists[key][0].id);settings.provider=previous;}}

    }
    Object.assign(settings,migrateSetup({...settings,services:saved?.settings?saved.settings.services:[]}));
    if(!Array.isArray(saved?.settings?.services))await this.persist();

    if (saved && (saved.version || 1) < 2) {
      if (saved.settings?.fontSize === 19) this.store.settings.fontSize = 20;
      if (saved.settings?.lineHeight === 1.95) this.store.settings.lineHeight = 1.64;
    }
    this.registerView(VIEW, leaf => new GlossView(leaf, this));
    this.addSettingTab(new GlossSettings(this.app, this));
    // Reader tabs are opt-in sessions; restored workspaces return to native files.
    this.app.workspace.onLayoutReady(()=>{requestAnimationFrame(()=>{if(this.unloading)return;for(const leaf of this.app.workspace.getLeavesOfType(VIEW)){const path=leaf.getViewState().state?.path;if(typeof path==='string'&&this.app.vault.getAbstractFileByPath(path) instanceof TFile)void leaf.setViewState({type:'markdown',state:{file:path}}).catch(showError);}});});
    this.addRibbonIcon('book-open-text', '进入沉浸阅读', () => {void this.openCurrent().catch(showError);});
    this.addCommand({id: 'open-reader', name: '进入沉浸阅读', callback: () => {void this.openCurrent().catch(showError);}});
    this.addCommand({id:'toggle-question',name:'显示 / 收起提问框',checkCallback:checking=>{const v=this.app.workspace.getActiveViewOfType(GlossView);if(!v)return false;if(!checking)v.toggleComposer();return true;}});
    this.addCommand({id: 'choose-document', name: '选择文档开始阅读', callback: () => this.choose()});
    this.addCommand({id: 'toggle-focus', name: '切换沉浸式阅读', checkCallback: checking => {const v = this.app.workspace.getActiveViewOfType(GlossView); if (!v) return false; if (!checking) void v.exitReader().catch(showError); return true;}});
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {if (file instanceof TFile && file.extension === 'md' && !blockedPath(file.path)) menu.addItem(i => i.setTitle('进入沉浸阅读').setIcon('book-open-text').onClick(() => {void this.openFile(file).catch(showError);}));}));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      // A rename moves the same document state; do not silently overwrite an existing record.
      for (const key of Object.keys(this.store.documents)) {
        if (key !== oldPath && !key.startsWith(oldPath + '/')) continue;
        const next = file.path + key.slice(oldPath.length);
        if (this.store.documents[next]) {new Notice('新路径已有批注，已保留两份记录。'); continue;}
        this.store.documents[next] = this.store.documents[key]; delete this.store.documents[key];
        for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) if ((leaf.view as GlossView).path === key) (leaf.view as GlossView).path = next;
      }
      void this.persist().catch(showError);
    }));
    this.registerObsidianProtocolHandler(VIEW, async params => {
      if (params.vault && params.vault !== this.app.vault.getName()) return;
      const file = this.app.vault.getAbstractFileByPath(params.path || '');
      if (!(file instanceof TFile)) {new Notice('原文已移动或不存在，请手动打开。'); return;}
      try {const v = await this.openFile(file); if (params.anchor) v.revealSaved(params.anchor);} catch(e) {showError(e);}
    });
  }
  read(path: string): Reading {return this.store.documents[path] ||= freshReading();}
  persist(): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(this.store));
    delete snapshot.settings.apiKey;
    const next = this.saveQueue.catch(() => {}).then(() => this.saveData(snapshot));
    this.saveQueue = next; return next;
  }
  choose() {new DocumentPicker(this.app, file => {void this.openFile(file).catch(showError);}).open();}
  async openCurrent() {
    const current=this.app.workspace.getActiveViewOfType(GlossView);if(current?.root?.classList.contains('gloss-focus')){await current.exitReader();return;}
    const file = current?.path ? this.app.vault.getAbstractFileByPath(current.path) : this.app.workspace.getActiveFile();
    if (file instanceof TFile && file.extension === 'md' && !blockedPath(file.path)) await this.openFile(file);
    else this.choose();
  }
  async openFile(file: TFile): Promise<GlossView> {
    for (const l of this.app.workspace.getLeavesOfType(VIEW)) if ((l.view as GlossView).path !== file.path && (l.view as GlossView).root?.classList.contains('gloss-focus')) (l.view as GlossView).toggleFocus(false);
    if (file.extension !== 'md') throw new Error('这一版支持 Markdown 文档。');
    if (blockedPath(file.path)) throw new Error('此目录受隐私边界保护，请使用原生阅读视图。');
    let leaf = this.app.workspace.getLeavesOfType(VIEW).find(l => (l.view as GlossView).path === file.path || l.getViewState().state?.path === file.path);
    if (!leaf) {leaf = this.app.workspace.getLeaf('tab'); await leaf.setViewState({type: VIEW, state: {path: file.path}, active: true});}
    await leaf.loadIfDeferred();
    if (!(leaf.view instanceof GlossView)) await leaf.open(new GlossView(leaf, this));
    await this.app.workspace.revealLeaf(leaf);
    const v = leaf.view as GlossView; if (v.path !== file.path || !v.article) await v.loadDocument(file.path); v.toggleFocus(true); return v;
  }
  onunload() {this.unloading=true;for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) if (leaf.view instanceof GlossView){leaf.view.stop();leaf.view.releaseChrome();}}
}

class DocumentPicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private pick: (file: TFile) => void) {super(app); this.setPlaceholder('选择一篇 Markdown 文档…');}
  getItems() {return this.app.vault.getMarkdownFiles().filter(f => !blockedPath(f.path));}
  getItemText(file: TFile) {return file.path;}
  onChooseItem(file: TFile) {this.pick(file);}
}
class NoteModal extends Modal {
  constructor(app: App, private initial: string, private save: (s: string) => Promise<void>) {super(app);}
  onOpen() {
    this.setTitle('留下你的理解');
    const field = this.contentEl.createEl('textarea', {cls: 'gloss-note-input', attr: {'aria-label': '批注内容', placeholder: '这段话让你想到什么？'}}); field.value = this.initial;
    const row = this.contentEl.createDiv({cls: 'gloss-note-actions'});
    button(row, '取消', () => this.close());
    button(row, '保存批注', async () => {await this.save(field.value); this.close();}, 'mod-cta'); field.focus();
  }
  onClose() {this.contentEl.empty();}
}

class GlossView extends ItemView {
  path = '';
  root!: HTMLElement;
  article!: HTMLElement;
  private scroller!: HTMLElement;
  private grid!: HTMLElement;
  private page!: HTMLElement;
  private margin!: HTMLElement;
  private drawer!: HTMLElement;
  private drawerBody!: HTMLElement;
  private drawerSubtitle!:HTMLElement;
  private drawerTabs!:HTMLElement;
  private notebookBadge!:HTMLElement;
  private notebookFilter:NotebookFilter='all';
  private notebookAnswers=new Set<string>();
  private rail!: HTMLElement;
  private railWindow!: HTMLElement;
  private railTimer?:ReturnType<typeof setTimeout>;
  private railFocus?:number;
  private selectionPreview?:any;
  private readingModel?:ModelRef;
  private modelMenu?:HTMLElement;
  private modelMenuTrigger?:HTMLButtonElement;
  private railGeometry: {top:number;height:number;fill:number;heading:boolean}[]=[];
  private composer!: HTMLTextAreaElement;
  private composerWrap!: HTMLElement;
  private questionButton!: HTMLButtonElement;
  private composeLabel!: HTMLElement;
  private sendButton!: HTMLButtonElement;
  private runningThread?:string;
  private briefHost!:HTMLElement;
  private briefCollapsed=false;
  private briefError='';
  private briefJob?:{controller:AbortController;revision:number};
  private focusButton!: HTMLButtonElement;
  private lens!: HTMLElement;
  private lensMode: 'actions'|'ask'|'note' = 'actions';
  private lensInput?: HTMLTextAreaElement;
  private appearance!: HTMLElement;
  private selected?: Anchor;
  private activeThread?: string;
  private activeHighlight?: string;
  private fresh?: string;
  private focus = false;
  private notebookOpen = false;
  private narrow = false;
  private revision = 0;
  private restoring = false;
  private pendingProgress?: number;
  private text = '';
  private blocks: HTMLElement[] = [];
  private passages: Passage[] = [];
  private cards = new Map<string, HTMLElement>();
  private previousPositions = new Map<string,string>();
  private markdown?: Component;
  private marginRender?: Component;
  private aborter?: AbortController;
  private resizeObserver?: ResizeObserver;
  private marginObserver?: ResizeObserver;
  private progressTimer?: ReturnType<typeof setTimeout>;
  private draftTimer?: ReturnType<typeof setTimeout>;
  private renderTimer?: ReturnType<typeof setTimeout>;
  private reloadTimer?: ReturnType<typeof setTimeout>;
  private frame = 0;
  private leader?:SVGSVGElement;
  private leaderFrame=0;
  private chromeDocument?:Document;
  private chromeOwner=uid();
  constructor(leaf: WorkspaceLeaf, readonly plugin: GlossPlugin) {super(leaf);}
  getViewType() {return VIEW;}
  getDisplayText() {return this.path ? `阅读 · ${this.path.split('/').pop()?.replace(/\.md$/, '')}` : '沉浸阅读';}
  getIcon() {return 'book-open-text';}
  getState() {return {path:this.path};}
  async setState(state:{path?:string}, result:any) {if(state?.path)await this.loadDocument(state.path);await super.setState(state,result);}
  async onOpen() {
    this.contentEl.addClass('gloss-host');
    this.registerEvent(this.app.workspace.on('active-leaf-change',leaf=>{if(leaf&&leaf!==this.leaf&&this.focus)this.toggleFocus(false);}));
    this.registerDomEvent(this.containerEl.ownerDocument,'keydown',e=>{
      const target=e.target as HTMLElement;
      if(target.closest?.('.modal-container')||(!this.focus&&this.app.workspace.getActiveViewOfType(GlossView)!==this))return;
      if(e.isComposing||e.keyCode===229)return;
      if(e.key==='Escape') {
        if(this.modelMenu){e.preventDefault();this.closeModelMenu(true);return;}
        if(this.lens&&!this.lens.hidden){e.preventDefault();this.closeLens();return;}
        if(this.composerWrap&&!this.composerWrap.hidden){e.preventDefault();this.toggleComposer(false);return;}
        if(this.notebookOpen){this.toggleNotebook(false);return;}
        if(this.appearance&&!this.appearance.hidden){e.preventDefault();e.stopImmediatePropagation();this.appearance.hidden=true;return;}
        if(this.focus)void this.exitReader().catch(showError);return;
      }
      if(target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
      if(e.metaKey||e.ctrlKey||e.altKey)return;
      if(e.key==='/'){e.preventDefault();this.closeLens();this.toggleComposer(true);return;}
      if(this.selected&&this.lens&&!this.lens.hidden&&e.key.length===1){e.preventDefault();this.showLens('ask',e.key);return;}
      if(e.key.toLowerCase()==='b'){e.preventDefault();if(this.data.brief){this.briefCollapsed=!this.briefCollapsed;this.renderBrief();}else void this.generateBrief().catch(showError);return;}
      if(e.key.toLowerCase()==='f'){e.preventDefault();if(this.focus)void this.exitReader().catch(showError);else this.toggleFocus(true);}
    });
    this.registerEvent(this.app.vault.on('modify',f=>{if(f.path!==this.path)return;clearTimeout(this.reloadTimer);this.reloadTimer=setTimeout(()=>void this.loadDocument(this.path,true).catch(showError),500);}));
    this.registerEvent(this.app.vault.on('delete',f=>{if(f.path===this.path){this.stop();new Notice('原文已移除，批注仍保留。');}}));
  }
  private iconButton(parent:HTMLElement,name:string,label:string,action:()=>void|Promise<void>,cls='') {
    const b=button(parent,'',action,`gloss-icon ${cls}`);setIcon(b,name);b.setAttribute('aria-label',label);b.title=label;return b;
  }
  private get data(){return this.plugin.read(this.path);}
  private get threads(){return this.data.threads.filter(t=>!t.removed);}
  async loadDocument(path:string,retainPosition=false) {
    if(blockedPath(path))throw new Error('此目录受隐私边界保护。');
    const file=this.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile))throw new Error('找不到这篇文档。');
    this.stop();if(this.briefJob){this.aborter=undefined;this.briefJob=undefined;}this.captureProgress();await this.flushDraft();
    const token=++this.revision, raw=await this.app.vault.cachedRead(file);if(token!==this.revision)return;
    const progress=this.plugin.read(path).progress;
    this.closeModelMenu();this.clearSelectionPreview();if(this.path!==path){this.notebookFilter='all';this.notebookAnswers.clear();}this.path=path;this.readingModel=undefined;this.selected=undefined;this.activeThread=undefined;this.activeHighlight=undefined;this.restoring=true;this.pendingProgress=progress;
    this.resizeObserver?.disconnect();this.marginObserver?.disconnect();cancelAnimationFrame(this.leaderFrame);this.leader=undefined;
    if(this.markdown){this.removeChild(this.markdown);this.markdown.unload();}this.markdown=new Component();this.addChild(this.markdown);
    this.root?.remove();this.contentEl.empty();
    this.root=this.contentEl.createDiv({cls:'gloss-root'});this.applyAppearance();
    const top=this.root.createEl('header',{cls:'gloss-toolbar'});
    this.iconButton(top,'folder-open','选择阅读文档',()=>this.plugin.choose(),'gloss-document-picker');
    const titleBtn=button(top,file.basename,()=>this.scroller.scrollTo({top:0,behavior:'smooth'}),'gloss-top-title');titleBtn.title=file.path;
    const tools=top.createEl('nav',{cls:'gloss-tools',attr:{'aria-label':'阅读工具'}});
    this.iconButton(tools,'list','文档目录',()=>this.showContents());
    button(tools,'Aa',()=>this.toggleAppearance(),'gloss-aa').setAttribute('aria-label','阅读外观');
    this.questionButton=this.iconButton(tools,'message-circle','提问 · /',()=>this.toggleComposer());this.questionButton.setAttribute('aria-expanded','false');
    this.focusButton=this.iconButton(tools,'arrow-left','返回文档',()=>this.exitReader());
    const notebook=button(tools,'',()=>this.toggleNotebook(),'gloss-notebook-button');setIcon(notebook,'notebook-pen');notebook.createSpan({text:'笔记本'});this.notebookBadge=notebook.createSpan({cls:'gloss-notebook-count'});notebook.setAttribute('aria-label','阅读笔记本');
    this.iconButton(tools,'settings-2','Agent 服务设置',()=>{(this.app as any).setting.open();(this.app as any).setting.openTabById(this.plugin.manifest.id);});
    this.scroller=this.root.createDiv({cls:'gloss-scroll'});
    this.grid=this.scroller.createDiv({cls:'gloss-reader-grid'});
    this.rail=this.grid.createDiv({cls:'gloss-rail',attr:{'aria-label':'文档导航'}});
    this.page=this.grid.createDiv({cls:'gloss-page'});
    const fm=this.app.metadataCache.getFileCache(file)?.frontmatter||{};
    let body=raw.slice(getFrontMatterInfo(raw).contentStart);
    const firstHeading=body.match(/^\s*# ([^\n]+)\s*\n/);
    const title=String(fm.title||firstHeading?.[1]||file.basename);
    if(firstHeading)body=body.slice(firstHeading[0].length);
    const header=this.page.createEl('header',{cls:'gloss-document-header'});
    const source=header.createDiv({cls:'gloss-document-source'});source.createSpan({cls:'gloss-source-dot'});source.createSpan({text:String(fm.source_label||file.parent?.name||'当前文档')});
    header.createEl('h1',{cls:'gloss-document-title',text:title});
    if(fm.description||fm.dek)header.createEl('p',{cls:'gloss-document-dek',text:String(fm.description||fm.dek)});
    const meta=header.createDiv({cls:'gloss-document-meta'}),byline=meta.createDiv();
    if(fm.author){const by=byline.createDiv({cls:'gloss-byline',text:String(fm.author)});if(fm.published||fm.date)by.createSpan({cls:'gloss-published',text:' · '+String(fm.published||fm.date)});}
    const stats=byline.createDiv({cls:'gloss-reading-stats'});
    const sourceBtn=button(meta,'',()=>this.app.workspace.openLinkText(path,'',true),'gloss-original');setIcon(sourceBtn,'arrow-up-right');sourceBtn.createSpan({text:'原文'});
    this.briefHost=header.createDiv({cls:'gloss-brief-host'});this.briefError='';
    this.article=this.page.createEl('article',{cls:'gloss-article markdown-rendered',attr:{'aria-label':'阅读正文'}});
    await MarkdownRenderer.render(this.app,passiveEmbeds(body),this.article,path,this.markdown);if(token!==this.revision)return;
    const selector='p,h1,h2,h3,h4,h5,h6,li,pre,table';
    this.blocks=Array.from(this.article.querySelectorAll<HTMLElement>(selector)).filter(el=>{if(el.closest('.internal-embed,.external-embed'))return false;const a=el.parentElement?.closest(selector);return(!a||!this.article.contains(a))&&!!el.textContent?.trim();});
    if(!this.blocks.length&&this.article.textContent?.trim())this.blocks=[this.article];
    const index=indexPassages(this.blocks.map(el=>el.textContent||''));this.text=index.text;this.passages=index.passages;
    this.blocks.forEach((el,i)=>{el.addClass('gloss-passage');el.dataset.glossParagraph=String(i+1);});
    const first=this.blocks.find(el=>el.tagName==='P');if(first){first.addClass('gloss-first-paragraph');if(/^[A-Za-z]/.test(first.textContent||''))first.addClass('gloss-dropcap');}
    const minutes=Math.max(1,Math.round(this.text.split(/\s+/).length/240+(this.text.match(/[\u3400-\u9fff]/g)||[]).length/450));
    stats.textContent=`${minutes} 分钟阅读 · ${this.blocks.filter(el=>!/^H/.test(el.tagName)).length} 个段落`;
    this.page.createDiv({cls:'gloss-end',text:'读到这里，留下一个属于你的想法。'});
    this.margin=this.grid.createEl('aside',{cls:'gloss-margin-column',attr:{'aria-label':'页边批注'}});
    this.buildRail();
    const compose=this.composerWrap=this.root.createDiv({cls:'gloss-composer',attr:{role:'group','aria-label':'文档提问'}});compose.hidden=true;
    this.composeLabel=compose.createDiv({cls:'gloss-compose-context'});
    const modelRow=compose.createDiv({cls:'gloss-compose-model-row'});this.modelPicker(modelRow,'提问模型');
    const row=compose.createDiv({cls:'gloss-compose-row'});
    this.composer=row.createEl('textarea',{cls:'gloss-question',attr:{'aria-label':'向 Agent 提问',placeholder:'询问这篇文章…',rows:'1'}});this.composer.value=this.data.draft||'';
    this.composer.addEventListener('input',()=>this.rememberDraft());this.protectInput(this.composer);this.composer.addEventListener('focus',()=>{this.closeModelMenu();this.closeLens();});this.composer.addEventListener('keydown',e=>{if(!e.isComposing&&e.keyCode!==229&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();void this.send().catch(showError);}});
    this.iconButton(row,'x','收起提问框 · Esc',()=>this.toggleComposer(false),'gloss-compose-close');
    const scope=button(row,'全文',()=>{this.plugin.store.settings.context=this.plugin.store.settings.context==='whole'?'nearby':'whole';this.refreshSettings();void this.plugin.persist().catch(showError);},'gloss-scope');scope.title='点击切换：当前文档全文 / 选文及相邻段落';
    this.sendButton=this.iconButton(row,'arrow-up','发送问题',()=>this.aborter?this.stop():this.send(),'gloss-send');
    this.drawer=this.root.createEl('aside',{cls:'gloss-notebook',attr:{'aria-label':'阅读笔记本'}});this.drawer.hidden=!this.notebookOpen;this.root.toggleClass('gloss-notebook-open',this.notebookOpen);
    const drawerHead=this.drawer.createDiv({cls:'gloss-notebook-head'}),heading=drawerHead.createDiv({cls:'gloss-notebook-heading'});heading.createEl('h2',{text:'笔记本'});this.drawerSubtitle=heading.createEl('p',{cls:'gloss-notebook-subtitle'});
    this.iconButton(drawerHead,'copy','复制 Markdown 笔记',async()=>{await navigator.clipboard.writeText(exportReading(this.path,this.data,this.app.vault.getName()));new Notice('已复制阅读笔记');});this.iconButton(drawerHead,'download','导出 Markdown 笔记',()=>this.exportNotes());drawerHead.createSpan({cls:'gloss-notebook-head-divider'});this.iconButton(drawerHead,'x','收起笔记本',()=>this.toggleNotebook(false));
    this.drawerTabs=this.drawer.createDiv({cls:'gloss-notebook-tabs',attr:{role:'tablist','aria-label':'笔记本分类'}});
    this.drawerBody=this.drawer.createDiv({cls:'gloss-notebook-body'});
    this.lens=this.root.createDiv({cls:'gloss-lens',attr:{role:'toolbar','aria-label':'选文操作'}});this.lens.hidden=true;
    this.lens.addEventListener('mousedown',e=>{if(!(e.target as HTMLElement).closest('textarea,input'))e.preventDefault();});
    this.appearance=this.root.createDiv({cls:'gloss-appearance'});this.appearance.hidden=true;
    this.appearance.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();e.stopImmediatePropagation();this.appearance.hidden=true;this.root.querySelector<HTMLButtonElement>('.gloss-aa')?.focus();}});
    this.article.addEventListener('mouseup',()=>this.captureSelection());this.article.addEventListener('keyup',e=>{if(e.key.startsWith('Arrow')||e.key==='Shift')this.captureSelection();});
    this.article.addEventListener('click',e=>{
      const selection=this.article.ownerDocument.getSelection();if(selection&&!selection.isCollapsed&&this.article.contains(selection.anchorNode))return;
      const el=(e.target as HTMLElement).closest<HTMLElement>('[data-h],[data-g]');if(!el)return;
      if(el.dataset.g){const t=this.threads.find(t=>t.id===el.dataset.g?.split(' ')[0]);if(t){this.activateThread(t);return;}}
      if(el.dataset.h){const h=this.data.highlights.find(h=>h.id===el.dataset.h?.split(' ')[0]);if(h){this.selected=h.anchor;this.activeHighlight=h.id;this.activeThread=undefined;this.paintHighlights();this.showLens('actions');this.updateContext();}}
    });
    this.article.addEventListener('mouseover',e=>{const g=(e.target as HTMLElement).closest<HTMLElement>('[data-g]')?.dataset.g;this.setHover(g?.split(' ')[0]);});
    this.article.addEventListener('mouseleave',()=>this.setHover());
    this.root.addEventListener('pointerdown',e=>{const target=e.target as HTMLElement;if(this.modelMenu&&!this.modelMenu.contains(target)&&!target.closest('.gloss-model-picker'))this.closeModelMenu();if(!this.lens.contains(target)&&!target.closest('[data-h]'))this.closeLens();if(!this.appearance.contains(target)&&!target.closest('.gloss-aa'))this.appearance.hidden=true;});
    this.root.addEventListener('click',e=>{const a=(e.target as HTMLElement).closest<HTMLAnchorElement>('a.internal-link');if(a){e.preventDefault();void this.app.workspace.openLinkText(a.dataset.href||a.getAttribute('href')||'',path,true);}});
    this.scroller.addEventListener('scroll',()=>{if(this.restoring)return;this.closeModelMenu();this.captureProgress();this.pulseRail();this.updateRail();if(!this.lens.hidden)this.placeLens();top.toggleClass('is-scrolled',this.scroller.scrollTop>180);clearTimeout(this.progressTimer);this.progressTimer=setTimeout(()=>void this.plugin.persist().catch(showError),700);},{passive:true});
    this.renderBrief();this.paintHighlights();this.refreshSettings();await this.renderMargin();this.toggleFocus(this.focus);
    this.resizeObserver=new ResizeObserver(()=>{this.narrow=this.root.clientWidth<1080;this.root.toggleClass('gloss-narrow',this.narrow);this.restorePosition();this.scheduleLayout();if(!this.lens.hidden)this.placeLens();});
    this.resizeObserver.observe(this.root);this.resizeObserver.observe(this.scroller);this.resizeObserver.observe(this.page);
    requestAnimationFrame(()=>{if(token===this.revision){this.restorePosition();this.scheduleLayout();}});
    this.app.workspace.requestSaveLayout();
  }
  private renderBrief(){
    if(!this.briefHost)return;const host=this.briefHost;host.empty();const saved=this.data.brief,busy=!!this.briefJob&&this.briefJob.controller===this.aborter&&this.briefJob.revision===this.revision;
    if(!saved){const open=button(host,'',()=>this.generateBrief(),'gloss-brief');open.disabled=!!this.aborter;const title=open.createSpan({cls:'gloss-brief-title',text:busy?'正在解读文章…':'解读这篇文章'});setIcon(title.createSpan(),busy?'loader-circle':'arrow-right');open.createSpan({cls:'gloss-brief-description',text:busy?'正在通读全文、梳理论点和段落地图':'要旨、关键论点与段落地图'});open.createSpan({cls:'gloss-brief-key',text:'B'});}
    else{
      const stale=saved.sourceHash!==briefHash(this.text),card=host.createEl('section',{cls:'gloss-brief-panel',attr:{'aria-label':'文章解读'}});
      const head=button(card,'',()=>{this.briefCollapsed=!this.briefCollapsed;this.renderBrief();this.scheduleLayout();},'gloss-brief-head');head.setAttribute('aria-expanded',String(!this.briefCollapsed));head.createSpan({cls:'gloss-brief-name',text:'文章解读'});head.createSpan({cls:'gloss-brief-counts',text:`${saved.data.sections.length} 个部分 · ${saved.data.claims.length} 个论点 · ${saved.data.caveats.length} 条提醒`});const chevron=head.createSpan({cls:'gloss-brief-chevron'});setIcon(chevron,this.briefCollapsed?'chevron-down':'chevron-up');
      const body=card.createDiv({cls:'gloss-brief-body'});body.hidden=this.briefCollapsed;
      if(stale)body.createEl('p',{cls:'gloss-brief-status',text:'原文已更新，请重新生成解读以更新段落引用。'});
      body.createEl('p',{cls:'gloss-brief-gist',text:saved.data.gist});
      const cite=(parent:HTMLElement,n:number)=>{const passage=this.passages[n-1],b=button(parent,'¶'+n,()=>{if(!stale&&passage)this.jump(makeAnchor(this.text,passage.start,passage.end));},'gloss-citation');b.disabled=stale||!passage;b.title=stale?'原文已更新，请重新生成':passage?.text||'未提供的原文段落';};
      const points=(label:string,items:{text:string;cite:number}[],kind:string)=>{if(!items.length)return;body.createEl('h3',{cls:'gloss-brief-section-label',text:label});const list=body.createEl(kind==='claims'?'ol':'ul',{cls:'gloss-brief-points gloss-brief-'+kind});items.forEach((point,i)=>{const row=list.createEl('li');row.createSpan({cls:'gloss-brief-index',text:kind==='claims'?String(i+1):'•'});const text=row.createDiv();text.append(point.text+' ');cite(text,point.cite);});};
      points('关键论点',saved.data.claims,'claims');points('阅读提醒',saved.data.caveats,'caveats');
      body.createEl('h3',{cls:'gloss-brief-section-label',text:'段落地图'});const map=body.createEl('ol',{cls:'gloss-brief-map'});
      briefRanges(saved.data,this.passages.length).forEach((section,i)=>{const li=map.createEl('li'),row=button(li,'',()=>{const p=this.passages[section.start-1];if(!stale&&p)this.jump(makeAnchor(this.text,p.start,p.end));},'gloss-brief-map-row');row.disabled=stale;row.title=section.title;row.createSpan({cls:'gloss-brief-index',text:String(i+1)});row.createSpan({cls:'gloss-brief-map-title',text:section.title});row.createSpan({cls:'gloss-brief-map-range',text:'¶'+section.start+(section.end>section.start?'–'+section.end:'')});});
      const footer=body.createDiv({cls:'gloss-brief-footer'}),receipt=footer.createDiv({cls:'gloss-brief-receipt'});receipt.createSpan({text:saved.model||'模型未记录'});receipt.createSpan({cls:'gloss-brief-receipt-divider',text:'/'});const tokens=receipt.createSpan({text:tokenReceipt(saved.usage)});tokens.title=tokenDetails(saved.usage);receipt.title=[saved.provider,saved.model].filter(Boolean).join(' · ');
      const redo=button(footer,'',()=>this.generateBrief(),'gloss-brief-redo');redo.disabled=!!this.aborter;setIcon(redo.createSpan(),'rotate-ccw');redo.createSpan({text:busy?'正在重新生成…':'重新生成'});
    }
    if(busy){const status=host.createDiv({cls:'gloss-brief-state',attr:{role:'status'}});status.createSpan({text:'正在使用总结模型生成解读'});const stop=this.iconButton(status,'square','停止解读',()=>this.stop());stop.disabled=false;}
    if(this.briefError)host.createEl('p',{cls:'gloss-brief-error',text:this.briefError,attr:{role:'status'}});
    this.scheduleLayout();
  }
  private async generateBrief(){
    if(this.aborter)return;if(blockedPath(this.path))throw new Error('此文档不能发送给模型。');if(!(this.app.vault.getAbstractFileByPath(this.path)instanceof TFile))throw new Error('原文已移除。');
    const settings=this.modelSettings('summary'),path=this.path,data=this.data,revision=this.revision,sourceHash=briefHash(this.text),count=this.passages.length;
    const context=contextFor(this.passages,undefined,this.text,true,settings.maxContext);if(!count)throw new Error('文档没有可解读的正文。');
    const controller=new AbortController();this.aborter=controller;this.briefJob={controller,revision};this.briefError='';this.closeModelMenu();this.briefCollapsed=false;
    this.composer.disabled=true;this.root.querySelectorAll<HTMLButtonElement>('.gloss-model-picker').forEach(b=>b.disabled=true);setIcon(this.sendButton,'square');this.sendButton.setAttribute('aria-label','停止解读');this.sendButton.title='停止解读';this.renderBrief();
    let usage:Message['usage'];
    try{await this.renderMargin();const answer=await askAgent({settings,context,messages:[{role:'user',content:briefPrompt(count)}],signal:controller.signal,onText:()=>{},onUsage:value=>{usage=value;}});
      if(controller.signal.aborted||this.revision!==revision||this.path!==path)return;
      const result=parseBrief(answer,count);data.brief={data:result,sourceHash,model:modelId(settings),provider:settings.serviceName||settings.provider,serviceId:settings.serviceId,usage,created:Date.now()};data.updated=Date.now();await this.plugin.persist();
    }catch(error){if(this.revision===revision&&this.path===path)this.briefError=(error instanceof Error?error.message:'文章解读失败。')+(data.brief?'（已保留原解读）':'');}
    finally{if(this.aborter===controller){this.aborter=undefined;this.briefJob=undefined;if(this.path===path&&this.revision===revision&&this.root.isConnected){this.composer.disabled=false;this.root.querySelectorAll<HTMLButtonElement>('.gloss-model-picker').forEach(b=>b.disabled=false);setIcon(this.sendButton,'arrow-up');this.sendButton.setAttribute('aria-label','发送问题');this.sendButton.title='发送问题';this.renderBrief();await this.renderMargin();}}}
  }
  applyAppearance(){if(!this.root)return;const s=this.plugin.store.settings;this.root.dataset.theme=s.theme==='auto'?(this.root.ownerDocument.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches?'night':'paper'):({light:'snow',dark:'night'}[s.theme]||s.theme);this.root.dataset.font=s.font;this.root.dataset.pen=s.pen||'vermilion';this.root.style.setProperty('--read-size',s.fontSize+'px');this.root.style.setProperty('--leading',String(s.lineHeight));this.root.style.setProperty('--measure-k',String(s.measure||32));this.root.style.setProperty('--reader-custom-font',s.customFont||'var(--font-serif)');this.root.toggleClass('gloss-show-numbers',!!s.numbers);this.syncChrome();this.scheduleLayout();}
  private syncChrome(){
    const doc=this.root?.ownerDocument;if(this.chromeDocument&&(!this.focus||this.chromeDocument!==doc))this.releaseChrome();
    if(!this.focus||!this.root?.isConnected||!doc?.defaultView)return;
    const style=doc.defaultView.getComputedStyle(this.root),body=doc.body;body.dataset.glossChromeOwner=this.chromeOwner;body.classList.add('gloss-reading-chrome');
    for(const [name,token]of [['bg','--bg'],['raised','--bg-raised'],['hover','--bg-sunk'],['ink','--ink'],['muted','--ink-3'],['rule','--rule']])body.style.setProperty('--gloss-chrome-'+name,style.getPropertyValue(token).trim());
    body.style.setProperty('--gloss-chrome-scheme',style.colorScheme);this.chromeDocument=doc;
  }
  releaseChrome(){const body=this.chromeDocument?.body;if(body?.dataset.glossChromeOwner===this.chromeOwner){body.classList.remove('gloss-reading-chrome');delete body.dataset.glossChromeOwner;for(const name of ['bg','raised','hover','ink','muted','rule','scheme'])body.style.removeProperty('--gloss-chrome-'+name);}this.chromeDocument=undefined;}
  refreshSettings(){this.applyAppearance();if(!this.root)return;const scope=this.root.querySelector('.gloss-scope');if(scope)scope.textContent=this.plugin.store.settings.context==='whole'?'全文':(this.selected?'选文':'全文');this.updateContext();this.closeModelMenu();this.refreshModelButtons();if(this.selected&&this.lens&&!this.lens.hidden&&this.lensMode==='actions')this.showLens('actions');}
  async exitReader(){this.captureProgress();await this.flushDraft();this.toggleFocus(false);const existing=this.app.workspace.getLeavesOfType('markdown').find(l=>l.getViewState().state?.file===this.path);if(existing){await this.app.workspace.revealLeaf(existing);this.leaf.detach();}else await this.leaf.setViewState({type:'markdown',state:{file:this.path},active:true});}
  toggleFocus(next=!this.focus){const changing=next!==this.focus,max=this.scroller?this.scroller.scrollHeight-this.scroller.clientHeight:0,ratio=max>0?this.scroller.scrollTop/max:0;this.focus=next;if(this.root){if(next&&this.root.parentElement!==this.root.ownerDocument.body)this.root.ownerDocument.body.appendChild(this.root);else if(!next&&this.root.parentElement!==this.contentEl)this.contentEl.appendChild(this.root);this.root.toggleClass('gloss-focus',next);if(!next){this.closeModelMenu();this.clearSelectionPreview();}}this.syncChrome();if(this.focusButton){setIcon(this.focusButton,'arrow-left');this.focusButton.setAttribute('aria-label','返回普通文档');this.focusButton.title='返回文档 · Esc';}if(changing)requestAnimationFrame(()=>{this.scroller?.scrollTo({top:Math.max(0,this.scroller.scrollHeight-this.scroller.clientHeight)*ratio,behavior:'instant'});this.scheduleLayout();});}
  private toggleNotebook(next=!this.notebookOpen){this.notebookOpen=next;this.drawer.hidden=!next;this.root.toggleClass('gloss-notebook-open',next);this.root.querySelector('.gloss-notebook-button')?.setAttribute('aria-expanded',String(next));if(next)void this.renderNotebook().catch(showError);this.scheduleLayout();}
  private showContents(){const modal=new Modal(this.app);modal.setTitle('文档目录');let count=0;this.blocks.forEach(el=>{if(/^H[1-6]$/.test(el.tagName)){button(modal.contentEl,el.textContent||'',()=>{modal.close();el.scrollIntoView({behavior:'smooth',block:'start'});},'gloss-contents-item');count++;}});if(!count)modal.contentEl.createEl('p',{text:'这篇文档没有分节标题。'});modal.open();}
  private toggleAppearance(){if(!this.appearance.hidden){this.appearance.hidden=true;return;}this.appearance.empty();const s=this.plugin.store.settings;this.appearance.createDiv({cls:'gloss-pop-title',text:'阅读外观'});const themes=this.appearance.createDiv({cls:'gloss-theme-swatches'});for(const [key,label] of [['auto','跟随系统'],['paper','纸张'],['sepia','暖黄'],['snow','雪白'],['night','夜读'],['ink','墨蓝']]){const b=button(themes,label,()=>{s.theme=key;this.applyAppearance();themes.querySelectorAll<HTMLButtonElement>('.gloss-theme-swatch').forEach(choice=>{const selected=choice.dataset.theme===key;choice.classList.toggle('is-selected',selected);choice.setAttribute('aria-pressed',String(selected));});void this.plugin.persist().catch(showError);},'gloss-theme-swatch');b.dataset.theme=key;b.classList.toggle('is-selected',s.theme===key);b.setAttribute('aria-pressed',String(s.theme===key));}
    const faces=this.appearance.createDiv({cls:'gloss-pop-row'});for(const [key,label] of [['serif','Newsreader'],['sans','Schibsted'],['song','宋体'],['system','系统']])button(faces,label,()=>{s.font=key;this.applyAppearance();void this.plugin.persist().catch(showError);});
    const size=this.appearance.createDiv({cls:'gloss-pop-row'});this.iconButton(size,'minus','减小字号',()=>{s.fontSize=Math.max(15,s.fontSize-1);this.applyAppearance();size.querySelector('.gloss-size-value')!.textContent=String(s.fontSize);void this.plugin.persist().catch(showError);});size.createSpan({cls:'gloss-size-value',text:String(s.fontSize)});this.iconButton(size,'plus','增大字号',()=>{s.fontSize=Math.min(28,s.fontSize+1);this.applyAppearance();size.querySelector('.gloss-size-value')!.textContent=String(s.fontSize);void this.plugin.persist().catch(showError);});
    const leading=this.appearance.createDiv({cls:'gloss-pop-row'});for(const [label,value]of [['紧凑',1.5],['标准',1.64],['宽松',1.82]]as const)button(leading,label,()=>{s.lineHeight=value;this.applyAppearance();void this.plugin.persist().catch(showError);});
    const widths=this.appearance.createDiv({cls:'gloss-pop-row'});for(const [label,value]of [['窄',28],['适中',32],['宽',37]]as const)button(widths,label,()=>{s.measure=value;this.applyAppearance();void this.plugin.persist().catch(showError);});
    const pens=this.appearance.createDiv({cls:'gloss-pop-row'});pens.createSpan({text:'批注笔色'});for(const [pen,label]of [['vermilion','朱红'],['cobalt','钴蓝'],['moss','苔绿'],['graphite','石墨']]){const b=button(pens,'',()=>{s.pen=pen;this.applyAppearance();void this.plugin.persist().catch(showError);},'gloss-pen-swatch');b.dataset.pen=pen;b.title=label;b.setAttribute('aria-label',label+'批注笔');}
    button(this.appearance,s.numbers?'隐藏段落编号':'显示段落编号',()=>{s.numbers=!s.numbers;this.applyAppearance();void this.plugin.persist().catch(showError);this.appearance.hidden=true;},'gloss-pop-number');this.appearance.hidden=false;}
  private buildRail(){
    this.rail.empty();this.rail.setAttribute('role','slider');this.rail.setAttribute('aria-label','阅读位置');this.rail.setAttribute('aria-valuemin','0');this.rail.setAttribute('aria-valuemax','100');
    const lines=this.rail.createDiv({cls:'gloss-rail-lines'});
    for(const p of this.passages){const b=lines.createEl('button',{cls:'gloss-rail-line',attr:{type:'button','aria-label':'跳到第 '+p.number+' 段'}});b.dataset.paragraph=String(p.number);b.addEventListener('click',e=>{if(e.detail===0)this.blocks[p.number-1].scrollIntoView({behavior:'smooth',block:'start'});});}
    this.railWindow=this.rail.createDiv({cls:'gloss-rail-window'});this.railWindow.setAttribute('aria-hidden','true');
    let drag=false;
    const travel=(clientY:number,instant=false)=>{const rect=this.rail.getBoundingClientRect(),y=Math.max(0,Math.min(rect.height,clientY-rect.top)),article=this.article.getBoundingClientRect(),scroller=this.scroller.getBoundingClientRect();this.scroller.scrollTo({top:this.scroller.scrollTop+article.top-scroller.top+y/Math.max(1,rect.height)*article.height-this.scroller.clientHeight*.3,behavior:instant?'instant':'smooth'});};
    this.rail.addEventListener('pointerdown',e=>{e.preventDefault();this.rail.setPointerCapture(e.pointerId);travel(e.clientY);drag=true;});this.rail.addEventListener('pointermove',e=>{this.railFocus=e.clientY-this.rail.getBoundingClientRect().top;this.magnifyRail();if(drag&&e.buttons)travel(e.clientY,true);});this.rail.addEventListener('pointerleave',()=>{this.railFocus=undefined;this.magnifyRail();});this.rail.addEventListener('pointerup',()=>drag=false);this.rail.addEventListener('pointercancel',()=>drag=false);this.updateRail(true);
  }
  private updateRail(measure=false){
    if(!this.railWindow||!this.scroller)return;const article=this.article.getBoundingClientRect(),height=Math.max(80,this.scroller.clientHeight-64);this.rail.style.height=height+'px';const k=height/Math.max(1,article.height);
    if(measure||this.railGeometry.length!==this.blocks.length)this.railGeometry=this.blocks.map(b=>{const r=b.getBoundingClientRect();return{top:r.top-article.top,height:r.height,fill:Math.min(1,.45+(b.textContent?.length||0)/1400),heading:/^H/.test(b.tagName)};});
    this.rail.querySelectorAll<HTMLElement>('.gloss-rail-line').forEach((el,i)=>{const g=this.railGeometry[i];if(!g)return;el.style.top=g.top*k+'px';el.style.height=Math.max(1,g.height*k-2)+'px';el.style.width=(g.heading?18:18*g.fill)+'px';el.classList.toggle('is-heading',g.heading);});
    this.rail.querySelectorAll('.gloss-rail-tick,.gloss-rail-gloss').forEach(el=>el.remove());
    const at=(a:Anchor)=>{const start=resolveAnchor(this.text,a);if(start===null)return null;const i=this.passages.findIndex(p=>p.end>start);return this.railGeometry[i]?.top*k;};
    for(const h of this.data.highlights.filter(h=>!h.removed)){const top=at(h.anchor);if(top===null||top===undefined)continue;const tick=this.rail.createSpan({cls:'gloss-rail-tick'});tick.dataset.color=h.color;tick.style.top=top+'px';}
    for(const t of this.threads){if(!t.anchor)continue;const top=at(t.anchor);if(top===null||top===undefined)continue;const tick=this.rail.createSpan({cls:'gloss-rail-gloss'});tick.style.top=top+'px';}
    const visibleTop=this.scroller.getBoundingClientRect().top-article.top,vTop=Math.max(0,visibleTop*k),vHeight=Math.max(14,Math.min(height-vTop,this.scroller.clientHeight*k));this.railWindow.style.top=vTop+'px';this.railWindow.style.height=vHeight+'px';this.magnifyRail((vTop+vHeight/2));this.rail.setAttribute('aria-valuenow',String(Math.round(Math.max(0,Math.min(1,(visibleTop+this.scroller.clientHeight*.3)/Math.max(1,article.height)))*100)));
  }
  private pulseRail(){this.rail.classList.add('is-scrolling');clearTimeout(this.railTimer);this.railTimer=setTimeout(()=>{if(!this.rail)return;this.rail.classList.remove('is-scrolling');this.magnifyRail();},800);}
  private magnifyRail(visibleCenter?:number){if(!this.rail)return;const focus=this.railFocus??(this.rail.classList.contains('is-scrolling')?(visibleCenter??parseFloat(this.railWindow.style.top)+parseFloat(this.railWindow.style.height)/2):undefined);this.rail.querySelectorAll<HTMLElement>('.gloss-rail-line').forEach(el=>{const scale=focus===undefined?1:railMagnification(parseFloat(el.style.top)+parseFloat(el.style.height)/2-focus);el.style.transform=`scaleX(${scale}) scaleY(${1+(scale-1)*.18})`;el.classList.toggle('is-magnified',scale>1.2);});}
  private rememberDraft(){if(!this.path||!this.composer)return;this.data.draft=this.composer.value;clearTimeout(this.draftTimer);this.draftTimer=setTimeout(()=>void this.plugin.persist().catch(showError),500);}
  private async flushDraft(){if(this.path&&this.composer){this.data.draft=this.composer.value;await this.plugin.persist();}}
  onResize(){this.restorePosition();this.scheduleLayout();}
  private restorePosition(){if(!this.restoring||this.pendingProgress===undefined||!this.scroller?.isConnected||!this.scroller.clientHeight||!this.scroller.clientWidth)return;if(this.root.clientHeight>(this.root.ownerDocument.defaultView?.innerHeight||window.innerHeight)+1)return;this.scroller.scrollTo({top:Math.max(0,this.scroller.scrollHeight-this.scroller.clientHeight)*this.pendingProgress,behavior:'instant'});this.pendingProgress=undefined;this.restoring=false;this.captureProgress();this.updateRail();}
  private captureProgress(){if(this.plugin.unloading||this.restoring||!this.scroller?.isConnected||!this.scroller.clientHeight||!this.path||this.root.clientHeight>(this.root.ownerDocument.defaultView?.innerHeight||window.innerHeight)+1)return;const max=this.scroller.scrollHeight-this.scroller.clientHeight;this.data.progress=max>0?Math.max(0,Math.min(1,this.scroller.scrollTop/max)):0;}
  private globalPoint(node:Node,offset:number){const block=this.blocks.find(el=>el.contains(node));if(!block)return null;const r=this.article.ownerDocument.createRange();r.selectNodeContents(block);r.setEnd(node,offset);return this.passages[this.blocks.indexOf(block)].start+r.toString().length;}
  captureSelection(){const s=this.article.ownerDocument.getSelection();if(!s||s.isCollapsed||!s.rangeCount)return;const r=s.getRangeAt(0);if(!this.article.contains(r.commonAncestorContainer))return;let start=this.globalPoint(r.startContainer,r.startOffset),end=this.globalPoint(r.endContainer,r.endOffset);if(start===null||end===null){const touched=this.blocks.filter(b=>r.intersectsNode(b));if(!touched.length)return;if(start===null)start=this.passages[this.blocks.indexOf(touched[0])].start;if(end===null)end=this.passages[this.blocks.indexOf(touched.at(-1)!)].end;}if(end<=start)return;const a=makeAnchor(this.text,start,end);if(!a.quote.trim())return;this.selected=a;this.activeThread=undefined;this.activeHighlight=undefined;this.updateContext();this.showLens('actions');}
  private modelSettings(task='default'):Settings{const s=this.plugin.store.settings,{service,model}=resolveModel(s,task,task==='default'||!s.taskModels[task]?this.readingModel:undefined);return{...s,...serviceSettings(service,model.id,this.plugin.serviceKey(service.id))};}
  private modelChoices(){return serviceChoices(this.plugin.store.settings);}
  private modelPicker(parent:HTMLElement,label:string){
    const trigger=button(parent,'',()=>this.openModelMenu(trigger),'gloss-model-picker');trigger.setAttribute('aria-label',label);trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
    trigger.addEventListener('pointerdown',e=>e.stopPropagation());trigger.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();});this.paintModelButton(trigger);return trigger;
  }
  private paintModelButton(trigger:HTMLButtonElement){
    const s=this.plugin.store.settings,ref=this.readingModel||s.taskModels.default,choice=this.modelChoices().find(m=>m.serviceId===ref?.serviceId&&m.id===ref?.modelId);trigger.empty();const icon=trigger.createSpan({cls:'gloss-model-provider-icon'});setIcon(icon,choice?SERVICE_ICONS[choice.kind]:'sliders-horizontal');trigger.createSpan({cls:'gloss-model-button-label',text:choice?.name||'选择问答模型'});setIcon(trigger.createSpan({cls:'gloss-model-chevron'}),'chevron-down');trigger.title=choice?choice.serviceName+' · '+choice.id:'先添加服务并配置模型';trigger.disabled=!!this.aborter;
  }
  private refreshModelButtons(){this.root?.querySelectorAll<HTMLButtonElement>('.gloss-model-picker').forEach(trigger=>this.paintModelButton(trigger));}
  private closeModelMenu(focus=false){const trigger=this.modelMenuTrigger;this.modelMenu?.remove();this.modelMenu=undefined;this.modelMenuTrigger=undefined;trigger?.setAttribute('aria-expanded','false');if(focus&&trigger?.isConnected)trigger.focus({preventScroll:true});}
  private openModelMenu(trigger:HTMLButtonElement){
    if(this.modelMenuTrigger===trigger){this.closeModelMenu();return;}this.closeModelMenu();if(this.aborter)return;this.modelMenuTrigger=trigger;trigger.setAttribute('aria-expanded','true');
    const menu=this.modelMenu=this.root.createDiv({cls:'gloss-model-menu',attr:{role:'dialog','aria-label':'选择阅读模型'}});menu.addEventListener('pointerdown',e=>e.stopPropagation());menu.addEventListener('mousedown',e=>e.stopPropagation());
    const searchRow=menu.createDiv({cls:'gloss-model-search'});setIcon(searchRow.createSpan(),'search');const search=searchRow.createEl('input',{attr:{type:'search','aria-label':'搜索阅读模型',placeholder:'搜索模型或服务…'}});this.protectInput(search);
    const list=menu.createDiv({cls:'gloss-model-results',attr:{role:'listbox','aria-label':'可用阅读模型'}}),choices=this.modelChoices();let buttons:HTMLButtonElement[]=[],active=0;
    const updateActive=()=>{buttons.forEach((b,i)=>b.classList.toggle('is-focused',i===active));buttons[active]?.scrollIntoView({block:'nearest'});};
    const draw=()=>{list.empty();buttons=[];const q=search.value.trim().toLowerCase(),s=this.plugin.store.settings,current=this.readingModel||s.taskModels.default;
      for(const service of s.services){const filtered=choices.filter(m=>m.serviceId===service.id&&[m.id,m.name,service.name].some(value=>value.toLowerCase().includes(q)));if(!filtered.length)continue;list.createDiv({cls:'gloss-model-group',text:service.name});
        for(const model of filtered){const selected=current?.serviceId===service.id&&current?.modelId===model.id,b=button(list,'',()=>{this.readingModel={serviceId:service.id,modelId:model.id};this.closeModelMenu();this.refreshModelButtons();const field=this.lensInput||(!this.composerWrap.hidden?this.composer:undefined);if(field)this.focusInput(field);},'gloss-model-option');b.setAttribute('role','option');b.setAttribute('aria-selected',String(selected));b.setAttribute('aria-label',service.name+' '+model.name);const copy=b.createSpan({cls:'gloss-model-option-copy'});copy.createSpan({cls:'gloss-model-option-name',text:model.name});if(model.name!==model.id)copy.createSpan({cls:'gloss-model-option-id',text:model.id});if(s.taskModels.default?.serviceId===service.id&&s.taskModels.default.modelId===model.id)b.createSpan({cls:'gloss-model-default',text:'默认'});const check=b.createSpan({cls:'gloss-model-option-check'});if(selected)setIcon(check,'check');buttons.push(b);}}
      if(!buttons.length){list.createDiv({cls:'gloss-model-empty',text:'请在设置中添加服务和模型'});button(list,'打开模型服务',()=>{this.closeModelMenu();(this.app as any).setting.open();(this.app as any).setting.openTabById('gloss-reader');},'gloss-model-option');}active=Math.max(0,buttons.findIndex(b=>b.getAttribute('aria-selected')==='true'));buttons.forEach((b,i)=>b.addEventListener('pointermove',()=>{active=i;buttons.forEach((el,j)=>el.classList.toggle('is-focused',i===j));}));buttons[active]?.classList.add('is-focused');};
    search.addEventListener('input',draw);menu.addEventListener('keydown',e=>{e.stopPropagation();if(e.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();this.closeModelMenu(true);}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();active=buttons.length?(active+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length:0;updateActive();}else if(e.key==='Enter'&&e.target===search){e.preventDefault();buttons[active]?.click();}},true);
    menu.createDiv({cls:'gloss-model-menu-foot',text:'本次问答模型 · 翻译与总结优先使用用途分配'});draw();
    const root=this.root.getBoundingClientRect(),box=trigger.getBoundingClientRect(),width=Math.min(340,this.root.clientWidth-24);menu.style.width=width+'px';menu.style.maxHeight=Math.max(140,this.root.clientHeight-90)+'px';const height=Math.min(menu.offsetHeight,this.root.clientHeight-90),left=Math.max(12,Math.min(this.root.clientWidth-width-12,box.left-root.left));menu.style.left=left+'px';menu.style.top=Math.max(66,Math.min(this.root.clientHeight-height-12,box.bottom-root.top+8+height>this.root.clientHeight?box.top-root.top-height-8:box.bottom-root.top+8))+'px';this.focusInput(search);
  }
  private clearSelectionPreview(){const registry=(this.root?.ownerDocument.defaultView as any)?.CSS?.highlights;if(this.selectionPreview&&registry?.get('gloss-selection')===this.selectionPreview)registry.delete('gloss-selection');this.selectionPreview=undefined;}
  private updateSelectionPreview(){
    this.clearSelectionPreview();if(!this.selected||!this.article)return;const keep=(this.lens&&!this.lens.hidden&&this.lensMode!=='actions')||(this.composerWrap&&!this.composerWrap.hidden);if(!keep)return;
    const range=anchorRange(this.blocks,this.passages,this.text,this.selected),win=this.article.ownerDocument.defaultView as any;if(range&&win?.CSS?.highlights&&win.Highlight){this.selectionPreview=new win.Highlight(range);win.CSS.highlights.set('gloss-selection',this.selectionPreview);}
  }
  private protectInput(input:HTMLInputElement|HTMLTextAreaElement){
    for(const event of ['pointerdown','mousedown','click','paste','cut','copy'] as const)input.addEventListener(event,e=>e.stopPropagation());
    input.addEventListener('keydown',event=>{const e=event as KeyboardEvent;if(e.key!=='Escape'||e.isComposing||e.keyCode===229)e.stopPropagation();});
  }
  private focusInput(input:HTMLInputElement|HTMLTextAreaElement){
    input.focus({preventScroll:true});
    // Pointer activation and workspace handlers may finish after the button callback.
    requestAnimationFrame(()=>{if(input.isConnected&&!input.closest('[hidden]'))input.focus({preventScroll:true});});
  }
  toggleComposer(next=this.composerWrap.hidden){
    this.composerWrap.hidden=!next;this.questionButton.setAttribute('aria-expanded',String(next));this.questionButton.toggleClass('is-active',next);
    if(next){this.closeLens();this.updateContext();this.layoutMargin();this.focusInput(this.composer);}
    else if(this.composer===this.composer.ownerDocument.activeElement)this.composer.blur();
    this.updateSelectionPreview();
  }
  private closeLens(){if(this.lens){this.lens.hidden=true;this.lensInput=undefined;}this.updateSelectionPreview();}
  private showLens(mode:'actions'|'ask'|'note',initial=''){
    if(!this.selected)return;if(mode!=='actions')this.toggleComposer(false);this.lensMode=mode;this.lensInput=undefined;this.lens.empty();this.lens.hidden=false;this.lens.classList.toggle('is-editor',mode!=='actions');
    if(mode==='actions'){
      const ask=button(this.lens,'提问',()=>this.showLens('ask'),'gloss-lens-action gloss-lens-ask');ask.createSpan({cls:'gloss-lens-caret'});this.lens.createSpan({cls:'gloss-lens-divider'});
      for(const command of this.plugin.store.settings.commands)button(this.lens,command.name,()=>this.runCommand(command),'gloss-lens-action gloss-command-action');
      this.lens.createSpan({cls:'gloss-lens-divider'});
      this.iconButton(this.lens,'pen-line','写批注',()=>this.showLens('note'),'gloss-lens-action');
      this.iconButton(this.lens,'copy','复制选文',async()=>{if(this.selected)await navigator.clipboard.writeText(this.selected.quote);this.closeLens();},'gloss-lens-action');
      this.iconButton(this.lens,'settings-2','管理选文指令',()=>{(this.app as any).setting.open();(this.app as any).setting.openTabById(this.plugin.manifest.id);const tab=(this.app as any).setting.activeTab;if(tab instanceof GlossSettings){tab.tab='commands';tab.display();}},'gloss-lens-action');
      if(this.activeHighlight)this.iconButton(this.lens,'eraser','移除这条标记',()=>this.removeHighlight(this.activeHighlight!),'gloss-lens-action');
      this.lens.createSpan({cls:'gloss-lens-divider'});
      const styles=this.lens.createDiv({cls:'gloss-mark-styles'});
      for(const [style,icon]of [['underline','underline'],['wavy','spline'],['highlight','highlighter']] as const){const b=this.iconButton(styles,icon,MARK_STYLES[style],()=>this.highlight(this.plugin.store.settings.marker||'yellow',style),'gloss-lens-action');b.dataset.markStyle=style;}
      const colors=this.lens.createDiv({cls:'gloss-marker-colors',attr:{role:'group','aria-label':'标记颜色'}});
      for(const[color,label]of [['yellow','黄色'],['green','绿色'],['blue','蓝色'],['pink','粉色']]){const b=button(colors,'',()=>this.highlight(color,this.plugin.store.settings.markStyle),'gloss-marker-dot');b.dataset.color=color;b.setAttribute('aria-label',label+'标记');b.title=label;b.classList.toggle('is-on',color===this.plugin.store.settings.marker);}
    }else{
      const head=this.lens.createDiv({cls:'gloss-lens-editor-head'});head.createSpan({text:mode==='ask'?'关于这段话':'用自己的话记下来'});this.iconButton(head,'x','关闭选文输入',()=>this.closeLens(),'gloss-lens-action');
      this.lensInput=this.lens.createEl('textarea',{cls:'gloss-lens-input',attr:{'aria-label':mode==='ask'?'选文提问':'选文批注',placeholder:mode==='ask'?'这句话为什么这样说？':'这段话让你想到了什么？',rows:mode==='ask'?'2':'3'}});
      const existing=this.data.highlights.find(h=>h.id===this.activeHighlight);this.lensInput.value=mode==='note'?existing?.note||'':initial;
      const footer=this.lens.createDiv({cls:'gloss-lens-editor-footer'});if(mode==='ask'){this.modelPicker(footer,'选文提问模型');this.iconButton(footer,'arrow-up','发送选文问题',()=>this.send(this.lensInput?.value),'gloss-lens-submit');}
      else button(footer,'保存批注',()=>this.saveLensNote(),'gloss-lens-save');
      this.protectInput(this.lensInput);this.lensInput.addEventListener('focus',()=>this.closeModelMenu());
      this.lensInput.addEventListener('keydown',e=>{if(!e.isComposing&&e.keyCode!==229&&e.key==='Enter'&&!e.shiftKey&&(mode==='ask'||e.metaKey||e.ctrlKey)){e.preventDefault();void(mode==='ask'?this.send(this.lensInput!.value):this.saveLensNote()).catch(showError);}});
      // The anchor is already stored; release the document selection before editing.
      this.article.ownerDocument.getSelection()?.removeAllRanges();
    }
    this.placeLens();this.updateSelectionPreview();
    if(this.lensInput){this.focusInput(this.lensInput);this.lensInput.setSelectionRange(this.lensInput.value.length,this.lensInput.value.length);}
  }
  private async runCommand(command:ReadingCommand){if(!this.selected)return;await this.send(renderCommand(command.prompt,this.selected.quote,this.path.split('/').pop()?.replace(/\.md$/,'')||''),false,command.id);}
  private placeLens(){if(!this.selected||this.lens.hidden)return;const r=anchorRange(this.blocks,this.passages,this.text,this.selected);if(!r)return;const rects=Array.from(r.getClientRects()).filter(r=>r.width>0);if(!rects.length)return;const first=rects[0],last=rects.at(-1)!,box=this.root.getBoundingClientRect(),w=this.lens.offsetWidth,h=this.lens.offsetHeight,center=(Math.min(...rects.map(r=>r.left))+Math.max(...rects.map(r=>r.right)))/2;const x=Math.max(12,Math.min(this.root.clientWidth-w-12,center-box.left-w/2));const above=first.top-box.top-h-12>=66;const y=above?first.top-box.top-h-12:last.bottom-box.top+12;this.lens.style.left=x+'px';this.lens.style.top=Math.max(66,Math.min(this.root.clientHeight-h-12,y))+'px';this.lens.style.setProperty('--gloss-arrow',Math.max(18,Math.min(w-18,(above?first.left+Math.min(40,first.width/2):(last.left+last.right)/2)-box.left-x))+'px');this.lens.classList.toggle('is-below',!above);}
  private updateContext(){if(!this.composer)return;this.updateSelectionPreview();const t=this.threads.find(t=>t.id===this.activeThread),a=t?.anchor||this.selected;this.composeLabel.textContent=a?`“${a.quote.length>50?a.quote.slice(0,50)+'…':a.quote}”`:'';this.composeLabel.hidden=!a;this.composer.placeholder=t?'继续追问…':a?'询问这段文字…':'询问这篇文章…';const scope=this.root.querySelector('.gloss-scope');if(scope)scope.textContent=a&&this.plugin.store.settings.context!=='whole'?'选文':'全文';}
  private paintHighlights(){if(!this.article)return;const marks:TextMark[]=[];for(const h of this.data.highlights.filter(h=>!h.removed)){const start=resolveAnchor(this.text,h.anchor);if(start!==null)marks.push({id:h.id,start,end:start+h.anchor.quote.length,kind:'highlight',color:h.color,note:!!h.note,style:markStyle(h.style)});}for(const t of this.threads){if(!t.anchor)continue;const start=resolveAnchor(this.text,t.anchor);if(start!==null)marks.push({id:t.id,start,end:start+t.anchor.quote.length,kind:'thread'});}paintMarks(this.article,this.blocks,this.passages,marks,this.activeThread||this.activeHighlight,this.fresh);this.updateSelectionPreview();this.rail?.querySelectorAll<HTMLElement>('.gloss-rail-line').forEach(el=>{const p=this.passages[Number(el.dataset.paragraph)-1],h=marks.find(m=>m.kind==='highlight'&&m.end>p.start&&m.start<p.end),t=marks.some(m=>m.kind==='thread'&&m.end>p.start&&m.start<p.end);el.dataset.color=h?.color||'';el.classList.toggle('has-gloss',t);});}
  private matchedHighlight(){if(!this.selected)return;const at=resolveAnchor(this.text,this.selected);return this.data.highlights.find(h=>!h.removed&&h.anchor.quote===this.selected!.quote&&resolveAnchor(this.text,h.anchor)===at);}
  private async highlight(color:string,style:MarkStyle=this.plugin.store.settings.markStyle){if(!this.selected)return;let h=this.matchedHighlight();if(h){h.color=color;h.style=style;}else{h={id:uid(),anchor:{...this.selected},color,style,note:'',created:Date.now()};this.data.highlights.push(h);}this.plugin.store.settings.marker=color;this.plugin.store.settings.markStyle=style;this.activeHighlight=undefined;this.fresh=h.id;this.data.updated=Date.now();await this.plugin.persist();this.article.ownerDocument.getSelection()?.removeAllRanges();this.closeLens();this.paintHighlights();await this.renderMargin();const id=h.id;setTimeout(()=>{if(this.fresh===id){this.fresh=undefined;this.article.querySelectorAll('.is-new').forEach(el=>el.removeClass('is-new'));}},750);}
  private async saveLensNote(){if(!this.selected||!this.lensInput)return;let h=this.matchedHighlight();const note=this.lensInput.value.trim();if(h)h.note=note;else{if(!note){this.closeLens();return;}h={id:uid(),anchor:{...this.selected},color:this.plugin.store.settings.marker||'yellow',style:this.plugin.store.settings.markStyle,note,created:Date.now()};this.data.highlights.push(h);}this.activeHighlight=h.id;this.fresh=h.id;this.data.updated=Date.now();await this.plugin.persist();this.closeLens();this.paintHighlights();await this.renderMargin();if(this.narrow)this.toggleNotebook(true);}
  private async removeHighlight(id:string){const h=this.data.highlights.find(h=>h.id===id);if(!h)return;h.removed=true;await this.plugin.persist();this.closeLens();this.activeHighlight=undefined;this.paintHighlights();await this.renderMargin();new Notice('高亮已移除，可在笔记本底部恢复。');}
  private jump(anchor:Anchor){const r=anchorRange(this.blocks,this.passages,this.text,anchor);if(!r){new Notice('原文已变化，无法可靠定位；摘录仍完整保留。');return;}const start=resolveAnchor(this.text,anchor)!,i=this.passages.findIndex(p=>p.end>start),b=this.blocks[i];b.scrollIntoView({behavior:'smooth',block:'center'});b.addClass('gloss-jump');setTimeout(()=>b.removeClass('gloss-jump'),1800);}
  private activateThread(t:Thread){this.activeThread=t.id;this.activeHighlight=undefined;this.selected=t.anchor;this.paintHighlights();this.updateContext();if(this.narrow){this.notebookOpen=true;this.drawer.hidden=false;}void this.renderMargin();}
  revealSaved(id:string){const h=this.data.highlights.find(h=>h.id===id),t=this.threads.find(t=>t.id===id);if(h){this.activeThread=undefined;this.activeHighlight=h.id;this.selected=h.anchor;this.jump(h.anchor);if(h.note){void this.renderMargin();if(this.narrow)this.toggleNotebook(true);}else this.showLens('actions');}if(t){this.activateThread(t);if(t.anchor)this.jump(t.anchor);}}
  private setHover(id?:string){this.article.querySelectorAll<HTMLElement>('[data-g]').forEach(el=>el.classList.toggle('is-hover',!!id&&el.dataset.g!.split(' ').includes(id)));for(const [key,card]of this.cards)card.classList.toggle('is-hover',id===key);}
  private citeButtons(parent:HTMLElement,t:Thread){
    const walker=parent.ownerDocument.createTreeWalker(parent,4),nodes:Text[]=[];while(walker.nextNode()){const n=walker.currentNode as Text;if(referenceTokens(n.data).length&&!n.parentElement?.closest('pre,code,a,button'))nodes.push(n);}
    for(const n of nodes){const fragment=parent.ownerDocument.createDocumentFragment();let end=0;for(const token of referenceTokens(n.data)){fragment.append(n.data.slice(end,token.start));for(const id of token.ids){const b=parent.ownerDocument.createElement('button');b.className='gloss-citation';b.textContent='¶'+id;const anchor=t.citations?.[id];if(anchor){b.onclick=()=>this.jump(anchor);b.title=anchor.quote;}else{b.disabled=true;b.title='未提供的原文段落';}fragment.append(b);}end=token.end;}fragment.append(n.data.slice(end));n.replaceWith(fragment);}
  }
  private async renderThread(parent:HTMLElement,t:Thread,component:Component,notebook=false){
    const active=t.id===this.activeThread,streaming=!!this.aborter&&this.runningThread===t.id,card=parent.createEl('article',{cls:'gloss-margin-card gloss-thread-card'});card.dataset.threadId=t.id;card.dataset.cardId=t.id;card.toggleClass('is-active',active);card.toggleClass('is-collapsed',!active);
    if(!notebook){this.cards.set(t.id,card);const prior=this.previousPositions.get(t.id);if(prior){card.style.transform=prior;card.style.visibility='visible';card.dataset.placed='true';}}
    const number=t.anchor?this.paragraphNumber(t.anchor):null,head=card.createDiv({cls:'gloss-card-heading'});head.createSpan({cls:'gloss-card-kind',text:threadType(t,this.plugin.store.settings.commands)});if(number)button(head,'¶'+number,()=>{if(this.activeThread!==t.id)this.activateThread(t);this.jump(t.anchor!);},'gloss-citation');
    if(active)this.iconButton(head,'chevrons-down-up','收起这段对话',()=>{this.activeThread=undefined;this.paintHighlights();this.updateContext();void this.renderMargin();},'gloss-collapse');
    if(t.anchor&&active){const quote=button(card,t.anchor.quote,()=>this.jump(t.anchor!),'gloss-thread-quote');quote.setAttribute('aria-label','引用原文：'+t.anchor.quote);quote.title=t.anchor.quote;}
    const first=t.messages.find(m=>m.role==='user');
    if(!active){
      if(!t.commandId||t.commandId==='default')card.createEl('p',{cls:'gloss-card-question',text:first?.content||'关于这篇文档'});
      const last=t.messages.filter(m=>m.role==='assistant').at(-1);
      const answer=last?.content||t.error||(streaming?'正在回答…':'尚无回答'),gist=card.createEl('p',{cls:'gloss-card-gist',text:answer.replace(/[#*_`]/g,'').slice(0,240)});this.citeButtons(gist,t);
      const expand=button(card,'阅读全文',()=>this.activateThread(t),'gloss-expand-thread');expand.setAttribute('aria-label','展开批注：'+first?.content);
    }else{
      for(const [index,m]of t.messages.entries()){if(index===0&&m.role==='user'&&t.commandId&&t.commandId!=='default')continue;const message=card.createDiv({cls:'gloss-message '+(m.role==='user'?'is-user':'is-assistant')});message.createDiv({cls:'gloss-message-label',text:m.role==='user'?'Q':'A'});
        if(m.role==='user')message.createEl('p',{cls:'gloss-card-question',text:m.content});
        else{const body=message.createDiv({cls:'gloss-answer markdown-rendered'});if(!m.content&&streaming)body.createDiv({cls:'gloss-writing',attr:{role:'status','aria-label':'正在回答'}});else{await MarkdownRenderer.render(this.app,passiveEmbeds(m.content),body,this.path,component);if(component!==this.marginRender)return;this.citeButtons(body,t);}}
      }
      const cited=[...new Set(t.messages.filter(m=>m.role==='assistant').flatMap(m=>referenceTokens(m.content).flatMap(token=>token.ids)))];
      if(cited.length){const references=card.createDiv({cls:'gloss-thread-references'});references.createSpan({text:'引用原文'});for(const id of cited){const anchor=t.citations?.[id],b=button(references,'¶'+id,()=>{if(anchor)this.jump(anchor);},'gloss-citation');b.disabled=!anchor;b.title=anchor?.quote||'未提供的原文段落';}}
      if(t.error)card.createDiv({cls:'gloss-error',text:t.error});
      this.answerFooter(card,t);const form=card.createDiv({cls:'gloss-followup'}),input=form.createEl('input',{attr:{type:'text','aria-label':'继续追问这条批注',placeholder:'继续追问…'}});input.disabled=!!this.aborter;
      const submit=()=>{this.activeThread=t.id;this.selected=t.anchor;return this.send(input.value);};this.protectInput(input);input.addEventListener('focus',()=>{this.closeModelMenu();this.selected=t.anchor;this.updateSelectionPreview();});input.addEventListener('keydown',e=>{if(!e.isComposing&&e.keyCode!==229&&e.key==='Enter'){e.preventDefault();void submit().catch(showError);}});const send=this.iconButton(form,streaming?'square':'arrow-up',streaming?'停止回答':'发送追问',()=>streaming?this.stop():submit(),'gloss-followup-send');send.disabled=!!this.aborter&&!streaming;
    }
    card.addEventListener('click',e=>{if((e.target as Element).closest('button,a,input,textarea,select,[contenteditable="true"]')||!card.ownerDocument.getSelection()?.isCollapsed)return;if(this.activeThread!==t.id)this.activateThread(t);});
    card.addEventListener('mouseenter',()=>this.setHover(t.id));card.addEventListener('mouseleave',()=>this.setHover());return card;
  }
  private paragraphNumber(a:Anchor){const start=resolveAnchor(this.text,a);return start===null?null:this.passages.find(p=>p.end>start)?.number;}
  private activateNote(h:Highlight){this.activeHighlight=h.id;this.activeThread=undefined;this.selected=h.anchor;this.paintHighlights();this.updateContext();void this.renderMargin().catch(showError);}
  private renderNote(parent:HTMLElement,h:Highlight,notebook=false){const card=parent.createEl('article',{cls:'gloss-margin-card gloss-personal-card'});card.dataset.cardId=h.id;card.dataset.color=h.color;if(!notebook){this.cards.set(h.id,card);const prior=this.previousPositions.get(h.id);if(prior){card.style.transform=prior;card.style.visibility='visible';card.dataset.placed='true';}}card.toggleClass('is-active',h.id===this.activeHighlight);const head=card.createDiv({cls:'gloss-card-heading'});head.createSpan({cls:'gloss-note-color',attr:{'data-color':h.color}});head.createSpan({text:'我的批注'});const number=this.paragraphNumber(h.anchor);if(number)button(head,'¶'+number,()=>{this.activateNote(h);this.jump(h.anchor);},'gloss-citation');button(card,h.anchor.quote,()=>{this.activateNote(h);this.showLens('actions');this.jump(h.anchor);},'gloss-note-quote');if(h.note)card.createEl('p',{cls:'gloss-personal-note',text:h.note});if(number===null)card.createDiv({cls:'gloss-stale',text:'原文已变更 · 摘录仍保留'});const actions=card.createDiv({cls:'gloss-note-actions'});this.iconButton(actions,'pen-line','编辑批注',()=>{this.activateNote(h);this.showLens('note');});this.iconButton(actions,'message-circle','讨论这段',()=>{this.activateNote(h);this.showLens('ask');});this.iconButton(actions,'eraser','移除高亮',()=>this.removeHighlight(h.id));card.addEventListener('click',e=>{if((e.target as Element).closest('button,a,input,textarea,select,[contenteditable="true"]')||!card.ownerDocument.getSelection()?.isCollapsed)return;if(this.activeHighlight!==h.id)this.activateNote(h);});return card;}
  private regenerationSettings(thread:Thread):Settings{
    const previous=thread.messages.filter(m=>m.role==='assistant').at(-1),s=this.plugin.store.settings;
    if(!previous?.model)return this.modelSettings(thread.commandId||'default');
    const candidates=s.services.filter(service=>(previous.serviceId?service.id===previous.serviceId:!previous.provider||[service.name,service.kind,providerName(service.kind)].includes(previous.provider))&&service.models.some(model=>model.id===previous.model));
    if(candidates.length!==1)throw new Error('原回答的模型服务已变更，请先在设置中配置该模型。');
    const service=candidates[0];return{...s,...serviceSettings(service,previous.model,this.plugin.serviceKey(service.id))};
  }
  private async regenerateThread(thread:Thread){if(this.aborter||thread.removed)return;regenerationHistory(thread);this.activeThread=thread.id;this.selected=thread.anchor;await this.send(undefined,false,thread.commandId||'default',thread);}
  private async deleteThread(thread:Thread){if(thread.removed)return;if(this.runningThread===thread.id)this.stop();thread.removed=true;thread.removedAt=Date.now();if(this.activeThread===thread.id){this.activeThread=undefined;this.selected=undefined;}await this.plugin.persist();this.paintHighlights();this.updateContext();await this.renderMargin();const fragment=this.root.ownerDocument.createDocumentFragment();fragment.append('已删除问答 ');const undo=this.root.ownerDocument.createElement('button');undo.textContent='撤销';undo.onclick=()=>{thread.removed=false;delete thread.removedAt;void this.plugin.persist().then(()=>{this.paintHighlights();return this.renderMargin();}).catch(showError);};fragment.append(undo);new Notice(fragment,8000);}
  private answerFooter(card:HTMLElement,thread:Thread){
    const foot=card.createDiv({cls:'gloss-card-footer gloss-answer-controls'}),last=thread.messages.filter(m=>m.role==='assistant').at(-1),receipt=foot.createSpan({cls:'gloss-answer-receipt'});receipt.createSpan({cls:'gloss-receipt-model',text:last?.model||'模型未记录'});receipt.createSpan({cls:'gloss-receipt-divider',text:'/'});receipt.createSpan({cls:'gloss-receipt-tokens',text:tokenReceipt(last?.usage)});receipt.title=[last?.provider,last?.model,tokenDetails(last?.usage)].filter(Boolean).join(' · ');
    const regenerate=this.iconButton(foot,'rotate-ccw','重新生成回答',()=>this.regenerateThread(thread));regenerate.disabled=!!this.aborter||!thread.messages.some(m=>m.role==='user');
    this.iconButton(foot,'copy','复制完整对话',async()=>{await navigator.clipboard.writeText((thread.anchor?'引用原文：\n'+thread.anchor.quote+'\n\n':'')+thread.messages.map(m=>(m.role==='user'?'我的问题':'回答'+(m.model?' · '+m.model:'')+(m.usage?' / '+tokenReceipt(m.usage):''))+'：\n'+m.content).join('\n\n'));new Notice('已复制对话与引用');});
    this.iconButton(foot,'trash-2','删除这条问答',()=>this.deleteThread(thread));return foot;
  }
  private notebookRender?:Component;
  private notebookMeta(parent:HTMLElement,anchor:Anchor|undefined,label:string,created:number){const head=parent.createDiv({cls:'gloss-notebook-meta'}),n=anchor?this.paragraphNumber(anchor):null;if(n)head.createSpan({cls:'gloss-citation gloss-notebook-paragraph',text:'¶'+n});head.createSpan({cls:'gloss-notebook-type',text:label});head.createSpan({cls:'gloss-notebook-time',text:notebookTime(created)});return head;}
  private notebookGo(t:Thread){this.toggleNotebook(false);this.activateThread(t);if(t.anchor)this.jump(t.anchor);else this.scroller.scrollTo({top:0,behavior:'smooth'});requestAnimationFrame(()=>this.cards.get(t.id)?.scrollIntoView({block:'nearest',behavior:'smooth'}));}
  private async renderNotebook(){
    const counts=notebookCounts(this.data);this.notebookBadge.textContent=String(counts.all);this.notebookBadge.hidden=!counts.all;this.drawerSubtitle.textContent=counts.all?counts.questions+' 条问答，'+counts.highlights+' 处划线':'还没有阅读笔记';this.drawerTabs.empty();
    for(const [key,label]of [['all','全部'],['questions','问答'],['highlights','划线']]as const){const b=button(this.drawerTabs,'',()=>{this.notebookFilter=key;void this.renderNotebook().catch(showError);},'gloss-notebook-tab');b.createSpan({text:label});b.createSpan({cls:'gloss-notebook-tab-count',text:String(counts[key])});b.setAttribute('role','tab');b.setAttribute('aria-label',label+' '+counts[key]);b.setAttribute('aria-selected',String(this.notebookFilter===key));}
    const scroll=this.drawerBody.scrollTop;this.drawerBody.empty();if(this.notebookRender){this.removeChild(this.notebookRender);this.notebookRender.unload();this.notebookRender=undefined;}if(!this.notebookOpen)return;
    const component=new Component();this.notebookRender=component;this.addChild(component);const entries=notebookEntries(this.data,this.notebookFilter,this.text),list=this.drawerBody.createEl('ol',{cls:'gloss-notebook-list'});
    for(const entry of entries){const item=list.createEl('li');if(entry.kind==='highlight'){const h=entry.value,card=item.createEl('article',{cls:'gloss-notebook-entry gloss-notebook-highlight',attr:{'aria-label':(h.note?'批注':'划线')+' · '+h.anchor.quote.slice(0,30)}});card.dataset.entryKind='highlight';card.dataset.entryId=h.id;
        const go=button(card,'',()=>{this.toggleNotebook(false);this.activateNote(h);this.jump(h.anchor);},'gloss-notebook-entry-go');this.notebookMeta(go,h.anchor,h.note?'批注':MARK_STYLES[markStyle(h.style)],h.created);const quote=go.createSpan({cls:'gloss-notebook-highlight-quote'}),mark=quote.createEl('mark',{cls:'m-hl',text:h.anchor.quote});mark.dataset.c=h.color;mark.dataset.fill=String(markStyle(h.style)==='highlight');if(markStyle(h.style)!=='highlight'){mark.dataset.line=markStyle(h.style);mark.dataset.lc=h.color;}if(h.note)go.createSpan({cls:'gloss-notebook-personal-note',text:h.note});this.iconButton(card,'x','移除这处划线',()=>this.removeHighlight(h.id),'gloss-notebook-entry-remove');
      }else{const t=entry.value,card=item.createEl('article',{cls:'gloss-notebook-entry gloss-notebook-question',attr:{'aria-label':threadType(t,this.plugin.store.settings.commands)+' · '+(t.messages.find(m=>m.role==='user')?.content||'全文问答')}});card.dataset.entryKind='question';card.dataset.entryId=t.id;
        const go=button(card,'',()=>this.notebookGo(t),'gloss-notebook-entry-go');this.notebookMeta(go,t.anchor,threadType(t,this.plugin.store.settings.commands),t.created);if(t.anchor)go.createSpan({cls:'gloss-notebook-source',text:t.anchor.quote});
        let pair:HTMLElement|undefined;for(const [index,message]of t.messages.entries()){if(message.role==='user'){pair=card.createDiv({cls:'gloss-notebook-pair'});const question=pair.createDiv({cls:'gloss-notebook-qa is-question'});question.createSpan({cls:'gloss-notebook-qa-label',text:'Q',attr:{'aria-label':'问题'}});question.createEl('p',{text:message.content});}else{pair||=card.createDiv({cls:'gloss-notebook-pair'});const answer=pair.createDiv({cls:'gloss-notebook-qa is-answer'});answer.createSpan({cls:'gloss-notebook-qa-label',text:'A',attr:{'aria-label':'回答'}});const copy=answer.createDiv({cls:'gloss-notebook-answer-content'}),body=copy.createDiv({cls:'gloss-answer gloss-notebook-clamp markdown-rendered'}),key=t.id+':'+index,expanded=this.notebookAnswers.has(key);body.classList.toggle('is-expanded',expanded);
            if(!message.content&&this.runningThread===t.id&&this.aborter)body.createDiv({cls:'gloss-writing',attr:{role:'status','aria-label':'正在回答'}});else if(message.content){await MarkdownRenderer.render(this.app,passiveEmbeds(message.content),body,this.path,component);if(component!==this.notebookRender)return;this.citeButtons(body,t);}else body.createSpan({cls:'gloss-notebook-unanswered',text:t.error||'尚无回答'});
            const more=button(copy,expanded?'收起回答':'阅读全文',()=>{const open=!body.classList.contains('is-expanded');body.classList.toggle('is-expanded',open);body.classList.toggle('is-over',!open);if(open)this.notebookAnswers.add(key);else this.notebookAnswers.delete(key);more.textContent=open?'收起回答':'阅读全文';},'gloss-notebook-read-more');more.hidden=!expanded;requestAnimationFrame(()=>{if(component!==this.notebookRender||!body.isConnected)return;const over=body.scrollHeight>body.clientHeight+2;body.classList.toggle('is-over',!expanded&&over);more.hidden=!expanded&&!over;});
          }}if(t.messages.at(-1)?.role==='user'){const status=card.createDiv({cls:'gloss-notebook-unanswered',text:t.error||'尚无回答'});status.setAttribute('role','status');}if(t.error&&t.messages.at(-1)?.role==='assistant')card.createDiv({cls:'gloss-error',text:t.error});this.answerFooter(card,t);
      }}
    if(!entries.length){const empty=this.drawerBody.createDiv({cls:'gloss-notebook-empty'});setIcon(empty.createSpan(),'notebook-pen');empty.createEl('p',{text:this.notebookFilter==='questions'?'还没有问答':this.notebookFilter==='highlights'?'还没有划线':'选中一句话，留下问题或划线。'});}
    const removedQuestions=this.data.threads.filter(t=>t.removed).sort((a,b)=>(b.removedAt||0)-(a.removedAt||0));if(removedQuestions.length)button(this.drawerBody,'恢复最近删除的问答',async()=>{const t=removedQuestions[0];t.removed=false;delete t.removedAt;await this.plugin.persist();this.paintHighlights();await this.renderMargin();},'gloss-restore');
    const removed=this.data.highlights.filter(h=>h.removed);if(removed.length)button(this.drawerBody,'恢复最近移除的高亮',async()=>{removed.at(-1)!.removed=false;await this.plugin.persist();this.paintHighlights();await this.renderMargin();},'gloss-restore');
    this.drawerBody.scrollTop=scroll;
  }
  private async renderMargin(){if(!this.margin)return;if(this.marginRender){this.removeChild(this.marginRender);this.marginRender.unload();}this.marginObserver?.disconnect();const component=new Component();this.marginRender=component;this.addChild(component);for(const[id,card]of this.cards)this.previousPositions.set(id,card.style.transform);this.margin.empty();this.leader=undefined;cancelAnimationFrame(this.leaderFrame);this.cards.clear();
    const notes=this.data.highlights.filter(h=>!h.removed&&h.note);
    for(const t of this.threads){await this.renderThread(this.margin,t,component);if(component!==this.marginRender)return;}
    for(const h of notes)this.renderNote(this.margin,h);
    if(!this.threads.length&&!notes.length){const hint=this.margin.createDiv({cls:'gloss-margin-hint'});hint.createEl('p',{text:'这里留给你的思考。'});hint.createEl('p',{text:'选中一句话，直接输入问题。回答会写在它旁边。'});}
    await this.renderNotebook();if(component!==this.marginRender)return;
    this.marginObserver=new ResizeObserver(()=>this.scheduleLayout());for(const card of this.cards.values())this.marginObserver.observe(card);this.scheduleLayout();}
  private scheduleLayout(){cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>this.layoutMargin());}
  private layoutMargin(){if(!this.margin?.isConnected)return;const compose=this.root.querySelector<HTMLElement>('.gloss-composer');if(compose){const r=this.page.getBoundingClientRect(),root=this.root.getBoundingClientRect();compose.style.left=(r.left-root.left+r.width/2)+'px';}const base=this.margin.getBoundingClientRect().top,items:MarginItem[]=[];
    for(const t of this.threads){const card=this.cards.get(t.id);if(!card)continue;const rect=t.anchor?anchorRange(this.blocks,this.passages,this.text,t.anchor)?.getClientRects()[0]:this.article.getBoundingClientRect();const desired=rect?rect.top-base-6:0;items.push({id:t.id,desired:Math.max(0,desired),height:card.offsetHeight||64,created:t.created});}
    for(const h of this.data.highlights.filter(h=>!h.removed&&h.note)){const card=this.cards.get(h.id);if(!card)continue;const rect=anchorRange(this.blocks,this.passages,this.text,h.anchor)?.getClientRects()[0];items.push({id:h.id,desired:Math.max(0,rect?rect.top-base-6:0),height:card.offsetHeight||48,created:h.created});}
    items.sort((a,b)=>a.desired-b.desired||a.created-b.created);const positions=placeMarginItems(items,this.activeThread||this.activeHighlight);let bottom=0,moving=false;for(const item of items){const card=this.cards.get(item.id)!;const first=!card.dataset.placed;if(first)card.style.transition='none';const transform=`translateY(${Math.round(positions[item.id])}px)`;if(!first&&card.style.transform!==transform)moving=true;card.style.transform=transform;card.dataset.placed='true';card.style.visibility='visible';bottom=Math.max(bottom,positions[item.id]+item.height);if(first)requestAnimationFrame(()=>card.style.removeProperty('transition'));}
    this.margin.style.minHeight=Math.max(this.page.offsetHeight,bottom+100)+'px';const hint=this.margin.querySelector<HTMLElement>('.gloss-margin-hint');if(hint)hint.style.transform=`translateY(${Math.max(0,this.article.getBoundingClientRect().top-base)}px)`;this.updateRail(true);this.updateLeader();if(moving)this.trackLeader();}
  private updateLeader(){
    if(!this.margin?.isConnected)return;
    if(!this.leader){this.leader=this.margin.ownerDocument.createElementNS('http://www.w3.org/2000/svg','svg');this.leader.setAttribute('class','gloss-margin-leader');this.leader.setAttribute('aria-hidden','true');this.margin.prepend(this.leader);}
    const svg=this.leader,id=this.activeThread||this.activeHighlight,card=id?this.cards.get(id):undefined;
    const anchor=this.activeThread?this.threads.find(t=>t.id===id)?.anchor:this.data.highlights.find(h=>h.id===id&&!h.removed)?.anchor;
    const source=anchor?anchorRange(this.blocks,this.passages,this.text,anchor)?.getClientRects()[0]:undefined,margin=this.margin.getBoundingClientRect(),gap=margin.left-this.page.getBoundingClientRect().right;
    if(!card||!source||!this.margin.offsetWidth||gap<16){svg.replaceChildren();svg.removeAttribute('data-annotation-id');return;}
    const y0=source.top+source.height/2-margin.top,y1=card.getBoundingClientRect().top+17-margin.top,x0=8,x1=gap-1;
    svg.style.left=-gap+'px';svg.setAttribute('width',String(gap));svg.setAttribute('height',String(Math.max(1,y0+4,y1+4)));svg.setAttribute('data-annotation-id',id!);
    let path=svg.querySelector('path'),dot=svg.querySelector('circle');if(!path){path=svg.ownerDocument.createElementNS(svg.namespaceURI,'path') as SVGPathElement;svg.append(path);}if(!dot){dot=svg.ownerDocument.createElementNS(svg.namespaceURI,'circle') as SVGCircleElement;dot.setAttribute('r','2.2');svg.append(dot);}
    path.setAttribute('d',`M ${x0} ${y0} C ${x0+gap*.5} ${y0}, ${x1-gap*.5} ${y1}, ${x1} ${y1}`);dot.setAttribute('cx',String(x0));dot.setAttribute('cy',String(y0));
  }
  private trackLeader(){cancelAnimationFrame(this.leaderFrame);const until=performance.now()+460,tick=()=>{if(!this.root?.isConnected)return;this.updateLeader();if(performance.now()<until)this.leaderFrame=requestAnimationFrame(tick);else this.leaderFrame=0;};this.leaderFrame=requestAnimationFrame(tick);}
  async send(override?:string,forceWhole=false,task='default',regenerate?:Thread){this.closeModelMenu();if(this.aborter)return;const question=(regenerate?regenerationHistory(regenerate).at(-1)!.content:override??this.composer.value).trim();if(!question){this.toggleComposer(true);return;}if(blockedPath(this.path))throw new Error('此文档不能发送给模型。');if(!(this.app.vault.getAbstractFileByPath(this.path)instanceof TFile))throw new Error('原文已移除。');const path=this.path,data=this.data,settings=regenerate?this.regenerationSettings(regenerate):this.modelSettings(task);let target=regenerate||data.threads.find(t=>!t.removed&&t.id===this.activeThread);const whole=forceWhole||!this.selected||settings.context==='whole';const context=target?.context||contextFor(this.passages,forceWhole?undefined:this.selected,this.text,whole,settings.maxContext);
    if(!target){const citations:Record<string,Anchor>={};for(const p of this.passages)if(context.includes(`[¶${p.number}] `))citations[String(p.number)]=makeAnchor(this.text,p.start,p.end);target={id:uid(),commandId:task,label:task==='summary'?'总结':settings.commands.find(c=>c.id===task)?.name||'提问',anchor:forceWhole?undefined:this.selected?{...this.selected}:undefined,messages:[],created:Date.now(),context,citations};data.threads.push(target);this.activeThread=target.id;}
    const thread=target,previous=regenerate?thread.messages:undefined;if(!regenerate)thread.messages.push({role:'user',content:question});delete thread.error;const history=regenerate?regenerationHistory(thread):thread.messages.map(m=>({...m})),response:Message={role:'assistant',content:'',provider:settings.serviceName||settings.provider,model:modelId(settings),serviceId:settings.serviceId};thread.messages=regenerate?[...history,response]:[...thread.messages,response];data.draft='';data.updated=Date.now();this.composer.value='';this.closeLens();this.article.ownerDocument.getSelection()?.removeAllRanges();
    this.activeHighlight=undefined;const controller=new AbortController();this.aborter=controller;this.runningThread=thread.id;this.renderBrief();this.composerWrap.hidden=false;this.questionButton.setAttribute('aria-expanded','true');this.questionButton.toggleClass('is-active',true);this.composer.disabled=true;this.root.querySelectorAll<HTMLButtonElement>('.gloss-model-picker').forEach(el=>el.disabled=true);setIcon(this.sendButton,'square');this.sendButton.setAttribute('aria-label','停止回答');this.sendButton.title='停止回答';this.fresh=thread.id;this.paintHighlights();this.updateContext();if(this.narrow){this.notebookOpen=true;this.drawer.hidden=false;}
    try{await this.plugin.persist();await this.renderMargin();response.content=await askAgent({settings,context,quote:thread.anchor?.quote,messages:history,signal:controller.signal,onUsage:usage=>{response.usage=usage;},onText:text=>{response.content=text;if(this.path!==path||this.aborter!==controller)return;clearTimeout(this.renderTimer);this.renderTimer=setTimeout(()=>void this.renderMargin().catch(showError),100);}});}catch(e){thread.error=e instanceof Error?e.message:'回答失败，请重试。';if(previous){thread.messages=previous;thread.error+='（已保留原回答）';}else if(!response.content)thread.messages.pop();}
    finally{clearTimeout(this.renderTimer);data.updated=Date.now();try{await this.plugin.persist();}catch(e){showError(e);}if(this.aborter===controller){this.aborter=undefined;this.runningThread=undefined;if(this.path===path&&this.root.isConnected){this.composer.disabled=false;this.root.querySelectorAll<HTMLButtonElement>('.gloss-model-picker').forEach(el=>el.disabled=false);setIcon(this.sendButton,'arrow-up');this.sendButton.setAttribute('aria-label','发送问题');this.sendButton.title='发送问题';this.fresh=undefined;this.renderBrief();this.article.querySelectorAll('.is-new').forEach(el=>el.removeClass('is-new'));await this.renderMargin();}}}
  }
  stop(){this.aborter?.abort();}
  private async exportNotes(){const data=this.data;if(!data.highlights.some(h=>!h.removed)&&!data.threads.some(t=>!t.removed)){new Notice('先留下一条划线、批注或对话。');return;}const folder='收集箱';if(!this.app.vault.getAbstractFileByPath(folder))await this.app.vault.createFolder(folder);const title=this.path.split('/').pop()!.replace(/\.md$/,'').replace(/[\\/:*?"<>|\[\]#^]/g,'-'),stamp=new Date().toISOString().replace(/[:.]/g,'-');let path=normalizePath(`${folder}/${title}-阅读笔记-${stamp}.md`);if(this.app.vault.getAbstractFileByPath(path))path=normalizePath(`${folder}/${title}-阅读笔记-${stamp}-${uid().slice(0,6)}.md`);await this.app.vault.create(path,exportReading(this.path,data,this.app.vault.getName()));new Notice('阅读笔记已保存到 '+path);}
  async onClose(){this.releaseChrome();this.notebookRender?.unload();this.revision++;this.stop();this.resizeObserver?.disconnect();this.marginObserver?.disconnect();cancelAnimationFrame(this.frame);cancelAnimationFrame(this.leaderFrame);clearTimeout(this.progressTimer);clearTimeout(this.draftTimer);clearTimeout(this.renderTimer);clearTimeout(this.reloadTimer);this.closeModelMenu();this.clearSelectionPreview();clearTimeout(this.railTimer);this.root?.remove();await this.flushDraft();}
}

type ModelChoice=ReturnType<typeof serviceChoices>[number];
class ModelAssignmentPicker extends FuzzySuggestModal<ModelChoice|null>{
  constructor(app:App,private setup:ModelSetup,private inherit:boolean,private pick:(ref:ModelRef|null)=>Promise<void>,private current?:ModelRef|null){super(app);this.setPlaceholder('搜索服务或模型…');}
  getItems(){return this.inherit?[null,...serviceChoices(this.setup)]:serviceChoices(this.setup);}
  getItemText(item:ModelChoice|null){return item?item.name+' '+item.serviceName+' '+item.id:'跟随默认问答';}
  renderSuggestion(result:any,el:HTMLElement){const item=result.item as ModelChoice|null;el.addClass('gr-model-suggestion');const copy=el.createDiv();copy.createDiv({cls:'gr-model-name',text:item?.name||'跟随默认问答'});copy.createDiv({cls:'gr-model-id',text:item?item.serviceName+' · '+item.id:'使用默认问答中指定的服务与模型'});if(item?this.current?.serviceId===item.serviceId&&this.current.modelId===item.id:!this.current)setIcon(el.createSpan({cls:'gr-model-suggestion-check'}),'check');}
  onChooseItem(item:ModelChoice|null){void this.pick(item?{serviceId:item.serviceId,modelId:item.id}:null).catch(showError);}
}

class GlossSettings extends PluginSettingTab {
  tab='models';
  private test?:AbortController;
  constructor(app:App,private plugin:GlossPlugin){super(app,plugin);}
  hide(){this.test?.abort();this.test=undefined;}
  private async save(){await this.plugin.persist();for(const l of this.app.workspace.getLeavesOfType(VIEW))if(l.view instanceof GlossView)l.view.refreshSettings();}
  display(){
    this.test?.abort();this.test=undefined;
    const el=this.containerEl;el.empty();el.addClass('gr-settings');const s=this.plugin.store.settings;
    const head=el.createDiv({cls:'gr-settings-head'}),identity=head.createDiv({cls:'gr-settings-identity'});
    identity.createSpan({cls:'gr-settings-name',text:'沉浸阅读'});identity.createSpan({cls:'gr-settings-version',text:'v'+this.plugin.manifest.version});
    const tabs=head.createDiv({cls:'gr-settings-tabs',attr:{role:'tablist','aria-label':'沉浸阅读设置'}});
    for(const[key,label,icon]of [['models','模型服务','plug'],['tasks','用途分配','workflow'],['commands','选文指令','wand-sparkles'],['reading','阅读外观','book-open']]){
      const b=button(tabs,'',()=>{this.tab=key;this.display();},'gr-settings-tab');const mark=b.createSpan();setIcon(mark,icon);b.createSpan({text:label});b.classList.toggle('is-active',this.tab===key);b.setAttribute('role','tab');b.setAttribute('aria-selected',String(this.tab===key));b.id='gr-tab-'+key;b.setAttribute('aria-controls','gr-settings-panel');
    }
    const body=el.createDiv({cls:'gr-settings-body',attr:{id:'gr-settings-panel',role:'tabpanel','aria-labelledby':'gr-tab-'+this.tab}});
    let group=body;const section=(title:string)=>{const card=body.createEl('section',{cls:'gr-settings-group'});card.createEl('h3',{cls:'gr-settings-section',text:title});group=card.createDiv({cls:'gr-settings-group-body'});return group;};
    const row=(label:string,description='')=>{const r=group.createDiv({cls:'gr-settings-row'}),info=r.createDiv({cls:'gr-settings-info'});info.createDiv({cls:'gr-settings-label',text:label});if(description)info.createDiv({cls:'gr-settings-description',text:description});return r.createDiv({cls:'gr-settings-controls'});};
    const select=(label:string,description:string,value:string,options:Record<string,string>,change:(v:string)=>void)=>{const d=row(label,description).createEl('select',{cls:'gr-settings-input',attr:{'aria-label':label}});for(const[k,t]of Object.entries(options))d.createEl('option',{value:k,text:t});d.value=value;d.onchange=()=>{change(d.value);void this.save().catch(showError);};};
    const input=(label:string,desc:string,value:string,placeholder:string,change:(v:string)=>void,type='text')=>{const t=row(label,desc).createEl('input',{cls:'gr-settings-input',attr:{'aria-label':label,type,placeholder}});t.value=value;t.autocomplete='off';t.spellcheck=false;t.onchange=()=>{change(t.value.trim());void this.save().catch(showError);};return t;};
    if(this.tab==='models'){
      this.renderModelsPage(body);
    }else if(this.tab==='tasks'){this.renderTasks(body);
    }else if(this.tab==='commands'){this.renderCommands(body);
    }else if(this.tab==='reading'){
      const appearance=section('默认阅读外观');
      const preview=appearance.createDiv({cls:'gloss-root gr-reading-preview'});preview.dataset.theme=s.theme==='auto'?'paper':s.theme;preview.dataset.font=s.font;preview.style.setProperty('--reader-custom-font',s.customFont||'var(--font-serif)');preview.createDiv({cls:'gr-preview-kicker',text:'READING / 阅读预览'});preview.createEl('p',{text:'阅读时，让问题自然发生。'});preview.createSpan({text:'选中一句话，留下你的理解。'});
      const papers=row('默认背景').createDiv({cls:'gr-paper-choices'});for(const [key,label]of [['auto','跟随系统'],['paper','纸张'],['sepia','暖黄'],['snow','雪白'],['night','夜读'],['ink','墨蓝']]){const b=button(papers,label,async()=>{s.theme=key;await this.save();this.display();},'gr-paper-choice');b.dataset.theme=key;b.classList.toggle('is-active',s.theme===key);b.setAttribute('aria-pressed',String(s.theme===key));}
      select('默认字体','',s.font,{serif:'Newsreader · 书籍衬线',sans:'Schibsted · 清晰无衬线',song:'宋体 · 中文长文',kai:'楷体 · 中文阅读',system:'系统字体',custom:'自定义字体'},v=>{s.font=v;this.display();});
      if(s.font==='custom')input('字体名称','',s.customFont,'例如：LXGW WenKai',v=>{s.customFont=v;this.display();});
      select('字号','',String(s.fontSize),Object.fromEntries(Array.from({length:14},(_,i)=>[String(i+15),(i+15)+' px'])),v=>s.fontSize=Number(v));
      select('行距','',String(s.lineHeight),{'1.5':'紧凑 · 1.5','1.64':'标准 · 1.64','1.82':'宽松 · 1.82',[String(s.lineHeight)]:String(s.lineHeight)},v=>s.lineHeight=Number(v));
      select('正文宽度','',String(s.measure),{'28':'窄','32':'适中','37':'宽'},v=>s.measure=Number(v));
      select('段落编号','',String(s.numbers),{false:'隐藏',true:'显示'},v=>s.numbers=v==='true');
      section('默认标记');select('标记样式','',s.markStyle,{highlight:'荧光笔',underline:'直线',wavy:'波浪线'},v=>s.markStyle=v as MarkStyle);
      select('标记颜色','',s.marker,{yellow:'黄色',green:'绿色',blue:'蓝色',pink:'粉色'},v=>s.marker=v);
      select('问答批注笔色','',s.pen,{vermilion:'朱红',cobalt:'钴蓝',moss:'苔绿',graphite:'石墨'},v=>s.pen=v);
      section('问答范围');select('新问题默认范围','',s.context,{nearby:'选文及相邻段落',whole:'当前文档全文'},v=>s.context=v);
      const limit=input('上下文上限','',String(s.maxContext),'60000',()=>{} ,'number');limit.min='1000';limit.max='300000';limit.onchange=()=>{const n=Number(limit.value);if(Number.isInteger(n)&&n>=1000&&n<=300000){s.maxContext=n;void this.save().catch(showError);}else{limit.value=String(s.maxContext);new Notice('请输入1,000–300,000之间的整数。');}};
    }
  }
  private activeService?:string;
  private renderModelsPage(body:HTMLElement){
    const s=this.plugin.store.settings,head=body.createDiv({cls:'gr-page-title'});head.createEl('h3',{text:'模型服务'});const add=button(head,'',()=>this.editService(),'gr-settings-button is-primary');setIcon(add.createSpan(),'plus');add.createSpan({text:'添加服务'});
    if(!s.services.length){const empty=body.createDiv({cls:'gr-service-empty'});setIcon(empty.createSpan(),'plug');empty.createEl('h4',{text:'添加你的第一个模型服务'});empty.createEl('p',{text:'Codex、Claude、Pi 或自定义 API'});button(empty,'添加服务',()=>this.editService(),'gr-settings-button');return;}
    if(!s.services.some(service=>service.id===this.activeService))this.activeService=s.services[0].id;
    const layout=body.createDiv({cls:'gr-service-workspace'}),nav=layout.createDiv({cls:'gr-service-nav',attr:{role:'tablist','aria-label':'已添加服务'}});
    for(const service of s.services){const b=button(nav,'',()=>{this.activeService=service.id;this.display();},'gr-service-nav-item');b.classList.toggle('is-active',service.id===this.activeService);b.setAttribute('role','tab');b.setAttribute('aria-selected',String(service.id===this.activeService));b.setAttribute('aria-label',service.name+' 服务');setIcon(b.createSpan({cls:'gr-service-symbol'}),SERVICE_ICONS[service.kind]);const copy=b.createSpan({cls:'gr-service-nav-copy'});copy.createSpan({text:service.name});copy.createSpan({cls:'gr-service-nav-meta',text:SERVICE_NAMES[service.kind]+' · '+service.models.length+' 模型'});}
    const service=s.services.find(service=>service.id===this.activeService)!,panel=layout.createDiv({cls:'gr-service-detail',attr:{role:'tabpanel','aria-label':service.name+' 服务配置'}}),header=panel.createDiv({cls:'gr-service-detail-head'}),title=header.createDiv();title.createEl('h4',{text:service.name});title.createSpan({cls:'gr-service-kind',text:service.kind==='api'?({openai:'OpenAI 兼容',responses:'Responses',anthropic:'Anthropic',gemini:'Gemini'}[service.protocol]):SERVICE_NAMES[service.kind]+' CLI'});const actions=header.createDiv({cls:'gr-service-head-actions'});this.settingsIcon(actions,'settings-2','编辑 '+service.name,()=>this.editService(service));this.settingsIcon(actions,'trash-2','删除 '+service.name,()=>this.removeService(service));
    const connection=panel.createDiv({cls:'gr-service-connection'});setIcon(connection.createSpan(),service.kind==='api'?'link':'terminal');connection.createSpan({text:service.kind==='api'?service.base:service.path||'自动查找本机 '+SERVICE_NAMES[service.kind]});
    const modelsHead=panel.createDiv({cls:'gr-service-model-head'});modelsHead.createSpan({text:'已添加模型'});button(modelsHead,'获取模型',()=>this.manageServiceModels(service,true),'gr-settings-button');
    const list=panel.createDiv({cls:'gr-service-models'});
    if(!service.models.length){const empty=list.createDiv({cls:'gr-service-model-empty'});empty.createSpan({text:'还没有添加模型'});button(empty,'获取并选择模型',()=>this.manageServiceModels(service,true),'gr-settings-button gr-ghost');}
    for(const model of service.models){const row=list.createDiv({cls:'gr-saved-model'});setIcon(row.createSpan({cls:'gr-saved-model-icon'}),'box');const copy=row.createDiv({cls:'gr-saved-model-copy'});copy.createSpan({cls:'gr-model-name',text:model.name});copy.createSpan({cls:'gr-model-id',text:model.id});const uses=Object.entries(s.taskModels).filter(([,ref])=>ref?.serviceId===service.id&&ref.modelId===model.id).map(([key])=>({default:'问答',translate:'翻译',summary:'总结'}[key]||s.commands.find(c=>c.id===key)?.name||'指令'));if(uses.length)row.createSpan({cls:'gr-model-use-badge',text:uses.join(' · ')});this.settingsIcon(row,'pencil','重命名 '+model.name,()=>this.renameServiceModel(service,model));this.settingsIcon(row,'x','移除 '+model.name,async()=>{service.models=service.models.filter(m=>m.id!==model.id);pruneAssignments(s);await this.save();this.display();});}
    const footer=panel.createDiv({cls:'gr-service-model-footer'});button(footer,'手动添加模型',()=>this.manageServiceModels(service,false),'gr-settings-button gr-ghost');
  }
  private settingsIcon(parent:HTMLElement,icon:string,label:string,action:()=>void|Promise<void>){const b=button(parent,'',action,'gr-settings-icon');setIcon(b,icon);b.setAttribute('aria-label',label);b.title=label;return b;}
  private editService(existing?:ModelService){
    const draft:ModelService=existing?{...existing,models:[...existing.models]}:newService('codex',uid()),modal=new Modal(this.app);modal.setTitle(existing?'编辑服务':'添加模型服务');modal.contentEl.addClass('gr-model-modal','gr-service-editor');
    const kinds=modal.contentEl.createDiv({cls:'gr-service-types'}),form=modal.contentEl.createDiv();let kind=draft.kind;const drafts=new Map<ServiceKind,{name:string;path:string;base:string;protocol:ApiProtocol;key:string}>();let collect:()=>void=()=>{};
    const draw=()=>{kinds.empty();form.empty();const values=drafts.get(kind)||{name:existing?.name||SERVICE_NAMES[kind],path:draft.path,base:kind==='api'?draft.base:'',protocol:draft.protocol,key:existing?this.plugin.serviceKey(existing.id):''};
      for(const value of ['codex','claude','pi','api']as const){const b=button(kinds,'',()=>{collect();kind=value;draw();},'gr-service-type');setIcon(b.createSpan(),SERVICE_ICONS[value]);b.createSpan({text:SERVICE_NAMES[value]});b.classList.toggle('is-active',value===kind);b.setAttribute('aria-pressed',String(value===kind));b.disabled=!!existing;}
      const field=(label:string,value:string,placeholder='',type='text')=>{const row=form.createDiv({cls:'gr-connection-row'});row.createEl('label',{text:label});const input=row.createEl('input',{cls:'gr-settings-input',attr:{'aria-label':label,type,placeholder}});input.value=value;input.autocomplete='off';input.spellcheck=false;return input;};
      const name=field('服务名称',values.name,'例如：我的 '+SERVICE_NAMES[kind]);name.maxLength=80;let path:HTMLInputElement|undefined,base:HTMLInputElement|undefined,key:HTMLInputElement|undefined,protocol:HTMLSelectElement|undefined;
      if(kind==='api'){const row=form.createDiv({cls:'gr-connection-row'});row.createEl('label',{text:'接口协议'});protocol=row.createEl('select',{cls:'gr-settings-input',attr:{'aria-label':'接口协议'}});for(const [id,label]of Object.entries({openai:'OpenAI 兼容',responses:'OpenAI Responses',anthropic:'Anthropic Messages',gemini:'Google Gemini'}))protocol.createEl('option',{value:id,text:label});protocol.value=values.protocol;base=field('API 地址',values.base||API_DEFAULTS[values.protocol],'https://…/v1');key=field('API Key',values.key,'保存在 Obsidian 密钥存储','password');let old=values.protocol;protocol.onchange=()=>{if(base!.value===API_DEFAULTS[old])base!.value=API_DEFAULTS[protocol!.value as ApiProtocol];old=protocol!.value as ApiProtocol;};}
      else path=field('可执行文件路径',values.path,'自动查找，无需填写');
      collect=()=>{drafts.set(kind,{name:name.value.trim(),path:path?.value.trim()||'',base:base?.value.trim()||API_DEFAULTS.openai,protocol:(protocol?.value||'openai')as ApiProtocol,key:key?.value||''});};
    };draw();const error=modal.contentEl.createDiv({cls:'gr-settings-message',attr:{role:'alert'}}),footer=modal.contentEl.createDiv({cls:'gr-settings-footer'});button(footer,'取消',()=>modal.close(),'gr-settings-button');const save=button(footer,existing?'保存服务':'添加并获取模型',async()=>{collect();const values=drafts.get(kind)!;if(!values.name){error.textContent='请输入服务名称';return;}if(kind==='api'){try{new URL(values.base);apiEndpoint(values.base,values.protocol,'test');}catch{error.textContent='请输入有效的 API 基础地址';return;}}
      save.disabled=true;const service:ModelService={...draft,kind,name:values.name,path:values.path,base:values.base,protocol:values.protocol};try{if(kind==='api')this.plugin.saveServiceKey(service.id,values.key);const s=this.plugin.store.settings;if(existing)s.services=s.services.map(item=>item.id===existing.id?service:item);else s.services.push(service);this.activeService=service.id;await this.save();modal.close();this.display();if(!existing)this.manageServiceModels(service,true);}catch(e){error.textContent=e instanceof Error?e.message:'保存失败';save.disabled=false;}},'gr-settings-button is-primary');modal.open();
  }
  private removeService(service:ModelService){const modal=new Modal(this.app);modal.setTitle('删除“'+service.name+'”？');modal.contentEl.addClass('gr-model-modal');const refs=Object.values(this.plugin.store.settings.taskModels).filter(ref=>ref?.serviceId===service.id).length;modal.contentEl.createEl('p',{text:'将移除该服务的 '+service.models.length+' 个模型'+(refs?'，并清除 '+refs+' 项模型分配':'')+'。已有阅读对话会保留。'});const footer=modal.contentEl.createDiv({cls:'gr-settings-footer'});button(footer,'取消',()=>modal.close(),'gr-settings-button');button(footer,'删除服务',async()=>{const s=this.plugin.store.settings;s.services=s.services.filter(item=>item.id!==service.id);pruneAssignments(s);this.plugin.saveServiceKey(service.id,'');await this.save();modal.close();this.display();},'gr-settings-button is-danger');modal.open();}
  private renameServiceModel(service:ModelService,model:ModelOption){const modal=new Modal(this.app);modal.setTitle('模型显示名称');modal.contentEl.addClass('gr-model-modal');const field=modal.contentEl.createEl('input',{cls:'gr-settings-input',attr:{'aria-label':'模型显示名称',maxlength:'100'}});field.value=model.name;const footer=modal.contentEl.createDiv({cls:'gr-settings-footer'});button(footer,'取消',()=>modal.close(),'gr-settings-button');button(footer,'保存',async()=>{model.name=field.value.trim()||model.id;await this.save();modal.close();this.display();},'gr-settings-button is-primary');modal.open();field.focus();}
  private manageServiceModels(service:ModelService,fetchNow:boolean){
    const modal=new Modal(this.app);modal.setTitle(service.name+' · 添加模型');modal.contentEl.addClass('gr-model-modal');let controller:AbortController|undefined,closed=false;modal.onClose=()=>{closed=true;controller?.abort();};let available=[...service.models],selected=new Set(service.models.map(m=>m.id));
    const toolbar=modal.contentEl.createDiv({cls:'gr-model-toolbar'}),search=toolbar.createEl('input',{attr:{type:'search','aria-label':'搜索服务模型',placeholder:'搜索模型…'}}),fetch=button(toolbar,'获取模型',async()=>{controller?.abort();controller=new AbortController();const c=controller;fetch.disabled=true;status.textContent='正在获取…';try{const found=service.kind==='codex'?await discoverCodexModels():service.kind==='claude'?[{id:'sonnet',name:'Claude Sonnet'},{id:'opus',name:'Claude Opus'},{id:'haiku',name:'Claude Haiku'}]:service.kind==='pi'?await discoverPiModels(service.path,c.signal):await discoverApiModels(serviceSettings(service,'',this.plugin.serviceKey(service.id)),c.signal);if(c.signal.aborted||closed)return;available=mergeModels(available,found);status.textContent=service.kind==='claude'?'Claude CLI 常用别名；实际可用性由账户决定':found.length?'已获取 '+found.length+' 个模型':'暂无模型，可手动添加';draw();}catch(e){if(!c.signal.aborted&&!closed)status.textContent=e instanceof Error?e.message:'获取失败';}finally{fetch.disabled=false;}},'gr-settings-button');
    const status=modal.contentEl.createDiv({cls:'gr-settings-message',attr:{role:'status'}}),tools=modal.contentEl.createDiv({cls:'gr-model-selection-tools'}),count=tools.createSpan();button(tools,'全选当前结果',()=>{for(const m of matches())selected.add(m.id);draw();},'gr-settings-button gr-ghost');button(tools,'清空选择',()=>{selected.clear();draw();},'gr-settings-button gr-ghost');const list=modal.contentEl.createDiv({cls:'gr-model-browser'}),matches=()=>{const q=search.value.trim().toLowerCase();return available.filter(m=>(m.name+' '+m.id).toLowerCase().includes(q));};
    const draw=()=>{list.empty();count.textContent='已选 '+selected.size;for(const model of matches()){const row=list.createEl('label',{cls:'gr-model-browser-row'}),check=row.createEl('input',{attr:{type:'checkbox','aria-label':'添加模型 '+model.id}});check.checked=selected.has(model.id);check.onchange=()=>{if(check.checked)selected.add(model.id);else selected.delete(model.id);count.textContent='已选 '+selected.size;};const copy=row.createSpan({cls:'gr-model-choice-info'});copy.createSpan({cls:'gr-model-name',text:model.name});copy.createSpan({cls:'gr-model-id',text:model.id});}if(!matches().length)list.createDiv({cls:'gr-service-model-empty',text:'没有匹配的模型'});};search.oninput=draw;
    const manual=modal.contentEl.createDiv({cls:'gr-model-toolbar'}),id=manual.createEl('input',{attr:{'aria-label':'手动模型 ID',placeholder:service.kind==='pi'?'provider/model-id':'手动输入模型 ID'}});button(manual,'添加',()=>{const model=normalizeModels([id.value.trim()])[0];if(!model){status.textContent='请输入不含空格的模型 ID';return;}available=mergeModels(available,[model]);selected.add(model.id);id.value='';search.value='';draw();},'gr-settings-button');
    const footer=modal.contentEl.createDiv({cls:'gr-settings-footer'});button(footer,'取消',()=>modal.close(),'gr-settings-button');button(footer,'添加所选模型',async()=>{const s=this.plugin.store.settings;service.models=available.filter(m=>selected.has(m.id));pruneAssignments(s);await this.save();modal.close();this.display();},'gr-settings-button is-primary');modal.open();draw();if(fetchNow)fetch.click();else id.focus();
  }
  private modelLabel(ref:ModelRef|null|undefined){if(!ref)return'跟随默认问答';const service=this.plugin.store.settings.services.find(s=>s.id===ref.serviceId),model=service?.models.find(m=>m.id===ref.modelId);return model?model.name:'重新选择模型';}
  private chooseTaskModel(task:string,done:()=>void){const s=this.plugin.store.settings;new ModelAssignmentPicker(this.app,s,task!=='default',async ref=>{if(ref)s.taskModels[task]=ref;else delete s.taskModels[task];await this.save();done();},s.taskModels[task]).open();}
  private renderTasks(body:HTMLElement){const s=this.plugin.store.settings,head=body.createDiv({cls:'gr-page-title'});head.createEl('h3',{text:'按用途选择模型'});const list=body.createDiv({cls:'gr-task-list'});for(const [key,label,icon,description]of [['default','默认问答','messages-square','阅读提问与追问'],['translate','翻译','languages','选文中的翻译指令'],['summary','总结','list-collapse','工具栏中的全文总结']]){const row=list.createDiv({cls:'gr-task-row'});setIcon(row.createSpan({cls:'gr-task-icon'}),icon);const copy=row.createDiv({cls:'gr-task-copy'});copy.createEl('h4',{text:label});copy.createSpan({text:description});const ref=s.taskModels[key],b=button(row,'',()=>this.chooseTaskModel(key,()=>this.display()),'gr-task-picker');b.createSpan({text:key==='default'&&!ref?'选择模型':this.modelLabel(ref)});const service=s.services.find(service=>service.id===ref?.serviceId);if(service)b.createSpan({cls:'gr-task-service',text:service.name});setIcon(b.createSpan({cls:'gr-task-chevron'}),'chevron-down');b.setAttribute('aria-label','选择'+label+'模型');}
    if(!serviceChoices(s).length){const empty=body.createDiv({cls:'gr-task-empty'});empty.createSpan({text:'先添加服务和模型，再为用途分配。'});button(empty,'添加模型服务',()=>{this.tab='models';this.display();this.editService();},'gr-settings-button');}
    body.createDiv({cls:'gr-task-hint',text:'其他选文指令也可以在编辑时单独指定模型。'});
  }
  private renderCommands(body:HTMLElement){
    const s=this.plugin.store.settings,card=body.createEl('section',{cls:'gr-settings-group gr-commands-group'}),head=card.createDiv({cls:'gr-command-heading'});body=card;head.createEl('h3',{text:`选文指令 ${s.commands.length} / ${MAX_COMMANDS}`,cls:'gr-settings-section'});
    const add=button(head,'添加指令',()=>this.editCommand(),'gr-settings-button is-primary');add.disabled=s.commands.length>=MAX_COMMANDS;
    const list=body.createDiv({cls:'gr-command-list'});if(!s.commands.length)list.createDiv({cls:'gr-settings-description',text:'还没有选文指令'});
    s.commands.forEach((c,i)=>{const row=list.createDiv({cls:'gr-command-row'}),copy=row.createDiv({cls:'gr-command-copy'});copy.createDiv({cls:'gr-settings-label',text:c.name});copy.createDiv({cls:'gr-command-preview',text:c.prompt});const actions=row.createDiv({cls:'gr-command-actions'});
      const move=async(delta:number)=>{const j=i+delta;if(j<0||j>=s.commands.length)return;[s.commands[i],s.commands[j]]=[s.commands[j],s.commands[i]];await this.save();this.display();};
      for(const[icon,label,delta]of [['arrow-up','上移',-1],['arrow-down','下移',1]]as const){const b=button(actions,'',()=>move(delta),'gr-settings-button');setIcon(b,icon);b.setAttribute('aria-label',label+' '+c.name);b.disabled=i+delta<0||i+delta>=s.commands.length;}
      button(actions,'编辑',()=>this.editCommand(c),'gr-settings-button');button(actions,'删除',async()=>{s.commands=s.commands.filter(x=>x.id!==c.id);delete s.taskModels[c.id];await this.save();this.display();},'gr-settings-button');
    });
    const missing=DEFAULT_COMMANDS.filter(d=>!s.commands.some(c=>c.id===d.id));if(missing.length){const footer=body.createDiv({cls:'gr-command-restore'});for(const d of missing){const b=button(footer,'恢复“'+d.name+'”',async()=>{s.commands=saveCommand(s.commands,{...d});await this.save();this.display();},'gr-settings-button');b.disabled=s.commands.length>=MAX_COMMANDS;}}
  }
  private editCommand(command?:ReadingCommand){
    const modal=new Modal(this.app);modal.setTitle(command?'编辑指令':'添加指令');modal.contentEl.addClass('gr-command-editor');
    modal.contentEl.createEl('label',{text:'名称',attr:{for:'gr-command-name'}});const name=modal.contentEl.createEl('input',{attr:{id:'gr-command-name','aria-label':'指令名称',maxlength:'16',placeholder:'指令名称'}});name.value=command?.name||'';
    modal.contentEl.createEl('label',{text:'Prompt',attr:{for:'gr-command-prompt'}});const prompt=modal.contentEl.createEl('textarea',{attr:{id:'gr-command-prompt','aria-label':'指令 Prompt',maxlength:'8000',rows:'9',placeholder:'输入对选文执行的指令…'}});prompt.value=command?.prompt||'';
    modal.contentEl.createDiv({cls:'gr-settings-description',text:'可用变量：{{selection}} 选文 · {{title}} 文档名'});
    const commandId=command?.id||uid();let modelRef=this.plugin.store.settings.taskModels[commandId]||null;const modelRow=modal.contentEl.createDiv({cls:'gr-command-model-row'});modelRow.createSpan({text:'使用模型'});const modelButton=button(modelRow,this.modelLabel(modelRef),()=>new ModelAssignmentPicker(this.app,this.plugin.store.settings,true,async ref=>{modelRef=ref;modelButton.textContent=this.modelLabel(ref);},modelRef).open(),'gr-settings-button');
    const error=modal.contentEl.createDiv({cls:'gr-settings-message',attr:{role:'alert'}}),footer=modal.contentEl.createDiv({cls:'gr-settings-footer'});
    const original=DEFAULT_COMMANDS.find(d=>d.id===command?.id);if(original)button(footer,'恢复默认',()=>{name.value=original.name;prompt.value=original.prompt;},'gr-settings-button');
    button(footer,'取消',()=>modal.close(),'gr-settings-button');button(footer,'保存',async()=>{try{this.plugin.store.settings.commands=saveCommand(this.plugin.store.settings.commands,{...command,id:commandId,name:name.value,prompt:prompt.value});if(modelRef)this.plugin.store.settings.taskModels[commandId]=modelRef;else delete this.plugin.store.settings.taskModels[commandId];await this.save();modal.close();this.display();}catch(e){error.textContent=e instanceof Error?e.message:'保存失败';}},'gr-settings-button is-primary');modal.open();name.focus();
  }
}
