import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {activeTocIndex} from '../src/reading-ui';
import {configureLanguage,currentLanguage,translate} from '../src/i18n';

test('the current contents entry is the last heading above the reading line',()=>{
 assert.equal(activeTocIndex([],100),-1);
 assert.equal(activeTocIndex([300,900],100),-1);
 assert.equal(activeTocIndex([-40,120,800],100),0);
 assert.equal(activeTocIndex([-40,60,800],100),1);
 assert.equal(activeTocIndex([-40,60,80],100),2);
 // A heading that never resolves (missing element) must not win just because it is last.
 assert.equal(activeTocIndex([-40,Number.POSITIVE_INFINITY],100),0);
});
test('the stylesheet floats the contents on the right without taking width from the text',async()=>{
 const css=await readFile(new URL('../styles.css',import.meta.url),'utf8');
 assert.ok(!/gloss-toc-(panel|strip|open)/.test(css),'the left panel and strip are gone');
 assert.ok(!css.includes('--toc-panel'),'the floating contents never take width from the text');
 const float=css.match(/\.gloss-toc-float\{([^}]*)\}/)?.[1]||'';
 assert.ok(float.includes('position:absolute')&&float.includes('right:10px'),'contents float on the right edge');
 assert.ok(css.includes('.gloss-toc-tick.is-current{width:22px;background:var(--rubric);}'),'the current heading line is marked');
 const open=css.match(/\.gloss-toc-float:is\(([^)]*\))\) \.gloss-toc-card\{([^}]*)\}/);
 assert.ok(open,'missing the open rule');
 for(const state of [':hover','.is-open',':has(:focus-visible)'])assert.ok(open[1].includes(state),'card must open on '+state);
 assert.ok(open[2].includes('visibility:visible'));
 assert.ok(css.includes('.gloss-root.gloss-mobile .gloss-toc-float{display:none;}'),'phones keep the contents dialog');
 // Entry rows beat the host theme's button styles and use the reading palette in the card and the dialog.
 assert.ok(css.includes('.gloss-toc-card button.gloss-toc-item'));
 assert.ok(css.includes('.modal.gloss-toc-modal button.gloss-toc-item'));
 assert.ok(css.includes('button.gloss-toc-item.is-current'));
 assert.ok(css.includes('[data-depth="2"]'));
 assert.ok(css.includes('.modal.gloss-toc-modal{background:var(--bg-raised)'));
});
test('desktop floats appearance, note and question at the bottom right; phones keep the dock',async()=>{
 const css=await readFile(new URL('../styles.css',import.meta.url),'utf8');
 const fab=css.match(/\.gloss-root:not\(\.gloss-mobile\) \.gloss-dock-float\{([^}]*)\}/)?.[1]||'';
 assert.ok(fab.includes('right:24px')&&fab.includes('bottom:24px')&&fab.includes('flex-direction:column'));
 assert.ok(css.includes('.gloss-root.gloss-notebook-open:not(.gloss-mobile) .gloss-dock-float{right:434px;}'),'the buttons move clear of the notebook');
 const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
 assert.ok(source.includes("button(Platform?.isMobile?dock:float,'Aa'"),'Aa joins the floating group on desktop');
 assert.ok(source.includes('else float.append(aaButton,noteButton,this.questionButton);'),'desktop order: Aa, note, then question nearest the corner');
});
test('the reader has one contents entry and it toggles',async()=>{
 const source=await readFile(new URL('../src/main.ts',import.meta.url),'utf8');
 assert.ok(!source.includes('tocButton')&&!source.includes('gloss-toc-strip'),'the toolbar button and the left strip are gone');
 assert.ok(source.includes("button(float,'',()=>this.showContents(),'gloss-toc-rail')"),'the heading lines are the entry');
 assert.ok(source.includes("this.setContentsOpen(!this.tocFloat.hasClass('is-open'))"),'the same click pins and unpins the list');
 assert.ok(source.includes('this.showContentsModal()'),'phones and hidden floats fall back to the dialog');
});
test('contents labels translate, and an unresolved host language never forces English',()=>{
 configureLanguage('zh-CN','zh');
 assert.equal(translate(currentLanguage(),'文档目录'),'文档目录');
 assert.equal(translate(currentLanguage(),'这篇文档没有分节标题。'),'这篇文档没有分节标题。');
 configureLanguage('en','zh');
 assert.equal(translate(currentLanguage(),'文档目录'),'Table of contents');
 assert.equal(translate(currentLanguage(),'PDF 页码'),'PDF pages');
 assert.equal(translate(currentLanguage(),'正在计算页码…'),'Calculating pages…');
 assert.equal(translate(currentLanguage(),'共 {0} 页',12),'12 pages');
 assert.equal(translate(currentLanguage(),'暂时无法计算页码。'),'Page numbers are currently unavailable.');
 assert.equal(translate(currentLanguage(),'这篇文档没有分节标题。'),'This document has no section headings.');
 assert.equal(translate(currentLanguage(),'打开文档目录'),'Open table of contents');
 assert.equal(translate(currentLanguage(),'收起目录'),'Collapse contents');
 assert.equal(translate(currentLanguage(),'目录'),'Contents');
 assert.equal(translate(currentLanguage(),'（未命名章节）'),'(Untitled section)');
 // Auto re-resolves when the host language settles; an empty host keeps the last known language.
 configureLanguage('auto','en');
 assert.equal(currentLanguage(),'en');
 configureLanguage('auto','zh-CN');
 assert.equal(currentLanguage(),'zh-CN');
 configureLanguage('auto','');
 assert.equal(currentLanguage(),'zh-CN');
});
