import test from 'node:test';
import assert from 'node:assert/strict';
import {shelfBooks,shelfTitle,rowsByWidth,spineStyle,formatShelfProgress,shelfPathMatches,formatBookSize,bookNumber,type ShelfFile,type ShelfReading,type SpineVariant} from '../src/bookshelf';

const file=(path:string):ShelfFile=>({path,basename:path.split('/').pop()!,extension:path.split('.').pop()!});

test('shelf ordering puts recently read first, then unread alphabetically',()=>{
 const readings:Record<string,ShelfReading>={'b.pdf':{progress:.5,updated:200},'a.epub':{progress:1,updated:300},'c.md':{progress:.2,updated:100}};
 const books=shelfBooks([file('z.md'),file('b.pdf'),file('a.epub'),file('c.md')],readings);
 assert.deepEqual(books.map(b=>b.path),['a.epub','b.pdf','c.md','z.md']);
 assert.equal(books[2]!.progress,.2);assert.equal(books[3]!.progress,0);
});

test('progress clamps to 0..1 and titles drop known extensions only',()=>{
 assert.deepEqual(shelfBooks([file('x.md')],{'x.md':{progress:5}})[0]!.progress,1);
 assert.equal(shelfTitle('我的书.epub'),'我的书');assert.equal(shelfTitle('notes.MD'),'notes');assert.equal(shelfTitle('v1.2.pdf'),'v1.2');
});

test('spine packing fills rows by real widths and never overflows',()=>{
 const widths=[46,52,38,60,44,48,56],items=widths.map((w,i)=>({i,w}));
 const rows=rowsByWidth(items,item=>item.w,200);
 for(const row of rows){
  const used=row.reduce((sum,item,j)=>sum+item.w+(j?12:0),0);
  assert.ok(used<=200,'row exceeds plank: '+used);
 }
 const order=rows.flat().map(item=>item.i);
 assert.deepEqual(order,[0,1,2,3,4,5,6]);
 assert.deepEqual(rowsByWidth([],()=>40,200),[]);
 assert.equal(rowsByWidth([{w:500}],item=>item.w,200).length,1);
});

test('spine styles are stable, bounded and carry a binding variant',()=>{
 const a=spineStyle('三体'),b=spineStyle('三体');
 assert.deepEqual(a,b);
 assert.ok(a.width>=56&&a.width<=72,'width '+a.width);
 assert.ok(a.height>=320&&a.height<=391,'height '+a.height);
 const variants=new Set<SpineVariant>(['plain','label','foil','bands']);
 for(let i=0;i<24;i++)assert.ok(variants.has(spineStyle('书'+i).variant));
 const colors=new Set(Array.from({length:20},(_,i)=>spineStyle('书'+i).color));
 assert.ok(colors.size>3);
});

test('progress formatting is a bounded integer percentage',()=>{
 assert.equal(formatShelfProgress(.456),46);assert.equal(formatShelfProgress(-1),0);assert.equal(formatShelfProgress(2),100);
});

test('shelf folder scoping accepts the whole vault or a folder subtree',()=>{
 assert.equal(shelfPathMatches('收集箱/a.pdf',''),true);
 assert.equal(shelfPathMatches('收集箱/a.pdf','收集箱'),true);
 assert.equal(shelfPathMatches('收集箱/子/a.epub','收集箱'),true);
 assert.equal(shelfPathMatches('收集箱/a.pdf','收集箱/'),true);
 assert.equal(shelfPathMatches('收集箱备份/a.pdf','收集箱'),false);
 assert.equal(shelfPathMatches('日记/a.pdf','收集箱'),false);
});

test('book sizes format for the card and accession numbers stay stable',()=>{
 assert.equal(formatBookSize(0),'');assert.equal(formatBookSize(500000),'488 KB');
 assert.equal(formatBookSize(2400000),'2.3 MB');assert.equal(formatBookSize(25000000),'24 MB');
 assert.equal(bookNumber('三体'),bookNumber('三体'));assert.ok(bookNumber('x')>=100&&bookNumber('x')<=999);
});
