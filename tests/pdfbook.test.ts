import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPdfBook,linesFromItems,PDF_SCAN_CODE,PDF_TOO_LARGE_CODE,type PdfItem,type PdfPageItems} from '../src/pdfbook';
import {BOOK_LIMITS} from '../src/formats';

const item=(str:string,y:number,x=0,size=10,bold=false,hasEOL=false):PdfItem=>({str,hasEOL,x,y,size,bold});
const page=(page:number,items:PdfItem[]):PdfPageItems=>({page,items});

const BOOK_PAGE=(body:PdfItem[]):PdfItem[]=>[
 item('书名示例出版社',780,60,8),     // repeated header at the top of the page
 ...body,
 item('— 12 —',40,290,8),            // footer ornament
 item('1',25,300,9),                 // page number
];

test('lines group by y with CJK joins, Latin spacing and hyphen continuation',()=>{
 const {lines}=linesFromItems([item('阅读',100,0,12),item('体验',100,30,12,true,true),item('the quick',80,0,12,true,false),item('brown',80,60,12,true,true)]);
 assert.equal(lines.length,2);
 assert.equal(lines[0]!.text,'阅读体验');
 assert.equal(lines[1]!.text,'the quick brown');
});

test('furniture removal drops repeated headers, footers and page numbers',()=>{
 const bodies=['这本书记录了第一段考察与思考，内容各页不同，讲述各自的重点。','这一页谈的是方法与工具，视角不同，例子也完全不一样。','最后一页收束全文，回到最初的问题并给出明确的回答。'];
 const pages=[1,2,3].map(n=>page(n,BOOK_PAGE([item(bodies[n-1]!,700,60,10,false,true),item('第'+n+'页的补充说明，句子保持完整，避免被当作页眉。',640,60,10,false,true)])));
 const book=buildPdfBook(pages,undefined,{title:'示例书'});
 assert.equal(book.warnings.length,0);
 const text=book.sections.flatMap(s=>s.blocks.map(b=>b.text)).join('\n');
 assert.ok(!text.includes('书名示例出版社')&&!text.includes('— 12 —'));
 assert.ok(text.includes('考察与思考')&&text.includes('收束全文'));
});

test('paragraphs break on gaps and page starts after closed sentences, and merge open跨页 paragraphs',()=>{
 const bodyA=[item('第一段完整地讲完了。',700,60,10,false,true),item('第二段跨页讲了一个很长的道理，到本页末尾还没讲完，',640,60,10,false,true),item('本页还有一段收尾的话，话没说完就翻页了，',560,60,10,false,true)];
 const bodyB=[item('续上的后半句终于讲完了。',700,60,10,false,true),item('第三段另起新页，是一个全新的段落。',600,60,10,false,true),item('第三页的第二段，同样完整。',520,60,10,false,true)];
 const book=buildPdfBook([page(1,BOOK_PAGE(bodyA)),page(2,BOOK_PAGE(bodyB))],undefined,{});
 const paras=book.sections.flatMap(s=>s.blocks.filter(b=>b.kind==='p').map(b=>b.text));
 assert.equal(paras.length,5);
 assert.match(paras[0]!,/第一段完整地讲完了/);
 assert.match(paras[2]!,/话没说完就翻页了，续上的后半句/);
 assert.match(paras[4]!,/第三页的第二段/);
 const pages=book.sections.flatMap(s=>s.blocks.map(b=>b.page));
 assert.deepEqual(pages,[1,1,1,2,2]);
});

test('font tiers become headings and sections; outline titles override section titles',()=>{
 const body=[item('第一章 起点',700,60,16,true,true),item('正文第一段，内容平实，字号也是正文大小，讲得很清楚。',640,60,10,false,true),item('小节标题',560,60,12,true,true),item('小节正文，同样平实。',520,60,10,false,true)];
 const second=page(2,BOOK_PAGE([item('第二页的正文内容，继续讲下去，保持整本书的连贯性和完整性。',700,60,10,false,true)]));
 const book=buildPdfBook([page(1,BOOK_PAGE(body)),second],[{title:'第一章 · 起点',level:1,page:1}],{});
 assert.equal(book.sections.length,1);
 assert.equal(book.sections[0]!.title,'第一章 · 起点');
 assert.equal(book.sections[0]!.blocks[0]!.kind,'p');
 const heads=book.sections[0]!.blocks.filter(b=>b.kind==='heading');
 assert.ok(heads.length>=1);
});

test('scanned pdfs refuse reflow and oversized ones hit the limit',()=>{
 const scan=[1,2,3,4].map(n=>page(n,[item('封面',300,60,10,false,true)]));
 assert.throws(()=>buildPdfBook(scan,undefined,{}),(e:Error)=>e.message===PDF_SCAN_CODE);
 const fat=Array.from({length:2},(_,i)=>page(i+1,BOOK_PAGE([item(('字'[i]??'零').repeat(BOOK_LIMITS.text/2+1),100,60,10,false,true)])));
 assert.throws(()=>buildPdfBook(fat,undefined,{}),(e:Error)=>e.message===PDF_TOO_LARGE_CODE);
});
