import { Plugin, ItemView, FileView, WorkspaceLeaf, TFile, Notice, MarkdownRenderer, Component, PluginSettingTab, ToggleComponent, App, FuzzySuggestModal, Modal, getFrontMatterInfo, normalizePath, requestUrl, setIcon } from 'obsidian';
import { type Anchor, type Thread, type Message, type WebReceipt, regenerationHistory, followupHistory, visibleThreadError, tokenReceipt, tokenDetails, type Reading, type Passage, type Highlight, freshReading, makeAnchor, resolveAnchor, indexPassages, contextFor, blockedPath, exportReading, MARK_STYLES, markStyle, referenceTokens, uniqueReferences, type MarkStyle } from './core';
import { type AgentSettings, type ApiProtocol, API_DEFAULTS, apiEndpoint, askAgent, discoverCodexModels, discoverApiModels, discoverPiModels, mergeModels, normalizeModels, type ModelOption,type ModelType, SYSTEM, networkSearch, webContext, parseQuestionSuggestions, QUESTION_SUGGESTION_PROMPT, SEARCH_QUERY_PROMPT, parseSearchQuery, webSystemPrompt } from './agent';

import {type ModelService,type ModelRef,type ModelSetup,type ServiceKind,SERVICE_NAMES,SERVICE_ICONS,newService,serviceChoices,resolveModel,serviceSettings,migrateSetup,pruneAssignments,supportsEmbedding,resolveEmbeddingModel,setModelType,migrateEmbeddingModel} from './services';

import {placeMarginItems, compactMarginIds, annotationAnchor, anchorRange, paintMarks, type TextMark, type MarginItem, railMagnification} from './reading-ui';

import {DEFAULT_COMMANDS,MAX_COMMANDS,normalizeCommands,saveCommand,renderCommand,type ReadingCommand} from './prompts';

import {notebookCounts,notebookEntries,notebookTime,threadType,type NotebookFilter} from './notebook';

import {briefHash,briefPrompt,briefRanges,parseBrief} from './brief';

import {readEpub,readableExtension,BOOK_LIMITS,type Book} from './formats';
import {NativePdf} from './pdf-ui';
import {join} from 'node:path';
import {googleTranslate,TRANSLATION_LANGUAGES} from './translation';
import {BookIndexCache,normalizeEmbedding,embeddingIdentity,embedTexts,chunkSections,createBookIndex,usableIndex,retrieve,wholeDocumentContext,retrievalContext,retainPriorEvidence,type EmbeddingSettings,type BookIndex,type SourceSection,type ContextInfo} from './rag';

const VIEW = 'gloss-reader';
const EPUB_VIEW='gloss-epub-file';
interface RetrievalPreferences {topK:number;autoIndex:boolean}
interface Settings extends AgentSettings, ModelSetup {embedding:RetrievalPreferences;webSearch:boolean;questionSuggestions:boolean;translationEngine:'google'|'model';translationTarget:string;taskPrompts:Record<string,string>;modelLists:Record<string,ModelOption[]>; markStyle:MarkStyle; customFont:string; theme: string; fontSize: number; font: string; lineHeight: number; context: string; maxContext: number; marker: string; pen: string; measure: number; numbers: boolean; commands:ReadingCommand[]; apiProfiles:Record<string,{base:string;model:string}> }
interface Store { version: number; settings: Settings; documents: Record<string, Reading> }
const DEFAULTS: Settings = {questionSuggestions:false,webSearch:false,translationEngine:'google',translationTarget:'zh-CN',taskPrompts:{},embedding:{topK:6,autoIndex:false},services:[],taskModels:{},modelLists:{},markStyle:'highlight',customFont:'',commands:DEFAULT_COMMANDS.map(c=>({...c})),apiProfiles:{},claudePath:'',claudeModel:'',apiProtocol:'openai',provider: 'codex', codexPath: '', codexModel: '', apiBase: 'https://api.openai.com/v1', apiModel: '', apiKey: '', theme: 'paper', fontSize: 20, font: 'serif', lineHeight: 1.64, context: 'nearby', maxContext: 60000, marker: 'yellow', pen: 'vermilion', measure: 32, numbers: false};
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
  indexCache!:BookIndexCache;
  sessionKeys=new Map<string,string>();
  serviceKey(id:string){return this.app.secretStorage?.getSecret('reader-'+id)||this.sessionKeys.get(id)||'';}
  saveServiceKey(id:string,key:string){if(this.app.secretStorage)this.app.secretStorage.setSecret('reader-'+id,key);else this.sessionKeys.set(id,key);}
  private saveQueue: Promise<void> = Promise.resolve();
  async onload() {
    const saved = await this.loadData();
    this.store = {version: 5, settings: {...DEFAULTS, ...saved?.settings, apiKey: ''}, documents: saved?.documents || {}};
    const legacyEmbedding=normalizeEmbedding(saved?.settings?.embedding);this.store.settings.embedding={topK:legacyEmbedding.topK,autoIndex:saved?.settings?.embedding?.autoIndex===true};
    this.indexCache=new BookIndexCache(join((this.app.vault.adapter as any).getBasePath(),this.manifest.dir||this.app.vault.configDir+'/plugins/'+this.manifest.id,'indices'));
    this.store.settings.commands=normalizeCommands(saved?.settings?.commands).map(command=>{const original=DEFAULT_COMMANDS.find(c=>c.id===command.id);return original&&command.prompt===original.prompt.replaceAll('选中文本','选文')?{...command,prompt:original.prompt}:command;});this.store.settings.webSearch=saved?.settings?.webSearch===true;this.store.settings.questionSuggestions=saved?.settings?.questionSuggestions===true;this.store.settings.translationEngine=saved?.settings?.translationEngine==='model'?'model':'google';this.store.settings.translationTarget=TRANSLATION_LANGUAGES[saved?.settings?.translationTarget]?saved.settings.translationTarget:'zh-CN';this.store.settings.taskPrompts={};for(const task of ['default','summary']){const value=saved?.settings?.taskPrompts?.[task];if(typeof value==='string')this.store.settings.taskPrompts[task]=value.slice(0,8000);}
    const settings=this.store.settings;settings.markStyle=markStyle(settings.markStyle);settings.modelLists={...(saved?.settings?.modelLists||{})};
    if(saved?.settings&&!Array.isArray(saved.settings.services)){
    const local=await discoverCodexModels();settings.modelLists.codex=settings.modelLists.codex===undefined?local:normalizeModels(settings.modelLists.codex);
    settings.modelLists.claude=settings.modelLists.claude===undefined?[{id:'sonnet',name:'Claude Sonnet'},{id:'opus',name:'Claude Opus'},{id:'haiku',name:'Claude Haiku'}]:normalizeModels(settings.modelLists.claude);
    for(const provider of ['codex','claude','api']){const key=modelKey(settings,provider),id=modelId(settings,provider);settings.modelLists[key]=mergeModels(normalizeModels(settings.modelLists[key]),id?[{id,name:id}]:[]);if(!id&&settings.modelLists[key].length){const previous=settings.provider;settings.provider=provider;setModel(settings,settings.modelLists[key][0].id);settings.provider=previous;}}

    }
    Object.assign(settings,migrateSetup({...settings,services:saved?.settings?saved.settings.services:[]}));
    const migratedEmbedding=migrateEmbeddingModel(settings,legacyEmbedding,service=>this.serviceKey(service.id)===this.serviceKey('embedding'));if(migratedEmbedding?.created)this.saveServiceKey(migratedEmbedding.service.id,this.serviceKey('embedding'));
    if((saved?.version||0)<5)delete settings.taskModels.translate;
    if(!Array.isArray(saved?.settings?.services)||(saved?.version||0)<5||migratedEmbedding)await this.persist();

    if (saved && (saved.version || 1) < 2) {
      if (saved.settings?.fontSize === 19) this.store.settings.fontSize = 20;
      if (saved.settings?.lineHeight === 1.95) this.store.settings.lineHeight = 1.64;
    }
    this.registerView(VIEW, leaf => new GlossView(leaf, this));
    this.registerView(EPUB_VIEW,leaf=>new EpubFileView(leaf,this));
    try{this.registerExtensions(['epub'],EPUB_VIEW);}catch{/* Keep any existing EPUB plugin's file association. */}
    this.addSettingTab(new GlossSettings(this.app, this));

    // Reader tabs are opt-in sessions; restored workspaces return to native files.
    this.app.workspace.onLayoutReady(()=>{const restored=this.app.workspace.getLeavesOfType(VIEW);requestAnimationFrame(()=>{if(this.unloading)return;for(const leaf of restored){const path=leaf.getViewState().state?.path;if(typeof path==='string'&&this.app.vault.getAbstractFileByPath(path) instanceof TFile)void leaf.openFile(this.app.vault.getAbstractFileByPath(path) as TFile,{active:false}).catch(showError);}});});
    this.addRibbonIcon('book-open-text', '进入沉浸阅读', () => {void this.openCurrent().catch(showError);});
    this.addCommand({id: 'open-reader', name: '进入沉浸阅读', callback: () => {void this.openCurrent().catch(showError);}});
    this.addCommand({id:'toggle-question',name:'显示 / 收起提问框',checkCallback:checking=>{const v=this.app.workspace.getActiveViewOfType(GlossView);if(!v)return false;if(!checking)v.toggleComposer();return true;}});
    this.addCommand({id: 'choose-document', name: '选择文档开始阅读', callback: () => this.choose()});
    this.addCommand({id: 'toggle-focus', name: '切换沉浸式阅读', checkCallback: checking => {const v = this.app.workspace.getActiveViewOfType(GlossView); if (!v) return false; if (!checking) void v.exitReader().catch(showError); return true;}});
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {if (file instanceof TFile && readableExtension(file.extension) && !blockedPath(file.path)) menu.addItem(i => i.setTitle('进入沉浸阅读').setIcon('book-open-text').onClick(() => {void this.openFile(file).catch(showError);}));}));
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
      try {const v = await this.openFile(file); if(params.anchor&&params.citation)await v.revealReference(params.anchor,params.citation);else if(params.anchor)v.revealSaved(params.anchor);} catch(e) {showError(e);}
    });
  }
  embeddingConnection(){const {service,model}=resolveEmbeddingModel(this.store.settings);return{service,settings:{...this.store.settings.embedding,base:service.base,model:model.id,dimensions:0} as EmbeddingSettings,key:this.serviceKey(service.id)};}
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
    if (file instanceof TFile && readableExtension(file.extension) && !blockedPath(file.path)) await this.openFile(file);
    else this.choose();
  }
  async openFile(file: TFile): Promise<GlossView> {
    for (const l of this.app.workspace.getLeavesOfType(VIEW)) if ((l.view as GlossView).path !== file.path && (l.view as GlossView).root?.classList.contains('gloss-focus')) (l.view as GlossView).toggleFocus(false);
    if (!readableExtension(file.extension)) throw new Error('支持 Markdown、PDF 和 EPUB。');
    if (blockedPath(file.path)) throw new Error('此目录受隐私边界保护，请使用原生阅读视图。');
    let leaf = this.app.workspace.getLeavesOfType(VIEW).find(l => (l.view as GlossView).path === file.path || l.getViewState().state?.path === file.path);
    if (!leaf) {leaf = this.app.workspace.getLeaf('tab'); await leaf.setViewState({type: VIEW, state: {path: file.path}, active: true});}
    await leaf.loadIfDeferred();
    if (!(leaf.view instanceof GlossView)) await leaf.open(new GlossView(leaf, this));
    await this.app.workspace.revealLeaf(leaf);
    const v = leaf.view as GlossView; if (v.path !== file.path || (!v.article&&!v.loadError)) await v.loadDocument(file.path);if(!v.loadError)v.toggleFocus(true); return v;
  }
  onunload() {this.unloading=true;for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) if (leaf.view instanceof GlossView){leaf.view.stop();leaf.view.cancelIndex();leaf.view.releaseChrome();}}
}

class DocumentPicker extends FuzzySuggestModal<TFile> {
  constructor(app: App, private pick: (file: TFile) => void) {super(app); this.setPlaceholder('选择 Markdown、PDF 或 EPUB…');}
  getItems() {return this.app.vault.getFiles().filter(f=>readableExtension(f.extension)).filter(f => !blockedPath(f.path));}
  getItemText(file: TFile) {return file.path;}
  onChooseItem(file: TFile) {this.pick(file);}
}
class EpubFileView extends FileView {
 constructor(leaf:WorkspaceLeaf,private plugin:GlossPlugin){super(leaf);}
 getViewType(){return EPUB_VIEW;}getDisplayText(){return this.file?.basename||'EPUB 电子书';}getIcon(){return 'book-open-text';}canAcceptExtension(ext:string){return ext.toLowerCase()==='epub';}
 async onLoadFile(file:TFile){this.contentEl.empty();const pane=this.contentEl.createDiv({cls:'gloss-import-state'});pane.createEl('h2',{text:file.basename});pane.createEl('p',{text:'EPUB 电子书'});button(pane,'进入沉浸阅读',()=>this.plugin.openFile(file).then(()=>{}),'mod-cta');}
 async onUnloadFile(){this.contentEl.empty();}
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
  private selectionPreview?:any;private referencePreview?:any;
  private readingModel?:ModelRef;
  private modelMenu?:HTMLElement;
  private modelMenuTrigger?:HTMLButtonElement;
  private railGeometry: {top:number;height:number;fill:number;heading:boolean}[]=[];
  private composer!: HTMLTextAreaElement;
  private composerWrap!: HTMLElement;
  private questionButton!: HTMLButtonElement;
  private webError='';private webButton?:HTMLButtonElement;private suggestionHost?:HTMLElement;private suggestionJob?:AbortController;private suggestionKey='';private suggestionCache=new Map<string,string[]>();
  private composeLabel!: HTMLElement;
  private sendButton!: HTMLButtonElement;
  private hoverThread?:string;private referenceFocus?:{threadId:string;anchor:Anchor};private runningThread?:string;private answerStage='';private wholeBookCache?:{stamp:string;sections:SourceSection[];skipped:number};private selectionChip?:HTMLElement;
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
  private pdf?:NativePdf;
  private readingScope:'selection'|'page'|'whole'|'rag'='page';
  private retrievalJob?:AbortController;
  private indexJob?:AbortController;
  private indexAutomatic=false;private indexAttempt='';private indexStatus='';private indexReady=false;private indexConnection='';private indexButton?:HTMLButtonElement;private indexListeners=new Set<()=>void>();
  private pdfSource?:{leaf:WorkspaceLeaf;container:HTMLElement;placeholder:Comment};
  private book?:Book;
  private bookUrls:string[]=[];
  private importAborter?:AbortController;
  loadError='';
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
      if(e.defaultPrevented||e.composedPath().some(n=>n instanceof HTMLElement&&n.classList.contains('modal-container'))||target.closest?.('.modal-container')||(!this.focus&&this.app.workspace.getActiveViewOfType(GlossView)!==this))return;
      if(e.isComposing||e.keyCode===229)return;
      if(e.key==='Escape') {
        if(this.modelMenu){e.preventDefault();e.stopImmediatePropagation();this.closeModelMenu(true);return;}
        if(this.lens&&!this.lens.hidden){e.preventDefault();e.stopImmediatePropagation();this.closeLens();return;}
        if(this.appearance&&!this.appearance.hidden){e.preventDefault();e.stopImmediatePropagation();this.appearance.hidden=true;return;}
        if(this.notebookOpen){e.preventDefault();e.stopImmediatePropagation();this.toggleNotebook(false);return;}
        if(this.activeThread){e.preventDefault();e.stopImmediatePropagation();this.collapseThread();return;}
        if(this.composerWrap&&!this.composerWrap.hidden){e.preventDefault();e.stopImmediatePropagation();this.toggleComposer(false);return;}
        if(this.focus){e.preventDefault();e.stopImmediatePropagation();void this.exitReader().catch(showError);}return;
      }
      if(target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
      if(target.closest?.('button,a,[role="button"]')&&(e.key==='Enter'||e.key===' '))return;
      if(e.metaKey||e.ctrlKey||e.altKey)return;
      if(e.key==='/'){e.preventDefault();e.stopImmediatePropagation();this.selected=undefined;this.activeHighlight=undefined;this.readingScope='whole';this.closeLens();this.toggleComposer(true);return;}
      if(e.key==='?'){e.preventDefault();e.stopImmediatePropagation();this.showKeys();return;}
      if(this.selected&&this.composerWrap&&!this.composerWrap.hidden&&e.key.length===1){e.preventDefault();e.stopImmediatePropagation();this.showLens('ask',e.key);return;}
      if(e.key==='j'||e.key==='k'){e.preventDefault();e.stopImmediatePropagation();this.movePassage(e.key==='j'?1:-1);return;}
      if(e.key==='Enter'){e.preventDefault();e.stopImmediatePropagation();if(!this.selected){const i=this.keyboardPassage??this.currentPassage(),p=this.passages[i];if(p)this.selected=this.makeReadingAnchor(p.start,p.end);}this.toggleComposer(true);return;}
      if(e.key==='['||e.key===']'){e.preventDefault();e.stopImmediatePropagation();this.moveAnnotation(e.key===']'?1:-1);return;}
      if(e.key.toLowerCase()==='n'){e.preventDefault();e.stopImmediatePropagation();this.toggleNotebook();return;}
      if(e.key.toLowerCase()==='b'&&!this.pdf){e.preventDefault();e.stopImmediatePropagation();if(this.data.brief){this.briefCollapsed=!this.briefCollapsed;this.renderBrief();}else void this.generateBrief().catch(showError);return;}
      if(e.key.toLowerCase()==='f'){e.preventDefault();e.stopImmediatePropagation();if(this.focus)void this.exitReader().catch(showError);else this.toggleFocus(true);}
    },{capture:true});
    this.registerEvent(this.app.vault.on('modify',f=>{if(f.path!==this.path)return;clearTimeout(this.reloadTimer);this.reloadTimer=setTimeout(()=>void this.loadDocument(this.path,true).catch(showError),500);}));
    this.registerEvent(this.app.vault.on('delete',f=>{if(f.path===this.path){this.stop();new Notice('原文已移除，批注仍保留。');}}));
  }
  private iconButton(parent:HTMLElement,name:string,label:string,action:()=>void|Promise<void>,cls='') {
    const b=button(parent,'',action,`gloss-icon ${cls}`);setIcon(b,name);const id='reader-label-'+uid();b.createSpan({cls:'gloss-sr-only',text:label,attr:{id}});b.setAttribute('aria-labelledby',id);return b;
  }
  private answerStop(parent:HTMLElement,cls=''){const b=this.iconButton(parent,'square','停止回答',()=>this.stop(),cls);b.addEventListener('pointerdown',e=>{e.preventDefault();this.stop();});return b;}
  private quietLabels(scope:HTMLElement){for(const el of [scope,...Array.from(scope.querySelectorAll<HTMLElement>('[aria-label]'))]){if(!el.hasAttribute('aria-label')||el.closest('.gloss-native-pdf')||el.matches('button,input,textarea,select,[role=option],[role=tab]'))continue;const label=el.getAttribute('aria-label')!,id='reader-group-'+uid();this.root.createSpan({cls:'gloss-sr-only',text:label,attr:{id}});el.removeAttribute('aria-label');el.setAttribute('aria-labelledby',id);}}
  private get data(){return this.plugin.read(this.path);}
  private get threads(){return this.data.threads.filter(t=>!t.removed&&(!this.pdf||!t.anchor||t.anchor.pdfPage===this.pdf.page||!!t.contextInfo?.embeddingModel||t.id===this.referenceFocus?.threadId));}
  async loadDocument(path:string,retainPosition=false) {
    if(blockedPath(path))throw new Error('此目录受隐私边界保护。');
    const file=this.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile))throw new Error('找不到这篇文档。');
    this.cancelSuggestions();this.indexJob?.abort();this.retrievalJob?.abort();this.stop();if(this.briefJob){this.aborter=undefined;this.briefJob=undefined;}this.captureProgress();await this.flushDraft();
    this.importAborter?.abort();const opening=new AbortController();this.importAborter=opening;const token=++this.revision,extension=file.extension.toLowerCase();let raw='',book:Book|undefined;
    let status:HTMLElement|undefined;if(!this.root?.isConnected)status=this.contentEl.createDiv({cls:'gloss-import-state',text:'正在打开文档…'});
    try{if(extension==='md')raw=await this.app.vault.cachedRead(file);else if(extension==='epub'){if(file.stat.size>BOOK_LIMITS.file)throw new Error('电子书超过 40 MB，请使用较小的文件。');const bytes=new Uint8Array(await this.app.vault.readBinary(file));book=await readEpub(bytes,text=>new DOMParser().parseFromString(text,'application/xml'),opening.signal,message=>{if(status)status.textContent=message;});}}
    catch(e){if(token!==this.revision||opening.signal.aborted)return;this.loadError=e instanceof Error?e.message:'无法打开文件。';this.pdf?.destroy();this.releasePdfSource();this.pdf=undefined;this.bookUrls.forEach(url=>URL.revokeObjectURL(url));this.bookUrls=[];this.resizeObserver?.disconnect();this.marginObserver?.disconnect();this.article=undefined as any;this.path=path;this.toggleFocus(false);this.root?.remove();this.contentEl.empty();const error=this.contentEl.createDiv({cls:'gloss-import-state'});error.createEl('h2',{text:'无法打开 '+file.basename});error.createEl('p',{text:this.loadError});button(error,'重试',()=>this.loadDocument(path));button(error,'选择其他文档',()=>this.plugin.choose());return;}
    if(token!==this.revision||opening.signal.aborted)return;this.loadError='';this.pdf?.destroy();this.releasePdfSource();this.pdf=undefined;this.bookUrls.forEach(url=>URL.revokeObjectURL(url));this.bookUrls=[];this.book=book;status?.remove();
    const progress=this.plugin.read(path).progress;
    this.closeModelMenu();this.clearSelectionPreview();this.clearReferencePreview();if(this.path!==path){this.notebookFilter='all';this.notebookAnswers.clear();}this.path=path;this.wholeBookCache=undefined;this.indexAttempt='';this.indexStatus='';this.indexReady=false;this.referenceFocus=undefined;this.hoverThread=undefined;this.readingModel=undefined;this.keyboardPassage=undefined;this.selected=undefined;this.activeThread=undefined;this.activeHighlight=undefined;this.restoring=true;this.pendingProgress=progress;this.readingScope='whole';
    this.resizeObserver?.disconnect();this.marginObserver?.disconnect();cancelAnimationFrame(this.leaderFrame);this.leader=undefined;
    if(this.markdown){this.removeChild(this.markdown);this.markdown.unload();}this.markdown=new Component();this.addChild(this.markdown);
    this.root?.remove();this.contentEl.empty();
    this.root=this.contentEl.createDiv({cls:'gloss-root'});this.root.toggleClass('gloss-pdf',extension==='pdf');this.applyAppearance();
    const top=this.root.createEl('header',{cls:'gloss-toolbar'});
    this.focusButton=this.iconButton(top,'arrow-left','返回文档',()=>this.exitReader(),'gloss-back');
    this.iconButton(top,'folder-open','选择阅读文档',()=>this.plugin.choose(),'gloss-document-picker');
    const titleBtn=button(top,file.basename,()=>this.scroller.scrollTo({top:0,behavior:'smooth'}),'gloss-top-title');
    const tools=top.createEl('nav',{cls:'gloss-tools',attr:{'aria-label':'阅读工具'}});
    this.iconButton(tools,'list','文档目录',()=>this.showContents());
    button(tools,'Aa',()=>this.toggleAppearance(),'gloss-aa').setAttribute('aria-label','外观配置');
    this.questionButton=this.iconButton(tools,'message-circle','提问 · /',()=>this.toggleComposer());this.questionButton.setAttribute('aria-expanded','false');
    this.iconButton(tools,'keyboard','快捷键',()=>this.showKeys());
    const notebook=button(tools,'',()=>this.toggleNotebook(),'gloss-notebook-button');setIcon(notebook,'notebook-pen');notebook.createSpan({text:'笔记本'});this.notebookBadge=notebook.createSpan({cls:'gloss-notebook-count'});notebook.setAttribute('aria-label','阅读笔记本');
    this.indexButton=button(tools,'',()=>this.showBookIndex(),'gloss-notebook-button');setIcon(this.indexButton.createSpan(),'database');this.indexButton.createSpan({cls:'gloss-index-label',text:'索引'});this.indexButton.setAttribute('aria-label','本书检索索引');this.indexButton.hidden=!this.focus;
    this.iconButton(tools,'settings-2','Agent 服务设置',()=>{(this.app as any).setting.open();(this.app as any).setting.openTabById(this.plugin.manifest.id);});
    this.scroller=this.root.createDiv({cls:'gloss-scroll'});
    this.grid=this.scroller.createDiv({cls:'gloss-reader-grid'});
    this.rail=this.grid.createDiv({cls:'gloss-rail',attr:{'aria-label':'文档导航'}});
    this.page=this.grid.createDiv({cls:'gloss-page'});
    const fm=book?{title:book.title||file.basename,author:book.author,source_label:'EPUB'}:this.app.metadataCache.getFileCache(file)?.frontmatter||{};
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
    if(extension==='pdf'){
      await this.mountPdfSource(file);
      this.pdf=new NativePdf(this.article,()=>this.syncPdfPage(),()=>{this.paintHighlights();this.scheduleLayout();if(this.lens&&!this.lens.hidden)this.placeLens();});
    }else if(book)this.renderBook(book);else await MarkdownRenderer.render(this.app,passiveEmbeds(body),this.article,path,this.markdown);if(token!==this.revision)return;
    const selector='p,h1,h2,h3,h4,h5,h6,li,pre,table';
    this.blocks=extension==='pdf'?[]:Array.from(this.article.querySelectorAll<HTMLElement>(selector)).filter(el=>{if(el.closest('.internal-embed,.external-embed'))return false;const a=el.parentElement?.closest(selector);return(!a||!this.article.contains(a))&&!!el.textContent?.trim();});
    if(extension!=='pdf'&&!this.blocks.length&&this.article.textContent?.trim())this.blocks=[this.article];
    const index=indexPassages(this.blocks.map(el=>el.textContent||''));this.text=index.text;this.passages=index.passages;this.passages.forEach((p,i)=>{p.source=this.blocks[i]?.closest<HTMLElement>('[data-book-source]')?.dataset.bookSource;});
    this.blocks.forEach((el,i)=>{el.addClass('gloss-passage');el.dataset.glossParagraph=String(i+1);});
    const first=this.blocks.find(el=>el.tagName==='P');if(first){first.addClass('gloss-first-paragraph');if(/^[A-Za-z]/.test(first.textContent||''))first.addClass('gloss-dropcap');}
    const minutes=Math.max(1,Math.round(this.text.split(/\s+/).length/240+(this.text.match(/[\u3400-\u9fff]/g)||[]).length/450));
    stats.textContent=`${minutes} 分钟阅读 · ${this.blocks.filter(el=>!/^H/.test(el.tagName)).length} 个段落`;
    this.page.createDiv({cls:'gloss-end',text:'读到这里，留下一个属于你的想法。'});
    this.margin=this.grid.createEl('aside',{cls:'gloss-margin-column',attr:{'aria-label':'页边批注'}});this.margin.addEventListener('scroll',()=>this.updateLeader(),{passive:true});
    this.buildRail();
    const compose=this.composerWrap=this.root.createDiv({cls:'gloss-composer',attr:{role:'group','aria-label':'文档提问'}});compose.hidden=true;
    this.suggestionHost=compose.createDiv({cls:'gloss-question-suggestions',attr:{'aria-label':'模型生成的问题建议'}});this.suggestionHost.hidden=true;
    this.composeLabel=compose.createDiv({cls:'gloss-compose-context'});this.selectionChip=compose.createDiv({cls:'gloss-compose-selection'});this.selectionChip.hidden=true;
    const inputRow=compose.createDiv({cls:'gloss-compose-input'});
    this.composer=inputRow.createEl('textarea',{cls:'gloss-question',attr:{'aria-label':'向 Agent 提问',placeholder:'询问这篇文章…',rows:'1',wrap:'off'}});this.composer.value=this.data.draft||'';
    this.composer.addEventListener('input',()=>{this.rememberDraft();this.resizeQuestion();this.syncSuggestionVisibility();if(this.composer.value.trim())this.cancelSuggestions();else void this.generateSuggestions();});this.protectInput(this.composer);this.composer.addEventListener('focus',()=>{this.closeModelMenu();this.closeLens();});this.composer.addEventListener('keydown',e=>{if(!e.isComposing&&e.keyCode!==229&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();void this.send().catch(showError);}});
    const row=inputRow;row.addClass('gloss-compose-row');button(row,'/',()=>this.showKeys(),'gloss-key-hint');const modelRow=row.createDiv({cls:'gloss-compose-model-row'});this.modelPicker(modelRow,'模型');
    const web=this.webButton=button(row,'',async()=>{if(this.aborter||this.retrievalJob)return;this.plugin.store.settings.webSearch=!this.plugin.store.settings.webSearch;this.webError='';this.paintWebButton();this.updateContext();await this.plugin.persist();},'gloss-web-toggle');setIcon(web.createSpan(),'globe');web.createSpan({text:'联网'});this.paintWebButton();
    this.sendButton=this.iconButton(row,'arrow-up','发送问题',()=>this.send(),'gloss-send');
    this.drawer=this.root.createEl('aside',{cls:'gloss-notebook',attr:{'aria-label':'阅读笔记本'}});this.drawer.hidden=!this.notebookOpen;this.root.toggleClass('gloss-notebook-open',this.notebookOpen);
    const drawerHead=this.drawer.createDiv({cls:'gloss-notebook-head'}),heading=drawerHead.createDiv({cls:'gloss-notebook-heading'});heading.createEl('h2',{text:'笔记本'});this.drawerSubtitle=heading.createEl('p',{cls:'gloss-notebook-subtitle'});
    this.iconButton(drawerHead,'copy','复制 Markdown 笔记',async()=>{await navigator.clipboard.writeText(exportReading(this.path,this.data,this.app.vault.getName()));new Notice('已复制阅读笔记');});this.iconButton(drawerHead,'download','导出 Markdown 笔记',()=>this.exportNotes());drawerHead.createSpan({cls:'gloss-notebook-head-divider'});this.iconButton(drawerHead,'x','收起笔记本',()=>this.toggleNotebook(false));
    this.drawerTabs=this.drawer.createDiv({cls:'gloss-notebook-tabs',attr:{role:'tablist','aria-label':'笔记本分类'}});
    this.drawerBody=this.drawer.createDiv({cls:'gloss-notebook-body'});
    this.lens=this.root.createDiv({cls:'gloss-lens',attr:{role:'toolbar'}});this.lens.hidden=true;
    this.lens.addEventListener('mousedown',e=>{if(!(e.target as HTMLElement).closest('textarea,input'))e.preventDefault();});
    this.appearance=this.root.createDiv({cls:'gloss-appearance'});this.appearance.hidden=true;
    this.appearance.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.isComposing&&e.keyCode!==229){e.preventDefault();e.stopImmediatePropagation();this.appearance.hidden=true;this.root.querySelector<HTMLButtonElement>('.gloss-aa')?.focus();}});
    this.article.addEventListener('wheel',()=>{this.keyboardPassage=undefined;},{passive:true});
    this.article.addEventListener('pointerdown',()=>{this.keyboardPassage=undefined;});
    this.article.addEventListener('mouseup',()=>this.captureSelection());this.article.addEventListener('keyup',e=>{if(e.key.startsWith('Arrow')||e.key==='Shift')this.captureSelection();});
    this.article.addEventListener('click',e=>{
      const selection=this.article.ownerDocument.getSelection();if(selection&&!selection.isCollapsed&&this.article.contains(selection.anchorNode))return;
      if(this.pdf){const id=this.pdf.hit(e.clientX,e.clientY),t=this.threads.find(t=>t.id===id),h=this.data.highlights.find(h=>h.id===id&&!h.removed);if(t){this.activateThread(t);this.selected=t.anchor;this.toggleComposer(true,false);return;}if(h){this.activateNote(h);this.showLens('actions');return;}}
      const el=(e.target as HTMLElement).closest<HTMLElement>('[data-h],[data-g]');if(!el)return;
      if(el.dataset.g){const t=this.threads.find(t=>t.id===el.dataset.g?.split(' ')[0]);if(t){this.activateThread(t);this.selected=t.anchor;this.toggleComposer(true,false);return;}}
      if(el.dataset.h){const h=this.data.highlights.find(h=>h.id===el.dataset.h?.split(' ')[0]);if(h){this.selected=h.anchor;this.activeHighlight=h.id;this.activeThread=undefined;this.toggleComposer(true,false);this.paintHighlights();this.showLens('actions');this.updateContext();}}
    });
    this.article.addEventListener('mouseover',e=>{const g=(e.target as HTMLElement).closest<HTMLElement>('[data-g]')?.dataset.g;this.setHover(g?.split(' ')[0]);});
    this.article.addEventListener('mouseleave',()=>this.setHover());
    this.root.addEventListener('pointerdown',e=>{const target=e.target as HTMLElement;if(this.modelMenu&&!this.modelMenu.contains(target)&&!target.closest('.gloss-model-picker'))this.closeModelMenu();if(!this.lens.contains(target)&&!target.closest('[data-h]'))this.closeLens();if(!this.appearance.contains(target)&&!target.closest('.gloss-aa'))this.appearance.hidden=true;});
    this.root.addEventListener('click',e=>{const a=(e.target as HTMLElement).closest<HTMLAnchorElement>('a.internal-link');if(a){e.preventDefault();void this.app.workspace.openLinkText(a.dataset.href||a.getAttribute('href')||'',path,true);}});
    this.scroller.addEventListener('scroll',()=>{if(this.restoring)return;this.closeModelMenu();this.captureProgress();this.pulseRail();this.updateRail();if(!this.lens.hidden)this.placeLens();top.toggleClass('is-scrolled',this.scroller.scrollTop>180);clearTimeout(this.progressTimer);this.progressTimer=setTimeout(()=>void this.plugin.persist().catch(showError),700);},{passive:true});
    if(this.pdf){void this.pdf.ready(opening.signal).then(()=>{if(token!==this.revision||opening.signal.aborted)return;this.loadError='';this.syncPdfPage();this.restorePosition();this.scheduleLayout();void this.maybeAutoIndex();}).catch(e=>{if(token===this.revision&&!opening.signal.aborted){this.loadError=e instanceof Error?e.message:'PDF 打开失败。';new Notice(this.loadError,7000);}});}if(token!==this.revision||opening.signal.aborted)return;this.renderBrief();this.paintHighlights();this.refreshSettings();await this.renderMargin();this.toggleFocus(this.focus);
    this.resizeObserver=new ResizeObserver(()=>{this.narrow=this.root.clientWidth<1080;this.root.toggleClass('gloss-narrow',this.narrow);this.restorePosition();this.scheduleLayout();if(!this.lens.hidden)this.placeLens();});
    this.resizeObserver.observe(this.root);this.resizeObserver.observe(this.scroller);this.resizeObserver.observe(this.page);
    requestAnimationFrame(()=>{if(token===this.revision){this.restorePosition();this.scheduleLayout();}});
    this.quietLabels(this.root);this.app.workspace.requestSaveLayout();
  }
  private async mountPdfSource(file:TFile){
    let leaf=this.app.workspace.getLeavesOfType('pdf').find(l=>(l.view as FileView).file?.path===file.path);if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.openFile(file,{active:false});}await leaf.loadIfDeferred();const container=leaf.view.containerEl,parent=container.parentNode;if(!parent)throw new Error('PDF 原生视图尚未就绪。');const placeholder=container.ownerDocument.createComment('沉浸阅读 PDF 视图原位置');parent.insertBefore(placeholder,container);this.pdfSource={leaf,container,placeholder};container.classList.add('gloss-native-pdf');this.article.append(container);await this.app.workspace.revealLeaf(this.leaf);
  }
  private releasePdfSource(){const source=this.pdfSource;if(!source)return;this.pdfSource=undefined;source.container.classList.remove('gloss-native-pdf');if(source.placeholder.parentNode){source.placeholder.replaceWith(source.container);requestAnimationFrame(()=>source.leaf.view.onResize());}else source.container.remove();}
  private makeReadingAnchor(start:number,end:number):Anchor{const a=makeAnchor(this.text,start,end);if(this.pdf){a.pdfPage=this.pdf.page;a.pdfOffset=a.start;}return a;}
  private syncPdfPage(){if(!this.pdf)return;if(this.pdf.blocks.length)this.loadError='';const changed=this.passages[0]?.source!=='PDF 第 '+this.pdf.page+' 页';this.blocks=this.pdf.blocks;this.text=this.pdf.text;this.passages=this.pdf.passages;if(changed){this.keyboardPassage=undefined;const active=this.data.threads.find(t=>t.id===this.activeThread);if(active?.anchor?.pdfPage&&active.anchor.pdfPage!==this.pdf.page&&!active.contextInfo?.embeddingModel&&active.id!==this.referenceFocus?.threadId)this.activeThread=undefined;this.activeHighlight=undefined;if(this.selected?.pdfPage!==this.pdf.page)this.selected=undefined;if(this.lens)this.closeLens();}if(!this.composer?.isConnected)return;this.paintHighlights();this.updateContext();this.captureProgress();void this.renderMargin().catch(showError);clearTimeout(this.progressTimer);this.progressTimer=setTimeout(()=>void this.plugin.persist().catch(showError),700);}
  private renderBook(book:Book){
    for(const section of book.sections){const el=this.article.createEl('section',{cls:'gloss-book-section'});el.dataset.bookSource=section.title;el.createEl('h2',{text:section.title});for(const block of section.blocks){if(block.kind==='image'){const image=book.images[block.image||''];if(image){const url=URL.createObjectURL(new Blob([new Uint8Array(image.bytes).buffer],{type:image.mime}));this.bookUrls.push(url);el.createEl('img',{attr:{src:url,alt:block.text,loading:'lazy'}});}continue;}if(block.kind==='pre')el.createEl('pre').createEl('code',{text:block.text});else el.createEl(block.kind==='heading'?'h'+Math.min(6,Math.max(3,block.level||3)) as 'h3':'p',{text:block.text});}}if(book.warnings.length)this.article.createDiv({cls:'gloss-book-warning',text:book.warnings.join(' ')});
  }
  private renderBrief(){
    if(!this.briefHost)return;this.briefHost.hidden=!!this.pdf;if(this.pdf)return;const host=this.briefHost;host.empty();const saved=this.data.brief,busy=!!this.briefJob&&this.briefJob.controller===this.aborter&&this.briefJob.revision===this.revision;
    if(!saved){const open=button(host,'',()=>this.generateBrief(),'gloss-brief');open.disabled=!!this.aborter;const title=open.createSpan({cls:'gloss-brief-title',text:busy?'正在解读文章…':'解读这篇文章'});setIcon(title.createSpan(),busy?'loader-circle':'arrow-right');open.createSpan({cls:'gloss-brief-description',text:busy?'正在通读全文、梳理论点和段落地图':'要旨、关键论点与段落地图'});open.createSpan({cls:'gloss-brief-key',text:'B'});}
    else{
      const stale=saved.sourceHash!==briefHash(this.text),card=host.createEl('section',{cls:'gloss-brief-panel',attr:{'aria-label':'文章解读'}});
      const head=button(card,'',()=>{this.briefCollapsed=!this.briefCollapsed;this.renderBrief();this.scheduleLayout();},'gloss-brief-head');head.setAttribute('aria-expanded',String(!this.briefCollapsed));head.createSpan({cls:'gloss-brief-name',text:'文章解读'});head.createSpan({cls:'gloss-brief-counts',text:`${saved.data.sections.length} 个部分 · ${saved.data.claims.length} 个论点 · ${saved.data.caveats.length} 条提醒`});const chevron=head.createSpan({cls:'gloss-brief-chevron'});setIcon(chevron,this.briefCollapsed?'chevron-down':'chevron-up');
      const body=card.createDiv({cls:'gloss-brief-body'});body.hidden=this.briefCollapsed;
      if(stale)body.createEl('p',{cls:'gloss-brief-status',text:'原文已更新，请重新生成解读以更新段落引用。'});
      body.createEl('p',{cls:'gloss-brief-gist',text:saved.data.gist});
      const cite=(parent:HTMLElement,n:number)=>{const passage=this.passages[n-1],b=button(parent,'¶'+n,()=>{if(!stale&&passage)this.jump(this.makeReadingAnchor(passage.start,passage.end));},'gloss-citation');b.disabled=stale||!passage;b.title=stale?'原文已更新，请重新生成':passage?.text||'未提供的原文段落';};
      const points=(label:string,items:{text:string;cite:number}[],kind:string)=>{if(!items.length)return;body.createEl('h3',{cls:'gloss-brief-section-label',text:label});const list=body.createEl(kind==='claims'?'ol':'ul',{cls:'gloss-brief-points gloss-brief-'+kind});items.forEach((point,i)=>{const row=list.createEl('li');row.createSpan({cls:'gloss-brief-index',text:kind==='claims'?String(i+1):'•'});const text=row.createDiv();text.append(point.text+' ');cite(text,point.cite);});};
      points('关键论点',saved.data.claims,'claims');points('阅读提醒',saved.data.caveats,'caveats');
      body.createEl('h3',{cls:'gloss-brief-section-label',text:'段落地图'});const map=body.createEl('ol',{cls:'gloss-brief-map'});
      briefRanges(saved.data,this.passages.length).forEach((section,i)=>{const li=map.createEl('li'),row=button(li,'',()=>{const p=this.passages[section.start-1];if(!stale&&p)this.jump(this.makeReadingAnchor(p.start,p.end));},'gloss-brief-map-row');row.disabled=stale;row.title=section.title;row.createSpan({cls:'gloss-brief-index',text:String(i+1)});row.createSpan({cls:'gloss-brief-map-title',text:section.title});row.createSpan({cls:'gloss-brief-map-range',text:'¶'+section.start+(section.end>section.start?'–'+section.end:'')});});
      const footer=body.createDiv({cls:'gloss-brief-footer'}),receipt=footer.createDiv({cls:'gloss-brief-receipt'});receipt.createSpan({text:saved.model||'模型未记录'});receipt.createSpan({cls:'gloss-brief-receipt-divider',text:'/'});const tokens=receipt.createSpan({text:tokenReceipt(saved.usage)});tokens.title=tokenDetails(saved.usage);receipt.title=[saved.provider,saved.model].filter(Boolean).join(' · ');
      const redo=button(footer,'',()=>this.generateBrief(),'gloss-brief-redo');redo.disabled=!!this.aborter;setIcon(redo.createSpan(),'rotate-ccw');redo.createSpan({text:busy?'正在重新生成…':'重新生成'});
    }
    if(busy){const status=host.createDiv({cls:'gloss-brief-state',attr:{role:'status'}});status.createSpan({text:'正在使用总结模型生成解读'});const stop=this.iconButton(status,'square','停止解读',()=>this.stop());stop.disabled=false;}
    if(this.briefError)host.createEl('p',{cls:'gloss-brief-error',text:this.briefError,attr:{role:'status'}});
    this.scheduleLayout();
  }
  private async generateBrief(){
    if(this.aborter)return;this.cancelSuggestions();if(blockedPath(this.path))throw new Error('此文档不能发送给模型。');if(!(this.app.vault.getAbstractFileByPath(this.path)instanceof TFile))throw new Error('原文已移除。');
    const settings=this.modelSettings('summary'),path=this.path,data=this.data,revision=this.revision,sourceHash=briefHash(this.text),count=this.passages.length;
    const context=contextFor(this.passages,undefined,this.text,true,settings.maxContext);if(!count)throw new Error('文档没有可解读的正文。');
    const controller=new AbortController();this.aborter=controller;this.briefJob={controller,revision};this.briefError='';this.closeModelMenu();this.briefCollapsed=false;
    this.syncComposerBusy();this.root.querySelectorAll<HTMLButtonElement>('.gloss-model-picker').forEach(b=>b.disabled=true);this.renderBrief();
    let usage:Message['usage'];
    try{await this.renderMargin();const answer=await askAgent({settings,context,messages:[{role:'user',content:briefPrompt(count)+(settings.taskPrompts.summary?'\n补充要求（仍须遵守上面的 JSON 结构和引用规则）：\n'+settings.taskPrompts.summary:'')}],signal:controller.signal,onText:()=>{},onUsage:value=>{usage=value;}});
      if(controller.signal.aborted||this.revision!==revision||this.path!==path)return;
      const result=parseBrief(answer,count);data.brief={data:result,sourceHash,model:modelId(settings),provider:settings.serviceName||settings.provider,serviceId:settings.serviceId,usage,created:Date.now()};data.updated=Date.now();await this.plugin.persist();
    }catch(error){if(this.revision===revision&&this.path===path)this.briefError=(error instanceof Error?error.message:'文章解读失败。')+(data.brief?'（已保留原解读）':'');}
    finally{if(this.aborter===controller){this.aborter=undefined;this.briefJob=undefined;if(this.path===path&&this.revision===revision&&this.root.isConnected){this.syncComposerBusy();this.root.querySelectorAll<HTMLButtonElement>('.gloss-model-picker').forEach(b=>b.disabled=false);this.renderBrief();await this.renderMargin();}}}
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
  refreshSettings(){this.applyAppearance();void this.maybeAutoIndex();if(!this.root)return;const scope=this.root.querySelector('.gloss-scope');if(scope)scope.textContent=this.scopeLabel();this.updateContext();this.closeModelMenu();this.refreshModelButtons();if(this.selected&&this.lens&&!this.lens.hidden&&this.lensMode==='actions')this.showLens('actions');}
  async exitReader(){this.indexJob?.abort();this.retrievalJob?.abort();this.captureProgress();this.restoring=true;this.importAborter?.abort();this.pdf?.destroy();this.releasePdfSource();await this.flushDraft();this.toggleFocus(false);const file=this.app.vault.getAbstractFileByPath(this.path);const existing=this.app.workspace.getLeavesOfType(file instanceof TFile&&file.extension==='pdf'?'pdf':file instanceof TFile&&file.extension==='epub'?EPUB_VIEW:'markdown').find(l=>l.getViewState().state?.file===this.path);if(existing){await this.app.workspace.revealLeaf(existing);this.leaf.detach();}else if(file instanceof TFile)await this.leaf.openFile(file,{active:true});}
  toggleFocus(next=!this.focus){const changing=next!==this.focus,max=this.scroller?this.scroller.scrollHeight-this.scroller.clientHeight:0,ratio=max>0?this.scroller.scrollTop/max:0;this.focus=next;if(this.indexButton)this.indexButton.hidden=!next;if(!next)this.cancelSuggestions();if(this.root){if(next&&this.root.parentElement!==this.root.ownerDocument.body)this.root.ownerDocument.body.appendChild(this.root);else if(!next&&this.root.parentElement!==this.contentEl)this.contentEl.appendChild(this.root);this.root.toggleClass('gloss-focus',next);if(!next){this.closeModelMenu();this.clearSelectionPreview();this.clearReferencePreview();}}this.syncChrome();if(changing)requestAnimationFrame(()=>{this.scroller?.scrollTo({top:Math.max(0,this.scroller.scrollHeight-this.scroller.clientHeight)*ratio,behavior:'instant'});this.restorePosition();this.scheduleLayout();if(next)void this.maybeAutoIndex();});}
  private toggleNotebook(next=!this.notebookOpen){this.notebookOpen=next;this.drawer.hidden=!next;this.root.toggleClass('gloss-notebook-open',next);this.root.querySelector('.gloss-notebook-button')?.setAttribute('aria-expanded',String(next));if(next)void this.renderNotebook().catch(showError);this.scheduleLayout();}
  private showContents(){if(this.pdf){const modal=new Modal(this.app);modal.setTitle('PDF 页码');for(let n=1;n<=this.pdf.total;n++)button(modal.contentEl,'第 '+n+' 页',async()=>{modal.close();await this.pdf?.go(n);},'gloss-contents-item');modal.open();return;}const modal=new Modal(this.app);modal.setTitle('文档目录');let count=0;this.blocks.forEach(el=>{if(/^H[1-6]$/.test(el.tagName)){button(modal.contentEl,el.textContent||'',()=>{modal.close();el.scrollIntoView({behavior:'smooth',block:'start'});},'gloss-contents-item');count++;}});if(!count)modal.contentEl.createEl('p',{text:'这篇文档没有分节标题。'});modal.open();}
  private toggleAppearance(){if(!this.appearance.hidden){this.appearance.hidden=true;return;}this.appearance.empty();const s=this.plugin.store.settings;this.appearance.createDiv({cls:'gloss-pop-title',text:'外观配置'});const themes=this.appearance.createDiv({cls:'gloss-theme-swatches'});for(const [key,label] of [['auto','跟随系统'],['paper','纸张'],['sepia','暖黄'],['snow','雪白'],['night','夜读'],['ink','墨蓝']]){const b=button(themes,label,()=>{s.theme=key;this.applyAppearance();themes.querySelectorAll<HTMLButtonElement>('.gloss-theme-swatch').forEach(choice=>{const selected=choice.dataset.theme===key;choice.classList.toggle('is-selected',selected);choice.setAttribute('aria-pressed',String(selected));});void this.plugin.persist().catch(showError);},'gloss-theme-swatch');b.dataset.theme=key;b.classList.toggle('is-selected',s.theme===key);b.setAttribute('aria-pressed',String(s.theme===key));}
    if(!this.pdf){const faces=this.appearance.createDiv({cls:'gloss-pop-row'});for(const [key,label] of [['serif','Newsreader'],['sans','Schibsted'],['song','宋体'],['system','系统']])button(faces,label,()=>{s.font=key;this.applyAppearance();void this.plugin.persist().catch(showError);});
    const size=this.appearance.createDiv({cls:'gloss-pop-row'});this.iconButton(size,'minus','减小字号',()=>{s.fontSize=Math.max(15,s.fontSize-1);this.applyAppearance();size.querySelector('.gloss-size-value')!.textContent=String(s.fontSize);void this.plugin.persist().catch(showError);});size.createSpan({cls:'gloss-size-value',text:String(s.fontSize)});this.iconButton(size,'plus','增大字号',()=>{s.fontSize=Math.min(28,s.fontSize+1);this.applyAppearance();size.querySelector('.gloss-size-value')!.textContent=String(s.fontSize);void this.plugin.persist().catch(showError);});
    const leading=this.appearance.createDiv({cls:'gloss-pop-row'});for(const [label,value]of [['紧凑',1.5],['标准',1.64],['宽松',1.82]]as const)button(leading,label,()=>{s.lineHeight=value;this.applyAppearance();void this.plugin.persist().catch(showError);});
    const widths=this.appearance.createDiv({cls:'gloss-pop-row'});for(const [label,value]of [['窄',28],['适中',32],['宽',37]]as const)button(widths,label,()=>{s.measure=value;this.applyAppearance();void this.plugin.persist().catch(showError);});
    }const pens=this.appearance.createDiv({cls:'gloss-pop-row'});pens.createSpan({text:'批注笔色'});for(const [pen,label]of [['vermilion','朱红'],['cobalt','钴蓝'],['moss','苔绿'],['graphite','石墨']]){const b=button(pens,'',()=>{s.pen=pen;this.applyAppearance();void this.plugin.persist().catch(showError);},'gloss-pen-swatch');b.dataset.pen=pen;b.title=label;b.setAttribute('aria-label',label+'批注笔');}
    if(!this.pdf)button(this.appearance,s.numbers?'隐藏段落编号':'显示段落编号',()=>{s.numbers=!s.numbers;this.applyAppearance();void this.plugin.persist().catch(showError);this.appearance.hidden=true;},'gloss-pop-number');this.appearance.hidden=false;}
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
  private restorePosition(){if(this.path.toLowerCase().endsWith('.pdf')){if(this.pdf&&this.focus&&this.restoring&&this.pendingProgress!==undefined&&this.pdf.loaded&&this.pdf.total){const n=Math.max(1,Math.min(this.pdf.total,this.data.pdfPage||Math.round(this.pendingProgress*Math.max(1,this.pdf.total-1))+1));this.pendingProgress=undefined;const pdf=this.pdf;void pdf.go(n).then(()=>{if(this.pdf===pdf){this.restoring=false;this.captureProgress();}}).catch(e=>{if(this.pdf===pdf)this.restoring=false;showError(e);});}return;}if(!this.restoring||this.pendingProgress===undefined||!this.scroller?.isConnected||!this.scroller.clientHeight||!this.scroller.clientWidth)return;if(this.root.clientHeight>(this.root.ownerDocument.defaultView?.innerHeight||window.innerHeight)+1)return;this.scroller.scrollTo({top:Math.max(0,this.scroller.scrollHeight-this.scroller.clientHeight)*this.pendingProgress,behavior:'instant'});this.pendingProgress=undefined;this.restoring=false;this.captureProgress();this.updateRail();}
  private captureProgress(){if(this.path.toLowerCase().endsWith('.pdf')){if(this.pdf&&!this.plugin.unloading&&!this.restoring&&this.path){this.data.progress=(this.pdf.page-1)/Math.max(1,this.pdf.total-1);this.data.pdfPage=this.pdf.page;}return;}if(this.plugin.unloading||this.restoring||!this.scroller?.isConnected||!this.scroller.clientHeight||!this.path||this.root.clientHeight>(this.root.ownerDocument.defaultView?.innerHeight||window.innerHeight)+1)return;const max=this.scroller.scrollHeight-this.scroller.clientHeight;this.data.progress=max>0?Math.max(0,Math.min(1,this.scroller.scrollTop/max)):0;}
  private globalPoint(node:Node,offset:number){const block=this.blocks.find(el=>el.contains(node));if(!block)return null;const r=this.article.ownerDocument.createRange();r.selectNodeContents(block);r.setEnd(node,offset);return this.passages[this.blocks.indexOf(block)].start+r.toString().length;}
  captureSelection(){const s=this.article.ownerDocument.getSelection();if(!s||s.isCollapsed||!s.rangeCount)return;const r=s.getRangeAt(0);if(this.pdf&&!this.pdf.activateRange(r)){new Notice('请在 PDF 同一页内选择文字。');return;}if(!this.article.contains(r.commonAncestorContainer))return;let start=this.globalPoint(r.startContainer,r.startOffset),end=this.globalPoint(r.endContainer,r.endOffset);if(start===null||end===null){const touched=this.blocks.filter(b=>r.intersectsNode(b));if(!touched.length)return;if(start===null)start=this.passages[this.blocks.indexOf(touched[0])].start;if(end===null)end=this.passages[this.blocks.indexOf(touched.at(-1)!)].end;}if(end<=start)return;const a=this.makeReadingAnchor(start,end);if(!a.quote.trim())return;this.selected=a;this.activeThread=undefined;this.activeHighlight=undefined;this.updateContext();this.toggleComposer(true,false);this.showLens('actions');}
  private modelSettings(task='default'):Settings{const s=this.plugin.store.settings,{service,model}=resolveModel(s,task,task==='translate'?undefined:task==='default'||!s.taskModels[task]?this.readingModel:undefined);return{...s,...serviceSettings(service,model.id,this.plugin.serviceKey(service.id)),systemPrompt:s.taskPrompts.default||SYSTEM};}
  private modelChoices(){return serviceChoices(this.plugin.store.settings);}
  private modelPicker(parent:HTMLElement,label:string){
    const trigger=button(parent,'',()=>this.openModelMenu(trigger),'gloss-model-picker');trigger.setAttribute('aria-label',label);trigger.setAttribute('aria-haspopup','dialog');trigger.setAttribute('aria-expanded','false');
    trigger.addEventListener('pointerdown',e=>e.stopPropagation());trigger.addEventListener('mousedown',e=>{e.stopPropagation();e.preventDefault();});this.paintModelButton(trigger);return trigger;
  }
  private paintModelButton(trigger:HTMLButtonElement){
    const s=this.plugin.store.settings,ref=this.readingModel||s.taskModels.default,choice=this.modelChoices().find(m=>m.serviceId===ref?.serviceId&&m.id===ref?.modelId);trigger.empty();const icon=trigger.createSpan({cls:'gloss-model-provider-icon'});setIcon(icon,choice?SERVICE_ICONS[choice.kind]:'sliders-horizontal');trigger.createSpan({cls:'gloss-model-button-label',text:choice?.name||'选择问答模型'});setIcon(trigger.createSpan({cls:'gloss-model-chevron'}),'chevron-down');trigger.title=choice?choice.serviceName+' · '+choice.id:'先添加服务并配置模型';trigger.disabled=!!this.aborter||!!this.retrievalJob;
  }
  private refreshModelButtons(){this.root?.querySelectorAll<HTMLButtonElement>('.gloss-model-picker').forEach(trigger=>this.paintModelButton(trigger));}
  private closeModelMenu(focus=false){const trigger=this.modelMenuTrigger;this.modelMenu?.remove();this.modelMenu=undefined;this.modelMenuTrigger=undefined;trigger?.setAttribute('aria-expanded','false');if(focus&&trigger?.isConnected)trigger.focus({preventScroll:true});}
  private openModelMenu(trigger:HTMLButtonElement){
    if(this.modelMenuTrigger===trigger){this.closeModelMenu();return;}this.closeModelMenu();if(this.aborter||this.retrievalJob)return;this.modelMenuTrigger=trigger;trigger.setAttribute('aria-expanded','true');
    const menu=this.modelMenu=this.root.createDiv({cls:'gloss-model-menu',attr:{role:'dialog','aria-label':'选择阅读模型'}});menu.addEventListener('pointerdown',e=>e.stopPropagation());menu.addEventListener('mousedown',e=>e.stopPropagation());
    const searchRow=menu.createDiv({cls:'gloss-model-search'});setIcon(searchRow.createSpan(),'search');const search=searchRow.createEl('input',{attr:{type:'search','aria-label':'搜索阅读模型',placeholder:'搜索模型或服务…'}});this.protectInput(search);
    const list=menu.createDiv({cls:'gloss-model-results',attr:{role:'listbox','aria-label':'可用阅读模型'}}),choices=this.modelChoices();let buttons:HTMLButtonElement[]=[],active=0;
    const updateActive=()=>{buttons.forEach((b,i)=>b.classList.toggle('is-focused',i===active));buttons[active]?.scrollIntoView({block:'nearest'});};
    const draw=()=>{list.empty();buttons=[];const q=search.value.trim().toLowerCase(),s=this.plugin.store.settings,current=this.readingModel||s.taskModels.default;
      for(const service of s.services){const filtered=choices.filter(m=>m.serviceId===service.id&&[m.id,m.name,service.name].some(value=>value.toLowerCase().includes(q)));if(!filtered.length)continue;list.createDiv({cls:'gloss-model-group',text:service.name});
        for(const model of filtered){const selected=current?.serviceId===service.id&&current?.modelId===model.id,b=button(list,'',()=>{this.readingModel={serviceId:service.id,modelId:model.id};this.closeModelMenu();this.refreshModelButtons();this.cancelSuggestions();this.suggestionKey='';if(!this.composerWrap.hidden)void this.generateSuggestions();const field=this.lensInput||(!this.composerWrap.hidden?this.composer:undefined);if(field)this.focusInput(field);},'gloss-model-option');b.setAttribute('role','option');b.setAttribute('aria-selected',String(selected));b.setAttribute('aria-label',service.name+' '+model.name);const copy=b.createSpan({cls:'gloss-model-option-copy'});copy.createSpan({cls:'gloss-model-option-name',text:model.name});if(model.name!==model.id)copy.createSpan({cls:'gloss-model-option-id',text:model.id});if(s.taskModels.default?.serviceId===service.id&&s.taskModels.default.modelId===model.id)b.createSpan({cls:'gloss-model-default',text:'默认'});const check=b.createSpan({cls:'gloss-model-option-check'});if(selected)setIcon(check,'check');buttons.push(b);}}
      if(!buttons.length){list.createDiv({cls:'gloss-model-empty',text:'请在设置中添加服务和模型'});button(list,'打开模型服务',()=>{this.closeModelMenu();(this.app as any).setting.open();(this.app as any).setting.openTabById('gloss-reader');},'gloss-model-option');}active=Math.max(0,buttons.findIndex(b=>b.getAttribute('aria-selected')==='true'));buttons.forEach((b,i)=>b.addEventListener('pointermove',()=>{active=i;buttons.forEach((el,j)=>el.classList.toggle('is-focused',i===j));}));buttons[active]?.classList.add('is-focused');};
    search.addEventListener('input',draw);menu.addEventListener('keydown',e=>{e.stopPropagation();if(e.isComposing||e.keyCode===229)return;if(e.key==='Escape'){e.preventDefault();this.closeModelMenu(true);}else if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();active=buttons.length?(active+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length:0;updateActive();}else if(e.key==='Enter'&&e.target===search){e.preventDefault();buttons[active]?.click();}},true);
    menu.createDiv({cls:'gloss-model-menu-foot',text:'本次问答模型 · 指令优先使用提示词中指定的模型'});draw();
    const root=this.root.getBoundingClientRect(),box=trigger.getBoundingClientRect(),width=Math.min(340,this.root.clientWidth-24);menu.style.width=width+'px';menu.style.maxHeight=Math.max(140,this.root.clientHeight-90)+'px';const height=Math.min(menu.offsetHeight,this.root.clientHeight-90),left=Math.max(12,Math.min(this.root.clientWidth-width-12,box.left-root.left));menu.style.left=left+'px';menu.style.top=Math.max(66,Math.min(this.root.clientHeight-height-12,box.bottom-root.top+8+height>this.root.clientHeight?box.top-root.top-height-8:box.bottom-root.top+8))+'px';this.quietLabels(menu);this.focusInput(search);
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
  toggleComposer(next=this.composerWrap.hidden,focus=true){
    this.composerWrap.hidden=!next;this.questionButton.setAttribute('aria-expanded',String(next));this.questionButton.toggleClass('is-active',next);
    if(next){if(focus)this.closeLens();this.updateContext();this.layoutMargin();this.resizeQuestion();if(focus)this.focusInput(this.composer);void this.generateSuggestions();}else this.cancelSuggestions();
    if(!next&&this.composer===this.composer.ownerDocument.activeElement)this.composer.blur();
    this.updateSelectionPreview();
  }
  private closeLens(){if(this.lens){this.lens.hidden=true;this.lensInput=undefined;}this.updateSelectionPreview();}
  private showLens(mode:'actions'|'ask'|'note',initial=''){
    if(!this.selected)return;if(mode==='ask'){this.toggleComposer(true);this.composer.value=initial;this.rememberDraft();this.syncSuggestionVisibility();return;}if(mode!=='actions')this.toggleComposer(false);this.lensMode=mode;this.lensInput=undefined;this.lens.empty();this.lens.hidden=false;this.lens.classList.toggle('is-editor',mode!=='actions');
    if(mode==='actions'){
      const ask=button(this.lens,'提问',()=>this.showLens('ask'),'gloss-lens-action gloss-lens-ask');ask.createSpan({cls:'gloss-lens-caret'});this.lens.createSpan({cls:'gloss-lens-divider'});
      for(const command of this.plugin.store.settings.commands)button(this.lens,command.name,()=>this.runCommand(command),'gloss-lens-action gloss-command-action');
      this.lens.createSpan({cls:'gloss-lens-divider'});
      this.iconButton(this.lens,'pen-line','写批注',()=>this.showLens('note'),'gloss-lens-action');
      this.iconButton(this.lens,'copy','复制选中文本',async()=>{if(this.selected)await navigator.clipboard.writeText(this.selected.quote);this.closeLens();},'gloss-lens-action');
      this.iconButton(this.lens,'settings-2','管理选中文本指令',()=>{(this.app as any).setting.open();(this.app as any).setting.openTabById(this.plugin.manifest.id);const tab=(this.app as any).setting.activeTab;if(tab instanceof GlossSettings){tab.tab='commands';tab.display();}},'gloss-lens-action');
      if(this.activeHighlight)this.iconButton(this.lens,'eraser','移除这条标记',()=>this.removeHighlight(this.activeHighlight!),'gloss-lens-action');
      this.lens.createSpan({cls:'gloss-lens-divider'});
      const styles=this.lens.createDiv({cls:'gloss-mark-styles'});
      for(const [style,icon]of [['underline','underline'],['wavy','spline'],['highlight','highlighter']] as const){const b=this.iconButton(styles,icon,MARK_STYLES[style],()=>this.highlight(this.plugin.store.settings.marker||'yellow',style),'gloss-lens-action');b.dataset.markStyle=style;}
      const colors=this.lens.createDiv({cls:'gloss-marker-colors',attr:{role:'group','aria-label':'标记颜色'}});
      for(const[color,label]of [['yellow','黄色'],['green','绿色'],['blue','蓝色'],['pink','粉色']]){const b=button(colors,'',()=>this.highlight(color,this.plugin.store.settings.markStyle),'gloss-marker-dot');b.dataset.color=color;b.setAttribute('aria-label',label+'标记');b.title=label;b.classList.toggle('is-on',color===this.plugin.store.settings.marker);}
    }else{
      const head=this.lens.createDiv({cls:'gloss-lens-editor-head'});head.createSpan({text:'用自己的话记下来'});this.iconButton(head,'x','关闭选中文本输入',()=>this.closeLens(),'gloss-lens-action');
      this.lensInput=this.lens.createEl('textarea',{cls:'gloss-lens-input',attr:{'aria-label':'选中文本批注',placeholder:'这段话让你想到了什么？',rows:'3'}});
      const existing=this.data.highlights.find(h=>h.id===this.activeHighlight);this.lensInput.value=mode==='note'?existing?.note||'':initial;
      const footer=this.lens.createDiv({cls:'gloss-lens-editor-footer'});button(footer,'保存批注',()=>this.saveLensNote(),'gloss-lens-save');
      this.protectInput(this.lensInput);this.lensInput.addEventListener('focus',()=>this.closeModelMenu());
      this.lensInput.addEventListener('keydown',e=>{if(!e.isComposing&&e.keyCode!==229&&e.key==='Enter'&&!e.shiftKey&&(e.metaKey||e.ctrlKey)){e.preventDefault();void this.saveLensNote().catch(showError);}});
      // The anchor is already stored; release the document selection before editing.
      this.article.ownerDocument.getSelection()?.removeAllRanges();
    }
    this.quietLabels(this.lens);this.placeLens();this.updateSelectionPreview();
    if(this.lensInput){this.focusInput(this.lensInput);this.lensInput.setSelectionRange(this.lensInput.value.length,this.lensInput.value.length);}
  }
  private async runCommand(command:ReadingCommand){if(!this.selected)return;if(command.id==='translate'){if(this.plugin.store.settings.translationEngine==='google'){await this.translateSelection();return;}await this.send(renderCommand(command.prompt,this.selected.quote,this.path.split('/').pop()||'')+'\n目标语言：'+TRANSLATION_LANGUAGES[this.plugin.store.settings.translationTarget]+'；如原文已是目标语言，中文改译英语，其他语言改译中文。',false,'translate');return;}await this.send(renderCommand(command.prompt,this.selected.quote,this.path.split('/').pop()?.replace(/\.md$/,'')||''),false,command.id);}
  private placeLens(){if(!this.selected||this.lens.hidden)return;const r=anchorRange(this.blocks,this.passages,this.text,this.selected);if(!r)return;const rects=Array.from(r.getClientRects()).filter(r=>r.width>0);if(!rects.length)return;const first=rects[0],last=rects.at(-1)!,box=this.root.getBoundingClientRect(),w=this.lens.offsetWidth,h=this.lens.offsetHeight,center=(Math.min(...rects.map(r=>r.left))+Math.max(...rects.map(r=>r.right)))/2;const x=Math.max(12,Math.min(this.root.clientWidth-w-12,center-box.left-w/2));const above=first.top-box.top-h-12>=66;const y=above?first.top-box.top-h-12:last.bottom-box.top+12;this.lens.style.left=x+'px';this.lens.style.top=Math.max(66,Math.min(this.root.clientHeight-h-12,y))+'px';this.lens.style.setProperty('--gloss-arrow',Math.max(18,Math.min(w-18,(above?first.left+Math.min(40,first.width/2):(last.left+last.right)/2)-box.left-x))+'px');this.lens.classList.toggle('is-below',!above);}
  private updateContext(){if(!this.composer)return;this.updateSelectionPreview();if(!this.plugin.store.settings.questionSuggestions)this.cancelSuggestions();else if(!this.composerWrap.hidden&&!this.aborter&&!this.retrievalJob)void this.generateSuggestions();
    this.syncComposerBusy();if(this.selectionChip){this.selectionChip.empty();this.selectionChip.hidden=!this.selected;if(this.selected){this.selectionChip.createSpan({text:'选中文本 · '+this.selected.quote.replace(/\s+/g,' ').slice(0,20)});this.iconButton(this.selectionChip,'x','改为整篇文档提问',()=>{this.selected=undefined;this.activeHighlight=undefined;this.closeLens();this.updateContext();this.focusInput(this.composer);});}}this.composeLabel.textContent=this.webError;this.composeLabel.hidden=!this.webError;this.composer.placeholder=this.selected?'询问选中文本…':'询问整篇文档…';}
  private paintHighlights(){if(!this.article)return;if(this.pdf){this.pdf.paint([...this.data.highlights.filter(h=>!h.removed).map(h=>({id:h.id,anchor:h.anchor,kind:'highlight' as const,color:h.color,style:markStyle(h.style),active:h.id===this.activeHighlight})),...this.data.threads.filter(t=>!t.removed&&t.anchor&&t.selection!==false).map(t=>({id:t.id,anchor:t.anchor!,kind:'thread' as const,active:t.id===this.activeThread}))]);this.updateSelectionPreview();return;}const marks:TextMark[]=[];for(const h of this.data.highlights.filter(h=>!h.removed)){const start=resolveAnchor(this.text,h.anchor);if(start!==null)marks.push({id:h.id,start,end:start+h.anchor.quote.length,kind:'highlight',color:h.color,note:!!h.note,style:markStyle(h.style)});}for(const t of this.threads){if(!t.anchor)continue;const start=resolveAnchor(this.text,t.anchor);if(start!==null)marks.push({id:t.id,start,end:start+t.anchor.quote.length,kind:'thread'});}paintMarks(this.article,this.blocks,this.passages,marks,this.activeThread||this.activeHighlight,this.fresh);this.updateSelectionPreview();this.rail?.querySelectorAll<HTMLElement>('.gloss-rail-line').forEach(el=>{const p=this.passages[Number(el.dataset.paragraph)-1],h=marks.find(m=>m.kind==='highlight'&&m.end>p.start&&m.start<p.end),t=marks.some(m=>m.kind==='thread'&&m.end>p.start&&m.start<p.end);el.dataset.color=h?.color||'';el.classList.toggle('has-gloss',t);});}
  private matchedHighlight(){if(!this.selected)return;const at=resolveAnchor(this.text,this.selected);return this.data.highlights.find(h=>!h.removed&&h.anchor.quote===this.selected!.quote&&resolveAnchor(this.text,h.anchor)===at);}
  private async highlight(color:string,style:MarkStyle=this.plugin.store.settings.markStyle){if(!this.selected)return;let h=this.matchedHighlight();if(h){h.color=color;h.style=style;}else{h={id:uid(),anchor:{...this.selected},color,style,note:'',created:Date.now()};this.data.highlights.push(h);}this.plugin.store.settings.marker=color;this.plugin.store.settings.markStyle=style;this.activeHighlight=undefined;this.fresh=h.id;this.data.updated=Date.now();await this.plugin.persist();this.article.ownerDocument.getSelection()?.removeAllRanges();this.closeLens();this.toggleComposer(true,false);this.paintHighlights();await this.renderMargin();const id=h.id;setTimeout(()=>{if(this.fresh===id){this.fresh=undefined;this.article.querySelectorAll('.is-new').forEach(el=>el.removeClass('is-new'));}},750);}
  private async saveLensNote(){if(!this.selected||!this.lensInput)return;let h=this.matchedHighlight();const note=this.lensInput.value.trim();if(h)h.note=note;else{if(!note){this.closeLens();return;}h={id:uid(),anchor:{...this.selected},color:this.plugin.store.settings.marker||'yellow',style:this.plugin.store.settings.markStyle,note,created:Date.now()};this.data.highlights.push(h);}this.activeHighlight=h.id;this.fresh=h.id;this.data.updated=Date.now();await this.plugin.persist();this.closeLens();this.paintHighlights();await this.renderMargin();if(this.narrow)this.toggleNotebook(true);}
  private async removeHighlight(id:string){const h=this.data.highlights.find(h=>h.id===id);if(!h)return;h.removed=true;await this.plugin.persist();this.closeLens();this.activeHighlight=undefined;this.paintHighlights();await this.renderMargin();new Notice('高亮已移除，可在笔记本底部恢复。');}
  private jump(anchor:Anchor){if(this.pdf&&anchor.pdfPage&&anchor.pdfPage!==this.pdf.page){void this.pdf.go(anchor.pdfPage).then(()=>this.jump(anchor)).catch(showError);return;}let r=anchorRange(this.blocks,this.passages,this.text,anchor);if(!r&&this.pdf){const needle=anchor.quote.replace(/\s/g,''),positions:number[]=[],chars:string[]=[];for(let n=0;n<this.text.length;n++)if(!/\s/.test(this.text[n])){positions.push(n);chars.push(this.text[n]);}const flat=chars.join(''),at=flat.indexOf(needle);if(needle&&at>=0&&flat.indexOf(needle,at+1)<0){anchor={...this.makeReadingAnchor(positions[at],positions[at+needle.length-1]+1)};r=anchorRange(this.blocks,this.passages,this.text,anchor);}}if(!r){new Notice(this.pdf?'已定位原书页；该片段无法精确匹配到文字层。':'原文已变化，无法可靠定位；摘录仍完整保留。');return;}const start=resolveAnchor(this.text,anchor)!,i=this.passages.findIndex(p=>p.end>start),b=this.blocks[i];if(this.pdf)this.pdf.reveal(anchor);else b.scrollIntoView({behavior:'smooth',block:'center'});b.addClass('gloss-jump');setTimeout(()=>b.removeClass('gloss-jump'),1800);}
  private activateThread(t:Thread){if(this.pdf&&t.anchor?.pdfPage&&t.anchor.pdfPage!==this.pdf.page){void this.pdf.go(t.anchor.pdfPage).then(()=>this.activateThread(t)).catch(showError);return;}this.referenceFocus=undefined;this.activeThread=t.id;this.activeHighlight=undefined;this.selected=undefined;this.paintHighlights();this.updateContext();if(this.narrow){this.notebookOpen=true;this.drawer.hidden=false;}void this.renderMargin();}
  async revealReference(threadId:string,id:string){const anchor=this.data.threads.find(t=>t.id===threadId&&!t.removed)?.citations?.[id];if(!anchor)throw new Error('此原文引用不存在。');if(this.pdf&&!this.pdf.loaded)await this.pdf.ready(this.importAborter?.signal);const thread=this.data.threads.find(t=>t.id===threadId&&!t.removed);if(thread)this.focusReference(thread,anchor);}
  revealSaved(id:string){const h=this.data.highlights.find(h=>h.id===id),t=this.data.threads.find(t=>t.id===id&&!t.removed);const a=h?.anchor||t?.anchor;if(this.pdf&&a?.pdfPage&&a.pdfPage!==this.pdf.page){void this.pdf.go(a.pdfPage).then(()=>this.revealSaved(id)).catch(showError);return;}if(h){this.activeThread=undefined;this.activeHighlight=h.id;this.selected=h.anchor;this.jump(h.anchor);if(h.note){void this.renderMargin();if(this.narrow)this.toggleNotebook(true);}else this.showLens('actions');}if(t){this.activateThread(t);if(t.anchor)this.jump(t.anchor);}}
  private collapseThread(){this.activeThread=undefined;this.referenceFocus=undefined;this.hoverThread=undefined;this.paintHighlights();this.updateAssociatedParagraphs();this.updateContext();void this.renderMargin().catch(showError);}
  private clearReferencePreview(){const registry=(this.root?.ownerDocument.defaultView as any)?.CSS?.highlights;if(this.referencePreview&&registry?.get('gloss-reference')===this.referencePreview)registry.delete('gloss-reference');this.referencePreview=undefined;}
  private updateAssociatedParagraphs(){
    this.blocks.forEach(b=>b.classList.remove('gloss-associated'));this.clearReferencePreview();
    const id=this.hoverThread||this.activeThread,anchor=annotationAnchor(this.threads,id,this.referenceFocus);
    if(!anchor)return;if(this.referenceFocus?.threadId===id){const range=this.pdf?this.pdf.range(anchor):anchorRange(this.blocks,this.passages,this.text,anchor),win=this.article.ownerDocument.defaultView as any;if(range&&win?.CSS?.highlights&&win.Highlight){this.referencePreview=new win.Highlight(range);win.CSS.highlights.set('gloss-reference',this.referencePreview);}}
    if(this.pdf)return;const at=resolveAnchor(this.text,anchor);if(at===null)return;this.blocks.forEach((b,i)=>{const p=this.passages[i];b.classList.toggle('gloss-associated',!!p&&p.end>at&&p.start<at+anchor.quote.length);});
  }
  private setHover(id?:string){this.hoverThread=id;this.article.querySelectorAll<HTMLElement>('[data-g]').forEach(el=>el.classList.toggle('is-hover',!!id&&el.dataset.g!.split(' ').includes(id)));for(const [key,card]of this.cards)card.classList.toggle('is-hover',id===key);this.updateAssociatedParagraphs();}
  private focusReference(thread:Thread,anchor:Anchor){this.activeThread=thread.id;this.activeHighlight=undefined;this.referenceFocus={threadId:thread.id,anchor};if(this.notebookOpen)this.toggleNotebook(false);this.jump(anchor);this.paintHighlights();this.updateAssociatedParagraphs();void this.renderMargin().catch(showError);this.scheduleLayout();this.trackLeader();}
  private citeButtons(parent:HTMLElement,t:Thread){
    const walker=parent.ownerDocument.createTreeWalker(parent,4),nodes:Text[]=[];while(walker.nextNode()){const n=walker.currentNode as Text;if(referenceTokens(n.data).length&&!n.parentElement?.closest('pre,code,a,button'))nodes.push(n);}
    for(const n of nodes){const fragment=parent.ownerDocument.createDocumentFragment();let end=0;for(const token of referenceTokens(n.data)){fragment.append(n.data.slice(end,token.start));for(const {id,anchor,label} of uniqueReferences(token.ids,t.citations)){const b=parent.ownerDocument.createElement('button');b.className='gloss-citation';b.textContent=anchor.pdfPage?'p.'+anchor.pdfPage:label;b.onclick=()=>this.focusReference(t,anchor);fragment.append(b);}end=token.end;}fragment.append(n.data.slice(end));n.replaceWith(fragment);}
  }
  private async renderThread(parent:HTMLElement,t:Thread,component:Component,notebook=false){
    const active=t.id===this.activeThread,streaming=!!this.aborter&&this.runningThread===t.id,card=parent.createEl('article',{cls:'gloss-margin-card gloss-thread-card'});card.dataset.threadId=t.id;card.dataset.cardId=t.id;card.toggleClass('is-active',active);card.toggleClass('is-collapsed',!active);
    if(!notebook){this.cards.set(t.id,card);const prior=this.previousPositions.get(t.id);if(prior){card.style.transform=prior;card.style.visibility='visible';card.dataset.placed='true';}}
    const follow=Math.max(0,t.messages.filter(m=>m.role==='user').length-1),number=t.anchor?this.paragraphNumber(t.anchor):null,source=t.anchor?.pdfPage?'p.'+t.anchor.pdfPage:number?'¶'+number:t.selection===false?'整篇':'',kind=t.selection===false&&(!t.commandId||t.commandId==='default')?'整篇':threadType(t,this.plugin.store.settings.commands),first=t.messages.find(m=>m.role==='user');
    if(!active){
      const row=card.createDiv({cls:'gloss-collapsed-row'}),open=button(row,'',()=>this.activateThread(t),'gloss-collapsed-open');open.setAttribute('aria-expanded','false');
      if(t.commandId&&t.commandId!=='default'){open.createSpan({cls:'gloss-collapsed-kind',text:kind});open.createSpan({cls:'gloss-collapsed-text',text:(t.anchor?.quote||first?.content||kind).replace(/\s+/g,' ')});}else open.createSpan({cls:'gloss-collapsed-text is-question',text:first?.content||'关于这篇文档'});
      if(follow){const counter=row.createSpan({cls:'gloss-collapsed-follow',text:'+'+follow});counter.title=follow+' 次追问';counter.setAttribute('aria-label',follow+' 次追问');}
      if(source&&t.anchor){const cite=button(row,source,()=>this.focusReference(t,t.anchor!),'gloss-citation gloss-collapsed-source');cite.setAttribute('aria-label','定位原文 '+source);}else if(source)row.createSpan({cls:'gloss-collapsed-source',text:source});
      const answer=t.messages.find(m=>m.role==='assistant'&&m.content.trim()),preview=card.createDiv({cls:'gloss-card-preview gloss-answer markdown-rendered'});if(answer){await MarkdownRenderer.render(this.app,passiveEmbeds(answer.content),preview,this.path,component);if(component!==this.marginRender)return;this.citeButtons(preview,t);}else if(streaming)preview.createDiv({cls:'gloss-writing',attr:{role:'status','aria-label':'正在回答'}});else if(visibleThreadError(t))preview.createSpan({text:visibleThreadError(t)});else preview.hidden=true;
      preview.addEventListener('click',e=>{if(!(e.target as Element).closest('button,a')&&preview.ownerDocument.getSelection()?.isCollapsed)this.activateThread(t);});if(streaming)this.answerStop(card,'gloss-collapsed-stop');
    }else{
      const head=card.createDiv({cls:'gloss-card-heading'});head.createSpan({cls:'gloss-card-kind',text:kind});
      if(source&&source!=='整篇')button(head,source,()=>{if(t.anchor)this.focusReference(t,t.anchor);},'gloss-citation');
      if(follow)head.createSpan({cls:'gloss-followup-count',text:follow+' 次追问'});if(streaming)this.answerStop(head,'gloss-answer-stop');this.iconButton(head,'chevrons-down-up','收起回答 · Esc',()=>this.collapseThread(),'gloss-collapse');
      if(t.anchor&&t.selection!==false)button(card,t.anchor.quote,()=>this.focusReference(t,t.anchor!),'gloss-thread-quote');
      for(const [index,m]of t.messages.entries()){if(index===0&&m.role==='user'&&t.commandId&&t.commandId!=='default')continue;
        const message=card.createDiv({cls:'gloss-message '+(m.role==='user'?'is-user':'is-assistant')});message.createSpan({cls:'gloss-sr-only',text:m.role==='user'?'问题':'回答'});
        if(m.role==='user')message.createEl('p',{cls:'gloss-card-question',text:m.content});
        else{const body=message.createDiv({cls:'gloss-answer markdown-rendered'});if(!m.content&&streaming)body.createDiv({cls:'gloss-writing',attr:{role:'status','aria-label':'正在回答'}});else{await MarkdownRenderer.render(this.app,passiveEmbeds(m.content),body,this.path,component);if(component!==this.marginRender)return;this.citeButtons(body,t);}}
      }
      const error=visibleThreadError(t);if(error)card.createDiv({cls:'gloss-error',text:error});this.answerFooter(card,t);this.renderFollowup(card,t);
    }
    card.addEventListener('mouseenter',()=>this.setHover(t.id));card.addEventListener('mouseleave',()=>this.setHover());return card;
  }
  private renderFollowup(card:HTMLElement,thread:Thread){
    const form=card.createEl('form',{cls:'gloss-followup'}),input=form.createEl('input',{cls:'gloss-followup-input',attr:{type:'text',placeholder:'继续追问…','aria-label':'继续追问当前回答'}});input.value=thread.followupDraft||'';input.disabled=!!this.aborter||!!this.retrievalJob;
    const submit=async()=>{const question=input.value.trim();if(!question||this.aborter||this.retrievalJob)return;await this.send(question,false,'default',undefined,thread);};
    const send=this.iconButton(form,'arrow-up','发送追问',submit,'gloss-followup-send');send.disabled=input.disabled||!input.value.trim();
    input.addEventListener('input',()=>{thread.followupDraft=input.value;send.disabled=!!this.aborter||!!this.retrievalJob||!input.value.trim();clearTimeout(this.draftTimer);this.draftTimer=setTimeout(()=>void this.plugin.persist().catch(showError),500);});
    this.protectInput(input);input.addEventListener('focus',()=>this.closeModelMenu());form.addEventListener('submit',e=>{e.preventDefault();void submit().catch(showError);});input.addEventListener('keydown',e=>{if(!e.isComposing&&e.keyCode!==229&&e.key==='Enter'){e.preventDefault();void submit().catch(showError);}});
  }
  private paragraphNumber(a:Anchor){if(this.pdf&&a.pdfPage!==this.pdf.page)return null;const start=resolveAnchor(this.text,a);return start===null?null:this.passages.find(p=>p.end>start)?.number;}
  private activateNote(h:Highlight){if(this.pdf&&h.anchor.pdfPage&&h.anchor.pdfPage!==this.pdf.page){void this.pdf.go(h.anchor.pdfPage).then(()=>this.activateNote(h)).catch(showError);return;}this.activeHighlight=h.id;this.activeThread=undefined;this.selected=h.anchor;this.toggleComposer(true,false);this.paintHighlights();this.updateContext();void this.renderMargin().catch(showError);}
  private renderNote(parent:HTMLElement,h:Highlight,notebook=false){const card=parent.createEl('article',{cls:'gloss-margin-card gloss-personal-card'});card.dataset.cardId=h.id;card.dataset.color=h.color;if(!notebook){this.cards.set(h.id,card);const prior=this.previousPositions.get(h.id);if(prior){card.style.transform=prior;card.style.visibility='visible';card.dataset.placed='true';}}card.toggleClass('is-active',h.id===this.activeHighlight);const head=card.createDiv({cls:'gloss-card-heading'});head.createSpan({cls:'gloss-note-color',attr:{'data-color':h.color}});head.createSpan({text:'我的批注'});const number=this.paragraphNumber(h.anchor);if(number)button(head,'¶'+number,()=>{this.activateNote(h);this.jump(h.anchor);},'gloss-citation');button(card,h.anchor.quote,()=>{this.activateNote(h);this.showLens('actions');this.jump(h.anchor);},'gloss-note-quote');if(h.note)card.createEl('p',{cls:'gloss-personal-note',text:h.note});if(number===null&&!h.anchor.pdfPage)card.createDiv({cls:'gloss-stale',text:'原文已变更 · 摘录仍保留'});const actions=card.createDiv({cls:'gloss-note-actions'});this.iconButton(actions,'pen-line','编辑批注',()=>{this.activateNote(h);this.showLens('note');});this.iconButton(actions,'message-circle','讨论这段',()=>{this.activateNote(h);this.showLens('ask');});this.iconButton(actions,'eraser','移除高亮',()=>this.removeHighlight(h.id));card.addEventListener('click',e=>{if((e.target as Element).closest('button,a,input,textarea,select,[contenteditable="true"]')||!card.ownerDocument.getSelection()?.isCollapsed)return;if(this.activeHighlight!==h.id)this.activateNote(h);});return card;}
  private regenerationSettings(thread:Thread):Settings{
    const previous=thread.messages.filter(m=>m.role==='assistant').at(-1),s=this.plugin.store.settings;
    if(previous?.provider==='Google Translate')return this.modelSettings('default');if(!previous?.model)return this.modelSettings(thread.commandId||'default');
    const candidates=s.services.filter(service=>(previous.serviceId?service.id===previous.serviceId:!previous.provider||[service.name,service.kind,providerName(service.kind)].includes(previous.provider))&&service.models.some(model=>model.id===previous.model));
    if(candidates.length!==1)throw new Error('原回答的模型服务已变更，请先在设置中配置该模型。');
    const service=candidates[0];return{...s,...serviceSettings(service,previous.model,this.plugin.serviceKey(service.id)),systemPrompt:s.taskPrompts.default||SYSTEM};
  }
  private async regenerateThread(thread:Thread){if(this.aborter||thread.removed)return;if(thread.messages.filter(m=>m.role==='user').length===1&&(thread.messages.filter(m=>m.role==='assistant').at(-1)?.provider==='Google Translate'||(!thread.messages.some(m=>m.role==='assistant')&&thread.commandId==='translate'&&this.plugin.store.settings.translationEngine==='google'))){if(this.pdf&&thread.anchor?.pdfPage&&thread.anchor.pdfPage!==this.pdf.page)await this.pdf.go(thread.anchor.pdfPage);await this.translateSelection(thread);return;}if(this.pdf&&thread.anchor?.pdfPage!==this.pdf.page&&thread.anchor?.pdfPage)await this.pdf.go(thread.anchor.pdfPage);regenerationHistory(thread);this.activeThread=thread.id;this.selected=thread.anchor;await this.send(undefined,false,thread.commandId||'default',thread);}
  private async deleteThread(thread:Thread){if(thread.removed)return;if(this.runningThread===thread.id)this.stop();thread.removed=true;thread.removedAt=Date.now();if(this.activeThread===thread.id){this.activeThread=undefined;this.selected=undefined;}await this.plugin.persist();this.paintHighlights();this.updateContext();await this.renderMargin();const fragment=this.root.ownerDocument.createDocumentFragment();fragment.append('已删除问答 ');const undo=this.root.ownerDocument.createElement('button');undo.textContent='撤销';undo.onclick=()=>{thread.removed=false;delete thread.removedAt;void this.plugin.persist().then(()=>{this.paintHighlights();return this.renderMargin();}).catch(showError);};fragment.append(undo);new Notice(fragment,8000);}
  private answerFooter(card:HTMLElement,thread:Thread,notebook=false){
    if(this.aborter&&this.runningThread===thread.id){if(notebook){const foot=card.createDiv({cls:'gloss-answer-controls'});this.answerStop(foot);}return;}
    if(thread.messages.at(-1)?.role!=='assistant'||!thread.messages.at(-1)!.content.trim()){const foot=card.createDiv({cls:'gloss-answer-controls'});this.iconButton(foot,'rotate-ccw','重试回答',()=>this.regenerateThread(thread));this.iconButton(foot,'trash-2','删除这条问答',()=>this.deleteThread(thread));return foot;}
    const foot=card.createDiv({cls:'gloss-card-footer gloss-answer-controls'}),last=thread.messages.filter(m=>m.role==='assistant').at(-1),receipt=foot.createSpan({cls:'gloss-answer-receipt'});const service=this.plugin.store.settings.services.find(s=>s.id===last?.serviceId),name=service?.models.find(m=>m.id===last?.model)?.name||last?.model||'';receipt.createSpan({cls:'gloss-receipt-model',text:name});if(last?.usage){receipt.createSpan({cls:'gloss-receipt-divider',text:'/'});receipt.createSpan({cls:'gloss-receipt-tokens',text:tokenReceipt(last.usage)});}receipt.title=last?.provider==='Google Translate'?'谷歌翻译 · 内置':[last?.provider,last?.model,tokenDetails(last?.usage)].filter(Boolean).join(' · ');
    const regenerate=this.iconButton(foot,'rotate-ccw','重新生成回答',()=>this.regenerateThread(thread));regenerate.disabled=!!this.aborter||!thread.messages.some(m=>m.role==='user');
    this.iconButton(foot,'copy','复制完整对话',async()=>{await navigator.clipboard.writeText((thread.anchor?'引用原文：\n'+thread.anchor.quote+'\n\n':'')+thread.messages.map(m=>(m.role==='user'?'我的问题':'回答'+(m.model?' · '+m.model:'')+(m.usage?' / '+tokenReceipt(m.usage):''))+'：\n'+m.content).join('\n\n'));new Notice('已复制对话与引用');});
    this.iconButton(foot,'trash-2','删除这条问答',()=>this.deleteThread(thread));return foot;
  }
  private notebookRender?:Component;
  private notebookMeta(parent:HTMLElement,anchor:Anchor|undefined,label:string,created:number){const head=parent.createDiv({cls:'gloss-notebook-meta'}),n=anchor?this.paragraphNumber(anchor):null;if(anchor?.pdfPage)head.createSpan({cls:'gloss-citation gloss-notebook-paragraph',text:'第 '+anchor.pdfPage+' 页'});else if(n)head.createSpan({cls:'gloss-citation gloss-notebook-paragraph',text:'¶'+n});head.createSpan({cls:'gloss-notebook-type',text:label});head.createSpan({cls:'gloss-notebook-time',text:notebookTime(created)});return head;}
  private notebookGo(t:Thread){this.toggleNotebook(false);this.activateThread(t);if(t.anchor)this.focusReference(t,t.anchor);else this.scroller.scrollTo({top:0,behavior:'smooth'});requestAnimationFrame(()=>{const card=this.cards.get(t.id);if(!card)return;if(this.pdf)this.margin.scrollTo({top:this.margin.scrollTop+card.getBoundingClientRect().top-this.margin.getBoundingClientRect().top,behavior:'smooth'});else card.scrollIntoView({block:'nearest',behavior:'smooth'});});}
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
            if(!message.content&&this.runningThread===t.id&&this.aborter)body.createDiv({cls:'gloss-writing',attr:{role:'status','aria-label':'正在回答'}});else if(message.content){await MarkdownRenderer.render(this.app,passiveEmbeds(message.content),body,this.path,component);if(component!==this.notebookRender)return;this.citeButtons(body,t);}else body.createSpan({cls:'gloss-notebook-unanswered',text:visibleThreadError(t)||''});
            const more=button(copy,expanded?'收起':'展开',()=>{const open=!body.classList.contains('is-expanded');body.classList.toggle('is-expanded',open);body.classList.toggle('is-over',!open);if(open)this.notebookAnswers.add(key);else this.notebookAnswers.delete(key);more.textContent=open?'收起':'展开';},'gloss-notebook-read-more');more.hidden=!expanded;requestAnimationFrame(()=>{if(component!==this.notebookRender||!body.isConnected)return;const over=body.scrollHeight>body.clientHeight+2;body.classList.toggle('is-over',!expanded&&over);more.hidden=!expanded&&!over;});
          }}if(t.messages.at(-1)?.role==='user'){const status=card.createDiv({cls:'gloss-notebook-unanswered',text:visibleThreadError(t)||''});status.setAttribute('role','status');}if(visibleThreadError(t)&&t.messages.at(-1)?.role==='assistant')card.createDiv({cls:'gloss-error',text:visibleThreadError(t)});this.answerFooter(card,t,true);
      }}
    if(!entries.length){const empty=this.drawerBody.createDiv({cls:'gloss-notebook-empty'});setIcon(empty.createSpan(),'notebook-pen');empty.createEl('p',{text:this.notebookFilter==='questions'?'还没有问答':this.notebookFilter==='highlights'?'还没有划线':'选中一句话，留下问题或划线。'});}
    const removedQuestions=this.data.threads.filter(t=>t.removed).sort((a,b)=>(b.removedAt||0)-(a.removedAt||0));if(removedQuestions.length)button(this.drawerBody,'恢复最近删除的问答',async()=>{const t=removedQuestions[0];t.removed=false;delete t.removedAt;await this.plugin.persist();this.paintHighlights();await this.renderMargin();},'gloss-restore');
    const removed=this.data.highlights.filter(h=>h.removed);if(removed.length)button(this.drawerBody,'恢复最近移除的高亮',async()=>{removed.at(-1)!.removed=false;await this.plugin.persist();this.paintHighlights();await this.renderMargin();},'gloss-restore');
    this.drawerBody.scrollTop=scroll;
  }
  private async renderMargin(){if(!this.margin)return;if(this.marginRender){this.removeChild(this.marginRender);this.marginRender.unload();}this.marginObserver?.disconnect();const component=new Component();this.marginRender=component;this.addChild(component);for(const[id,card]of this.cards)this.previousPositions.set(id,card.style.transform);this.margin.empty();this.leader?.remove();this.leader=undefined;cancelAnimationFrame(this.leaderFrame);this.cards.clear();
    const notes=this.data.highlights.filter(h=>!h.removed&&h.note&&(!this.pdf||h.anchor.pdfPage===this.pdf.page));
    for(const t of this.threads){await this.renderThread(this.margin,t,component);if(component!==this.marginRender)return;}
    for(const h of notes)this.renderNote(this.margin,h);

    await this.renderNotebook();if(component!==this.marginRender)return;
    this.marginObserver=new ResizeObserver(()=>this.scheduleLayout());for(const card of this.cards.values())this.marginObserver.observe(card);this.scheduleLayout();}
  private scheduleLayout(){cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>this.layoutMargin());}
  private layoutMargin(){if(!this.margin?.isConnected)return;const compose=this.root.querySelector<HTMLElement>('.gloss-composer');if(compose){const r=this.page.getBoundingClientRect(),root=this.root.getBoundingClientRect();compose.style.left=(r.left-root.left+r.width/2)+'px';}const base=this.margin.getBoundingClientRect().top,items:MarginItem[]=[];
    for(const t of this.threads){const card=this.cards.get(t.id);if(!card)continue;const rect=t.anchor?anchorRange(this.blocks,this.passages,this.text,t.anchor)?.getClientRects()[0]:this.article.getBoundingClientRect();const desired=rect?rect.top-base-6:0;items.push({id:t.id,desired:Math.max(0,desired),sourceY:rect?desired:NaN,height:card.offsetHeight||64,created:t.created});}
    for(const h of this.data.highlights.filter(h=>!h.removed&&h.note)){const card=this.cards.get(h.id);if(!card)continue;const rect=anchorRange(this.blocks,this.passages,this.text,h.anchor)?.getClientRects()[0];items.push({id:h.id,desired:Math.max(0,rect?rect.top-base-6:0),height:card.offsetHeight||48,created:h.created,note:true,sourceY:rect?rect.top-base-6:NaN});}
    const mini=compactMarginIds(items,this.activeThread||this.activeHighlight);for(const item of items){item.mini=mini.has(item.id);const card=this.cards.get(item.id)!;card.classList.toggle('is-mini',item.mini);item.height=card.offsetHeight||item.height;}
    if(this.pdf)for(const item of items)item.desired=Math.min(item.desired,Math.max(0,this.margin.clientHeight-item.height));
    items.sort((a,b)=>a.desired-b.desired||a.created-b.created);const positions=placeMarginItems(items,this.activeThread||this.activeHighlight);let bottom=0,moving=false;for(const item of items){const card=this.cards.get(item.id)!;const first=!card.dataset.placed;if(first)card.style.transition='none';const transform=`translateY(${Math.round(positions[item.id])}px)`;if(!first&&card.style.transform!==transform)moving=true;card.style.transform=transform;card.dataset.placed='true';card.style.visibility='visible';bottom=Math.max(bottom,positions[item.id]+item.height);if(first)requestAnimationFrame(()=>card.style.removeProperty('transition'));}
    this.margin.style.minHeight=Math.max(this.page.offsetHeight,bottom+100)+'px';const hint=this.margin.querySelector<HTMLElement>('.gloss-margin-hint');if(hint)hint.style.transform=`translateY(${Math.max(0,this.article.getBoundingClientRect().top-base)}px)`;this.updateAssociatedParagraphs();this.updateRail(true);this.updateLeader();if(moving)this.trackLeader();}
  private updateLeader(){
    if(!this.margin?.isConnected)return;
    if(!this.leader){this.leader=this.margin.ownerDocument.createElementNS('http://www.w3.org/2000/svg','svg');this.leader.setAttribute('class','gloss-margin-leader');this.leader.setAttribute('aria-hidden','true');(this.pdf?this.root:this.margin).prepend(this.leader);}
    const svg=this.leader,id=this.activeThread||this.activeHighlight,card=id?this.cards.get(id):undefined;
    const anchor=this.activeThread?annotationAnchor(this.threads,id,this.referenceFocus):this.data.highlights.find(h=>h.id===id&&!h.removed)?.anchor;
    const source=anchor?(this.pdf?this.pdf.range(anchor):anchorRange(this.blocks,this.passages,this.text,anchor))?.getClientRects()[0]:undefined,margin=this.margin.getBoundingClientRect(),gap=margin.left-this.page.getBoundingClientRect().right;
    if(!card||!source||!this.margin.offsetWidth||gap<16){svg.replaceChildren();svg.removeAttribute('data-annotation-id');return;}
    const y0=source.top+source.height/2-margin.top,y1=card.getBoundingClientRect().top+17-margin.top,x0=8,x1=gap-1;if(this.pdf&&(y0<42||y0>margin.height||y1<0||y1>margin.height)){svg.replaceChildren();return;}
    svg.style.left=(this.pdf?margin.left-this.root.getBoundingClientRect().left-gap:-gap)+'px';svg.style.top=(this.pdf?margin.top-this.root.getBoundingClientRect().top:0)+'px';svg.setAttribute('width',String(gap));svg.setAttribute('height',String(Math.max(1,y0+4,y1+4)));svg.setAttribute('data-annotation-id',id!);
    let path=svg.querySelector('path'),dot=svg.querySelector('circle');if(!path){path=svg.ownerDocument.createElementNS(svg.namespaceURI,'path') as SVGPathElement;svg.append(path);}if(!dot){dot=svg.ownerDocument.createElementNS(svg.namespaceURI,'circle') as SVGCircleElement;dot.setAttribute('r','2.2');svg.append(dot);}
    path.setAttribute('d',`M ${x0} ${y0} C ${x0+gap*.5} ${y0}, ${x1-gap*.5} ${y1}, ${x1} ${y1}`);dot.setAttribute('cx',String(x0));dot.setAttribute('cy',String(y0));
  }
  private trackLeader(){cancelAnimationFrame(this.leaderFrame);const until=performance.now()+460,tick=()=>{if(!this.root?.isConnected)return;this.updateLeader();if(performance.now()<until)this.leaderFrame=requestAnimationFrame(tick);else this.leaderFrame=0;};this.leaderFrame=requestAnimationFrame(tick);}

  private currentPassage(){const box=(this.pdf?this.article:this.scroller).getBoundingClientRect(),y=box.top+Math.min(150,box.height*.25);let best=0,distance=Infinity;this.blocks.forEach((b,i)=>{const r=b.getBoundingClientRect(),d=r.bottom>=y?Math.abs(r.top-y):Infinity;if(d<distance){best=i;distance=d;}});return best;}
  private keyboardPassage?:number;
  private movePassage(step:number){if(!this.passages.length)return;const next=(this.keyboardPassage??this.currentPassage())+step;if(this.pdf&&(next<0||next>=this.passages.length)){const page=this.pdf.page+step;if(page>=1&&page<=this.pdf.total){this.keyboardPassage=undefined;void this.pdf.go(page).catch(showError);}return;}const i=Math.max(0,Math.min(this.passages.length-1,next));this.keyboardPassage=i;this.selected=undefined;this.blocks.forEach((b,n)=>b.classList.toggle('is-keyboard-passage',n===i));const p=this.passages[i];this.jump(this.makeReadingAnchor(p.start,p.end));}
  private moveAnnotation(step:number){const items=[...this.data.threads.filter(t=>!t.removed).map(t=>({id:t.id,anchor:t.anchor})),...this.data.highlights.filter(h=>!h.removed).map(h=>({id:h.id,anchor:h.anchor}))].sort((a,b)=>(a.anchor?.pdfPage||0)-(b.anchor?.pdfPage||0)||(a.anchor?.start||0)-(b.anchor?.start||0));if(!items.length)return;const at=items.findIndex(item=>item.id===(this.activeThread||this.activeHighlight)),index=at<0?(step>0?0:items.length-1):(at+step+items.length)%items.length;this.revealSaved(items[index].id);}
  private showKeys(){const modal=new Modal(this.app);modal.setTitle('快捷键');modal.modalEl.addClass('gloss-keys-modal');modal.contentEl.addClass('gloss-keys');const theme=this.root.dataset.theme;if(theme)modal.modalEl.dataset.theme=theme;const palette=getComputedStyle(this.root);for(const key of ['--bg-raised','--ink','--ink-3','--rule'])modal.modalEl.style.setProperty(key,palette.getPropertyValue(key));
    for(const [keys,description] of [['选择文字后输入','询问选中文本'],['/','新建文档问题'],['J  K','下一段 / 上一段'],['Enter','询问当前段落'],['[  ]','上一条 / 下一条批注'],['B','文章解读 · Markdown / EPUB'],['N','笔记本'],['F','进入 / 退出沉浸阅读'],['Esc','关闭或返回'],['?','快捷键列表']]){const row=modal.contentEl.createDiv({cls:'gloss-key-row'}),key=row.createSpan();for(const k of keys.split('  '))key.createEl('kbd',{text:k});row.createSpan({text:description});}modal.open();}

  private scopeLabel(){return this.readingScope==='rag'?'整书检索':this.readingScope==='page'?'当前页':this.readingScope==='whole'?'全文':this.selected?'选中文本及附近':this.pdf?'当前页':'全文';}
  private chooseReadingScope(){
    if(this.aborter||this.retrievalJob)return;const modal=new Modal(this.app);modal.setTitle('问答范围');modal.contentEl.addClass('gr-scope-modal');
    const choices:[typeof this.readingScope,string,string][]=[['selection','选中文本及附近','只阅读选中文本和相邻段落'],...(this.pdf?[['page','当前页','使用当前 PDF 页文字'] as [typeof this.readingScope,string,string]]:[['whole','当前文档全文','使用全文，超过上下文上限时提示'] as [typeof this.readingScope,string,string]]),['rag','整书检索','按问题查找本书原文，回答带来源']];
    for(const [scope,label,desc]of choices){const b=button(modal.contentEl,'',()=>{this.readingScope=scope;this.activeThread=undefined;this.refreshSettings();modal.close();},'gr-scope-choice');b.createSpan({text:label});b.createSpan({text:desc});b.classList.toggle('is-selected',scope===this.readingScope);}
    button(modal.contentEl,'管理本书索引',()=>{modal.close();return this.showBookIndex();},'gr-settings-button');modal.open();
  }
  private stamp(){const f=this.app.vault.getAbstractFileByPath(this.path);if(!(f instanceof TFile)||blockedPath(this.path))throw new Error('当前文档不可用于检索。');return{path:f.path,mtime:f.stat.mtime,size:f.stat.size};}
  private async indexSections(signal:AbortSignal,status:(text:string)=>void):Promise<{sections:SourceSection[];skipped:number}>{
    const sections:SourceSection[]=[];let skipped=0;
    if(this.pdf){const doc=(this.pdfSource?.leaf.view as any)?.viewer?.child?.pdfViewer?.pdfViewer?.pdfDocument;if(!doc)throw new Error('PDF 尚未加载完成，请稍后再试。');if(doc.numPages>3000)throw new Error('本版索引最多支持 3,000 页。');let chars=0;for(let n=1;n<=doc.numPages;n++){if(signal.aborted)throw new Error('已停止');status('读取原文 · '+n+' / '+doc.numPages+' 页');const page=await doc.getPage(n),content=await page.getTextContent(),texts=content.items.filter((i:any)=>typeof i.str==='string'&&i.str.trim()).map((i:any)=>i.str);const text=indexPassages(texts).text;chars+=text.length;if(chars>5_000_000)throw new Error('本书超过 500 万字符，请按章节处理。');if(text.trim())sections.push({text,label:'PDF 第 '+n+' 页',pdfPage:n});else skipped++;await new Promise(r=>setTimeout(r,0));}}
    else{let current:SourceSection|undefined;for(const p of this.passages){const label=p.source||'当前文档';if(!current||current.label!==label){current={text:p.text,label,offset:p.start};sections.push(current);}else current.text+='\n\n'+p.text;}}
    return{sections,skipped};
  }

  cancelIndex(){this.indexJob?.abort();}
  private updateIndexStatus(text=this.indexStatus){this.indexStatus=text;const label=this.indexButton?.querySelector('.gloss-index-label');if(label)label.textContent=this.indexJob?'索引中…':this.indexReady?'已索引':'索引';this.indexButton?.setAttribute('title',text||'本书检索索引');this.indexButton?.setAttribute('aria-busy',String(!!this.indexJob));for(const refresh of this.indexListeners)refresh();}
  private async maybeAutoIndex(){
    if(!this.article?.isConnected||!this.path||!this.focus||this.plugin.unloading)return;const prefs=this.plugin.store.settings.embedding;if(!prefs.autoIndex){this.indexAttempt='';if(this.indexAutomatic)this.cancelIndex();}
    let connection:ReturnType<GlossPlugin['embeddingConnection']>;try{connection=this.plugin.embeddingConnection();}catch{this.indexReady=false;if(this.indexAutomatic)this.cancelIndex();this.updateIndexStatus('先选择嵌入模型');return;}
    const identity=embeddingIdentity(connection.settings);if(this.indexJob){if(this.indexConnection!==identity)this.cancelIndex();return;}
    const stamp=this.stamp(),revision=this.revision,attempt=JSON.stringify([stamp,identity]);try{const cached=await this.plugin.indexCache.load(stamp.path);if(revision!==this.revision||!this.focus||this.plugin.unloading)return;const current=this.plugin.embeddingConnection();if(embeddingIdentity(current.settings)!==identity)return;this.indexReady=!!cached&&usableIndex(cached,stamp,current.settings);this.updateIndexStatus(this.indexReady?'索引可用 · '+cached!.chunks.length+' 个片段':'尚未建立或需要更新索引');if(this.indexReady||!this.plugin.store.settings.embedding.autoIndex||this.indexAttempt===attempt||this.indexJob||this.aborter||this.retrievalJob)return;if(this.pdf&&!this.pdf.loaded)return;this.indexAttempt=attempt;await this.buildBookIndex(true);}catch(e){if(revision===this.revision){this.indexAttempt=attempt;this.updateIndexStatus((e as Error).message);if(!/已停止|已切换/.test((e as Error).message))new Notice('自动索引未完成：'+(e as Error).message);}}
  }
  private async buildBookIndex(automatic=false){
    if(this.indexJob)throw new Error('本书索引正在建立。');const path=this.path,stamp=this.stamp(),connection=this.plugin.embeddingConnection(),settings={...connection.settings},controller=new AbortController();this.indexJob=controller;this.indexAutomatic=automatic;this.indexConnection=embeddingIdentity(settings);this.indexAttempt=JSON.stringify([stamp,this.indexConnection]);this.indexReady=false;this.updateIndexStatus('正在读取本书原文…');
    try{const {sections,skipped}=await this.indexSections(controller.signal,t=>this.updateIndexStatus(t));if(path!==this.path)throw new Error('已切换文档，索引已停止。');this.updateIndexStatus('正在生成嵌入向量…');const result=await createBookIndex(stamp,sections,settings,connection.key,controller.signal,(done,total)=>this.updateIndexStatus('建立索引 · '+done+' / '+total),skipped);if(controller.signal.aborted)throw new Error('已停止');const current=this.stamp(),selected=this.plugin.embeddingConnection();if(current.path!==path||current.mtime!==stamp.mtime||current.size!==stamp.size||embeddingIdentity(selected.settings)!==embeddingIdentity(settings))throw new Error('文档或模型配置已变化，请重新建立索引。');await this.plugin.indexCache.save(result);this.indexReady=true;this.updateIndexStatus('索引可用 · '+result.chunks.length+' 个片段');return result;}catch(e){if(path===this.path)this.updateIndexStatus((e as Error).message);throw e;}finally{if(this.indexJob===controller){this.indexJob=undefined;this.indexAutomatic=false;this.updateIndexStatus();try{if(this.path!==path||embeddingIdentity(this.plugin.embeddingConnection().settings)!==embeddingIdentity(settings))void this.maybeAutoIndex();}catch{}}}
  }
  async showBookIndex(){
    const path=this.path,stamp=this.stamp(),modal=new Modal(this.app);modal.setTitle('本书检索');modal.contentEl.addClass('gr-index-modal');modal.contentEl.createDiv({cls:'gr-index-title',text:path.split('/').pop()||''});const status=modal.contentEl.createDiv({cls:'gr-index-status',attr:{role:'status'}}),detail=modal.contentEl.createDiv({cls:'gr-settings-description'}),note=modal.contentEl.createDiv({cls:'gr-index-notice'}),actions=modal.contentEl.createDiv({cls:'gr-settings-footer'});let index:BookIndex|null=null,initiatedHere=false,buildError='';try{index=await this.plugin.indexCache.load(path);}catch(e){this.indexStatus=(e as Error).message;}
    const stop=button(actions,'停止',()=>this.cancelIndex(),'gr-settings-button'),build=button(actions,'建立索引',async()=>{try{this.plugin.embeddingConnection();}catch{(this.app as any).setting.open();(this.app as any).setting.openTabById(this.plugin.manifest.id);return;}initiatedHere=true;buildError='';try{index=await this.buildBookIndex()||null;}catch(e){buildError=(e as Error).message;}finally{initiatedHere=false;draw();}},'gr-settings-button is-primary'),remove=button(actions,'清除本书索引',async()=>{await this.plugin.indexCache.remove(path);index=null;this.indexReady=false;this.updateIndexStatus('本书索引已清除');draw();},'gr-settings-button');
    const draw=()=>{const busy=!!this.indexJob;let connection:ReturnType<GlossPlugin['embeddingConnection']>|undefined;try{connection=this.plugin.embeddingConnection();}catch{}stop.hidden=!busy;build.disabled=busy;remove.disabled=busy||!index;build.textContent=!connection?'选择嵌入模型':index?'重新建立索引':'建立索引';status.textContent=busy?this.indexStatus:buildError?buildError:index&&connection?(usableIndex(index,stamp,connection.settings)?'索引可用 · '+index.chunks.length+' 个片段':'索引已过期，请重新建立'):this.indexStatus||'尚未建立索引';detail.textContent=index?'Embedding · '+index.model+(index.inputTokens!==undefined?' · '+index.inputTokens.toLocaleString()+' tokens':'')+(index.skippedPages?' · '+index.skippedPages+' 页没有文字，未索引':''):'仅处理当前书籍，索引保存在本地。';note.textContent=connection?'本书文字将发送至 '+connection.service.name+'，使用 '+connection.settings.model+'。':'在模型服务中添加并标记嵌入模型，在下方嵌入选择。';};
    button(actions,'整书提问',()=>{this.readingScope='rag';this.selected=undefined;modal.close();this.toggleComposer(true);},'gr-settings-button');
    let updating=false;const refresh=()=>{draw();if(!this.indexJob&&!updating){updating=true;void this.plugin.indexCache.load(path).then(value=>{index=value;draw();}).catch(()=>{}).finally(()=>updating=false);}};this.indexListeners.add(refresh);const priorClose=modal.onClose.bind(modal);modal.onClose=()=>{this.indexListeners.delete(refresh);if(initiatedHere)this.cancelIndex();priorClose();};draw();modal.open();
  }
  private syncComposerBusy(){if(this.sendButton)this.sendButton.disabled=!!this.aborter||!!this.retrievalJob;if(this.composer)this.composer.disabled=false;}
  private setAnswerStage(text:string){this.answerStage=text;this.margin?.querySelectorAll<HTMLElement>('.gloss-answer-stage').forEach(el=>el.textContent=text);}
  private async prepareQuestionContext(question:string,target:Thread|undefined,forceWhole:boolean,regenerate:boolean,anchor?:Anchor,scope=this.readingScope):Promise<{context:string;citations:Record<string,Anchor>;info?:ContextInfo}>{
    const legacyPage=!!this.pdf&&target?.selection===false&&target.contextInfo?.label.startsWith('当前页');
    if(regenerate&&target?.context&&!legacyPage)return{context:target.context,citations:target.citations||{},info:target.contextInfo};
    const selected=forceWhole?undefined:anchor;
    const rag=!selected&&(scope==='rag'||this.indexReady);
    if(rag){const stamp=this.stamp(),connection=this.plugin.embeddingConnection(),settings={...connection.settings};const index=await this.plugin.indexCache.load(this.path);if(!index||!usableIndex(index,stamp,settings))throw new Error('本书索引尚未就绪或已过期，请重新建立索引。');
      const controller=this.aborter||new AbortController();this.retrievalJob=controller;this.setAnswerStage('正在检索全书…');this.syncComposerBusy();
      try{const result=await embedTexts(settings,connection.key,[question.slice(0,3500)],controller.signal);if(controller.signal.aborted)throw new Error('已停止');if(!usableIndex(index,this.stamp(),this.plugin.embeddingConnection().settings))throw new Error('检索期间文档或模型已变化，请重试。');const hits=retrieve(index,question,result.vectors[0],settings.topK),bundle=retrievalContext(hits,Math.min(this.plugin.store.settings.maxContext,16000)-160);return{...bundle,info:{label:'整书检索 · '+bundle.sources.length+' 处原文'+(index.skippedPages?' · 有 '+index.skippedPages+' 页未索引':''),embeddingModel:index.model,inputTokens:result.inputTokens,sources:bundle.sources}};}finally{if(this.retrievalJob===controller)this.retrievalJob=undefined;this.syncComposerBusy();}
    }
    if(!selected){
      if(this.pdf){const controller=this.aborter||new AbortController(),stamp=JSON.stringify(this.stamp());this.setAnswerStage('正在读取全书文字…');let book=this.wholeBookCache;if(!book||book.stamp!==stamp){const result=await this.indexSections(controller.signal,text=>this.setAnswerStage(text));if(controller.signal.aborted)throw new Error('已停止');book={stamp,...result};this.wholeBookCache=book;}if(controller.signal.aborted)throw new Error('已停止');const result=wholeDocumentContext(book.sections,question,Math.max(1000,this.plugin.store.settings.maxContext-(this.plugin.store.settings.webSearch?8000:1000)));if(book.skipped)result.info.label+=' · '+book.skipped+' 页无文字';return result;}
      try{const context=contextFor(this.passages,undefined,this.text,true,this.plugin.store.settings.maxContext-(this.plugin.store.settings.webSearch?8000:1000)),citations:Record<string,Anchor>={};for(const p of this.passages)citations[String(p.number)]=this.makeReadingAnchor(p.start,p.end);return{context:'本轮针对整篇文档提问，没有选中文本。\n\n'+context,citations,info:{label:'整篇文档 · 全文',sources:[]}};}catch(e){if(!String(e).includes('超过'))throw e;const book=await this.indexSections(this.aborter!.signal,()=>{});return wholeDocumentContext(book.sections,question,Math.max(1000,this.plugin.store.settings.maxContext-(this.plugin.store.settings.webSearch?8000:1000)));}
    }
    const context=contextFor(this.passages,selected,this.text,false,this.plugin.store.settings.maxContext),citations:Record<string,Anchor>={};for(const p of this.passages)if(context.includes(`[¶${p.number}] `))citations[String(p.number)]=this.makeReadingAnchor(p.start,p.end);return{context,citations,info:{label:'选中文本及附近'+(this.pdf?' · PDF 第 '+selected.pdfPage+' 页':''),sources:[]}};
  }

  private resizeQuestion(){if(!this.composer)return;this.composer.style.height='36px';}
  private paintWebButton(){if(!this.webButton)return;const enabled=this.plugin.store.settings.webSearch;this.webButton.setAttribute('aria-label','网络搜索');this.webButton.setAttribute('aria-pressed',String(enabled));this.webButton.classList.toggle('is-active',enabled);this.webButton.disabled=!!this.aborter||!!this.retrievalJob;this.webButton.title=enabled?'已启用 · 向 DuckDuckGo 发送检索关键词':'启用网络搜索';}
  private cancelSuggestions(){this.suggestionJob?.abort();this.suggestionJob=undefined;if(this.suggestionHost)this.suggestionHost.hidden=true;}
  private syncSuggestionVisibility(){if(this.suggestionHost)this.suggestionHost.hidden=!this.plugin.store.settings.questionSuggestions||this.composerWrap.hidden||!!this.composer.value.trim()||!!this.aborter||!!this.retrievalJob||!this.suggestionHost.childElementCount;}
  private async generateSuggestions(force=false){
    if(!this.plugin.store.settings.questionSuggestions||this.composerWrap.hidden||this.composer.value.trim()||this.aborter||this.retrievalJob||!this.focus||blockedPath(this.path))return;let settings:Settings;try{settings=this.modelSettings();}catch{return;}const source=(this.selected?.quote||this.text).slice(0,4500),last=this.threads.find(t=>t.id===this.activeThread)?.messages.filter(m=>m.role==='assistant').at(-1)?.content.slice(0,1200)||'';if(!source.trim())return;const key=briefHash(JSON.stringify([this.path,this.pdf?.page,source,last,settings.serviceId,modelId(settings)]));if(this.suggestionJob&&this.suggestionKey===key&&!force)return;this.cancelSuggestions();this.suggestionKey=key;const host=this.suggestionHost!;
    const draw=(questions:string[])=>{host.empty();const head=host.createDiv({cls:'gloss-suggestion-heading'});head.createSpan({text:'可以这样问'});this.iconButton(head,'refresh-cw','换一组问题',()=>this.generateSuggestions(true));for(const q of questions)button(host,q,()=>{this.composer.value=q;this.rememberDraft();this.resizeQuestion();this.syncSuggestionVisibility();this.focusInput(this.composer);},'gloss-suggestion-chip');this.syncSuggestionVisibility();};const cached=this.suggestionCache.get(key);if(cached&&!force){draw(cached);return;}const controller=this.suggestionJob=new AbortController(),revision=this.revision;host.empty();host.createDiv({cls:'gloss-suggestion-loading',text:'正在想几个问题…',attr:{role:'status'}});this.syncSuggestionVisibility();
    try{const answer=await askAgent({settings:{...settings,systemPrompt:QUESTION_SUGGESTION_PROMPT},context:source+(last?'\n已讨论的回答：\n'+last:''),messages:[{role:'user',content:QUESTION_SUGGESTION_PROMPT}],signal:controller.signal,onText:()=>{}});if(controller.signal.aborted||revision!==this.revision||this.suggestionKey!==key)return;const questions=parseQuestionSuggestions(answer);this.suggestionCache.set(key,questions);if(this.suggestionCache.size>24)this.suggestionCache.delete(this.suggestionCache.keys().next().value!);draw(questions);}catch(e){if(controller.signal.aborted||revision!==this.revision)return;host.empty();const retry=button(host,'问题建议暂不可用 · 点击重试',()=>this.generateSuggestions(true),'gloss-suggestion-chip');retry.title=(e as Error).message;this.syncSuggestionVisibility();}finally{if(this.suggestionJob===controller)this.suggestionJob=undefined;}
  }
  private async searchForAnswer(question:string,settings:Settings,anchor?:Anchor):Promise<WebReceipt>{
    this.webError='';const controller=this.retrievalJob=this.aborter||new AbortController();this.paintWebButton();this.syncComposerBusy();this.setAnswerStage('正在搜索网络…');
    try{const quote=anchor?.quote.slice(0,240)||'',file=this.app.vault.getAbstractFileByPath(this.path),fm=file instanceof TFile?this.app.metadataCache.getFileCache(file)?.frontmatter:undefined;this.setAnswerStage('正在整理搜索问题…');const planned=await askAgent({settings:{...settings,systemPrompt:SEARCH_QUERY_PROMPT},context:JSON.stringify({title:this.page.querySelector('.gloss-document-title')?.textContent||this.path.split('/').pop(),author:fm?.author||'',selection:quote}),messages:[{role:'user',content:question}],signal:controller.signal,onText:()=>{}}),query=parseSearchQuery(planned);this.setAnswerStage('正在搜索网络…');return await networkSearch(query,controller.signal,async url=>{const result=await requestUrl({url,method:'GET',headers:{'User-Agent':'Mozilla/5.0',Accept:'text/html'},throw:false});if(result.status<200||result.status>=300)throw new Error('网络请求失败。');return result.text;});}catch(e){this.webError=(e as Error).message;throw e;}finally{if(this.retrievalJob===controller){this.retrievalJob=undefined;this.syncComposerBusy();this.paintWebButton();this.updateContext();}}
  }
  private async translateSelection(regenerate?:Thread){
    if(this.aborter||this.retrievalJob)return;const anchor=regenerate?.anchor||this.selected;if(!anchor||!anchor.quote.trim())throw new Error('请先选择需要翻译的文字。');if(blockedPath(this.path)||!(this.app.vault.getAbstractFileByPath(this.path)instanceof TFile))throw new Error('当前文档不能用于翻译。');const path=this.path,data=this.data,controller=new AbortController(),prior=regenerate?.messages;
    const target=regenerate?.translationTarget||this.plugin.store.settings.translationTarget;const thread:Thread=regenerate||{id:uid(),commandId:'translate',label:'翻译',anchor:{...anchor},selection:true,created:Date.now(),messages:[{role:'user' as const,content:'翻译这段选中文本'}],context:anchor.quote,citations:{}};if(!regenerate)data.threads.push(thread);const response:Message={role:'assistant',content:'',provider:'Google Translate',model:'Google Translate'};thread.messages=[...(regenerate?regenerationHistory(thread):thread.messages),response];delete thread.error;this.activeThread=thread.id;this.selected=undefined;this.aborter=controller;this.runningThread=thread.id;this.closeLens();this.composer.value='';data.draft='';this.toggleComposer(true);this.syncComposerBusy();this.paintHighlights();this.updateContext();
    try{await this.plugin.persist();await this.renderMargin();const result=await googleTranslate(anchor.quote,target,controller.signal,async(url,signal)=>{if(signal.aborted)throw new Error('已停止');const res=await requestUrl({url,method:'GET',throw:false});if([429,503].includes(res.status))throw new Error('谷歌翻译请求过于频繁，请稍后重试。');if(res.status<200||res.status>=300)throw new Error('谷歌翻译连接失败。');return res.json;});response.content=result.text;response.model='Google Translate · '+TRANSLATION_LANGUAGES[result.target];thread.translationTarget=result.target;}catch(e){if(controller.signal.aborted){thread.interrupted=true;delete thread.error;}else thread.error=(e as Error).message;if(prior){thread.messages=prior;if(thread.error)thread.error+='（已保留原译文）';}else if(!response.content)thread.messages.pop();}finally{data.updated=Date.now();try{await this.plugin.persist();}catch(e){showError(e);}if(this.aborter===controller){this.aborter=undefined;this.runningThread=undefined;this.paintWebButton();if(this.path===path&&this.root.isConnected){this.syncComposerBusy();this.refreshModelButtons();await this.renderMargin();}}}
  }
  async send(override?:string,forceWhole=false,task='default',regenerate?:Thread,followup?:Thread){
    this.closeModelMenu();if(this.aborter||this.retrievalJob)return;
    const question=(regenerate?regenerationHistory(regenerate).at(-1)!.content:override??this.composer.value).trim();if(!question){this.toggleComposer(true);return;}
    if(followup?.removed)throw new Error('这条问答已删除。');if(blockedPath(this.path))throw new Error('此文档不能发送给模型。');if(!(this.app.vault.getAbstractFileByPath(this.path)instanceof TFile))throw new Error('原文已移除。');
    const path=this.path,data=this.data,settings=regenerate||followup?this.regenerationSettings((regenerate||followup)!):this.modelSettings(task),legacyPage=!!this.pdf&&regenerate?.selection===false&&regenerate.contextInfo?.label.startsWith('当前页'),submittedAnchor=followup?(followup.selection===false?undefined:followup.anchor):forceWhole||legacyPage?undefined:regenerate?(regenerate.selection===false?undefined:regenerate.anchor):this.selected?{...this.selected}:undefined,scope=this.readingScope;
    const thread:Thread=regenerate||followup||{id:uid(),commandId:task,label:task==='summary'?'总结':settings.commands.find(c=>c.id===task)?.name||'提问',anchor:submittedAnchor,selection:!!submittedAnchor,messages:[{role:'user',content:question}],created:Date.now()};
    const previous=regenerate?thread.messages:undefined,previousState=regenerate?{context:thread.context,citations:thread.citations,contextInfo:thread.contextInfo,anchor:thread.anchor,selection:thread.selection}:undefined,previousWeb=(previous||followup?.messages)?.filter(m=>m.role==='assistant').at(-1)?.web,history=regenerate?regenerationHistory(thread):followup?followupHistory(thread,question):thread.messages.map(m=>({...m})),response:Message={role:'assistant',content:'',provider:settings.serviceName||settings.provider,model:modelId(settings),serviceId:settings.serviceId};
    if(!regenerate&&!followup)data.threads.push(thread);thread.messages=[...history,response];delete thread.error;delete thread.interrupted;if(followup)thread.followupDraft='';this.activeThread=thread.id;this.activeHighlight=undefined;
    const controller=new AbortController();this.aborter=controller;this.runningThread=thread.id;this.setAnswerStage('正在准备原文…');this.cancelSuggestions();this.webError='';
    if(!regenerate&&!followup){this.referenceFocus=undefined;this.hoverThread=undefined;data.draft='';this.composer.value='';this.selected=undefined;this.article.ownerDocument.getSelection()?.removeAllRanges();this.closeLens();}
    this.composerWrap.hidden=false;this.questionButton.setAttribute('aria-expanded','true');this.questionButton.toggleClass('is-active',true);this.syncComposerBusy();this.refreshModelButtons();this.paintWebButton();this.paintHighlights();this.updateContext();if(this.narrow){this.notebookOpen=true;this.drawer.hidden=false;}
    try{
      await this.plugin.persist();await this.renderMargin();
      const bundle=followup?.context?{context:followup.context,citations:followup.citations||{},info:followup.contextInfo}:task==='translate'&&submittedAnchor&&!regenerate?{context:'仅翻译以下选中文本：\n'+submittedAnchor.quote,citations:{} as Record<string,Anchor>,info:{label:'选中文本翻译',sources:[]}}:await this.prepareQuestionContext(question,regenerate,forceWhole,!!regenerate,submittedAnchor,scope);
      if(controller.signal.aborted||path!==this.path)throw new Error('已停止');let context=bundle.context;let web=previousWeb;
      if(!regenerate&&!followup&&task!=='translate'&&settings.webSearch){web=await this.searchForAnswer(question,settings,submittedAnchor);if(controller.signal.aborted||path!==this.path)throw new Error('已停止');context+=webContext(web);}
      if(context.length+history.reduce((n,m)=>n+m.content.length,0)>settings.maxContext)throw new Error('本轮原文与对话超过上下文上限，请新建问题或提高上限。');if(web)settings.systemPrompt=webSystemPrompt(settings.systemPrompt||SYSTEM);
      response.web=web;thread.context=context;thread.citations=bundle.citations;thread.contextInfo=bundle.info;if(legacyPage){delete thread.anchor;thread.selection=false;}
      this.setAnswerStage('正在回答…');await this.renderMargin();
      response.content=await askAgent({settings,context,quote:submittedAnchor?.quote,messages:history,signal:controller.signal,onUsage:usage=>{response.usage=usage;},onText:text=>{response.content=text;if(this.path!==path||this.aborter!==controller)return;clearTimeout(this.renderTimer);this.renderTimer=setTimeout(()=>void this.renderMargin().catch(showError),100);}});
    }catch(e){if(controller.signal.aborted){thread.interrupted=true;delete thread.error;}else thread.error=e instanceof Error?e.message:'回答失败，请重试。';if(previous){thread.messages=previous;Object.assign(thread,previousState);if(thread.error)thread.error+='（已保留原回答）';}else if(!response.content)thread.messages.pop();}
    finally{clearTimeout(this.renderTimer);data.updated=Date.now();if(this.aborter===controller){this.aborter=undefined;this.runningThread=undefined;this.answerStage='';}try{await this.plugin.persist();}catch(e){showError(e);}if(this.path===path&&this.root.isConnected){this.syncComposerBusy();this.refreshModelButtons();this.paintWebButton();this.fresh=undefined;this.renderBrief();this.paintHighlights();await this.renderMargin();if(task!=='translate'&&!thread.error&&!this.composerWrap.hidden)void this.generateSuggestions();}}
  }
  stop(){this.cancelSuggestions();this.retrievalJob?.abort();this.aborter?.abort();}
  private async exportNotes(){const data=this.data;if(!data.highlights.some(h=>!h.removed)&&!data.threads.some(t=>!t.removed)){new Notice('先留下一条划线、批注或对话。');return;}const folder='收集箱';if(!this.app.vault.getAbstractFileByPath(folder))await this.app.vault.createFolder(folder);const title=this.path.split('/').pop()!.replace(/\.md$/,'').replace(/[\\/:*?"<>|\[\]#^]/g,'-'),stamp=new Date().toISOString().replace(/[:.]/g,'-');let path=normalizePath(`${folder}/${title}-阅读笔记-${stamp}.md`);if(this.app.vault.getAbstractFileByPath(path))path=normalizePath(`${folder}/${title}-阅读笔记-${stamp}-${uid().slice(0,6)}.md`);await this.app.vault.create(path,exportReading(this.path,data,this.app.vault.getName()));new Notice('阅读笔记已保存到 '+path);}
  async onClose(){this.indexJob?.abort();this.retrievalJob?.abort();this.importAborter?.abort();this.pdf?.destroy();this.releasePdfSource();this.bookUrls.forEach(url=>URL.revokeObjectURL(url));this.releaseChrome();this.notebookRender?.unload();this.revision++;this.stop();this.resizeObserver?.disconnect();this.marginObserver?.disconnect();cancelAnimationFrame(this.frame);cancelAnimationFrame(this.leaderFrame);clearTimeout(this.progressTimer);clearTimeout(this.draftTimer);clearTimeout(this.renderTimer);clearTimeout(this.reloadTimer);this.closeModelMenu();this.clearSelectionPreview();this.clearReferencePreview();clearTimeout(this.railTimer);this.root?.remove();await this.flushDraft();}
}

type ModelChoice=ReturnType<typeof serviceChoices>[number];
class ModelAssignmentPicker extends FuzzySuggestModal<ModelChoice|null>{
  constructor(app:App,private setup:ModelSetup,private inherit:boolean,private pick:(ref:ModelRef|null)=>Promise<void>,private current?:ModelRef|null,private modelType:ModelType='chat'){super(app);this.setPlaceholder(modelType==='embedding'?'选择已添加的嵌入模型…':'搜索服务或模型…');}
  getItems(){return this.inherit?[null,...serviceChoices(this.setup,this.modelType)]:serviceChoices(this.setup,this.modelType);}
  getItemText(item:ModelChoice|null){return item?item.name+' '+item.serviceName+' '+item.id:'默认';}
  renderSuggestion(result:any,el:HTMLElement){const item=result.item as ModelChoice|null;el.addClass('gr-model-suggestion');const copy=el.createDiv();copy.createDiv({cls:'gr-model-name',text:item?.name||'默认'});copy.createDiv({cls:'gr-model-id',text:item?item.serviceName+' · '+item.id:'使用默认问答中指定的服务与模型'});if(item?this.current?.serviceId===item.serviceId&&this.current.modelId===item.id:!this.current)setIcon(el.createSpan({cls:'gr-model-suggestion-check'}),'check');}
  onChooseItem(item:ModelChoice|null){void this.pick(item?{serviceId:item.serviceId,modelId:item.id}:null).catch(showError);}
}

class GlossSettings extends PluginSettingTab {
  tab='reading';
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
    for(const[key,label,icon]of [['reading','外观配置','book-open'],['models','模型服务','plug'],['commands','指令配置','wand-sparkles']]){
      const b=button(tabs,'',()=>{this.tab=key;this.display();},'gr-settings-tab');const mark=b.createSpan();setIcon(mark,icon);b.createSpan({text:label});b.classList.toggle('is-active',this.tab===key);b.setAttribute('role','tab');b.setAttribute('aria-selected',String(this.tab===key));b.id='gr-tab-'+key;b.setAttribute('aria-controls','gr-settings-panel');
    }
    const body=el.createDiv({cls:'gr-settings-body',attr:{id:'gr-settings-panel',role:'tabpanel','aria-labelledby':'gr-tab-'+this.tab}});
    let group=body;const section=(title:string)=>{const card=body.createEl('section',{cls:'gr-settings-group'});card.createEl('h3',{cls:'gr-settings-section',text:title});group=card.createDiv({cls:'gr-settings-group-body'});return group;};
    const row=(label:string,description='')=>{const r=group.createDiv({cls:'gr-settings-row'}),info=r.createDiv({cls:'gr-settings-info'});info.createDiv({cls:'gr-settings-label',text:label});if(description)info.createDiv({cls:'gr-settings-description',text:description});return r.createDiv({cls:'gr-settings-controls'});};
    const select=(label:string,description:string,value:string,options:Record<string,string>,change:(v:string)=>void)=>{const d=row(label,description).createEl('select',{cls:'gr-settings-input',attr:{'aria-label':label}});for(const[k,t]of Object.entries(options))d.createEl('option',{value:k,text:t});d.value=value;d.onchange=()=>{change(d.value);void this.save().catch(showError);};};
    const input=(label:string,desc:string,value:string,placeholder:string,change:(v:string)=>void,type='text')=>{const t=row(label,desc).createEl('input',{cls:'gr-settings-input',attr:{'aria-label':label,type,placeholder}});t.value=value;t.autocomplete='off';t.spellcheck=false;t.onchange=()=>{change(t.value.trim());void this.save().catch(showError);};return t;};
    if(this.tab==='models'){
      this.renderModelsPage(body);this.renderIndexSettings(body);
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
      section('问答');new ToggleComponent(row('问题建议')).setTooltip('问题建议').setValue(s.questionSuggestions).onChange(async value=>{s.questionSuggestions=value;await this.save();});
      section('问答范围');select('新问题默认范围','',s.context,{nearby:'选中文本及相邻段落',whole:'当前文档全文'},v=>s.context=v);
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
    for(const model of service.models){const row=list.createDiv({cls:'gr-saved-model'});setIcon(row.createSpan({cls:'gr-saved-model-icon'}),'box');const copy=row.createDiv({cls:'gr-saved-model-copy'});copy.createSpan({cls:'gr-model-name',text:model.name});copy.createSpan({cls:'gr-model-id',text:model.id+' · '+(model.type==='embedding'?'嵌入':'聊天')});const uses=Object.entries(s.taskModels).filter(([key,ref])=>(key!=='translate'||s.translationEngine==='model')&&ref?.serviceId===service.id&&ref.modelId===model.id).map(([key])=>({default:'问答',translate:'翻译',summary:'总结',embedding:'嵌入'}[key]||s.commands.find(c=>c.id===key)?.name||'指令'));if(uses.length)row.createSpan({cls:'gr-model-use-badge',text:uses.join(' · ')});this.settingsIcon(row,'pencil','编辑模型 '+model.name,()=>this.renameServiceModel(service,model));this.settingsIcon(row,'x','移除 '+model.name,async()=>{service.models=service.models.filter(m=>m.id!==model.id);pruneAssignments(s);await this.save();this.display();});}
    const footer=panel.createDiv({cls:'gr-service-model-footer'});button(footer,'手动添加模型',()=>this.manageServiceModels(service,false),'gr-settings-button gr-ghost');
  }
  private renderIndexSettings(body:HTMLElement){
    const s=this.plugin.store.settings,e=s.embedding,section=body.createEl('section',{cls:'gr-settings-group gr-index-settings'});section.style.marginTop='28px';section.createEl('h3',{cls:'gr-settings-section',text:'嵌入'});const group=section.createDiv({cls:'gr-settings-group-body'});
    const row=(label:string)=>{const r=group.createDiv({cls:'gr-settings-row'}),info=r.createDiv({cls:'gr-settings-info'});info.createDiv({cls:'gr-settings-label',text:label});return r.createDiv({cls:'gr-settings-controls'});};
    const model=row('索引模型').createEl('select',{cls:'gr-settings-input',attr:{'aria-label':'索引模型'}}),choices=serviceChoices(s,'embedding');model.createEl('option',{value:'',text:''});for(const choice of choices)model.createEl('option',{value:JSON.stringify([choice.serviceId,choice.id]),text:choice.serviceName+' · '+choice.name});const ref=s.taskModels.embedding;model.value=ref?JSON.stringify([ref.serviceId,ref.modelId]):'';model.onchange=()=>{if(model.value){const [serviceId,modelId]=JSON.parse(model.value);s.taskModels.embedding={serviceId,modelId};}else delete s.taskModels.embedding;void this.save().then(()=>this.display()).catch(showError);};
    const auto=new ToggleComponent(row('自动建立索引'));auto.setValue(e.autoIndex).onChange(value=>{e.autoIndex=value;void this.save().catch(showError);});auto.toggleEl.setAttribute('aria-label','自动建立索引');
    const top=row('参考片段').createEl('select',{cls:'gr-settings-input',attr:{'aria-label':'参考片段'}});for(const count of [4,6,8,12])top.createEl('option',{value:String(count),text:count+' 处'});top.value=String(e.topK);top.onchange=()=>{e.topK=Number(top.value);void this.save().catch(showError);};
    const test=button(row('连接'),'测试连接',async()=>{test.disabled=true;const controller=this.test=new AbortController();try{const connection=this.plugin.embeddingConnection();await embedTexts(connection.settings,connection.key,['阅读检索连接测试'],controller.signal);if(!controller.signal.aborted)new Notice('嵌入模型连接成功');}finally{test.disabled=!s.taskModels.embedding;}},'gr-settings-button');test.disabled=!choices.some(c=>c.serviceId===ref?.serviceId&&c.id===ref?.modelId);
    section.createDiv({cls:'gr-settings-description',text:'自动索引仅处理当前沉浸阅读文档，文字会发送至所选服务。也可点击 PDF 或阅读顶部的索引按钮。'});
  }
  private settingsIcon(parent:HTMLElement,icon:string,label:string,action:()=>void|Promise<void>){const b=button(parent,'',action,'gr-settings-icon');setIcon(b,icon);const id='reader-label-'+uid();b.createSpan({cls:'gloss-sr-only',text:label,attr:{id}});b.setAttribute('aria-labelledby',id);return b;}
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
      save.disabled=true;const service:ModelService={...draft,kind,name:values.name,path:values.path,base:values.base,protocol:values.protocol};try{if(kind==='api')this.plugin.saveServiceKey(service.id,values.key);const s=this.plugin.store.settings;if(existing)s.services=s.services.map(item=>item.id===existing.id?service:item);else s.services.push(service);pruneAssignments(s);this.activeService=service.id;await this.save();modal.close();this.display();if(!existing)this.manageServiceModels(service,true);}catch(e){error.textContent=e instanceof Error?e.message:'保存失败';save.disabled=false;}},'gr-settings-button is-primary');modal.open();
  }
  private removeService(service:ModelService){const modal=new Modal(this.app);modal.setTitle('删除“'+service.name+'”？');modal.contentEl.addClass('gr-model-modal');const refs=Object.values(this.plugin.store.settings.taskModels).filter(ref=>ref?.serviceId===service.id).length;modal.contentEl.createEl('p',{text:'将移除该服务的 '+service.models.length+' 个模型'+(refs?'，并清除 '+refs+' 项模型分配':'')+'。已有阅读对话会保留。'});const footer=modal.contentEl.createDiv({cls:'gr-settings-footer'});button(footer,'取消',()=>modal.close(),'gr-settings-button');button(footer,'删除服务',async()=>{const s=this.plugin.store.settings;s.services=s.services.filter(item=>item.id!==service.id);pruneAssignments(s);this.plugin.saveServiceKey(service.id,'');await this.save();modal.close();this.display();},'gr-settings-button is-danger');modal.open();}
  private renameServiceModel(service:ModelService,model:ModelOption){const modal=new Modal(this.app);modal.setTitle('编辑模型');modal.contentEl.addClass('gr-model-modal');modal.contentEl.createEl('label',{text:'显示名称'});const field=modal.contentEl.createEl('input',{cls:'gr-settings-input',attr:{'aria-label':'模型显示名称',maxlength:'100'}});field.value=model.name;modal.contentEl.createEl('label',{text:'模型类型'});const type=modal.contentEl.createEl('select',{cls:'gr-settings-input',attr:{'aria-label':'模型类型'}});type.createEl('option',{value:'chat',text:'聊天模型'});type.createEl('option',{value:'embedding',text:'嵌入模型',attr:supportsEmbedding(service)?{}:{disabled:''}});type.value=model.type||'chat';if(!supportsEmbedding(service))modal.contentEl.createEl('p',{cls:'gr-settings-description',text:'嵌入类型需要 OpenAI 兼容 API 服务。'});const footer=modal.contentEl.createDiv({cls:'gr-settings-footer'});button(footer,'取消',()=>modal.close(),'gr-settings-button');button(footer,'保存',async()=>{setModelType(this.plugin.store.settings,service,model,type.value as ModelType);model.name=field.value.trim()||model.id;await this.save();modal.close();this.display();},'gr-settings-button is-primary');modal.open();field.focus();}
  private manageServiceModels(service:ModelService,fetchNow:boolean){
    const modal=new Modal(this.app);modal.setTitle(service.name+' · 添加模型');modal.contentEl.addClass('gr-model-modal');let controller:AbortController|undefined,closed=false;modal.onClose=()=>{closed=true;controller?.abort();};let available=service.models.map(m=>({...m})),selected=new Set(service.models.map(m=>m.id));
    const toolbar=modal.contentEl.createDiv({cls:'gr-model-toolbar'}),search=toolbar.createEl('input',{attr:{type:'search','aria-label':'搜索服务模型',placeholder:'搜索模型…'}}),fetch=button(toolbar,'获取模型',async()=>{controller?.abort();controller=new AbortController();const c=controller;fetch.disabled=true;status.textContent='正在获取…';try{const found=service.kind==='codex'?await discoverCodexModels():service.kind==='claude'?[{id:'sonnet',name:'Claude Sonnet'},{id:'opus',name:'Claude Opus'},{id:'haiku',name:'Claude Haiku'}]:service.kind==='pi'?await discoverPiModels(service.path,c.signal):await discoverApiModels(serviceSettings(service,'',this.plugin.serviceKey(service.id)),c.signal);if(c.signal.aborted||closed)return;available=mergeModels(available,found);status.textContent=service.kind==='claude'?'Claude CLI 常用别名；实际可用性由账户决定':found.length?'已获取 '+found.length+' 个模型':'暂无模型，可手动添加';draw();}catch(e){if(!c.signal.aborted&&!closed)status.textContent=e instanceof Error?e.message:'获取失败';}finally{fetch.disabled=false;}},'gr-settings-button');
    const status=modal.contentEl.createDiv({cls:'gr-settings-message',attr:{role:'status'}}),tools=modal.contentEl.createDiv({cls:'gr-model-selection-tools'}),count=tools.createSpan();button(tools,'全选当前结果',()=>{for(const m of matches())selected.add(m.id);draw();},'gr-settings-button gr-ghost');button(tools,'清空选择',()=>{selected.clear();draw();},'gr-settings-button gr-ghost');const list=modal.contentEl.createDiv({cls:'gr-model-browser'}),matches=()=>{const q=search.value.trim().toLowerCase();return available.filter(m=>(m.name+' '+m.id).toLowerCase().includes(q));};
    const draw=()=>{list.empty();count.textContent='已选 '+selected.size;for(const model of matches()){const row=list.createDiv({cls:'gr-model-browser-row'}),check=row.createEl('input',{attr:{type:'checkbox','aria-label':'添加模型 '+model.id}});check.checked=selected.has(model.id);check.onchange=()=>{if(check.checked)selected.add(model.id);else selected.delete(model.id);count.textContent='已选 '+selected.size;};const copy=row.createSpan({cls:'gr-model-choice-info'});copy.createSpan({cls:'gr-model-name',text:model.name});copy.createSpan({cls:'gr-model-id',text:model.id});if(supportsEmbedding(service)){const type=row.createEl('select',{cls:'gr-settings-input',attr:{'aria-label':'模型类型 '+model.id}});type.style.width='100px';type.style.flex='none';type.createEl('option',{value:'chat',text:'聊天'});type.createEl('option',{value:'embedding',text:'嵌入'});type.value=model.type||'chat';type.onchange=()=>model.type=type.value as ModelType;}}if(!matches().length)list.createDiv({cls:'gr-service-model-empty',text:'没有匹配的模型'});};search.oninput=draw;
    const manual=modal.contentEl.createDiv({cls:'gr-model-toolbar'}),id=manual.createEl('input',{attr:{'aria-label':'手动模型 ID',placeholder:service.kind==='pi'?'provider/model-id':'手动输入模型 ID'}});button(manual,'添加',()=>{const model=normalizeModels([id.value.trim()])[0];if(!model){status.textContent='请输入不含空格的模型 ID';return;}available=mergeModels(available,[model]);selected.add(model.id);id.value='';search.value='';draw();},'gr-settings-button');
    const footer=modal.contentEl.createDiv({cls:'gr-settings-footer'});button(footer,'取消',()=>modal.close(),'gr-settings-button');button(footer,'添加所选模型',async()=>{const s=this.plugin.store.settings;service.models=available.filter(m=>selected.has(m.id));pruneAssignments(s);await this.save();modal.close();this.display();},'gr-settings-button is-primary');modal.open();draw();if(fetchNow)fetch.click();else id.focus();
  }
  private modelLabel(ref:ModelRef|null|undefined){if(!ref)return'默认';const service=this.plugin.store.settings.services.find(s=>s.id===ref.serviceId),model=service?.models.find(m=>m.id===ref.modelId);return model?model.name:'重新选择模型';}
  private chooseTaskModel(task:string,done:()=>void){const s=this.plugin.store.settings;new ModelAssignmentPicker(this.app,s,task!=='default',async ref=>{if(ref)s.taskModels[task]=ref;else delete s.taskModels[task];await this.save();done();},s.taskModels[task]).open();}
  private renderCommands(body:HTMLElement){
    const s=this.plugin.store.settings;const base=body.createEl('section',{cls:'gr-settings-group'});base.createEl('h3',{cls:'gr-settings-section',text:'阅读提示词'});for(const [id,name,description]of [['default','默认问答','阅读提问与追问'],['summary','文章解读','全文概览、论点与段落地图']]){const row=base.createDiv({cls:'gr-command-row'}),copy=row.createDiv({cls:'gr-command-copy'});copy.createDiv({cls:'gr-settings-label',text:name});copy.createDiv({cls:'gr-command-preview',text:description+' · '+(s.taskModels[id]?this.modelLabel(s.taskModels[id]):id==='default'?'选择模型':'默认')});button(row,'编辑',()=>this.editCommand({id,name,prompt:s.taskPrompts[id]||(id==='default'?SYSTEM:'请概述文章要旨、关键论点与阅读提醒。')},true),'gr-settings-button');}
    const card=body.createEl('section',{cls:'gr-settings-group gr-commands-group'}),head=card.createDiv({cls:'gr-command-heading'});body=card;head.createEl('h3',{text:`选中文本指令 ${s.commands.length} / ${MAX_COMMANDS}`,cls:'gr-settings-section'});
    const add=button(head,'添加指令',()=>this.editCommand(),'gr-settings-button is-primary');add.disabled=s.commands.length>=MAX_COMMANDS;
    const list=body.createDiv({cls:'gr-command-list'});if(!s.commands.length)list.createDiv({cls:'gr-settings-description',text:'还没有选中文本指令'});
    s.commands.forEach((c,i)=>{const row=list.createDiv({cls:'gr-command-row'}),copy=row.createDiv({cls:'gr-command-copy'});copy.createDiv({cls:'gr-settings-label',text:c.name});copy.createDiv({cls:'gr-command-preview',text:c.id==='translate'?(s.translationEngine==='google'?'谷歌翻译 · 内置':this.modelLabel(s.taskModels.translate)+' · 模型翻译')+' · '+TRANSLATION_LANGUAGES[s.translationTarget]:c.prompt+' · '+this.modelLabel(s.taskModels[c.id])});const actions=row.createDiv({cls:'gr-command-actions'});
      const move=async(delta:number)=>{const j=i+delta;if(j<0||j>=s.commands.length)return;[s.commands[i],s.commands[j]]=[s.commands[j],s.commands[i]];await this.save();this.display();};
      for(const[icon,label,delta]of [['arrow-up','上移',-1],['arrow-down','下移',1]]as const){const b=button(actions,'',()=>move(delta),'gr-settings-button');setIcon(b,icon);b.setAttribute('aria-label',label+' '+c.name);b.disabled=i+delta<0||i+delta>=s.commands.length;}
      button(actions,'编辑',()=>this.editCommand(c),'gr-settings-button');button(actions,'删除',async()=>{s.commands=s.commands.filter(x=>x.id!==c.id);delete s.taskModels[c.id];await this.save();this.display();},'gr-settings-button');
    });
    const missing=DEFAULT_COMMANDS.filter(d=>!s.commands.some(c=>c.id===d.id));if(missing.length){const footer=body.createDiv({cls:'gr-command-restore'});for(const d of missing){const b=button(footer,'恢复“'+d.name+'”',async()=>{s.commands=saveCommand(s.commands,{...d});await this.save();this.display();},'gr-settings-button');b.disabled=s.commands.length>=MAX_COMMANDS;}}
  }
  private editTranslation(){const s=this.plugin.store.settings,modal=new Modal(this.app);modal.setTitle('翻译');modal.contentEl.addClass('gr-model-modal');let engine=s.translationEngine,ref=s.taskModels.translate||null;const body=modal.contentEl.createDiv();const draw=()=>{body.empty();body.createEl('label',{text:'翻译方式'});const mode=body.createEl('select',{cls:'gr-settings-input',attr:{'aria-label':'翻译方式'}});mode.createEl('option',{value:'google',text:'谷歌翻译 · 内置'});mode.createEl('option',{value:'model',text:'模型翻译'});mode.value=engine;mode.onchange=()=>{engine=mode.value as 'google'|'model';draw();};if(engine==='model'){const row=body.createDiv({cls:'gr-command-model-row'});row.createSpan({text:'使用模型'});const picker=button(row,this.modelLabel(ref),()=>new ModelAssignmentPicker(this.app,s,true,async value=>{ref=value;picker.textContent=this.modelLabel(ref);},ref).open(),'gr-settings-button');}else body.createDiv({cls:'gr-settings-description',text:'仅将选中文本发送至 Google。'});};draw();modal.contentEl.createEl('label',{text:'目标语言'});const target=modal.contentEl.createEl('select',{cls:'gr-settings-input',attr:{'aria-label':'翻译目标语言'}});for(const [code,label]of Object.entries(TRANSLATION_LANGUAGES))target.createEl('option',{value:code,text:label});target.value=s.translationTarget;modal.contentEl.createEl('label',{text:'翻译提示词'});const prompt=modal.contentEl.createEl('textarea',{cls:'gr-settings-input',attr:{'aria-label':'翻译提示词',rows:'4'}});prompt.style.height='110px';prompt.value=s.commands.find(c=>c.id==='translate')?.prompt||'请翻译选中文本。';const footer=modal.contentEl.createDiv({cls:'gr-settings-footer'});button(footer,'取消',()=>modal.close(),'gr-settings-button');button(footer,'保存',async()=>{if(!prompt.value.trim()||prompt.value.length>8000)throw new Error('Prompt 需为1–8,000个字符。');s.translationEngine=engine;s.translationTarget=target.value;const command=s.commands.find(c=>c.id==='translate');if(command)command.prompt=prompt.value.trim();if(ref)s.taskModels.translate=ref;else delete s.taskModels.translate;await this.save();modal.close();this.display();},'gr-settings-button is-primary');modal.open();}
  private editCommand(command?:ReadingCommand,taskPrompt=false){
    if(command?.id==='translate'&&!taskPrompt){this.editTranslation();return;}
    const modal=new Modal(this.app);modal.setTitle(command?'编辑指令':'添加指令');modal.contentEl.addClass('gr-command-editor');
    modal.contentEl.createEl('label',{text:'名称',attr:{for:'gr-command-name'}});const name=modal.contentEl.createEl('input',{attr:{id:'gr-command-name','aria-label':'指令名称',maxlength:'16',placeholder:'指令名称'}});name.value=command?.name||'';name.disabled=taskPrompt;
    modal.contentEl.createEl('label',{text:'Prompt',attr:{for:'gr-command-prompt'}});const prompt=modal.contentEl.createEl('textarea',{attr:{id:'gr-command-prompt','aria-label':'指令 Prompt',maxlength:'8000',rows:'9',placeholder:'输入对选中文本执行的指令…'}});prompt.value=command?.prompt||'';
    if(!taskPrompt)modal.contentEl.createDiv({cls:'gr-settings-description',text:'可用变量：{{selection}} 选中文本 · {{title}} 文档名'});
    const commandId=command?.id||uid();let modelRef=this.plugin.store.settings.taskModels[commandId]||null;const modelRow=modal.contentEl.createDiv({cls:'gr-command-model-row'});modelRow.createSpan({text:'使用模型'});const modelButton=button(modelRow,commandId==='default'&&!modelRef?'默认':this.modelLabel(modelRef),()=>new ModelAssignmentPicker(this.app,this.plugin.store.settings,commandId!=='default',async ref=>{modelRef=ref;modelButton.textContent=this.modelLabel(ref);},modelRef).open(),'gr-settings-button');
    const error=modal.contentEl.createDiv({cls:'gr-settings-message',attr:{role:'alert'}}),footer=modal.contentEl.createDiv({cls:'gr-settings-footer'});
    const original=taskPrompt?{name:command!.name,prompt:command!.id==='default'?SYSTEM:'请概述文章要旨、关键论点与阅读提醒。'}:DEFAULT_COMMANDS.find(d=>d.id===command?.id);if(original)button(footer,'恢复默认',()=>{name.value=original.name;prompt.value=original.prompt;},'gr-settings-button');
    button(footer,'取消',()=>modal.close(),'gr-settings-button');button(footer,'保存',async()=>{try{if(taskPrompt){if(!prompt.value.trim()||prompt.value.length>8000)throw new Error('Prompt 需为1–8,000个字符。');this.plugin.store.settings.taskPrompts[commandId]=prompt.value.trim();}else this.plugin.store.settings.commands=saveCommand(this.plugin.store.settings.commands,{...command,id:commandId,name:name.value,prompt:prompt.value});if(modelRef)this.plugin.store.settings.taskModels[commandId]=modelRef;else delete this.plugin.store.settings.taskModels[commandId];await this.save();modal.close();this.display();}catch(e){error.textContent=e instanceof Error?e.message:'保存失败';}},'gr-settings-button is-primary');modal.open();name.focus();
  }
}
