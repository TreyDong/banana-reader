import test from 'node:test';
import assert from 'node:assert/strict';
import * as http from 'node:http';
import { once } from 'node:events';
import { makeAnchor, resolveAnchor, indexPassages, contextFor, freshReading, exportReading, blockedPath } from './core';
import { apiEndpoint, askAgent, parseCodexLine } from './agent';

test('Chinese selection survives inserted paragraphs and repeated phrases', () => {
  const source = '第一章\n\n我们在这里慢慢阅读。\n\n第二章\n\n我们在这里慢慢阅读。';
  const start = source.lastIndexOf('我们在这里'); const a = makeAnchor(source, start, source.length);
  const edited = '新增说明。\n\n' + source;
  assert.equal(resolveAnchor(edited, a), edited.lastIndexOf('我们在这里'));
  assert.equal(edited.slice(resolveAnchor(edited, a)!), a.quote);
});
test('missing and ambiguous quotes are never guessed onto another passage', () => {
  const a = makeAnchor('前文这一句后文', 2, 5);
  assert.equal(resolveAnchor('前文已经改写后文', a), null);
  const b = makeAnchor('这一句', 0, 3);
  assert.equal(resolveAnchor('这一句——这一句', b), null);
});
test('anchors trim whitespace without losing CJK or emoji offsets', () => {
  const text = '甲\n\n  阅读📖，保留理解。  \n\n乙';
  const a = makeAnchor(text, 3, text.length - 3);
  assert.equal(a.quote, '阅读📖，保留理解。');
  assert.equal(resolveAnchor(text, a), text.indexOf('阅读'));
});
test('nearby context includes complete selected paragraphs, preserves numbering and excludes unrelated passages', () => {
  const ix = indexPassages(['引言', '背景', '核心观点', '论据', '结论', '无关附录']);
  const a = makeAnchor(ix.text, ix.passages[2].start, ix.passages[2].end);
  const c = contextFor(ix.passages, a, ix.text, false, 1000);
  assert.equal(c, '[¶2] 背景\n\n[¶3] 核心观点\n\n[¶4] 论据');
  assert.throws(() => contextFor(ix.passages, undefined, ix.text, true, 4), /超过/);
  const changed = makeAnchor('旧的原句', 0, 5);
  assert.throws(() => contextFor(ix.passages, changed, ix.text, false, 1000), /无法可靠定位/);
});
test('cross-paragraph selection keeps all selected passages', () => {
  const ix = indexPassages(['A', 'B段', 'C段', 'D', 'E']);
  const a = makeAnchor(ix.text, ix.passages[1].start, ix.passages[2].end);
  assert.equal(contextFor(ix.passages, a, ix.text, false, 1000), '[¶1] A\n\n[¶2] B段\n\n[¶3] C段\n\n[¶4] D');
});
test('exports retain quote, personal note, full conversation and encoded return links', () => {
  const r = freshReading(); const a = makeAnchor('完整的原文', 0, 5);
  r.highlights.push({id:'h1',anchor:a,color:'yellow',note:'我的批注',created:1});
  r.highlights.push({id:'removed',anchor:a,color:'pink',note:'不应导出',created:1,removed:true});
  r.threads.push({id:'t1',anchor:a,messages:[{role:'user',content:'为什么？'},{role:'assistant',content:'解释 [¶1]'}],created:1});
  const md = exportReading('剪藏/一篇 文档.md', r, '00_个人库');
  assert.match(md, /我的批注/); assert.match(md, /解释 \[¶1\]/); assert.match(md, /anchor=h1/); assert.match(md, /anchor=t1/); assert.ok(md.includes(encodeURIComponent('剪藏/一篇 文档.md'))); assert.ok(!md.includes('不应导出'));
});
test('protected directories are excluded without matching unrelated similar names', () => {
  for (const p of ['日记/今天.md', '20_投资库/a.md', '子目录/60_工作库/a.md', 'A1_交易数据/a.md']) assert.equal(blockedPath(p), true);
  assert.equal(blockedPath('自媒体/阅读日记的方法.md'), false);
});
test('Codex parser accepts complete answers and recognizes failures without leaking diagnostics', () => {
  assert.deepEqual(parseCodexLine('{"type":"item.completed","item":{"type":"agent_message","text":"答案 [¶1]"}}'), {text:'答案 [¶1]'});
  assert.deepEqual(parseCodexLine('{"type":"turn.failed","error":{"message":"failed"}}'), {error:'failed'});
  assert.deepEqual(parseCodexLine('diagnostic private-output'), {});
});
test('API endpoint validation allows TLS and localhost, rejects credential URLs and remote HTTP', () => {
  assert.equal(apiEndpoint('https://example.com/v1/').pathname, '/v1/chat/completions');
  assert.equal(apiEndpoint('http://127.0.0.1:1234/v1').hostname, '127.0.0.1');
  assert.throws(() => apiEndpoint('http://example.com/v1'));
  assert.throws(() => apiEndpoint('https://key@example.com/v1'));
  assert.throws(() => apiEndpoint('https://example.com/v1?key=x'));
});

async function mockService(handler: http.RequestListener) {
  const server = http.createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address() as {port:number};
  return {server, settings:{provider:'api',codexPath:'',codexModel:'',apiBase:`http://127.0.0.1:${address.port}/v1`,apiKey:'test-key',apiModel:'test-model'}};
}
test('API roundtrip streams a chunked SSE response and sends only the given context/history', async () => {
  let request: any; const updates: string[] = [];
  const {server,settings} = await mockService((req,res) => {let body=''; req.on('data',b=>body+=b); req.on('end',()=>{request=JSON.parse(body); res.writeHead(200,{'Content-Type':'text/event-stream'}); res.write('data: {"choices":[{"delta":{"content":"解释"}}]}\r\n\r\n'); setTimeout(()=>res.end('data: {"choices":[{"delta":{"content":" [¶1]"}}]}\n\ndata: [DONE]\n\n'),20);});});
  try {const answer=await askAgent({settings,context:'[¶1] 公开测试原文',messages:[{role:'user',content:'请解释'}],signal:new AbortController().signal,onText:t=>updates.push(t)}); assert.equal(answer,'解释 [¶1]'); assert.deepEqual(updates,['解释','解释 [¶1]']); assert.equal(request.model,'test-model'); assert.equal(request.messages.at(-1).content,'请解释'); assert.ok(JSON.stringify(request).includes('公开测试原文'));} finally {server.closeAllConnections(); server.close();}
});
test('API cancellation closes a pending request', async () => {
  const {server,settings}=await mockService((req,res)=>{res.writeHead(200,{'Content-Type':'text/event-stream'});res.write(': keepalive\n\n');});
  try {const c=new AbortController();const p=askAgent({settings,context:'test',messages:[],signal:c.signal,onText:()=>{}});setTimeout(()=>c.abort(),30);await assert.rejects(p,/已停止/);} finally {server.closeAllConnections();server.close();}
});
test('API failures never echo provider error bodies or keys', async () => {
  const {server,settings}=await mockService((req,res)=>{res.writeHead(401);res.end('secret-provider-error test-key');});
  try {await assert.rejects(askAgent({settings,context:'test',messages:[],signal:new AbortController().signal,onText:()=>{}}), e => String(e).includes('401') && !String(e).includes('test-key') && !String(e).includes('secret-provider-error'));} finally {server.closeAllConnections();server.close();}
});
