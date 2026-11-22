import test from 'node:test';
import assert from 'node:assert/strict';
import {checkCss,checkCopy,checkSource} from '../scripts/check-ui.mjs';

test('stylesheet rules catch overrides, off-scale type, faint text, slow motion and raw colors',()=>{
 const found=checkCss('.a{color:red!important}.b{font-size:13.5px}.c{font:600 9px/1 x}.d{color:var(--ink-4)}.e{transition:opacity .4s}.f{background:#c1401b}');
 assert.equal(found.length,6,found.join('\n'));
 assert.deepEqual(checkCss('.a{--pen:#c1401b;background:var(--pen);box-shadow:0 1px 2px #0003,0 0 0 1px rgb(0 0 0/.1);font:14px/1.5 x;transition:opacity var(--d,.15s),transform .3s}'),[]);
 assert.deepEqual(checkCss('.gr-shelf-book{background:#bf3f2b}'),[],'fixed physical palettes are exempt');
});
test('removing an outline needs a visible replacement',()=>{
 assert.equal(checkCss('.x input{outline:none}').length,1);
 assert.deepEqual(checkCss('.x input:focus{outline:none;border-color:var(--a)}'),[]);
 assert.deepEqual(checkCss('.field input{outline:none}.field:has(input:focus-visible){border-color:var(--a)}'),[]);
});
test('copy rules allow data labels but reject colons and filler elsewhere',()=>{
 assert.deepEqual(checkCopy({'范围：{0}':'Folder: {0}','例如：收集箱':'e.g. Inbox','无法获取（HTTP 401）：密钥无效。':'Cannot fetch (HTTP 401): the key is invalid.','Z-Library：请求被拒绝。':'Z-Library: the request was rejected.','刚刚':'Just now'}),[]);
 assert.equal(checkCopy({'注意：这会删除笔记':'Note: this deletes the note'}).length,2);
 assert.equal(checkCopy({'开始':'Just start typing'}).length,1);
});
test('source rules reject fake buttons and positive tabindex',()=>{
 assert.equal(checkSource("el.createDiv({cls:'card',attr:{role:'button'}});").length,1);
 assert.deepEqual(checkSource("el.createDiv({cls:'gr-cloud-card',attr:{role:'button','tabindex':'0'}});"),[]);
 assert.equal(checkSource("el.createDiv({cls:'x',attr:{tabindex:'2'}});").length,1);
});
