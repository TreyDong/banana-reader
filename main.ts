import { Plugin, ItemView, WorkspaceLeaf, TFile, Notice, MarkdownRenderer, Component, PluginSettingTab, Setting, App, FuzzySuggestModal, Modal, getFrontMatterInfo, normalizePath } from 'obsidian';
import { type Anchor, type Thread, type Reading, type Passage, freshReading, makeAnchor, resolveAnchor, indexPassages, contextFor, blockedPath, exportReading } from './core';
import { type AgentSettings, askAgent } from './agent';

const VIEW = 'gloss-reader';
interface Settings extends AgentSettings { theme: string; fontSize: number; font: string; lineHeight: number; context: string; maxContext: number }
interface Store { version: number; settings: Settings; documents: Record<string, Reading> }
const DEFAULTS: Settings = {provider: 'codex', codexPath: '', codexModel: '', apiBase: 'https://api.openai.com/v1', apiModel: '', apiKey: '', theme: 'paper', fontSize: 19, font: 'serif', lineHeight: 1.95, context: 'nearby', maxContext: 60000};
const uid = () => crypto.randomUUID();
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
  private saveQueue: Promise<void> = Promise.resolve();
  async onload() {
    const saved = await this.loadData();
    this.store = {version: 1, settings: {...DEFAULTS, ...saved?.settings, apiKey: ''}, documents: saved?.documents || {}};
    this.registerView(VIEW, leaf => new GlossView(leaf, this));
    this.addSettingTab(new GlossSettings(this.app, this));
    this.addRibbonIcon('book-open-text', 'Gloss · 阅读与思考', () => {void this.openCurrent().catch(showError);});
    this.addCommand({id: 'open-reader', name: '在 Gloss 中阅读当前文档', callback: () => {void this.openCurrent().catch(showError);}});
    this.addCommand({id: 'choose-document', name: '选择文档开始阅读', callback: () => this.choose()});
    this.addCommand({id: 'toggle-focus', name: '切换沉浸式阅读', checkCallback: checking => {const v = this.app.workspace.getActiveViewOfType(GlossView); if (!v) return false; if (!checking) v.toggleFocus(); return true;}});
    this.registerEvent(this.app.workspace.on('file-menu', (menu, file) => {if (file instanceof TFile && file.extension === 'md' && !blockedPath(file.path)) menu.addItem(i => i.setTitle('在 Gloss 中阅读').setIcon('book-open-text').onClick(() => {void this.openFile(file).catch(showError);}));}));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
      // A rename moves the same document state; do not silently overwrite an existing record.
      for (const key of Object.keys(this.store.documents)) {
        if (key !== oldPath && !key.startsWith(oldPath + '/')) continue;
        const next = file.path + key.slice(oldPath.length);
        if (this.store.documents[next]) {new Notice('Gloss：新路径已有批注，已保留两份记录。'); continue;}
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
    const file = this.app.workspace.getActiveFile();
    if (file && file.extension === 'md' && !blockedPath(file.path)) await this.openFile(file);
    else this.choose();
  }
  async openFile(file: TFile): Promise<GlossView> {
    if (file.extension !== 'md') throw new Error('这一版支持 Markdown 文档。');
    if (blockedPath(file.path)) throw new Error('此目录受隐私边界保护，请使用原生阅读视图。');
    let leaf = this.app.workspace.getLeavesOfType(VIEW).find(l => (l.view as GlossView).path === file.path);
    if (!leaf) {leaf = this.app.workspace.getLeaf('tab'); await leaf.setViewState({type: VIEW, state: {path: file.path}, active: true});}
    await this.app.workspace.revealLeaf(leaf);
    const v = leaf.view as GlossView; if (v.path !== file.path || !v.article) await v.loadDocument(file.path); return v;
  }
  onunload() {for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) (leaf.view as GlossView).stop();}
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
  article!: HTMLElement;
  root!: HTMLElement;
  private scroller!: HTMLElement;
  private margin!: HTMLElement;
  private composer!: HTMLTextAreaElement;
  private contextLabel!: HTMLElement;
  private quoteEl!: HTMLElement;
  private progressEl!: HTMLElement;
  private lens!: HTMLElement;
  private toc!: HTMLElement;
  private sendButton!: HTMLButtonElement;
  private aborter?: AbortController;
  private markdown?: Component;
  private marginRender?: Component;
  private blocks: HTMLElement[] = [];
  private passages: Passage[] = [];
  private text = '';
  private selected?: Anchor;
  private activeThread?: string;
  private focus = false;
  private restoring = false;
  private pendingProgress?: number;
  private resizeObserver?: ResizeObserver;
  private revision = 0;
  private progressTimer?: ReturnType<typeof setTimeout>;
  private renderTimer?: ReturnType<typeof setTimeout>;
  private reloadTimer?: ReturnType<typeof setTimeout>;
  private focusButton!: HTMLButtonElement;
  private tab: 'threads' | 'highlights' = 'threads';
  constructor(leaf: WorkspaceLeaf, readonly plugin: GlossPlugin) {super(leaf);}
  getViewType() {return VIEW;}
  getDisplayText() {return this.path ? `Gloss · ${this.path.split('/').pop()?.replace(/\.md$/, '')}` : 'Gloss';}
  getIcon() {return 'book-open-text';}
  getState() {return {path: this.path};}
  async setState(state: {path?: string}, result: any) {if (state?.path) await this.loadDocument(state.path); await super.setState(state, result);}
  async onOpen() {
    this.contentEl.addClass('gloss-host');
    this.registerDomEvent(this.containerEl.ownerDocument, 'keydown', e => {
      if ((e.target as HTMLElement).closest?.('.modal-container')) return;
      if (!this.focus && this.app.workspace.getActiveViewOfType(GlossView) !== this) return;
      if (e.key === 'Escape') {this.lens?.hide(); if (this.focus) this.toggleFocus(false); return;}
      const input = (e.target as HTMLElement).closest('textarea,input,select,[contenteditable="true"]');
      if (input) return;
      if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey && !e.altKey) {e.preventDefault(); this.toggleFocus();}
      if (e.key === '/' && !e.metaKey && !e.ctrlKey) {e.preventDefault(); this.composer?.focus();}
    });
    this.registerEvent(this.app.vault.on('modify', file => {
      if (file.path !== this.path) return;
      clearTimeout(this.reloadTimer); this.reloadTimer = setTimeout(() => {void this.loadDocument(this.path, true).catch(showError);}, 500);
    }));
    this.registerEvent(this.app.vault.on('delete', file => {if (file.path === this.path) {this.stop(); new Notice('原文已移除。Gloss 已保留批注，请勿覆盖同名文档。');}}));
  }
  async loadDocument(path: string, retainPosition = false) {
    if (blockedPath(path)) throw new Error('此目录受隐私边界保护。');
    const file = this.app.vault.getAbstractFileByPath(path); if (!(file instanceof TFile)) throw new Error('找不到这篇文档。');
    this.stop(); this.captureProgress(); await this.flushDraft();
    const token = ++this.revision;
    const oldRatio = retainPosition ? this.plugin.read(this.path).progress : null;
    const raw = await this.app.vault.cachedRead(file); if (token !== this.revision) return;
    const desiredProgress = oldRatio ?? this.plugin.read(path).progress;
    this.pendingProgress = desiredProgress;
    this.restoring = true;
    this.resizeObserver?.disconnect();
    this.path = path; this.activeThread = undefined; this.selected = undefined;
    this.markdown?.unload(); this.markdown && this.removeChild(this.markdown);
    this.markdown = new Component(); this.addChild(this.markdown);
    this.root?.remove(); this.contentEl.empty();
    this.root = this.contentEl.createDiv({cls: 'gloss-root'}); this.applyAppearance();
    const toolbar = this.root.createDiv({cls: 'gloss-toolbar'});
    const brand = button(toolbar, 'g.  GLOSS', () => this.plugin.choose(), 'gloss-brand'); brand.title = '选择阅读文档';
    const fileLabel = toolbar.createDiv({cls: 'gloss-file-label', text: file.basename}); fileLabel.title = file.path;
    button(toolbar, '目录', () => this.toc.toggleClass('is-open', !this.toc.hasClass('is-open')));
    button(toolbar, 'Aa', () => this.appearanceMenu());
    button(toolbar, '伴读', () => this.root.toggleClass('gloss-side-open', !this.root.hasClass('gloss-side-open')), 'gloss-side-toggle');
    button(toolbar, '导出笔记', () => this.exportNotes());
    this.focusButton = button(toolbar, '沉浸阅读', () => this.toggleFocus());
    button(toolbar, '设置', () => {(this.app as any).setting.open(); (this.app as any).setting.openTabById(this.plugin.manifest.id);});
    this.progressEl = this.root.createDiv({cls: 'gloss-progress', attr: {'aria-label': '阅读进度'}});
    this.toc = this.root.createDiv({cls: 'gloss-toc'});
    this.scroller = this.root.createDiv({cls: 'gloss-scroll'});
    const page = this.scroller.createDiv({cls: 'gloss-page'});
    page.createDiv({cls: 'gloss-eyebrow', text: 'READ · QUESTION · KEEP'});
    page.createEl('h1', {cls: 'gloss-document-title', text: file.basename});
    page.createDiv({cls: 'gloss-document-meta', text: '选一段文字，留一个问题，让理解在页边生长。'});
    this.article = page.createEl('article', {cls: 'gloss-article markdown-rendered', attr: {'aria-label': '阅读正文'}});
    const info = getFrontMatterInfo(raw);
    await MarkdownRenderer.render(this.app, passiveEmbeds(raw.slice(info.contentStart)), this.article, path, this.markdown);
    if (token !== this.revision) return;
    // Text-only indexes exclude nested blocks and embedded attachments, keeping quote offsets stable.
    const selectors = 'p,h1,h2,h3,h4,h5,h6,li,pre,table';
    this.blocks = Array.from(this.article.querySelectorAll<HTMLElement>(selectors)).filter(el => {
      if (el.closest('.internal-embed, .external-embed')) return false;
      const ancestor = el.parentElement?.closest(selectors); return (!ancestor || !this.article.contains(ancestor)) && !!el.textContent?.trim();
    });
    if (!this.blocks.length && this.article.textContent?.trim()) this.blocks = [this.article];
    const index = indexPassages(this.blocks.map(el => el.textContent || '')); this.passages = index.passages; this.text = index.text;
    this.blocks.forEach((el, i) => {el.dataset.glossParagraph = String(i + 1); el.addClass('gloss-passage');});
    const headings = this.blocks.filter(el => /^H[1-6]$/.test(el.tagName));
    if (!headings.length) this.toc.createSpan({text: '这篇文档没有标题目录。'});
    for (const el of headings) button(this.toc, el.textContent || '', () => el.scrollIntoView({behavior: 'smooth', block: 'start'}));
    const side = this.scroller.createEl('aside', {cls: 'gloss-side', attr: {'aria-label': '阅读伴侣'}});
    const sideTop = side.createDiv({cls: 'gloss-side-heading'}); sideTop.createSpan({text: '页边思考'}); sideTop.createSpan({cls: 'gloss-local-badge', text: '本地保存'});
    const tabs = side.createDiv({cls: 'gloss-tabs'});
    button(tabs, '对话', () => {this.tab = 'threads'; void this.renderMargin();});
    button(tabs, '高亮与批注', () => {this.tab = 'highlights'; void this.renderMargin();});
    button(tabs, '新问题 ＋', () => {this.activeThread = undefined; this.selected = undefined; this.updateContext(); this.tab = 'threads'; void this.renderMargin(); this.composer.focus();});
    this.margin = side.createDiv({cls: 'gloss-margin', attr: {'aria-live': 'polite'}});
    const compose = side.createDiv({cls: 'gloss-compose'});
    this.contextLabel = compose.createDiv({cls: 'gloss-context-label'});
    this.quoteEl = compose.createDiv({cls: 'gloss-compose-quote'});
    const contextRow = compose.createDiv({cls: 'gloss-context-row'});
    const scope = contextRow.createEl('select', {attr: {'aria-label': '发送给 Agent 的内容范围'}});
    scope.createEl('option', {value: 'nearby', text: '选文及相邻段落'}); scope.createEl('option', {value: 'whole', text: '当前文档全文'}); scope.value = this.plugin.store.settings.context;
    scope.addEventListener('change', () => {this.plugin.store.settings.context = scope.value; void this.plugin.persist().catch(showError); this.updateContext();});
    const starters = compose.createDiv({cls: 'gloss-starters'});
    for (const [label, prompt] of [['解释', '请解释这段话的含义和关键概念。'], ['举例', '请用一个具体例子帮助我理解。'], ['质疑', '这段论述有哪些隐含假设和可能的反例？'], ['翻译', '请翻译这段话：英文译成中文，中文译成英文。']]) button(starters, label, () => {this.composer.value = prompt; this.rememberDraft(); this.composer.focus();});
    this.composer = compose.createEl('textarea', {cls: 'gloss-question', attr: {'aria-label': '向 Agent 提问', placeholder: '这段话，哪里让你停了下来？', rows: '3'}}); this.composer.value = this.plugin.read(path).draft || '';
    this.composer.addEventListener('input', () => this.rememberDraft());
    this.composer.addEventListener('keydown', e => {if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {e.preventDefault(); void this.send().catch(showError);}});
    const sendRow = compose.createDiv({cls: 'gloss-send-row'});
    sendRow.createSpan({text: this.plugin.store.settings.provider === 'codex' ? 'Codex CLI · ⌘↵ 发送' : '自定义 API · ⌘↵ 发送', cls: 'gloss-provider'});
    this.sendButton = button(sendRow, '发送 ↗', () => this.aborter ? this.stop() : this.send(), 'gloss-send');
    compose.createDiv({cls: 'gloss-disclosure', text: '点击发送后，所示范围的正文会交给所选模型处理。未配置服务时仍可阅读与批注。'});
    this.lens = this.root.createDiv({cls: 'gloss-lens', attr: {role: 'toolbar', 'aria-label': '选文操作'}}); this.lens.hide();
    this.lens.addEventListener('mousedown', e => e.preventDefault());
    button(this.lens, '问 Agent', () => {this.activeThread = undefined; this.tab = 'threads'; this.root.addClass('gloss-side-open'); this.updateContext(); this.lens.hide(); void this.renderMargin(); this.composer.focus();});
    for (const [color, label] of [['yellow', '黄'], ['green', '绿'], ['pink', '粉']]) {const b = button(this.lens, label, () => this.highlight(color), `gloss-color gloss-color-${color}`); b.setAttribute('aria-label', label + '色高亮');}
    button(this.lens, '写批注', () => this.annotate());
    this.article.addEventListener('mouseup', () => this.captureSelection());
    this.article.addEventListener('keyup', e => {if (e.key.startsWith('Arrow') || e.key === 'Shift') this.captureSelection();});
    this.article.addEventListener('click', e => {const mark = (e.target as HTMLElement).closest<HTMLElement>('mark[data-gloss-id]'); if (mark) {const h = this.plugin.read(this.path).highlights.find(h => h.id === mark.dataset.glossId); if (h) {this.selected = h.anchor; this.activeThread = undefined; this.tab = 'highlights'; this.updateContext(); void this.renderMargin();}}});
    this.scroller.addEventListener('scroll', () => {this.lens.hide(); if (this.restoring) return; this.captureProgress(); clearTimeout(this.progressTimer); this.progressTimer = setTimeout(() => {void this.plugin.persist().catch(showError);}, 700);}, {passive: true});
    this.root.addEventListener('click', e => {const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.internal-link'); if (link) {e.preventDefault(); void this.app.workspace.openLinkText(link.dataset.href || link.getAttribute('href') || '', this.path, true);}});
    this.updateContext(); this.paintHighlights(); await this.renderMargin(); this.toggleFocus(this.focus);
    this.resizeObserver = new ResizeObserver(() => this.restorePosition());
    this.resizeObserver.observe(this.scroller);
    requestAnimationFrame(() => {if (token === this.revision) this.restorePosition();});
    this.app.workspace.requestSaveLayout();
  }
  applyAppearance() {
    if (!this.root) return;
    const s = this.plugin.store.settings;
    this.root.dataset.theme = s.theme; this.root.dataset.font = s.font;
    this.root.style.setProperty('--gloss-font-size', s.fontSize + 'px'); this.root.style.setProperty('--gloss-line-height', String(s.lineHeight));
  }
  refreshSettings() {
    this.applyAppearance();
    const label = this.root?.querySelector('.gloss-provider');
    if (label) label.textContent = this.plugin.store.settings.provider === 'codex' ? 'Codex CLI · ⌘↵ 发送' : '自定义 API · ⌘↵ 发送';
    const scope = this.root?.querySelector<HTMLSelectElement>('.gloss-context-row select');
    if (scope) scope.value = this.plugin.store.settings.context;
    this.updateContext();
  }
  private appearanceMenu() {
    const modal = new Modal(this.app); modal.setTitle('让阅读更舒服');
    new Setting(modal.contentEl).setName('纸张').addDropdown(d => d.addOptions({paper: '暖纸', light: '纸白', dark: '夜读'}).setValue(this.plugin.store.settings.theme).onChange(v => {this.plugin.store.settings.theme = v; this.applyAppearance(); void this.plugin.persist().catch(showError);}));
    new Setting(modal.contentEl).setName('字体').addDropdown(d => d.addOptions({serif: '衬线 · 阅读', sans: '无衬线 · 清晰'}).setValue(this.plugin.store.settings.font).onChange(v => {this.plugin.store.settings.font = v; this.applyAppearance(); void this.plugin.persist().catch(showError);}));
    new Setting(modal.contentEl).setName('字号').addSlider(s => s.setLimits(15, 28, 1).setValue(this.plugin.store.settings.fontSize).setDynamicTooltip().onChange(v => {this.plugin.store.settings.fontSize = v; this.applyAppearance(); void this.plugin.persist().catch(showError);}));
    new Setting(modal.contentEl).setName('行距').addSlider(s => s.setLimits(1.4, 2.4, 0.05).setValue(this.plugin.store.settings.lineHeight).setDynamicTooltip().onChange(v => {this.plugin.store.settings.lineHeight = v; this.applyAppearance(); void this.plugin.persist().catch(showError);}));
    modal.open();
  }
  toggleFocus(next = !this.focus) {
    const changing = next !== this.focus;
    const max = this.scroller ? this.scroller.scrollHeight - this.scroller.clientHeight : 0;
    const progress = max > 0 ? this.scroller.scrollTop / max : 0;
    this.focus = next;
    if (this.root) {
      // Portal outside Obsidian's contained leaf so full-window reading is not clipped by split panes.
      if (next && this.root.parentElement !== this.root.ownerDocument.body) this.root.ownerDocument.body.appendChild(this.root);
      else if (!next && this.root.parentElement !== this.contentEl) this.contentEl.appendChild(this.root);
      this.root.toggleClass('gloss-focus', next);
    }
    if (this.focusButton) this.focusButton.textContent = next ? '退出沉浸 · Esc' : '沉浸阅读';
    if (changing) requestAnimationFrame(() => {if (this.scroller) this.scroller.scrollTop = Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight) * progress;});
  }
  private rememberDraft() {if (!this.path || !this.composer) return; this.plugin.read(this.path).draft = this.composer.value; clearTimeout(this.progressTimer); this.progressTimer = setTimeout(() => {void this.plugin.persist().catch(showError);}, 500);}
  private async flushDraft() {if (this.path && this.composer) {this.plugin.read(this.path).draft = this.composer.value; await this.plugin.persist();}}
  onResize() {this.restorePosition();}
  private restorePosition() {
    if (!this.restoring || this.pendingProgress === undefined || !this.scroller?.isConnected || this.scroller.clientHeight <= 0 || this.scroller.clientWidth <= 0) return;
    // During workspace restoration Obsidian briefly gives new leaves their content height,
    // which can exceed the window. Wait for the bounded pane before applying a saved ratio.
    if (this.root.clientHeight > (this.root.ownerDocument.defaultView?.innerHeight || window.innerHeight) + 1) return;
    this.scroller.scrollTo({top: Math.max(0, this.scroller.scrollHeight - this.scroller.clientHeight) * this.pendingProgress, behavior: 'instant'});
    this.pendingProgress = undefined; this.restoring = false; this.captureProgress();
  }
  private captureProgress() {if (this.restoring || !this.scroller?.isConnected || !this.scroller.clientHeight || !this.path || !this.progressEl) return; const max = this.scroller.scrollHeight - this.scroller.clientHeight; const ratio = max > 0 ? this.scroller.scrollTop / max : 0; this.plugin.read(this.path).progress = Math.max(0, Math.min(1, ratio)); this.progressEl.style.setProperty('--gloss-progress', `${ratio * 100}%`); this.progressEl.setAttribute('aria-label', `阅读进度 ${Math.round(ratio * 100)}%`);}
  private globalPoint(node: Node, offset: number): number | null {
    const block = this.blocks.find(el => el.contains(node)); if (!block) return null;
    const range = this.article.ownerDocument.createRange(); range.selectNodeContents(block); range.setEnd(node, offset);
    return this.passages[this.blocks.indexOf(block)].start + range.toString().length;
  }
  captureSelection() {
    const selection = this.article.ownerDocument.getSelection(); if (!selection || selection.isCollapsed || !selection.rangeCount) {this.lens.hide(); return;}
    const range = selection.getRangeAt(0); if (!this.article.contains(range.commonAncestorContainer)) return;
    const start = this.globalPoint(range.startContainer, range.startOffset), end = this.globalPoint(range.endContainer, range.endOffset);
    if (start === null || end === null || end <= start) return;
    const a = makeAnchor(this.text, start, end); if (!a.quote.trim()) return;
    this.selected = a; this.activeThread = undefined; this.updateContext();
    const box = range.getBoundingClientRect(), rootBox = this.root.getBoundingClientRect();
    this.lens.show(); const width = this.lens.offsetWidth;
    this.lens.style.left = Math.max(8, Math.min(this.root.clientWidth - width - 8, box.left - rootBox.left)) + 'px';
    this.lens.style.top = Math.max(50, Math.min(this.root.clientHeight - this.lens.offsetHeight - 8, box.bottom - rootBox.top + 8)) + 'px';
  }
  private updateContext() {
    if (!this.contextLabel) return;
    const thread = this.plugin.read(this.path).threads.find(t => t.id === this.activeThread);
    const anchor = thread?.anchor || this.selected;
    this.contextLabel.textContent = thread ? '继续这条对话 · 保留最初上下文' : anchor ? '围绕选文提问' : '围绕当前文档提问';
    this.quoteEl.textContent = anchor?.quote || (this.plugin.store.settings.context === 'whole' ? '本轮发送：当前文档全文' : '选中一段原文后，可仅发送它和相邻段落。');
    this.quoteEl.toggleClass('has-quote', !!anchor);
  }
  private pointAt(block: HTMLElement, offset: number): {node: Node; offset: number} {
    const doc = block.ownerDocument, walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT); let seen = 0, last: Node = block;
    while (walker.nextNode()) {last = walker.currentNode; const len = last.textContent?.length || 0; if (seen + len >= offset) return {node: last, offset: offset - seen}; seen += len;}
    return {node: last, offset: last.nodeType === Node.TEXT_NODE ? last.textContent?.length || 0 : 0};
  }
  private paintHighlights() {
    for (const mark of Array.from(this.article.querySelectorAll('mark[data-gloss-id]'))) mark.replaceWith(...Array.from(mark.childNodes));
    this.article.normalize();
    const records = this.plugin.read(this.path).highlights.filter(h => !h.removed);
    // Work backwards so splitting text nodes preserves offsets, including overlapping marks.
    for (const h of records.slice().reverse()) {
      const at = resolveAnchor(this.text, h.anchor); if (at === null) continue;
      for (let i = 0; i < this.passages.length; i++) {
        const p = this.passages[i], start = Math.max(0, at - p.start), end = Math.min(p.text.length, at + h.anchor.quote.length - p.start); if (end <= start) continue;
        const block = this.blocks[i]; const walker = block.ownerDocument.createTreeWalker(block, NodeFilter.SHOW_TEXT); const segments: {node: Text; start: number; end: number}[] = []; let seen = 0;
        while (walker.nextNode()) {const node = walker.currentNode as Text, len = node.length; if (seen < end && seen + len > start) segments.push({node, start: Math.max(0, start - seen), end: Math.min(len, end - seen)}); seen += len;}
        for (const s of segments.reverse()) {const range = block.ownerDocument.createRange(); range.setStart(s.node, s.start); range.setEnd(s.node, s.end); const mark = block.ownerDocument.createElement('mark'); mark.dataset.glossId = h.id; mark.dataset.color = h.color; mark.title = h.note || '点击查看高亮'; range.surroundContents(mark);}
      }
    }
  }
  private async highlight(color: string) {
    if (!this.selected) return;
    const data = this.plugin.read(this.path); const existing = data.highlights.find(h => !h.removed && h.anchor.start === this.selected!.start && h.anchor.quote === this.selected!.quote);
    if (existing) existing.color = color; else data.highlights.push({id: uid(), anchor: {...this.selected}, color, note: '', created: Date.now()});
    data.updated = Date.now(); await this.plugin.persist(); this.paintHighlights(); this.lens.hide(); this.root.addClass('gloss-side-open'); this.tab = 'highlights'; await this.renderMargin();
  }
  private annotate(id?: string) {
    const path = this.path, data = this.plugin.read(path), existing = id ? data.highlights.find(h => h.id === id) : undefined;
    const anchor = existing?.anchor || this.selected; if (!anchor) {new Notice('请先选择一段原文。'); return;}
    new NoteModal(this.app, existing?.note || '', async note => {
      if (existing) existing.note = note;
      else data.highlights.push({id: uid(), anchor: {...anchor}, color: 'yellow', note, created: Date.now()});
      data.updated = Date.now(); await this.plugin.persist();
      if (this.path === path) {this.paintHighlights(); this.tab = 'highlights'; this.lens.hide(); await this.renderMargin();}
    }).open();
  }
  private jump(anchor: Anchor) {
    const start = resolveAnchor(this.text, anchor); if (start === null) {new Notice('原文已变化，暂时无法可靠定位。摘录仍完整保留。'); return;}
    const index = this.passages.findIndex(p => p.end > start); const block = this.blocks[index]; if (!block) return;
    block.scrollIntoView({behavior: 'smooth', block: 'center'}); block.addClass('gloss-jump'); setTimeout(() => block.removeClass('gloss-jump'), 1600);
  }
  revealSaved(id: string) {const data = this.plugin.read(this.path), highlight = data.highlights.find(h => h.id === id), thread = data.threads.find(t => t.id === id); if (highlight) {this.tab = 'highlights'; this.jump(highlight.anchor);} if (thread) {this.tab = 'threads'; this.activeThread = thread.id; this.selected = thread.anchor; if (thread.anchor) this.jump(thread.anchor); this.updateContext();} void this.renderMargin();}
  private citeButtons(parent: HTMLElement, thread: Thread) {
    const walker = parent.ownerDocument.createTreeWalker(parent, NodeFilter.SHOW_TEXT); const nodes: Text[] = [];
    while (walker.nextNode()) {const n = walker.currentNode as Text; if (/\[¶\d+\]/.test(n.data) && !n.parentElement?.closest('code,pre,a,button')) nodes.push(n);}
    for (const node of nodes) {const frag = parent.ownerDocument.createDocumentFragment(); let end = 0; const regex = /\[¶(\d+)\]/g; let match;
      while ((match = regex.exec(node.data))) {frag.append(node.data.slice(end, match.index)); const b = parent.ownerDocument.createElement('button'); b.className = 'gloss-citation'; b.textContent = match[0]; const anchor = thread.citations?.[match[1]]; if (anchor) b.onclick = () => this.jump(anchor); else {b.disabled = true; b.title = '回答引用了未提供的段落，无法定位';} frag.append(b); end = regex.lastIndex;} frag.append(node.data.slice(end)); node.replaceWith(frag);
    }
  }
  private async renderMargin() {
    if (!this.margin) return;
    this.marginRender?.unload(); this.marginRender && this.removeChild(this.marginRender);
    const component = new Component(); this.marginRender = component; this.addChild(component);
    const parent = this.margin; const scroll = parent.scrollTop; parent.empty();
    this.root.querySelectorAll('.gloss-tabs button').forEach((b, i) => b.toggleClass('is-active', i === (this.tab === 'threads' ? 0 : 1)));
    const data = this.plugin.read(this.path);
    if (this.tab === 'highlights') {
      const items = data.highlights.filter(h => !h.removed);
      if (!items.length) {parent.createEl('h3', {text: '把值得停留的句子留下'}); parent.createEl('p', {text: '选中文字后，可以划线或写下你的理解。它们会留在这篇文档旁边。', cls: 'gloss-empty'});}
      for (const h of items) {
        const card = parent.createDiv({cls: 'gloss-highlight-card'}); card.dataset.color = h.color;
        button(card, h.anchor.quote, () => this.jump(h.anchor), 'gloss-quote-button');
        if (resolveAnchor(this.text, h.anchor) === null) card.createDiv({cls: 'gloss-stale', text: '原文已变化 · 摘录已保留，暂无法定位'});
        if (h.note) card.createDiv({cls: 'gloss-personal-note', text: h.note});
        const actions = card.createDiv({cls: 'gloss-card-actions'});
        button(actions, h.note ? '编辑批注' : '写批注', () => this.annotate(h.id));
        button(actions, '讨论这段', () => {this.selected = h.anchor; this.activeThread = undefined; this.tab = 'threads'; this.updateContext(); void this.renderMargin(); this.composer.focus();});
        button(actions, '移除', async () => {h.removed = true; await this.plugin.persist(); this.paintHighlights(); await this.renderMargin();});
      }
      const removed = data.highlights.filter(h => h.removed); if (removed.length) button(parent, `恢复最近移除的高亮（${removed.length}）`, async () => {removed[removed.length - 1].removed = false; await this.plugin.persist(); this.paintHighlights(); await this.renderMargin();}, 'gloss-restore');
    } else {
      if (!data.threads.length) {parent.createDiv({cls: 'gloss-empty-symbol', text: '“'}); parent.createEl('h3', {text: '好问题，从一句话开始。'}); parent.createEl('p', {cls: 'gloss-empty', text: '选中左侧原文，问它是什么意思、请它举例，或试着提出一个反例。回答和来源会一起留在这里。'});}
      for (const t of data.threads) {
        const card = parent.createDiv({cls: 'gloss-thread'}); card.toggleClass('is-active', t.id === this.activeThread); card.dataset.threadId = t.id;
        if (t.anchor) button(card, t.anchor.quote, () => this.jump(t.anchor!), 'gloss-quote-button');
        else card.createDiv({cls: 'gloss-thread-scope', text: '整篇文档'});
        for (const m of t.messages) {
          const msg = card.createDiv({cls: `gloss-message gloss-message-${m.role}`}); msg.createDiv({cls: 'gloss-role', text: m.role === 'user' ? '我的问题' : 'Agent'});
          const content = msg.createDiv({cls: 'markdown-rendered'});
          await MarkdownRenderer.render(this.app, passiveEmbeds(m.content), content, this.path, component);
          if (component !== this.marginRender) return; if (m.role === 'assistant') this.citeButtons(content, t);
        }
        if (t.error) card.createDiv({cls: 'gloss-error', text: t.error});
        if (this.aborter && t.id === this.activeThread && t.messages[t.messages.length - 1]?.role !== 'assistant') card.createDiv({cls: 'gloss-waiting', text: '正在阅读上下文…'});
        const actions = card.createDiv({cls: 'gloss-card-actions'});
        button(actions, '继续追问', () => {this.activeThread = t.id; this.selected = t.anchor; this.updateContext(); this.composer.focus(); void this.renderMargin();});
        button(actions, '复制对话', async () => {await navigator.clipboard.writeText(t.messages.map(m => `${m.role === 'user' ? '我的问题' : 'Agent'}\n\n${m.content}`).join('\n\n')); new Notice('已复制对话');});
      }
    }
    parent.scrollTop = scroll;
  }
  async send() {
    if (this.aborter) return;
    const question = this.composer.value.trim(); if (!question) {this.composer.focus(); return;}
    if (blockedPath(this.path)) throw new Error('此文档不能发送给模型。');
    const path = this.path, data = this.plugin.read(path), settings = {...this.plugin.store.settings};
    let thread = data.threads.find(t => t.id === this.activeThread);
    const whole = settings.context === 'whole';
    if (!thread && !this.selected && !whole) throw new Error('请先选中一段文字，或将范围切换为“当前文档全文”。');
    const context = thread?.context || contextFor(this.passages, this.selected, this.text, whole, settings.maxContext);
    if (!thread) {
      const citations: Record<string, Anchor> = {};
      for (const p of this.passages) if (context.includes(`[¶${p.number}] `)) citations[String(p.number)] = makeAnchor(this.text, p.start, p.end);
      thread = {id: uid(), anchor: this.selected ? {...this.selected} : undefined, messages: [], created: Date.now(), context, citations}; data.threads.push(thread); this.activeThread = thread.id;
    }
    const target = thread; target.messages.push({role: 'user', content: question}); delete target.error; data.draft = ''; data.updated = Date.now();
    this.composer.value = ''; await this.plugin.persist();
    this.aborter = new AbortController(); const controller = this.aborter; this.sendButton.textContent = '停止 ■'; this.composer.disabled = true; this.tab = 'threads'; this.updateContext(); await this.renderMargin();
    const response = {role: 'assistant' as const, content: ''}; const history = target.messages.map(m => ({...m})); target.messages.push(response);
    try {
      response.content = await askAgent({settings, context, quote: target.anchor?.quote, messages: history, signal: controller.signal, onText: text => {
        response.content = text;
        if (this.path !== path || this.aborter !== controller) return;
        clearTimeout(this.renderTimer); this.renderTimer = setTimeout(() => {void this.renderMargin().catch(showError);}, 120);
      }});
    } catch(e) {target.error = e instanceof Error ? e.message : '回答失败，请重试。'; if (!response.content) target.messages.pop();}
    finally {
      clearTimeout(this.renderTimer); data.updated = Date.now(); await this.plugin.persist();
      if (this.aborter === controller) {this.aborter = undefined; this.sendButton.textContent = '发送 ↗'; this.composer.disabled = false; if (this.path === path) {await this.renderMargin(); this.margin.scrollTop = this.margin.scrollHeight;}}
    }
  }
  stop() {this.aborter?.abort();}
  private async exportNotes() {
    const data = this.plugin.read(this.path); if (!data.highlights.some(h => !h.removed) && !data.threads.length) {new Notice('先留下一条高亮、批注或对话再导出。'); return;}
    const folder = '收集箱'; if (!this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    const title = this.path.split('/').pop()!.replace(/\.md$/, '').replace(/[\\/:*?"<>|\[\]#^]/g, '-');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-'); let path = normalizePath(`${folder}/${title}-阅读笔记-${stamp}.md`);
    if (this.app.vault.getAbstractFileByPath(path)) path = normalizePath(`${folder}/${title}-阅读笔记-${stamp}-${uid().slice(0, 6)}.md`);
    await this.app.vault.create(path, exportReading(this.path, data, this.app.vault.getName())); new Notice(`阅读笔记已保存到 ${path}`);
  }
  async onClose() {this.revision++; this.stop(); this.resizeObserver?.disconnect(); clearTimeout(this.progressTimer); clearTimeout(this.renderTimer); clearTimeout(this.reloadTimer); this.captureProgress(); this.root?.remove(); await this.flushDraft();}
}

class GlossSettings extends PluginSettingTab {
  constructor(app: App, private plugin: GlossPlugin) {super(app, plugin);}
  display() {
    const el = this.containerEl; el.empty(); el.createEl('h2', {text: 'Gloss · 阅读伴侣'});
    el.createEl('p', {text: '阅读、高亮与批注在本地完成。只有主动发送时，选定的正文范围才会交给所选模型。'});
    const s = this.plugin.store.settings;
    const save = async () => {try {await this.plugin.persist(); for (const leaf of this.app.workspace.getLeavesOfType(VIEW)) (leaf.view as GlossView).refreshSettings();} catch(e) {showError(e);}};
    new Setting(el).setName('Agent 服务').addDropdown(d => d.addOptions({codex: '本机 Codex CLI', api: 'OpenAI 兼容 API'}).setValue(s.provider).onChange(async v => {s.provider = v; await save(); this.display();}));
    if (s.provider === 'codex') {
      el.createEl('p', {text: '沿用本机 ChatGPT 登录；不会加载用户 CLI 的 MCP、hooks 或项目配置。只读模式运行于临时空目录，每轮独立发送阅读上下文。'});
      new Setting(el).setName('Codex 可执行文件').setDesc('留空自动查找；需要先在终端完成 codex login。').addText(t => t.setPlaceholder('/Users/你的用户名/.local/bin/codex').setValue(s.codexPath).onChange(async v => {s.codexPath = v.trim(); await save();}));
      new Setting(el).setName('Codex 模型').setDesc('留空使用 CLI 默认模型；也可填写你账号可用的模型 ID。').addText(t => t.setValue(s.codexModel).onChange(async v => {s.codexModel = v.trim(); await save();}));
    } else {
      new Setting(el).setName('API 基础地址').setDesc('填写到 /v1，例如 https://api.openai.com/v1。支持本机 HTTP 服务。').addText(t => t.setValue(s.apiBase).onChange(async v => {s.apiBase = v.trim(); await save();}));
      new Setting(el).setName('模型 ID').addText(t => t.setPlaceholder('填写服务商提供的模型 ID').setValue(s.apiModel).onChange(async v => {s.apiModel = v.trim(); await save();}));
      new Setting(el).setName('API Key').setDesc('仅保存在当前运行会话中，不写入插件文件；重启后需重新输入。').addText(t => {t.inputEl.type = 'password'; t.setValue(s.apiKey).onChange(v => {s.apiKey = v;});});
    }
    new Setting(el).setName('测试 Agent 连接').setDesc('只发送一条公开测试句，不读取笔记。').addButton(b => b.setButtonText('测试连接').onClick(async () => {b.setDisabled(true); const controller = new AbortController(); try {const answer = await askAgent({settings: {...s}, context: '[¶1] 阅读帮助人理解文字。', messages: [{role: 'user', content: '请用一句中文解释这句话，并引用段落编号。'}], signal: controller.signal, onText: () => {}}); new Notice('连接成功：' + answer.slice(0, 120), 10000);} catch(e) {showError(e);} finally {b.setDisabled(false);}}));
    new Setting(el).setName('新问题默认范围').addDropdown(d => d.addOptions({nearby: '选文及相邻段落', whole: '当前文档全文'}).setValue(s.context).onChange(async v => {s.context = v; await save();}));
    new Setting(el).setName('上下文字符上限').setDesc('超出时提示缩小范围，不静默截断文档。').addText(t => t.setValue(String(s.maxContext)).onChange(async v => {const n = Number(v); if (Number.isFinite(n) && n >= 1000 && n <= 300000) {s.maxContext = Math.round(n); await save();}}));
    el.createEl('h3', {text: '存储与边界'});
    el.createEl('p', {text: '批注、对话、草稿与进度保存在插件 data.json 中。导出会在收集箱新建 Markdown 笔记，原文不改写。私密日记与受保护目录不进入本阅读器。嵌入的其他笔记不会自动展开给模型。'});
    el.createEl('p', {text: '当前支持 Markdown；PDF、EPUB、网页导入和朗读尚未实现。快捷键：F 沉浸，Esc 退出，/ 聚焦提问，⌘/Ctrl+Enter 发送。'});
  }
}
