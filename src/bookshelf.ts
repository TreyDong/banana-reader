/**
 * Pure helpers for the bookshelf view: collecting readable books with their
 * reading progress, packing variable-width spines onto plank rows and deriving
 * each spine's cloth color, size and binding variant from the book title.
 */
export interface ShelfFile{path:string;basename:string;extension:string}
export interface ShelfReading{progress?:number;updated?:number}
export interface ShelfBook{path:string;title:string;extension:string;progress:number;updated:number}
export type SpineVariant='plain'|'label'|'foil'|'bands';
export interface SpineStyle{color:string;dark:string;width:number;height:number;variant:SpineVariant}
export const SHELF_FILE_TYPES=['pdf','epub','md'] as const;
export type ShelfFileType=typeof SHELF_FILE_TYPES[number];
export function normalizeShelfTypes(value:unknown):ShelfFileType[]{
 if(!Array.isArray(value))return['pdf','epub'];
 const selected=new Set(value.filter((item):item is string=>typeof item==='string').map(item=>item.toLowerCase()));
 return SHELF_FILE_TYPES.filter(type=>selected.has(type));
}
/** A vault-relative folder; undefined is invalid, while empty selects the whole vault. */
export function normalizeShelfFolder(value:string):string|undefined{
 const path=value.trim().replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');
 if(!path||path==='.')return '';
 if(path.includes(':')||path.split('/').some(part=>!part||part==='.'||part==='..'))return undefined;
 return path;
}

/** Muted cloth tones; [base, dark edge] pairs. */
const PALETTE:[string,string][]=[
  ['#2e5339','#1c3823'],['#6a5488','#4a3866'],['#1f5f5b','#12403d'],['#7a3040','#551e2b'],
  ['#33507a','#20375a'],['#96652a','#6c4517'],['#274b46','#16302c'],['#5c4470','#3e2c50'],
  ['#8c4a3a','#622e21'],['#41586b','#2a3c4c']];
const VARIANTS:SpineVariant[]=['plain','plain','plain','label','foil','bands'];

export function shelfTitle(basename:string):string{return basename.replace(/\.(md|pdf|epub)$/i,'').trim()||basename;}

/** Recently read first (by last update), then unread books by title. */
export function shelfBooks(files:ShelfFile[],readings:Record<string,ShelfReading>,types:readonly ShelfFileType[]=SHELF_FILE_TYPES):ShelfBook[]{
 const read:ShelfBook[]=[],unread:ShelfBook[]=[];
 const allowed=new Set<string>(types);
 for(const file of files){
  if(!allowed.has(file.extension.toLowerCase()))continue;
  const reading=readings[file.path];
  const progress=reading&&typeof reading.progress==='number'?Math.max(0,Math.min(1,reading.progress)):0;
  const updated=reading&&typeof reading.updated==='number'?reading.updated:0;
  (updated>0?read:unread).push({path:file.path,title:shelfTitle(file.basename),extension:file.extension.toLowerCase(),progress,updated});
 }
 read.sort((a,b)=>b.updated-a.updated||a.title.localeCompare(b.title));
 unread.sort((a,b)=>a.title.localeCompare(b.title));
 return [...read,...unread];
}

/** Deterministic binding for a title: the same book always gets the same spine. */
export function spineStyle(seed:string):SpineStyle{
 let hash=0;for(let i=0;i<seed.length;i++)hash=(hash*31+seed.charCodeAt(i))>>>0;
 const [color,dark]=PALETTE[hash%PALETTE.length];
 return{color,dark,width:56+(hash>>>6)%17,height:320+(hash>>>11)%72,variant:VARIANTS[(hash>>>3)%VARIANTS.length]};
}

/** Greedy packing of variable-width spines into plank rows that fit the container. */
export function rowsByWidth<T>(items:T[],widthOf:(item:T)=>number,maxWidth:number,gap=12):T[][]{
 const rows:T[][]=[];let row:T[]=[],used=0;
 for(const item of items){
  const width=widthOf(item),need=row.length?gap+width:width;
  if(row.length&&used+need>maxWidth){rows.push(row);row=[];used=0;}
  used+=row.length?gap+width:width;row.push(item);
 }
 if(row.length)rows.push(row);
 return rows;
}

export function formatShelfProgress(progress:number):number{return Math.round(Math.max(0,Math.min(1,progress))*100);}

/** Human-readable file size for the book card; empty for unknown sizes. */
export function formatBookSize(bytes:number):string{
 if(!Number.isFinite(bytes)||bytes<=0)return '';
 const mb=bytes/1048576;
 if(mb>=10)return Math.round(mb)+' MB';
 if(mb>=1)return mb.toFixed(1)+' MB';
 return Math.max(1,Math.round(bytes/1024))+' KB';
}

/** Stable decorative accession number (100–999) for the bookplate. */
export function bookNumber(seed:string):number{
 let hash=0;for(let i=0;i<seed.length;i++)hash=(hash*31+seed.charCodeAt(i))>>>0;
 return 100+hash%900;
}

/** Empty folder means the whole vault; otherwise the book must live inside that folder. */
export function shelfPathMatches(path:string,folder:string):boolean{
 const dir=folder.replace(/\/+$/,'');
 if(!dir)return true;
 return path===dir||path.startsWith(dir+'/');
}
