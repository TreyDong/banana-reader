import { Plugin, ItemView, WorkspaceLeaf, TFile, Notice, MarkdownRenderer, Component, PluginSettingTab, App, FuzzySuggestModal, Modal, getFrontMatterInfo, normalizePath, setIcon } from 'obsidian';
import { type Anchor, type Thread, type Reading, type Passage, type Highlight, freshReading, makeAnchor, resolveAnchor, indexPassages, contextFor, blockedPath, exportReading, MARK_STYLES, markStyle, referenceTokens, type MarkStyle } from './core';
import { type AgentSettings, type ApiProtocol, API_DEFAULTS, askAgent, discoverCodexModels, discoverApiModels, mergeModels, normalizeModels, type ModelOption } from './agent';

import {placeMarginItems, anchorRange, paintMarks, type TextMark, type MarginItem, railMagnification} from './reading-ui';

import {DEFAULT_COMMANDS,MAX_COMMANDS,normalizeCommands,saveCommand,renderCommand,type ReadingCommand} from './prompts';

const VIEW = 'gloss-reader';
interface Settings extends AgentSettings {modelLists:Record<string,ModelOption[]>; markStyle:MarkStyle; customFont:string; theme: string; fontSize: number; font: string; lineHeight: number; context: string; maxContext: number; marker: string; pen: string; measure: number; numbers: boolean; commands:ReadingCommand[]; apiProfiles:Record<string,{base:string;model:string}> }
interface Store { version: number; settings: Settings; documents: Record<string, Reading> }
const DEFAULTS: Settings = {modelLists:{},markStyle:'highlight',customFont:'',commands:DEFAULT_COMMANDS.map(c=>({...c})),apiProfiles:{},claudePath:'',claudeModel:'',apiProtocol:'openai',provider: 'codex', codexPath: '', codexModel: '', apiBase: 'https://api.openai.com/v1', apiModel: '', apiKey: '', theme: 'paper', fontSize: 20, font: 'serif', lineHeight: 1.64, context: 'nearby', maxContext: 60000, marker: 'yellow', pen: 'vermilion', measure: 32, numbers: false};
const uid = () => crypto.randomUUID();
const modelKey=(s:AgentSettings,provider=s.provider)=>provider==='api'?'api:'+(s.apiProtocol||'openai'):provider;
const modelId=(s:AgentSettings,provider=s.provider)=>provider==='codex'?s.codexModel:provider==='claude'?s.claudeModel||'':s.apiModel;
const setModel=(s:AgentSettings,id:string)=>{if(s.provider==='codex')s.codexModel=id;else if(s.provider==='claude')s.claudeModel=id;else s.apiModel=id;};
const providerName=(provider:string)=>({codex:'Codex CLI',claude:'Claude CLI',api:'API'}[provider]||provider);

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
  private saveQueue: Promise<void> = Promise.resolve();
  async onload() {
    const saved = await this.loadData();
    this.store = {version: 2, settings: {...DEFAULTS, ...saved?.settings, apiKey: ''}, documents: saved?.documents || {}};
    this.store.settings.commands=normalizeCommands(saved?.settings?.commands);
    const settings=this.store.settings;settings.markStyle=markStyle(settings.markStyle);settings.modelLists={...(saved?.settings?.modelLists||{})};
    const local=await discoverCodexModels();settings.modelLists.codex=settings.modelLists.codex===undefined?local:normalizeModels(settings.modelLists.codex);
    settings.modelLists.claude=settings.modelLists.claude===undefined?[{id:'sonnet',name:'Claude Sonnet'},{id:'opus',name:'Claude Opus'},{id:'haiku',name:'Claude Haiku'}]:normalizeModels(settings.modelLists.claude);
    for(const provider of ['codex','claude','api']){const key=modelKey(settings,provider),id=modelId(settings,provider);settings.modelLists[key]=mergeModels(normalizeModels(settings.modelLists[key]),id?[{id,name:id}]:[]);if(!id&&settings.modelLists[key].length){const previous=settings.provider;settings.provider=provider;setModel(settings,settings.modelLists[key][0].id);settings.provider=previous;}}

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
  onunload() {this.unloading=true;for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) if (leaf.view instanceof GlossView) leaf.view.stop();}
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
  private rail!: HTMLElement;
  private railWindow!: HTMLElement;
  private railTimer?:ReturnType<typeof setTimeout>;
  private railFocus?:number;
  private selectionPreview?:any;
  private readingModel?:{provider:string;id:string};
  private railGeometry: {top:number;height:number;fill:number;heading:boolean}[]=[];
  private composer!: HTMLTextAreaElement;
  private composerWrap!: HTMLElement;
  private questionButton!: HTMLButtonElement;
  private composeLabel!: HTMLElement;
  private sendButton!: HTMLButtonElement;
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
        if(this.lens&&!this.lens.hidden){e.preventDefault();this.closeLens();return;}
        if(this.composerWrap&&!this.composerWrap.hidden){e.preventDefault();this.toggleComposer(false);return;}
        if(this.notebookOpen){this.toggleNotebook(false);return;}
        if(this.appearance&&!this.appearance.hidden){this.appearance.hidden=true;return;}
        if(this.focus)void this.exitReader().catch(showError);return;
      }
      if(target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
      if(e.metaKey||e.ctrlKey||e.altKey)return;
      if(e.key==='/'){e.preventDefault();this.closeLens();this.toggleComposer(true);return;}
      if(this.selected&&this.lens&&!this.lens.hidden&&e.key.length===1){e.preventDefault();this.showLens('ask',e.key);return;}
      if(e.key.toLowerCase()==='f'){e.preventDefault();if(this.focus)void this.exitReader().catch(showError);else this.toggleFocus(true);}
    });
    this.registerEvent(this.app.vault.on('modify',f=>{if(f.path!==this.path)return;clearTimeout(this.reloadTimer);this.reloadTimer=setTimeout(()=>void this.loadDocument(this.path,true).catch(showError),500);}));
    this.registerEvent(this.app.vault.on('delete',f=>{if(f.path===this.path){this.stop();new Notice('原文已移除，批注仍保留。');}}));
  }
  private iconButton(parent:HTMLElement,name:string,label:string,action:()=>void|Promise<void>,cls='') {
    const b=button(parent,'',action,`gloss-icon ${cls}`);setIcon(b,name);b.setAttribute('aria-label',label);b.title=label;return b;
  }
  private get data(){return this.plugin.read(this.path);}
  async loadDocument(path:string,retainPosition=false) {
    if(blockedPath(path))throw new Error('此目录受隐私边界保护。');
    const file=this.app.vault.getAbstractFileByPath(path);if(!(file instanceof TFile))throw new Error('找不到这篇文档。');
    this.stop();this.captureProgress();await this.flushDraft();
    const token=++this.revision, raw=await this.app.vault.cachedRead(file);if(token!==this.revision)return;
    const progress=this.plugin.read(path).progress;
    this.clearSelectionPreview();this.path=path;this.readingModel=undefined;this.selected=undefined;this.activeThread=undefined;this.activeHighlight=undefined;this.restoring=true;this.pendingProgress=progress;
    this.resizeObserver?.disconnect();this.marginObserver?.disconnect();
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
    const notebook=button(tools,'',()=>this.toggleNotebook(),'gloss-notebook-button');setIcon(notebook,'notebook-pen');notebook.createSpan({text:'笔记本'});notebook.setAttribute('aria-label','阅读笔记本');
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
    const brief=button(header,'',async()=>{this.selected=undefined;this.activeThread=undefined;await this.send('请给出这篇文档的要旨、关键论点和阅读路线，引用段落编号。',true);},'gloss-brief');
    const briefTop=brief.createSpan({cls:'gloss-brief-title',text:'解读这篇文章'});const briefArrow=briefTop.createSpan();setIcon(briefArrow,'arrow-right');brief.createSpan({cls:'gloss-brief-description',text:'先抓住要旨、关键观点，再带着问题阅读'});brief.createSpan({cls:'gloss-brief-key',text:'B'});
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
    this.composer.addEventListener('input',()=>this.rememberDraft());this.protectInput(this.composer);this.composer.addEventListener('focus',()=>this.closeLens());this.composer.addEventListener('keydown',e=>{if(!e.isComposing&&e.keyCode!==229&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();void this.send().catch(showError);}});
    this.iconButton(row,'x','收起提问框 · Esc',()=>this.toggleComposer(false),'gloss-compose-close');
    const scope=button(row,'全文',()=>{this.plugin.store.settings.context=this.plugin.store.settings.context==='whole'?'nearby':'whole';this.refreshSettings();void this.plugin.persist().catch(showError);},'gloss-scope');scope.title='点击切换：当前文档全文 / 选文及相邻段落';
    this.sendButton=this.iconButton(row,'arrow-up','发送问题',()=>this.aborter?this.stop():this.send(),'gloss-send');
    this.drawer=this.root.createEl('aside',{cls:'gloss-notebook',attr:{'aria-label':'阅读笔记本'}});this.drawer.hidden=!this.notebookOpen;
    const drawerHead=this.drawer.createDiv({cls:'gloss-notebook-head'});drawerHead.createEl('h2',{text:'阅读笔记'});this.iconButton(drawerHead,'download','导出 Markdown 笔记',()=>this.exportNotes());this.iconButton(drawerHead,'x','收起笔记本',()=>this.toggleNotebook(false));
    this.drawerBody=this.drawer.createDiv({cls:'gloss-notebook-body'});
    this.lens=this.root.createDiv({cls:'gloss-lens',attr:{role:'toolbar','aria-label':'选文操作'}});this.lens.hidden=true;
    this.lens.addEventListener('mousedown',e=>{if(!(e.target as HTMLElement).closest('textarea,input'))e.preventDefault();});
    this.appearance=this.root.createDiv({cls:'gloss-appearance'});this.appearance.hidden=true;
    this.article.addEventListener('mouseup',()=>this.captureSelection());this.article.addEventListener('keyup',e=>{if(e.key.startsWith('Arrow')||e.key==='Shift')this.captureSelection();});
    this.article.addEventListener('click',e=>{
      const selection=this.article.ownerDocument.getSelection();if(selection&&!selection.isCollapsed&&this.article.contains(selection.anchorNode))return;
      const el=(e.target as HTMLElement).closest<HTMLElement>('[data-h],[data-g]');if(!el)return;
      if(el.dataset.g){const t=this.data.threads.find(t=>t.id===el.dataset.g?.split(' ')[0]);if(t){this.activateThread(t);return;}}
      if(el.dataset.h){const h=this.data.highlights.find(h=>h.id===el.dataset.h?.split(' ')[0]);if(h){this.selected=h.anchor;this.activeHighlight=h.id;this.activeThread=undefined;this.paintHighlights();this.showLens('actions');this.updateContext();}}
    });
    this.article.addEventListener('mouseover',e=>{const g=(e.target as HTMLElement).closest<HTMLElement>('[data-g]')?.dataset.g;this.setHover(g?.split(' ')[0]);});
    this.article.addEventListener('mouseleave',()=>this.setHover());
    this.root.addEventListener('pointerdown',e=>{const target=e.target as HTMLElement;if(!this.lens.contains(target)&&!target.closest('[data-h]'))this.closeLens();if(!this.appearance.contains(target)&&!target.closest('.gloss-aa'))this.appearance.hidden=true;});
    this.root.addEventListener('click',e=>{const a=(e.target as HTMLElement).closest<HTMLAnchorElement>('a.internal-link');if(a){e.preventDefault();void this.app.workspace.openLinkText(a.dataset.href||a.getAttribute('href')||'',path,true);}});
    this.scroller.addEventListener('scroll',()=>{if(this.restoring)return;this.captureProgress();this.pulseRail();this.updateRail();if(!this.lens.hidden)this.placeLens();top.toggleClass('is-scrolled',this.scroller.scrollTop>180);clearTimeout(this.progressTimer);this.progressTimer=setTimeout(()=>void this.plugin.persist().catch(showError),700);},{passive:true});
    this.paintHighlights();this.refreshSettings();await this.renderMargin();this.toggleFocus(this.focus);
    this.resizeObserver=new ResizeObserver(()=>{this.narrow=this.root.clientWidth<1080;this.root.toggleClass('gloss-narrow',this.narrow);this.restorePosition();this.scheduleLayout();if(!this.lens.hidden)this.placeLens();});
    this.resizeObserver.observe(this.root);this.resizeObserver.observe(this.scroller);this.resizeObserver.observe(this.page);
    requestAnimationFrame(()=>{if(token===this.revision){this.restorePosition();this.scheduleLayout();}});
    this.app.workspace.requestSaveLayout();
  }
  applyAppearance(){if(!this.root)return;const s=this.plugin.store.settings;this.root.dataset.theme=s.theme==='auto'?(this.root.ownerDocument.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches?'night':'paper'):({light:'snow',dark:'night'}[s.theme]||s.theme);this.root.dataset.font=s.font;this.root.dataset.pen=s.pen||'vermilion';this.root.style.setProperty('--read-size',s.fontSize+'px');this.root.style.setProperty('--leading',String(s.lineHeight));this.root.style.setProperty('--measure-k',String(s.measure||32));this.root.style.setProperty('--reader-custom-font',s.customFont||'var(--font-serif)');this.root.toggleClass('gloss-show-numbers',!!s.numbers);this.scheduleLayout();}
  refreshSettings(){this.applyAppearance();if(!this.root)return;const scope=this.root.querySelector('.gloss-scope');if(scope)scope.textContent=this.plugin.store.settings.context==='whole'?'全文':(this.selected?'选文':'全文');this.updateContext();this.root.querySelectorAll<HTMLSelectElement>('.gloss-model-picker').forEach(el=>{const next=this.modelPicker(el.parentElement!,el.getAttribute('aria-label')||'提问模型');el.replaceWith(next);});if(this.selected&&this.lens&&!this.lens.hidden&&this.lensMode==='actions')this.showLens('actions');}
  async exitReader(){this.captureProgress();await this.flushDraft();this.toggleFocus(false);const existing=this.app.workspace.getLeavesOfType('markdown').find(l=>l.getViewState().state?.file===this.path);if(existing){await this.app.workspace.revealLeaf(existing);this.leaf.detach();}else await this.leaf.setViewState({type:'markdown',state:{file:this.path},active:true});}
  toggleFocus(next=!this.focus){const changing=next!==this.focus,max=this.scroller?this.scroller.scrollHeight-this.scroller.clientHeight:0,ratio=max>0?this.scroller.scrollTop/max:0;this.focus=next;if(this.root){if(next&&this.root.parentElement!==this.root.ownerDocument.body)this.root.ownerDocument.body.appendChild(this.root);else if(!next&&this.root.parentElement!==this.contentEl)this.contentEl.appendChild(this.root);this.root.toggleClass('gloss-focus',next);if(!next)this.clearSelectionPreview();}if(this.focusButton){setIcon(this.focusButton,'arrow-left');this.focusButton.setAttribute('aria-label','返回普通文档');this.focusButton.title='返回文档 · Esc';}if(changing)requestAnimationFrame(()=>{this.scroller?.scrollTo({top:Math.max(0,this.scroller.scrollHeight-this.scroller.clientHeight)*ratio,behavior:'instant'});this.scheduleLayout();});}
  private toggleNotebook(next=!this.notebookOpen){this.notebookOpen=next;this.drawer.hidden=!next;this.root.toggleClass('gloss-notebook-open',next);if(next)void this.renderMargin();}
  private showContents(){const modal=new Modal(this.app);modal.setTitle('文档目录');let count=0;this.blocks.forEach(el=>{if(/^H[1-6]$/.test(el.tagName)){button(modal.contentEl,el.textContent||'',()=>{modal.close();el.scrollIntoView({behavior:'smooth',block:'start'});},'gloss-contents-item');count++;}});if(!count)modal.contentEl.createEl('p',{text:'这篇文档没有分节标题。'});modal.open();}
  private toggleAppearance(){if(!this.appearance.hidden){this.appearance.hidden=true;return;}this.appearance.empty();const s=this.plugin.store.settings;this.appearance.createDiv({cls:'gloss-pop-title',text:'阅读外观'});const themes=this.appearance.createDiv({cls:'gloss-theme-swatches'});for(const [key,label] of [['auto','跟随系统'],['paper','纸张'],['sepia','暖黄'],['snow','雪白'],['night','夜读'],['ink','墨蓝']]){const b=button(themes,label,()=>{s.theme=key;this.applyAppearance();void this.plugin.persist().catch(showError);this.appearance.hidden=true;},'gloss-theme-swatch');b.dataset.theme=key;b.classList.toggle('is-selected',s.theme===key);}
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
    for(const t of this.data.threads){if(!t.anchor)continue;const top=at(t.anchor);if(top===null||top===undefined)continue;const tick=this.rail.createSpan({cls:'gloss-rail-gloss'});tick.style.top=top+'px';}
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
  private modelSettings():Settings{const s={...this.plugin.store.settings};if(this.readingModel){s.provider=this.readingModel.provider;setModel(s,this.readingModel.id);}return s;}
  private modelPicker(parent:HTMLElement,label:string){
    const select=parent.createEl('select',{cls:'gloss-model-picker',attr:{'aria-label':label}}),s=this.plugin.store.settings,current=this.modelSettings();
    for(const provider of ['codex','claude','api']){const options=mergeModels(normalizeModels(s.modelLists[modelKey(s,provider)]),modelId(s,provider)?[{id:modelId(s,provider),name:modelId(s,provider)}]:[]);if(current.provider===provider&&modelId(current)&&!options.some(m=>m.id===modelId(current)))options.push({id:modelId(current),name:modelId(current)});if(!options.length)continue;const group=select.createEl('optgroup',{attr:{label:providerName(provider)+(provider==='api'?' · '+(s.apiProtocol||'openai'):'')}});for(const m of options){const option=group.createEl('option',{text:m.name+(m.id===modelId(s,provider)&&s.provider===provider?' · 默认':''),value:JSON.stringify([provider,m.id])});option.title=m.id;}}
    if(!Array.from(select.options).some(o=>o.value===JSON.stringify([current.provider,modelId(current)])))select.createEl('option',{value:JSON.stringify([current.provider,modelId(current)]),text:'选择模型'});
    select.value=JSON.stringify([current.provider,modelId(current)]);select.disabled=!!this.aborter;
    select.addEventListener('pointerdown',e=>e.stopPropagation());select.addEventListener('mousedown',e=>e.stopPropagation());select.addEventListener('keydown',e=>e.stopPropagation());
    select.onchange=()=>{const [provider,id]=JSON.parse(select.value);this.readingModel={provider,id};this.root.querySelectorAll<HTMLSelectElement>('.gloss-model-picker').forEach(el=>el.value=select.value);};return select;
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
      this.protectInput(this.lensInput);
      this.lensInput.addEventListener('keydown',e=>{if(!e.isComposing&&e.keyCode!==229&&e.key==='Enter'&&!e.shiftKey&&(mode==='ask'||e.metaKey||e.ctrlKey)){e.preventDefault();void(mode==='ask'?this.send(this.lensInput!.value):this.saveLensNote()).catch(showError);}});
      // The anchor is already stored; release the document selection before editing.
      this.article.ownerDocument.getSelection()?.removeAllRanges();
    }
    this.placeLens();this.updateSelectionPreview();
    if(this.lensInput){this.focusInput(this.lensInput);this.lensInput.setSelectionRange(this.lensInput.value.length,this.lensInput.value.length);}
  }
  private async runCommand(command:ReadingCommand){if(!this.selected)return;await this.send(renderCommand(command.prompt,this.selected.quote,this.path.split('/').pop()?.replace(/\.md$/,'')||''));}
  private placeLens(){if(!this.selected||this.lens.hidden)return;const r=anchorRange(this.blocks,this.passages,this.text,this.selected);if(!r)return;const rects=Array.from(r.getClientRects()).filter(r=>r.width>0);if(!rects.length)return;const first=rects[0],last=rects.at(-1)!,box=this.root.getBoundingClientRect(),w=this.lens.offsetWidth,h=this.lens.offsetHeight,center=(Math.min(...rects.map(r=>r.left))+Math.max(...rects.map(r=>r.right)))/2;const x=Math.max(12,Math.min(this.root.clientWidth-w-12,center-box.left-w/2));const above=first.top-box.top-h-12>=66;const y=above?first.top-box.top-h-12:last.bottom-box.top+12;this.lens.style.left=x+'px';this.lens.style.top=Math.max(66,Math.min(this.root.clientHeight-h-12,y))+'px';this.lens.style.setProperty('--gloss-arrow',Math.max(18,Math.min(w-18,(above?first.left+Math.min(40,first.width/2):(last.left+last.right)/2)-box.left-x))+'px');this.lens.classList.toggle('is-below',!above);}
  private updateContext(){if(!this.composer)return;this.updateSelectionPreview();const t=this.data.threads.find(t=>t.id===this.activeThread),a=t?.anchor||this.selected;this.composeLabel.textContent=a?`“${a.quote.length>50?a.quote.slice(0,50)+'…':a.quote}”`:'';this.composeLabel.hidden=!a;this.composer.placeholder=t?'继续追问…':a?'询问这段文字…':'询问这篇文章…';const scope=this.root.querySelector('.gloss-scope');if(scope)scope.textContent=a&&this.plugin.store.settings.context!=='whole'?'选文':'全文';}
  private paintHighlights(){if(!this.article)return;const marks:TextMark[]=[];for(const h of this.data.highlights.filter(h=>!h.removed)){const start=resolveAnchor(this.text,h.anchor);if(start!==null)marks.push({id:h.id,start,end:start+h.anchor.quote.length,kind:'highlight',color:h.color,note:!!h.note,style:markStyle(h.style)});}for(const t of this.data.threads){if(!t.anchor)continue;const start=resolveAnchor(this.text,t.anchor);if(start!==null)marks.push({id:t.id,start,end:start+t.anchor.quote.length,kind:'thread'});}paintMarks(this.article,this.blocks,this.passages,marks,this.activeThread||this.activeHighlight,this.fresh);this.updateSelectionPreview();this.rail?.querySelectorAll<HTMLElement>('.gloss-rail-line').forEach(el=>{const p=this.passages[Number(el.dataset.paragraph)-1],h=marks.find(m=>m.kind==='highlight'&&m.end>p.start&&m.start<p.end),t=marks.some(m=>m.kind==='thread'&&m.end>p.start&&m.start<p.end);el.dataset.color=h?.color||'';el.classList.toggle('has-gloss',t);});}
  private matchedHighlight(){if(!this.selected)return;const at=resolveAnchor(this.text,this.selected);return this.data.highlights.find(h=>!h.removed&&h.anchor.quote===this.selected!.quote&&resolveAnchor(this.text,h.anchor)===at);}
  private async highlight(color:string,style:MarkStyle=this.plugin.store.settings.markStyle){if(!this.selected)return;let h=this.matchedHighlight();if(h){h.color=color;h.style=style;}else{h={id:uid(),anchor:{...this.selected},color,style,note:'',created:Date.now()};this.data.highlights.push(h);}this.plugin.store.settings.marker=color;this.plugin.store.settings.markStyle=style;this.activeHighlight=undefined;this.fresh=h.id;this.data.updated=Date.now();await this.plugin.persist();this.article.ownerDocument.getSelection()?.removeAllRanges();this.closeLens();this.paintHighlights();await this.renderMargin();const id=h.id;setTimeout(()=>{if(this.fresh===id){this.fresh=undefined;this.article.querySelectorAll('.is-new').forEach(el=>el.removeClass('is-new'));}},750);}
  private async saveLensNote(){if(!this.selected||!this.lensInput)return;let h=this.matchedHighlight();const note=this.lensInput.value.trim();if(h)h.note=note;else{if(!note){this.closeLens();return;}h={id:uid(),anchor:{...this.selected},color:this.plugin.store.settings.marker||'yellow',style:this.plugin.store.settings.markStyle,note,created:Date.now()};this.data.highlights.push(h);}this.activeHighlight=h.id;this.fresh=h.id;this.data.updated=Date.now();await this.plugin.persist();this.closeLens();this.paintHighlights();await this.renderMargin();if(this.narrow)this.toggleNotebook(true);}
  private async removeHighlight(id:string){const h=this.data.highlights.find(h=>h.id===id);if(!h)return;h.removed=true;await this.plugin.persist();this.closeLens();this.activeHighlight=undefined;this.paintHighlights();await this.renderMargin();new Notice('高亮已移除，可在笔记本底部恢复。');}
  private jump(anchor:Anchor){const r=anchorRange(this.blocks,this.passages,this.text,anchor);if(!r){new Notice('原文已变化，无法可靠定位；摘录仍完整保留。');return;}const start=resolveAnchor(this.text,anchor)!,i=this.passages.findIndex(p=>p.end>start),b=this.blocks[i];b.scrollIntoView({behavior:'smooth',block:'center'});b.addClass('gloss-jump');setTimeout(()=>b.removeClass('gloss-jump'),1800);}
  private activateThread(t:Thread){this.activeThread=t.id;this.activeHighlight=undefined;this.selected=t.anchor;this.paintHighlights();this.updateContext();if(this.narrow){this.notebookOpen=true;this.drawer.hidden=false;}void this.renderMargin();}
  revealSaved(id:string){const h=this.data.highlights.find(h=>h.id===id),t=this.data.threads.find(t=>t.id===id);if(h){this.activeHighlight=h.id;this.selected=h.anchor;this.jump(h.anchor);if(h.note){void this.renderMargin();if(this.narrow)this.toggleNotebook(true);}else this.showLens('actions');}if(t){this.activateThread(t);if(t.anchor)this.jump(t.anchor);}}
  private setHover(id?:string){this.article.querySelectorAll<HTMLElement>('[data-g]').forEach(el=>el.classList.toggle('is-hover',!!id&&el.dataset.g!.split(' ').includes(id)));for(const [key,card]of this.cards)card.classList.toggle('is-hover',id===key);}
  private citeButtons(parent:HTMLElement,t:Thread){
    const walker=parent.ownerDocument.createTreeWalker(parent,4),nodes:Text[]=[];while(walker.nextNode()){const n=walker.currentNode as Text;if(referenceTokens(n.data).length&&!n.parentElement?.closest('pre,code,a,button'))nodes.push(n);}
    for(const n of nodes){const fragment=parent.ownerDocument.createDocumentFragment();let end=0;for(const token of referenceTokens(n.data)){fragment.append(n.data.slice(end,token.start));for(const id of token.ids){const b=parent.ownerDocument.createElement('button');b.className='gloss-citation';b.textContent='¶'+id;const anchor=t.citations?.[id];if(anchor){b.onclick=()=>this.jump(anchor);b.title=anchor.quote;}else{b.disabled=true;b.title='未提供的原文段落';}fragment.append(b);}end=token.end;}fragment.append(n.data.slice(end));n.replaceWith(fragment);}
  }
  private async renderThread(parent:HTMLElement,t:Thread,component:Component,notebook=false){
    const active=t.id===this.activeThread,card=parent.createEl('article',{cls:'gloss-margin-card gloss-thread-card'});card.dataset.threadId=t.id;card.dataset.cardId=t.id;card.toggleClass('is-active',active);card.toggleClass('is-collapsed',!active);
    if(!notebook){this.cards.set(t.id,card);const prior=this.previousPositions.get(t.id);if(prior){card.style.transform=prior;card.style.visibility='visible';card.dataset.placed='true';}}
    const number=t.anchor?this.paragraphNumber(t.anchor):null,head=card.createDiv({cls:'gloss-card-heading'});head.createSpan({cls:'gloss-card-kind',text:'阅读对话'});if(number)button(head,'¶'+number,()=>this.jump(t.anchor!),'gloss-citation');
    if(active)this.iconButton(head,'chevrons-down-up','收起这段对话',()=>{this.activeThread=undefined;this.paintHighlights();this.updateContext();void this.renderMargin();},'gloss-collapse');
    if(t.anchor){const quote=button(card,t.anchor.quote,()=>this.jump(t.anchor!),'gloss-thread-quote');quote.setAttribute('aria-label','引用原文：'+t.anchor.quote);quote.title=t.anchor.quote;}
    const first=t.messages.find(m=>m.role==='user');
    if(!active){
      card.createDiv({cls:'gloss-message-label is-question',text:'我的问题'});card.createEl('p',{cls:'gloss-card-question',text:first?.content||'关于这篇文档'});
      const last=t.messages.filter(m=>m.role==='assistant').at(-1);card.createDiv({cls:'gloss-message-label',text:'回答'+(last?.model?' · '+last.model:'')});
      const answer=last?.content||t.error||(this.aborter?'正在回答…':'尚无回答'),gist=card.createEl('p',{cls:'gloss-card-gist',text:answer.replace(/[#*_`]/g,'').slice(0,240)});this.citeButtons(gist,t);
      const expand=button(card,'展开完整对话',()=>this.activateThread(t),'gloss-expand-thread');expand.setAttribute('aria-label','展开批注：'+first?.content);
    }else{
      for(const m of t.messages){const message=card.createDiv({cls:'gloss-message '+(m.role==='user'?'is-user':'is-assistant')});message.createDiv({cls:'gloss-message-label',text:m.role==='user'?'我的问题':'回答'+(m.provider?' · '+providerName(m.provider):'')+(m.model?' · '+m.model:'')});
        if(m.role==='user')message.createEl('p',{cls:'gloss-card-question',text:m.content});
        else{const body=message.createDiv({cls:'gloss-answer markdown-rendered'});if(!m.content&&this.aborter)body.createDiv({cls:'gloss-writing',attr:{role:'status','aria-label':'正在回答'}});else{await MarkdownRenderer.render(this.app,passiveEmbeds(m.content),body,this.path,component);if(component!==this.marginRender)return;this.citeButtons(body,t);}}
      }
      const cited=[...new Set(t.messages.filter(m=>m.role==='assistant').flatMap(m=>referenceTokens(m.content).flatMap(token=>token.ids)))];
      if(cited.length){const references=card.createDiv({cls:'gloss-thread-references'});references.createSpan({text:'引用原文'});for(const id of cited){const anchor=t.citations?.[id],b=button(references,'¶'+id,()=>{if(anchor)this.jump(anchor);},'gloss-citation');b.disabled=!anchor;b.title=anchor?.quote||'未提供的原文段落';}}
      if(t.error)card.createDiv({cls:'gloss-error',text:t.error});
      const foot=card.createDiv({cls:'gloss-card-footer'});if(this.aborter)this.iconButton(foot,'square','停止回答',()=>this.stop());else this.iconButton(foot,'copy','复制完整对话',async()=>{await navigator.clipboard.writeText((t.anchor?'引用原文：\n'+t.anchor.quote+'\n\n':'')+t.messages.map(m=>(m.role==='user'?'我的问题':'回答'+(m.model?' · '+m.model:''))+'：\n'+m.content).join('\n\n'));new Notice('已复制对话与引用');});
      this.modelPicker(foot,'追问模型');const form=card.createDiv({cls:'gloss-followup'}),input=form.createEl('input',{attr:{type:'text','aria-label':'继续追问这条批注',placeholder:'继续追问…'}});input.disabled=!!this.aborter;
      const submit=()=>{this.activeThread=t.id;this.selected=t.anchor;return this.send(input.value);};this.protectInput(input);input.addEventListener('focus',()=>{this.selected=t.anchor;this.updateSelectionPreview();});input.addEventListener('keydown',e=>{if(!e.isComposing&&e.keyCode!==229&&e.key==='Enter'){e.preventDefault();void submit().catch(showError);}});this.iconButton(form,'arrow-up','发送追问',submit,'gloss-followup-send');
    }
    card.addEventListener('mouseenter',()=>this.setHover(t.id));card.addEventListener('mouseleave',()=>this.setHover());return card;
  }
  private paragraphNumber(a:Anchor){const start=resolveAnchor(this.text,a);return start===null?null:this.passages.find(p=>p.end>start)?.number;}
  private renderNote(parent:HTMLElement,h:Highlight,notebook=false){const card=parent.createEl('article',{cls:'gloss-margin-card gloss-personal-card'});card.dataset.cardId=h.id;card.dataset.color=h.color;if(!notebook){this.cards.set(h.id,card);const prior=this.previousPositions.get(h.id);if(prior){card.style.transform=prior;card.style.visibility='visible';card.dataset.placed='true';}}card.toggleClass('is-active',h.id===this.activeHighlight);const head=card.createDiv({cls:'gloss-card-heading'});head.createSpan({cls:'gloss-note-color',attr:{'data-color':h.color}});head.createSpan({text:'我的批注'});const number=this.paragraphNumber(h.anchor);if(number)button(head,'¶'+number,()=>this.jump(h.anchor),'gloss-citation');button(card,h.anchor.quote,()=>{this.selected=h.anchor;this.activeHighlight=h.id;this.showLens('actions');this.jump(h.anchor);},'gloss-note-quote');if(h.note)card.createEl('p',{cls:'gloss-personal-note',text:h.note});if(number===null)card.createDiv({cls:'gloss-stale',text:'原文已变更 · 摘录仍保留'});const actions=card.createDiv({cls:'gloss-note-actions'});this.iconButton(actions,'pen-line','编辑批注',()=>{this.selected=h.anchor;this.activeHighlight=h.id;this.showLens('note');});this.iconButton(actions,'message-circle','讨论这段',()=>{this.selected=h.anchor;this.activeThread=undefined;this.showLens('ask');this.updateContext();});this.iconButton(actions,'eraser','移除高亮',()=>this.removeHighlight(h.id));return card;}
  private async renderMargin(){if(!this.margin)return;if(this.marginRender){this.removeChild(this.marginRender);this.marginRender.unload();}this.marginObserver?.disconnect();const component=new Component();this.marginRender=component;this.addChild(component);for(const[id,card]of this.cards)this.previousPositions.set(id,card.style.transform);this.margin.empty();this.drawerBody.empty();this.cards.clear();
    const notes=this.data.highlights.filter(h=>!h.removed&&h.note);
    for(const t of this.data.threads){await this.renderThread(this.margin,t,component);if(component!==this.marginRender)return;}
    for(const h of notes)this.renderNote(this.margin,h);
    if(!this.data.threads.length&&!notes.length){const hint=this.margin.createDiv({cls:'gloss-margin-hint'});hint.createEl('p',{text:'这里留给你的思考。'});hint.createEl('p',{text:'选中一句话，直接输入问题。回答会写在它旁边。'});}
    const all=this.data.highlights.filter(h=>!h.removed);if(all.length){this.drawerBody.createEl('h3',{text:'划线与批注 · '+all.length});for(const h of all)this.renderNote(this.drawerBody,h,true);}
    if(this.data.threads.length){this.drawerBody.createEl('h3',{text:'阅读对话 · '+this.data.threads.length});for(const t of this.data.threads){await this.renderThread(this.drawerBody,t,component,true);if(component!==this.marginRender)return;}}
    if(!all.length&&!this.data.threads.length)this.drawerBody.createEl('p',{cls:'gloss-notebook-empty',text:'划线、批注和阅读中的好问题，都留在这里。'});
    const removed=this.data.highlights.filter(h=>h.removed);if(removed.length)button(this.drawerBody,'恢复最近移除的高亮',async()=>{removed.at(-1)!.removed=false;await this.plugin.persist();this.paintHighlights();await this.renderMargin();},'gloss-restore');
    this.marginObserver=new ResizeObserver(()=>this.scheduleLayout());for(const card of this.cards.values())this.marginObserver.observe(card);this.scheduleLayout();}
  private scheduleLayout(){cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>this.layoutMargin());}
  private layoutMargin(){if(!this.margin?.isConnected)return;const compose=this.root.querySelector<HTMLElement>('.gloss-composer');if(compose){const r=this.page.getBoundingClientRect(),root=this.root.getBoundingClientRect();compose.style.left=(r.left-root.left+r.width/2)+'px';}const base=this.margin.getBoundingClientRect().top,items:MarginItem[]=[];
    for(const t of this.data.threads){const card=this.cards.get(t.id);if(!card)continue;const rect=t.anchor?anchorRange(this.blocks,this.passages,this.text,t.anchor)?.getClientRects()[0]:this.article.getBoundingClientRect();const desired=rect?rect.top-base-6:0;items.push({id:t.id,desired:Math.max(0,desired),height:card.offsetHeight||64,created:t.created});}
    for(const h of this.data.highlights.filter(h=>!h.removed&&h.note)){const card=this.cards.get(h.id);if(!card)continue;const rect=anchorRange(this.blocks,this.passages,this.text,h.anchor)?.getClientRects()[0];items.push({id:h.id,desired:Math.max(0,rect?rect.top-base-6:0),height:card.offsetHeight||48,created:h.created});}
    items.sort((a,b)=>a.desired-b.desired||a.created-b.created);const positions=placeMarginItems(items,this.activeThread||this.activeHighlight);let bottom=0;for(const item of items){const card=this.cards.get(item.id)!;const first=!card.dataset.placed;if(first)card.style.transition='none';card.style.transform=`translateY(${Math.round(positions[item.id])}px)`;card.dataset.placed='true';card.style.visibility='visible';bottom=Math.max(bottom,positions[item.id]+item.height);if(first)requestAnimationFrame(()=>card.style.removeProperty('transition'));}
    this.margin.style.minHeight=Math.max(this.page.offsetHeight,bottom+100)+'px';const hint=this.margin.querySelector<HTMLElement>('.gloss-margin-hint');if(hint)hint.style.transform=`translateY(${Math.max(0,this.article.getBoundingClientRect().top-base)}px)`;this.updateRail(true);}
  async send(override?:string,forceWhole=false){if(this.aborter)return;const question=(override??this.composer.value).trim();if(!question){this.toggleComposer(true);return;}if(blockedPath(this.path))throw new Error('此文档不能发送给模型。');if(!(this.app.vault.getAbstractFileByPath(this.path)instanceof TFile))throw new Error('原文已移除。');const path=this.path,data=this.data,settings=this.modelSettings();let target=data.threads.find(t=>t.id===this.activeThread);const whole=forceWhole||!this.selected||settings.context==='whole';const context=target?.context||contextFor(this.passages,forceWhole?undefined:this.selected,this.text,whole,settings.maxContext);
    if(!target){const citations:Record<string,Anchor>={};for(const p of this.passages)if(context.includes(`[¶${p.number}] `))citations[String(p.number)]=makeAnchor(this.text,p.start,p.end);target={id:uid(),anchor:forceWhole?undefined:this.selected?{...this.selected}:undefined,messages:[],created:Date.now(),context,citations};data.threads.push(target);this.activeThread=target.id;}
    const thread=target;thread.messages.push({role:'user',content:question});delete thread.error;const history=thread.messages.map(m=>({...m})),response={role:'assistant' as const,content:'',provider:settings.provider,model:modelId(settings)};thread.messages.push(response);data.draft='';data.updated=Date.now();this.composer.value='';this.closeLens();this.article.ownerDocument.getSelection()?.removeAllRanges();
    this.activeHighlight=undefined;const controller=new AbortController();this.aborter=controller;this.composerWrap.hidden=false;this.questionButton.setAttribute('aria-expanded','true');this.questionButton.toggleClass('is-active',true);this.composer.disabled=true;this.root.querySelectorAll<HTMLSelectElement>('.gloss-model-picker').forEach(el=>el.disabled=true);setIcon(this.sendButton,'square');this.sendButton.setAttribute('aria-label','停止回答');this.sendButton.title='停止回答';this.fresh=thread.id;this.paintHighlights();this.updateContext();if(this.narrow){this.notebookOpen=true;this.drawer.hidden=false;}
    try{await this.plugin.persist();await this.renderMargin();response.content=await askAgent({settings,context,quote:thread.anchor?.quote,messages:history,signal:controller.signal,onText:text=>{response.content=text;if(this.path!==path||this.aborter!==controller)return;clearTimeout(this.renderTimer);this.renderTimer=setTimeout(()=>void this.renderMargin().catch(showError),100);}});}catch(e){thread.error=e instanceof Error?e.message:'回答失败，请重试。';if(!response.content)thread.messages.pop();}
    finally{clearTimeout(this.renderTimer);data.updated=Date.now();try{await this.plugin.persist();}catch(e){showError(e);}if(this.aborter===controller){this.aborter=undefined;if(this.path===path&&this.root.isConnected){this.composer.disabled=false;this.root.querySelectorAll<HTMLSelectElement>('.gloss-model-picker').forEach(el=>el.disabled=false);setIcon(this.sendButton,'arrow-up');this.sendButton.setAttribute('aria-label','发送问题');this.sendButton.title='发送问题';this.fresh=undefined;this.article.querySelectorAll('.is-new').forEach(el=>el.removeClass('is-new'));await this.renderMargin();}}}
  }
  stop(){this.aborter?.abort();}
  private async exportNotes(){const data=this.data;if(!data.highlights.some(h=>!h.removed)&&!data.threads.length){new Notice('先留下一条划线、批注或对话。');return;}const folder='收集箱';if(!this.app.vault.getAbstractFileByPath(folder))await this.app.vault.createFolder(folder);const title=this.path.split('/').pop()!.replace(/\.md$/,'').replace(/[\\/:*?"<>|\[\]#^]/g,'-'),stamp=new Date().toISOString().replace(/[:.]/g,'-');let path=normalizePath(`${folder}/${title}-阅读笔记-${stamp}.md`);if(this.app.vault.getAbstractFileByPath(path))path=normalizePath(`${folder}/${title}-阅读笔记-${stamp}-${uid().slice(0,6)}.md`);await this.app.vault.create(path,exportReading(this.path,data,this.app.vault.getName()));new Notice('阅读笔记已保存到 '+path);}
  async onClose(){this.revision++;this.stop();this.resizeObserver?.disconnect();this.marginObserver?.disconnect();cancelAnimationFrame(this.frame);clearTimeout(this.progressTimer);clearTimeout(this.draftTimer);clearTimeout(this.renderTimer);clearTimeout(this.reloadTimer);this.clearSelectionPreview();clearTimeout(this.railTimer);this.root?.remove();await this.flushDraft();}
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
    for(const[key,label,icon]of [['models','模型与连接','sliders-horizontal'],['commands','选文指令','wand-sparkles'],['reading','阅读偏好','book-open']]){
      const b=button(tabs,'',()=>{this.tab=key;this.display();},'gr-settings-tab');const mark=b.createSpan();setIcon(mark,icon);b.createSpan({text:label});b.classList.toggle('is-active',this.tab===key);b.setAttribute('role','tab');b.setAttribute('aria-selected',String(this.tab===key));b.id='gr-tab-'+key;b.setAttribute('aria-controls','gr-settings-panel');
    }
    const body=el.createDiv({cls:'gr-settings-body',attr:{id:'gr-settings-panel',role:'tabpanel','aria-labelledby':'gr-tab-'+this.tab}});
    let group=body;const section=(title:string)=>{const card=body.createEl('section',{cls:'gr-settings-group'});card.createEl('h3',{cls:'gr-settings-section',text:title});group=card.createDiv({cls:'gr-settings-group-body'});return group;};
    const row=(label:string,description='')=>{const r=group.createDiv({cls:'gr-settings-row'}),info=r.createDiv({cls:'gr-settings-info'});info.createDiv({cls:'gr-settings-label',text:label});if(description)info.createDiv({cls:'gr-settings-description',text:description});return r.createDiv({cls:'gr-settings-controls'});};
    const select=(label:string,description:string,value:string,options:Record<string,string>,change:(v:string)=>void)=>{const d=row(label,description).createEl('select',{cls:'gr-settings-input',attr:{'aria-label':label}});for(const[k,t]of Object.entries(options))d.createEl('option',{value:k,text:t});d.value=value;d.onchange=()=>{change(d.value);void this.save().catch(showError);};};
    const input=(label:string,desc:string,value:string,placeholder:string,change:(v:string)=>void,type='text')=>{const t=row(label,desc).createEl('input',{cls:'gr-settings-input',attr:{'aria-label':label,type,placeholder}});t.value=value;t.autocomplete='off';t.spellcheck=false;t.onchange=()=>{change(t.value.trim());void this.save().catch(showError);};return t;};
    if(this.tab==='models'){
      section('模型服务');
      const list=group.createDiv({cls:'gr-service-list',attr:{role:'group','aria-label':'问答服务'}});
      for(const[key,title,desc]of [['codex','Codex CLI',''],['claude','Claude CLI',''],['api','API','']]){
        const card=button(list,'',async()=>{s.provider=key as Settings['provider'];await this.save();this.display();},'gr-service-card');card.classList.toggle('is-active',s.provider===key);card.setAttribute('aria-pressed',String(s.provider===key));
        const radio=card.createSpan({cls:'gr-service-radio'});if(s.provider===key)setIcon(radio,'check');const copy=card.createSpan({cls:'gr-service-copy'});copy.createSpan({cls:'gr-service-title',text:title});if(desc)copy.createSpan({cls:'gr-service-detail',text:desc});if(s.provider===key)card.createSpan({cls:'gr-service-badge',text:'使用中'});
      }
      section('连接配置');
      if(s.provider==='codex'||s.provider==='claude'){
        const claude=s.provider==='claude';
        input('可执行文件','',claude?s.claudePath||'':s.codexPath,'自动查找',v=>{if(claude)s.claudePath=v;else s.codexPath=v;});

      }else{
        select('协议','',s.apiProtocol||'openai',{openai:'OpenAI Chat Completions',responses:'OpenAI Responses',anthropic:'Anthropic Messages',gemini:'Google Gemini'},v=>{
          const old=s.apiProtocol||'openai';s.apiProfiles||={};s.apiProfiles[old]={base:s.apiBase,model:s.apiModel};s.apiProtocol=v as ApiProtocol;const preset=s.apiProfiles[v];s.apiBase=preset?.base||API_DEFAULTS[s.apiProtocol];s.apiModel=preset?.model||'';s.apiKey='';this.display();
        });
        input('API 地址','',s.apiBase,API_DEFAULTS[s.apiProtocol||'openai'],v=>s.apiBase=v);

        const key=input('API Key','当前会话有效',s.apiKey,'输入 API Key',v=>s.apiKey=v,'password');key.oninput=()=>{s.apiKey=key.value;};
      }
      this.renderModelSettings(section('模型'));
      const footer=body.createDiv({cls:'gr-settings-footer'}),status=footer.createDiv({cls:'gr-settings-message',text:'',attr:{role:'status','aria-live':'polite'}});
      const stop=button(footer,'停止',()=>this.test?.abort(),'gr-settings-button');stop.hidden=true;
      const test=button(footer,'测试连接',async()=>{this.test?.abort();const controller=new AbortController();this.test=controller;test.disabled=true;stop.hidden=false;status.textContent='正在连接…';status.classList.remove('is-error');
        const cancelled=new Promise<never>((_,reject)=>controller.signal.addEventListener('abort',()=>reject(new Error('已停止')),{once:true}));
        try{await Promise.race([cancelled,askAgent({settings:{...s},context:'[¶1] 阅读帮助人理解文字。',messages:[{role:'user',content:'请用一句中文解释这句话，并引用段落编号。'}],signal:controller.signal,onText:()=>{}})]);status.textContent='连接成功，可以开始阅读问答。';}
        catch(e){status.textContent=controller.signal.aborted?'已停止测试':(e instanceof Error?e.message:'连接失败，请检查配置。');status.classList.toggle('is-error',!controller.signal.aborted);}
        finally{if(this.test===controller)this.test=undefined;test.disabled=false;stop.hidden=true;}
      },'gr-settings-button is-primary');

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
  private renderModelSettings(body:HTMLElement){
    const s=this.plugin.store.settings,key=modelKey(s),models=mergeModels(normalizeModels(s.modelLists[key]),modelId(s)?[{id:modelId(s),name:modelId(s)}]:[]);s.modelLists[key]=models;
    const top=body.createDiv({cls:'gr-model-heading'});top.createSpan({text:'默认模型',cls:'gr-settings-label'});
    const defaults=top.createEl('select',{cls:'gr-settings-input',attr:{'aria-label':'默认模型'}});if(!models.length)defaults.createEl('option',{text:'先获取或添加模型',value:''});for(const m of models)defaults.createEl('option',{value:m.id,text:m.name+' · '+m.id});defaults.value=modelId(s);defaults.onchange=()=>{setModel(s,defaults.value);void this.save().catch(showError);this.display();};
    const list=body.createDiv({cls:'gr-model-list'});for(const m of models){const r=list.createDiv({cls:'gr-model-row'}),copy=r.createDiv({cls:'gr-model-copy'});copy.createDiv({cls:'gr-settings-label',text:m.name});copy.createEl('code',{text:m.id});
      const use=button(r,m.id===modelId(s)?'默认':'设为默认',async()=>{setModel(s,m.id);await this.save();this.display();},'gr-settings-button'+(m.id===modelId(s)?' is-selected':''));use.setAttribute('aria-label','默认模型 '+m.id);
      const remove=button(r,'',async()=>{s.modelLists[key]=models.filter(x=>x.id!==m.id);if(modelId(s)===m.id)setModel(s,s.modelLists[key][0]?.id||'');await this.save();this.display();},'gr-settings-button gr-model-remove');setIcon(remove,'x');remove.setAttribute('aria-label','移除模型 '+m.id);
    }
    const add=body.createDiv({cls:'gr-model-add'}),id=add.createEl('input',{cls:'gr-settings-input',attr:{'aria-label':'添加模型 ID',placeholder:'输入模型 ID'}});
    button(add,'添加',async()=>{const value=id.value.trim(),parsed=normalizeModels([value]);if(!parsed.length){new Notice('请输入有效模型 ID，不含空格。');return;}s.modelLists[key]=mergeModels(models,parsed);if(!modelId(s))setModel(s,value);await this.save();this.display();},'gr-settings-button');
    const state=body.createDiv({cls:'gr-settings-message',attr:{role:'status'}});
    if(s.provider!=='claude'){const refresh=button(add,s.provider==='codex'?'读取本机模型':'获取 API 模型',async()=>{this.test?.abort();const controller=new AbortController();this.test=controller;refresh.disabled=true;state.textContent='正在读取…';try{const found=s.provider==='codex'?await discoverCodexModels():await discoverApiModels({...s},controller.signal);if(controller.signal.aborted||this.test!==controller)return;if(!found.length){state.textContent='本机暂无模型缓存，可手动添加。';return;}s.modelLists[key]=mergeModels(models,found);if(!modelId(s))setModel(s,found[0].id);await this.save();this.display();}catch(e){state.textContent=e instanceof Error?e.message:'获取失败';state.classList.add('is-error');}finally{refresh.disabled=false;if(this.test===controller)this.test=undefined;}},'gr-settings-button');}
  }
  private renderCommands(body:HTMLElement){
    const s=this.plugin.store.settings,card=body.createEl('section',{cls:'gr-settings-group gr-commands-group'}),head=card.createDiv({cls:'gr-command-heading'});body=card;head.createEl('h3',{text:`选文指令 ${s.commands.length} / ${MAX_COMMANDS}`,cls:'gr-settings-section'});
    const add=button(head,'添加指令',()=>this.editCommand(),'gr-settings-button is-primary');add.disabled=s.commands.length>=MAX_COMMANDS;
    const list=body.createDiv({cls:'gr-command-list'});if(!s.commands.length)list.createDiv({cls:'gr-settings-description',text:'还没有选文指令'});
    s.commands.forEach((c,i)=>{const row=list.createDiv({cls:'gr-command-row'}),copy=row.createDiv({cls:'gr-command-copy'});copy.createDiv({cls:'gr-settings-label',text:c.name});copy.createDiv({cls:'gr-command-preview',text:c.prompt});const actions=row.createDiv({cls:'gr-command-actions'});
      const move=async(delta:number)=>{const j=i+delta;if(j<0||j>=s.commands.length)return;[s.commands[i],s.commands[j]]=[s.commands[j],s.commands[i]];await this.save();this.display();};
      for(const[icon,label,delta]of [['arrow-up','上移',-1],['arrow-down','下移',1]]as const){const b=button(actions,'',()=>move(delta),'gr-settings-button');setIcon(b,icon);b.setAttribute('aria-label',label+' '+c.name);b.disabled=i+delta<0||i+delta>=s.commands.length;}
      button(actions,'编辑',()=>this.editCommand(c),'gr-settings-button');button(actions,'删除',async()=>{s.commands=s.commands.filter(x=>x.id!==c.id);await this.save();this.display();},'gr-settings-button');
    });
    const missing=DEFAULT_COMMANDS.filter(d=>!s.commands.some(c=>c.id===d.id));if(missing.length){const footer=body.createDiv({cls:'gr-command-restore'});for(const d of missing){const b=button(footer,'恢复“'+d.name+'”',async()=>{s.commands=saveCommand(s.commands,{...d});await this.save();this.display();},'gr-settings-button');b.disabled=s.commands.length>=MAX_COMMANDS;}}
  }
  private editCommand(command?:ReadingCommand){
    const modal=new Modal(this.app);modal.setTitle(command?'编辑指令':'添加指令');modal.contentEl.addClass('gr-command-editor');
    modal.contentEl.createEl('label',{text:'名称',attr:{for:'gr-command-name'}});const name=modal.contentEl.createEl('input',{attr:{id:'gr-command-name','aria-label':'指令名称',maxlength:'16',placeholder:'指令名称'}});name.value=command?.name||'';
    modal.contentEl.createEl('label',{text:'Prompt',attr:{for:'gr-command-prompt'}});const prompt=modal.contentEl.createEl('textarea',{attr:{id:'gr-command-prompt','aria-label':'指令 Prompt',maxlength:'8000',rows:'9',placeholder:'输入对选文执行的指令…'}});prompt.value=command?.prompt||'';
    modal.contentEl.createDiv({cls:'gr-settings-description',text:'可用变量：{{selection}} 选文 · {{title}} 文档名'});
    const error=modal.contentEl.createDiv({cls:'gr-settings-message',attr:{role:'alert'}}),footer=modal.contentEl.createDiv({cls:'gr-settings-footer'});
    const original=DEFAULT_COMMANDS.find(d=>d.id===command?.id);if(original)button(footer,'恢复默认',()=>{name.value=original.name;prompt.value=original.prompt;},'gr-settings-button');
    button(footer,'取消',()=>modal.close(),'gr-settings-button');button(footer,'保存',async()=>{try{this.plugin.store.settings.commands=saveCommand(this.plugin.store.settings.commands,{...command,id:command?.id||uid(),name:name.value,prompt:prompt.value});await this.save();modal.close();this.display();}catch(e){error.textContent=e instanceof Error?e.message:'保存失败';}},'gr-settings-button is-primary');modal.open();name.focus();
  }
}
