/**
 * WeRead (微信读书) shelf client over Tencent's official Agent Gateway
 * (`POST https://i.weread.qq.com/api/agent/gateway` with a Bearer API key).
 * The endpoint contract comes from Tencent's WeChatReading skills documents
 * (see notes/weread-shelf-integration-research.md); fields and the skill
 * version may change without notice. Read-only: shelf metadata only, no book
 * content. All network access goes through an injected fetcher so the logic
 * stays testable.
 */
export type WereadFetcher=(url:string,init:{method:'GET'|'POST';headers:Record<string,string>;body?:string})=>Promise<{status:number;headers:Record<string,string>;json:unknown;text:string;arrayBuffer:Promise<ArrayBuffer>}>;
export interface WereadShelfBook{bookId:string;title:string;author:string;cover:string;category:string;readUpdateTime:number;finished:boolean;secret:boolean;isTop:boolean;readerLink:string;deepLink:string}
export interface WereadShelf{books:WereadShelfBook[];albums:number}
/** Chapter label shared by highlights and thoughts of one book. */
export interface WereadChapter{title:string;idx:number}
/** One saved highlight (`/book/bookmarklist`, markers of type=1 only). */
export interface WereadHighlight{id:string;text:string;chapter:string;chapterIdx:number;createTime:number}
/** One personal thought or review (`/review/list/mine`); `abstract` is the highlighted passage it replies to. */
export interface WereadNote{id:string;content:string;abstract:string;chapter:string;chapterIdx:number;createTime:number;star:number}
export interface WereadBookNotes{highlights:WereadHighlight[];notes:WereadNote[];truncated:boolean}
export const WEREAD_GATEWAY='https://i.weread.qq.com/api/agent/gateway';
/** Server rejects requests whose version is missing; bump alongside upstream docs. */
export const WEREAD_SKILL_VERSION='1.0.5';
export const WEREAD_KEY_URL='https://weread.qq.com/r/weread-skills';
/** A structured failure carrying a stable code for UI classification. */
export class WereadError extends Error{constructor(message:string,readonly code:string){super(message);this.name='WereadError';}}
/** 401 or an authentication errcode: the key is missing, wrong or expired. */
export class WereadAuthError extends WereadError{constructor(message='微信读书 API Key 无效或已过期，请重新获取。'){super(message,'auth');}}
/** 403: the key was accepted but the egress IP is risk-controlled. */
export class WereadBlockedError extends WereadError{constructor(){super('微信读书拒绝了当前网络出口（风控 403）。API Key 可能有效，请更换网络环境后重试。','blocked');}}
export class WereadApiError extends WereadError{constructor(message:string,code:string,readonly errcode=0){super(message,code);}}
const str=(value:unknown):string=>typeof value==='string'||typeof value==='number'||typeof value==='boolean'?String(value):'';
const num=(value:unknown):number=>{const n=typeof value==='number'?value:Number(value);return Number.isFinite(n)?n:0;};
/** weread covers are `…/s_<id>.jpg`; `t7_` is the hi-res variant. */
const hdCover=(cover:string):string=>cover.replace('/s_','/t7_');

export function parseShelfBook(raw:unknown):WereadShelfBook{
 const book=(raw??{}) as Record<string,unknown>;
 return{
  bookId:str(book.bookId),
  title:str(book.title),
  author:str(book.author).replace(/\[(.*?)\]/g,'【$1】'),
  cover:hdCover(str(book.cover)),
  category:str(book.category),
  readUpdateTime:num(book.readUpdateTime)>0?num(book.readUpdateTime)*1000:0,
  finished:num(book.finishReading)===1,
  secret:num(book.secret)===1,
  isTop:num(book.isTop)===1,
  readerLink:str(book.readerLink),
  deepLink:str(book.deepLink)};
}

/** Pinned books first, then recently read, then the rest by title. */
export function parseShelfSync(raw:unknown):WereadShelf{
 const root=(raw??{}) as Record<string,unknown>;
 const books=(Array.isArray(root.books)?root.books:[]).map(parseShelfBook).filter(book=>book.bookId!==''&&book.title!=='');
 books.sort((a,b)=>Number(b.isTop)-Number(a.isTop)||b.readUpdateTime-a.readUpdateTime||a.title.localeCompare(b.title));
 return{books,albums:Array.isArray(root.albums)?root.albums.length:0};
}

/**
 * Loose identity for matching a shelf title against a local vault file:
 * case-, whitespace- and punctuation-insensitive, parenthetical volume
 * remarks stripped. Exact matches only — no substring guessing.
 */
export function normalizeBookKey(value:string):string{
 return value.toLowerCase().replace(/[（(][^）)]*[）)]/g,'').replace(/[^\p{L}\p{N}]+/gu,'');
}
/** `chapters[]` from the highlight response, keyed by chapterUid. */
export function chapterIndex(raw:unknown):Map<number,WereadChapter>{
 const root=(raw??{}) as Record<string,unknown>,index=new Map<number,WereadChapter>();
 if(Array.isArray(root.chapters))for(const item of root.chapters){
  const chapter=(item??{}) as Record<string,unknown>;
  const uid=num(chapter.chapterUid);
  if(uid)index.set(uid,{title:str(chapter.title),idx:num(chapter.chapterIdx)});
 }
 return index;
}
export function parseBookmarks(raw:unknown):WereadHighlight[]{
 const root=(raw??{}) as Record<string,unknown>,chapters=chapterIndex(raw);
 const list=Array.isArray(root.updated)?root.updated:[];
 return list.map(item=>{
  const mark=(item??{}) as Record<string,unknown>,chapter=chapters.get(num(mark.chapterUid));
  return{id:str(mark.bookmarkId),text:str(mark.markText).trim(),chapter:chapter?.title||'',chapterIdx:chapter?.idx||0,createTime:num(mark.createTime)*1000};
 }).filter(mark=>mark.text!=='');
}
/** Personal thoughts; `chapters` supplies labels because that response carries no chapter list. */
export function parseMyReviews(raw:unknown,chapters:Map<number,WereadChapter>=new Map()):{notes:WereadNote[];synckey:number;hasMore:boolean}{
 const root=(raw??{}) as Record<string,unknown>;
 const list=Array.isArray(root.reviews)?root.reviews:[];
 const notes:WereadNote[]=[];
 for(const item of list){
  const holder=(item??{}) as Record<string,unknown>,reviewRaw=holder.review;
  if(!reviewRaw||typeof reviewRaw!=='object'||Array.isArray(reviewRaw))continue;
  const review=reviewRaw as Record<string,unknown>,content=str(review.content).trim(),abstract=str(review.abstract).trim();
  if(!content&&!abstract)continue;
  const chapter=chapters.get(num(review.chapterUid));
  notes.push({id:str(review.reviewId),content,abstract,chapter:str(review.chapterName)||chapter?.title||'',chapterIdx:num(review.chapterIdx)||chapter?.idx||0,createTime:num(review.createTime)*1000,star:num(review.star)});
 }
 return{notes,synckey:num(root.synckey),hasMore:num(root.hasMore)===1};
}
export function matchLocalBook(title:string,files:{path:string;basename:string;extension:string}[]):string|undefined{
 const key=normalizeBookKey(title);if(!key)return undefined;
 for(const file of files){
  const extension=file.extension.toLowerCase();
  if(extension!=='md'&&extension!=='pdf'&&extension!=='epub')continue;
  if(normalizeBookKey(file.basename)===key)return file.path;
 }
 return undefined;
}

export class WereadClient{
 constructor(private apiKey:string,private fetcher:WereadFetcher){}
 /** One gateway call; business params are flattened at the body top level. */
 private async call(apiName:string,params:Record<string,unknown>={}):Promise<Record<string,unknown>>{
  if(!this.apiKey)throw new WereadAuthError('未配置微信读书 API Key，请先在设置中获取并填写。');
  let response:Awaited<ReturnType<WereadFetcher>>;
  try{
   response=await this.fetcher(WEREAD_GATEWAY,{method:'POST',headers:{'Authorization':`Bearer ${this.apiKey}`,'Content-Type':'application/json','Accept':'application/json','User-Agent':'BananaReader'},body:JSON.stringify({api_name:apiName,skill_version:WEREAD_SKILL_VERSION,...params})});
  }catch(error){const message=error instanceof Error?error.message:typeof error==='string'?error:'网络异常';throw new WereadError('微信读书请求失败：'+message,'network');}
  // 401 = bad/expired key; 403 = risk control on the egress IP; they must not
  // share one message or a network block would read as "key invalid".
  if(response.status===401)throw new WereadAuthError();
  if(response.status===403)throw new WereadBlockedError();
  if(response.status<200||response.status>=300)throw new WereadApiError(`微信读书接口返回 HTTP ${response.status}。`,'http',response.status);
  const body=response.json;
  if(!body||typeof body!=='object'||Array.isArray(body))throw new WereadApiError('微信读书返回了无法解析的数据。','parse');
  const root=body as Record<string,unknown>;
  const upgrade=root.upgrade_info;
  if(upgrade&&typeof upgrade==='object'&&!Array.isArray(upgrade)){
   const message=str((upgrade as Record<string,unknown>).message);
   if(message)throw new WereadApiError('微信读书接口需要升级：'+message+'。请更新插件后重试。','upgrade');
  }
  const errcode=num(root.errcode);
  if(errcode!==0){
   const message=str(root.errmsg)||`微信读书错误码 ${errcode}`;
   if(errcode===-2013||message.includes('鉴权'))throw new WereadAuthError();
   throw new WereadApiError('微信读书：'+message,'api',errcode);
  }
  return root;
 }
 /** Lightweight key probe via `/_list`. */
 async validate():Promise<boolean>{await this.call('/_list');return true;}
 shelf():Promise<WereadShelf>{return this.call('/shelf/sync').then(parseShelfSync);}
 /**
  * Highlights plus personal thoughts for one book. The two endpoints disagree
  * on parameter casing (`bookId` vs `bookid`), and thoughts are paginated by
  * `synckey` while highlights come back whole.
  */
 async notes(bookId:string):Promise<WereadBookNotes>{
  const [markRaw,pages]=await Promise.all([this.call('/book/bookmarklist',{bookId}),this.reviewPages(bookId)]);
  const chapters=chapterIndex(markRaw);
  const notes=pages.list.flatMap(page=>parseMyReviews(page,chapters).notes);
  return{highlights:parseBookmarks(markRaw),notes,truncated:pages.truncated};
 }
 /** Bounded cursor walk: five pages of 100 thoughts is far past any real book. */
 private async reviewPages(bookId:string):Promise<{list:unknown[];truncated:boolean}>{
  const list:unknown[]=[];let synckey=0;
  for(let page=0;page<5;page++){
   const block=await this.call('/review/list/mine',{bookid:bookId,count:100,...(synckey?{synckey}:{})});
   list.push(block);
   const {hasMore,synckey:next}=parseMyReviews(block);
   if(!hasMore||!next)return{list,truncated:false};
   synckey=next;
  }
  return{list,truncated:true};
 }
 /** Fetches a cover image without account credentials; covers live on a public CDN. */
 async coverImage(url:string):Promise<{bytes:ArrayBuffer;mime:string}|null>{
  if(!url)return null;
  const target=url.startsWith('//')?'https:'+url:url;
  try{
   const response=await this.fetcher(target,{method:'GET',headers:{'Accept':'image/*','User-Agent':'BananaReader'}});
   if(response.status!==200)return null;
   const bytes=await response.arrayBuffer;
   if(!bytes.byteLength)return null;
   return{bytes,mime:response.headers['content-type']||'image/jpeg'};
  }catch{return null;}
 }
}
