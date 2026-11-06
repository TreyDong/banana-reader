import test from 'node:test';
import assert from 'node:assert/strict';
import {parseShelfBook,parseShelfSync,normalizeBookKey,matchLocalBook,parseBookmarks,parseMyReviews,WereadClient,WereadAuthError,WereadBlockedError,WereadApiError,WereadError,WEREAD_GATEWAY,WEREAD_SKILL_VERSION,type WereadFetcher} from '../src/weread';

interface RecordedCall{url:string;method:string;headers:Record<string,string>;body?:string}
function fetcherOf(handler:(call:RecordedCall)=>{status?:number;json?:unknown;text?:string;bytes?:Uint8Array;headers?:Record<string,string>}|undefined){
 const calls:RecordedCall[]=[];
 const fetcher:WereadFetcher=async(url,init)=>{const call={...init,url};calls.push(call);const response=handler(call)||{};
  return{status:response.status??200,headers:response.headers||{},json:response.json??null,text:response.text??'',arrayBuffer:Promise.resolve(response.bytes?response.bytes.buffer.slice(response.bytes.byteOffset,response.bytes.byteOffset+response.bytes.byteLength) as ArrayBuffer:new ArrayBuffer(0))};};
 return{calls,fetcher};
}
const shelfPayload=()=>({books:[
 {bookId:'33001',title:'三体全集（全三册）',author:'刘慈欣',cover:'https://cdn.weread.qq.com/weread/cover/33/yuewen_33001/s_yuewen_33001.jpg',category:'科幻',readUpdateTime:1700000000,finishReading:1,secret:0,isTop:1,readerLink:'https://weread.qq.com/web/reader/330',deepLink:'weread://book/33001'},
 {bookId:'33002',title:'置身事内',author:'兰小欢[译]',cover:'https://cdn.weread.qq.com/weread/cover/32/yuewen_33002/s_yuewen_33002.jpg',category:'经济',readUpdateTime:1699000000,finishReading:0,secret:1,isTop:0},
 {bookId:'',title:'坏数据'},
 {bookId:'33003',title:'无链接的书',cover:'',readUpdateTime:0}
],albums:[{albumInfo:{}},{albumInfo:{}}],archive:[],mp:{}});
const shelfFile=(path:string,basename:string,extension='epub')=>({path,basename,extension});

test('shelf parsing keeps readable books, high-resolution covers and upstream links',()=>{
 const shelf=parseShelfSync(shelfPayload());
 assert.equal(shelf.books.length,3);assert.equal(shelf.albums,2);
 const [santi,book,plain]=shelf.books;
 assert.equal(santi.title,'三体全集（全三册）');
 assert.equal(santi.cover,'https://cdn.weread.qq.com/weread/cover/33/yuewen_33001/t7_yuewen_33001.jpg');
 assert.equal(santi.author,'刘慈欣');
 assert.equal(santi.readUpdateTime,1700000000000);
 assert.equal(santi.finished,true);assert.equal(santi.secret,false);assert.equal(santi.isTop,true);
 assert.equal(santi.readerLink,'https://weread.qq.com/web/reader/330');assert.equal(santi.deepLink,'weread://book/33001');
 assert.equal(book.author,'兰小欢【译】');assert.equal(book.secret,true);assert.equal(book.finished,false);assert.equal(book.readerLink,'');
 assert.equal(plain.readUpdateTime,0);assert.equal(plain.cover,'');
 const pinned=parseShelfSync(shelfPayload()).books;
 assert.equal(pinned[0].bookId,'33001','pinned book sorts first');
});

test('gateway requests flatten parameters, pin the skill version and never send credentials to covers',async()=>{
 const {calls,fetcher}=fetcherOf(()=>({json:{errcode:0}}));
 const client=new WereadClient('wrk-secret',fetcher);
 await client.shelf();
 assert.equal(calls.length,1);
 assert.equal(calls[0].url,WEREAD_GATEWAY);
 assert.equal(calls[0].headers.Authorization,'Bearer wrk-secret');
 assert.deepEqual(JSON.parse(calls[0].body||'{}'),{api_name:'/shelf/sync',skill_version:WEREAD_SKILL_VERSION});
 const covers=fetcherOf(()=>({bytes:new Uint8Array([1,2]),headers:{'content-type':'image/jpeg'}}));
 const image=await new WereadClient('wrk-secret',covers.fetcher).coverImage('https://cdn.weread.qq.com/x.jpg');
 assert.equal(image?.mime,'image/jpeg');
 assert.equal(covers.calls[0].headers.Authorization,undefined);
 const protocol=await new WereadClient('wrk-secret',covers.fetcher).coverImage('//cdn.weread.qq.com/x.jpg');
 assert.equal(protocol?.bytes.byteLength,2);
 assert.equal(covers.calls[1].url,'https://cdn.weread.qq.com/x.jpg');
});

test('auth, risk control and business errors classify into distinct failures',async()=>{
 const auth=fetcherOf(()=>({status:401,json:{errcode:-2013,errmsg:'鉴权失败'}}));
 await assert.rejects(new WereadClient('wrk-bad',auth.fetcher).shelf(),WereadAuthError);
 const bodyAuth=fetcherOf(()=>({json:{errcode:-2013,errmsg:'鉴权失败'}}));
 await assert.rejects(new WereadClient('wrk-bad',bodyAuth.fetcher).validate(),WereadAuthError);
 const blocked=fetcherOf(()=>({status:403,json:{}}));
 await assert.rejects(new WereadClient('wrk-ok',blocked.fetcher).validate(),WereadBlockedError);
 const business=fetcherOf(()=>({json:{errcode:-2012,errmsg:'参数错误'}}));
 const failure=await new WereadClient('wrk-ok',business.fetcher).shelf().catch(error=>error);
 assert.ok(failure instanceof WereadApiError);assert.equal(failure.code,'api');assert.equal(failure.errcode,-2012);
 const http=fetcherOf(()=>({status:502,json:null}));
 await assert.rejects(new WereadClient('wrk-ok',http.fetcher).shelf(),/HTTP 502/);
 const garbage=fetcherOf(()=>({text:'<html>',json:null}));
 await assert.rejects(new WereadClient('wrk-ok',garbage.fetcher).shelf(),/无法解析/);
 const network=fetcherOf(()=>{throw new Error('socket down');});
 await assert.rejects(new WereadClient('wrk-ok',network.fetcher).shelf(),/socket down/);
 const noKey=fetcherOf(()=>({json:{}}));
 await assert.rejects(new WereadClient('',noKey.fetcher).validate(),WereadAuthError);
 assert.equal(noKey.calls.length,0,'an unset key must not hit the network');
 const upgrade=fetcherOf(()=>({json:{errcode:0,upgrade_info:{message:'请升级到 1.1.0'}}}));
 await assert.rejects(new WereadClient('wrk-ok',upgrade.fetcher).validate(),/升级到 1\.1\.0/);
 const valid=fetcherOf(()=>({json:{apis:[]}}));
 assert.equal(await new WereadClient('wrk-ok',valid.fetcher).validate(),true);
});

test('missing covers resolve to null instead of throwing',async()=>{
 const client=new WereadClient('wrk-ok',fetcherOf(()=>({bytes:new Uint8Array([])})).fetcher);
 assert.equal(await client.coverImage(''),null);
 assert.equal(await client.coverImage('https://cdn.weread.qq.com/empty.jpg'),null);
});

test('local matching normalizes punctuation and volume remarks but never guesses substrings',()=>{
 assert.equal(normalizeBookKey('三体全集（全三册）'),'三体全集');
 assert.equal(normalizeBookKey(' The  Three-Body Problem! '),'thethreebodyproblem');
 assert.equal(matchLocalBook('三体全集（全三册）',[shelfFile('books/三体全集.epub','三体全集')]),'books/三体全集.epub');
 assert.equal(matchLocalBook('三体',[shelfFile('books/三体.pdf','三体','pdf')]),'books/三体.pdf');
 assert.equal(matchLocalBook('三体',[shelfFile('books/三体.md','三体','md')]),'books/三体.md');
 assert.equal(matchLocalBook('三体',[shelfFile('books/三体全集.epub','三体全集')]),undefined);
 assert.equal(matchLocalBook('三体',[shelfFile('books/三体.txt','三体','txt')]),undefined);
 assert.equal(matchLocalBook('三体',[shelfFile('books/别的书.epub','别的书')]),undefined);
 assert.equal(matchLocalBook('',[shelfFile('books/x.epub','x')]),undefined);
 assert.equal(matchLocalBook('几何原本（第一卷）',[shelfFile('books/几何原本 第一卷.epub','几何原本 第一卷')]),undefined,'only punctuation is normalized, spacing differences must not fake a match');
});

test('highlights parse chapter titles, drop empty marks and convert timestamps',async()=>{
 const payload={updated:[
  {bookmarkId:'m1',chapterUid:7,markText:'  黑暗森林法则  ',createTime:1700000000,type:1,range:'100-120'},
  {bookmarkId:'m2',chapterUid:9,markText:'没有章节归属的划线',createTime:1700000100},
  {bookmarkId:'m3',chapterUid:7,markText:'   ',createTime:1700000200}
 ],chapters:[{chapterUid:7,chapterIdx:3,title:'第三章 面壁'},{chapterUid:9,chapterIdx:5,title:'第五章 破壁'}]};
 const marks=parseBookmarks(payload);
 assert.equal(marks.length,2,'blank highlight is dropped');
 assert.deepEqual(marks[0],{id:'m1',text:'黑暗森林法则',chapter:'第三章 面壁',chapterIdx:3,createTime:1700000000000});
 assert.equal(marks[1].chapter,'第五章 破壁');
 assert.deepEqual(parseBookmarks(null),[]);
});

test('thoughts keep the quoted passage, fall back to chapter labels and report paging',()=>{
 const payload={reviews:[
  {review:{reviewId:'r1',content:'这段写得好',abstract:'黑暗森林法则',chapterUid:7,createTime:1700000000,star:-1}},
  {review:{reviewId:'r2',content:'整本书评',chapterName:'书评',star:4}},
  {review:{reviewId:'r3',content:'',abstract:''}},
  {review:null}
 ],synckey:991,hasMore:1};
 const parsed=parseMyReviews(payload,new Map([[7,{title:'第三章 面壁',idx:3}]]));
 assert.equal(parsed.notes.length,2,'empty reviews are skipped');
 assert.deepEqual(parsed.notes[0],{id:'r1',content:'这段写得好',abstract:'黑暗森林法则',chapter:'第三章 面壁',chapterIdx:3,createTime:1700000000000,star:-1});
 assert.equal(parsed.notes[1].chapter,'书评');
 assert.equal(parsed.hasMore,true);assert.equal(parsed.synckey,991);
 assert.deepEqual(parseMyReviews(undefined),{notes:[],synckey:0,hasMore:false});
});

test('notes fetch uses each endpoint\'s own parameter casing and walks the thought cursor',async()=>{
 const {calls,fetcher}=fetcherOf(call=>{
  const body=JSON.parse(call.body||'{}');
  if(body.api_name==='/book/bookmarklist'){
   assert.equal(body.bookId,'33001');
   return{json:{errcode:0,updated:[{bookmarkId:'m1',chapterUid:7,markText:'黑暗森林法则',createTime:1700000000}],chapters:[{chapterUid:7,chapterIdx:1,title:'第一章'}]}};
  }
  assert.equal(body.api_name,'/review/list/mine');
  assert.equal(body.bookid,'33001','the review endpoint takes lowercase bookid');
  assert.equal(body.bookId,undefined);
  if(body.synckey)return{json:{errcode:0,reviews:[{review:{reviewId:'r2',content:'后半本的想法',chapterUid:7,createTime:1700000400}}],hasMore:0,synckey:0}};
  return{json:{errcode:0,reviews:[{review:{reviewId:'r1',content:'前半本的想法',chapterUid:7,createTime:1700000200}}],hasMore:1,synckey:555}};
 });
 const notes=await new WereadClient('wrk-secret',fetcher).notes('33001');
 assert.equal(calls.length,3,'one highlight call plus two thought pages');
 assert.equal(notes.highlights.length,1);
 assert.deepEqual(notes.notes.map(note=>note.content),['前半本的想法','后半本的想法']);
 assert.equal(notes.notes[0].chapter,'第一章','thoughts borrow the chapter label from the highlight response');
 assert.equal(notes.truncated,false);
 const bodies=calls.map(call=>JSON.parse(call.body||'{}'));
 assert.equal(bodies[1].count,100);assert.equal(bodies[1].synckey,undefined);
 assert.equal(bodies[2].synckey,555);
 for(const call of calls)assert.equal(call.headers.Authorization,'Bearer wrk-secret');
});
