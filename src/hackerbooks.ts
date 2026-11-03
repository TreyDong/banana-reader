export interface RecommendedBook{id:string;title:string;authors:string[];slug?:string;year?:number;recommendations?:number;commenters?:number;cover?:number;mentions?:number;firstMentioned?:number;score?:number;rising?:number;topics:string[]}
const ROOT='https://hackerbooks.org/';
/** Read the site's current data manifest without executing its script. */
export function hackerBooksIndex(html:string):string{
 return hackerBooksAsset(html,'books');
}
export function hackerBooksAsset(html:string,kind:'books'|'topics'):string{
 const match=html.match(/(?:window\.__ASSETS|const\s+ASSETS)\s*=\s*(\{[^<]*?\})\s*;/);if(!match)throw new Error('Hacker Books 数据地址不可用。');
 let manifest:unknown;try{manifest=JSON.parse(match[1]);}catch{throw new Error('Hacker Books 数据地址不可用。');}
 const path=(manifest as Record<string,unknown>)?.[kind];if(typeof path!=='string'||!(kind==='books'?/^\/?data\/books\.[a-f0-9]+\.json$/:/^\/?data\/topics\.[a-f0-9]+\.json$/).test(path))throw new Error('Hacker Books 数据地址不可用。');return ROOT+path.replace(/^\//,'');
}
export function parseRecommendedBooks(data:unknown):RecommendedBook[]{
 if(!Array.isArray(data)||data.length>50000)throw new Error('Hacker Books 返回的数据无法读取。');
 return data.flatMap((item):RecommendedBook[]=>{if(!item||typeof item!=='object')return[];const x=item as Record<string,unknown>;if(typeof x.id!=='string'||!/^(?:OL\d+[A-Z]|HB[a-z0-9-]+)$/.test(x.id)||typeof x.t!=='string'||!x.t.trim())return[];
  const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:undefined;
  return[{id:x.id,title:x.t.slice(0,500),authors:Array.isArray(x.a)?x.a.filter((a):a is string=>typeof a==='string').slice(0,8).map(a=>a.slice(0,200)):[],slug:typeof x.sl==='string'&&/^[a-z0-9-]+$/.test(x.sl)?x.sl:undefined,year:num(x.y),recommendations:num(x.ru),commenters:num(x.u),cover:num(x.c),mentions:num(x.n),firstMentioned:num(x.f),score:num(x.s),rising:num(x.r),topics:Array.isArray(x.tp)?x.tp.filter((v):v is string=>typeof v==='string').slice(0,32):[]}];});
}
export function findRecommendedBooks(books:RecommendedBook[],query:string):RecommendedBook[]{const terms=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);return terms.length?books.filter(b=>{const value=[b.title,...b.authors].join(' ').toLocaleLowerCase();return terms.every(t=>value.includes(t));}):books;}
export function hackerBookUrl(book:RecommendedBook):string{let slug=book.slug||book.title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/&/g,' and ').replace(/['’]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');if(slug.length>80)slug=slug.slice(0,81).replace(/-[^-]*$/,'');return ROOT+'book/'+encodeURIComponent(slug||book.id.toLowerCase());}
