/**
 * Pure heuristics that turn extracted PDF page items into a reflowable Book
 * (the same shape readEpub produces, so the existing reader pipeline renders it).
 * No pdf.js here: the engine entry adapts pdf.js structures into plain items.
 * Heuristics are Calibre-lineage: line grouping → furniture removal → paragraph
 * merging → font-tier headings → outline-driven sections. Expect imperfection
 * on complex layouts; the original-pages view is the fallback.
 */
import {BOOK_LIMITS,type Book,type BookBlock,type BookSection} from './formats';

export const PDF_SCAN_CODE='pdf-no-text-layer';
export const PDF_TOO_LARGE_CODE='pdf-too-large';

export interface PdfItem{str:string;hasEOL:boolean;x:number;y:number;size:number;bold:boolean}
export interface PdfPageItems{page:number;items:PdfItem[]}
export interface PdfLine{text:string;x:number;y:number;size:number;bold:boolean}
export interface PdfOutlineEntry{title:string;level:number;page:number}

const CLOSED=/[。．!?！？；;…”"』」)\]]\s*$/;
const PAGE_NUMBER=/^[-–—·.\s]*(?:第\s*\d+\s*页|[0-9]{1,4}|[ivxlcdm]{1,7})\s*(?:[/·]\s*\S{1,8})?[-–—·.\s]*$/i;
const normalizeForRepeat=(text:string)=>text.replace(/[\d\s/·.\-–—:：pag页e]+/gi,'');
const normalizeTitle=(text:string)=>text.replace(/\s+/g,'').replace(/[·・:：、,，.。\-–—]/g,'');
const textWidth=(text:string,size:number)=>{let width=0;for(const ch of text)width+=size*(ch.charCodeAt(0)>0x2e80?1:0.52);return width;};

/** Groups raw items into visual lines (top-down), joining fragmented strings with CJK/Latin spacing. */
export function linesFromItems(items:PdfItem[]):{lines:PdfLine[];charCount:number}{
 const usable=items.filter(item=>typeof item.str==='string'&&item.str.trim());
 const lines:PdfLine[]=[];let current:PdfItem[]=[];let top=NaN;let charCount=0;
 const flush=()=>{if(!current.length)return;
  current.sort((a,b)=>a.x-b.x);
  let text='';
  for(let i=0;i<current.length;i++){const item=current[i]!,prev=current[i-1];
   if(!text){text=item.str;continue;}
   const gap=prev?item.x-prev.x-textWidth(prev.str,prev.size):0;
   text+=gap>Math.max(1.2,item.size*0.28)&&/[A-Za-z0-9,;:%)\]]$/.test(text)&&/^[A-Za-z0-9(\[“"]/.test(item.str)?' '+item.str:item.str;}
  const weight=current.reduce((sum,item)=>sum+item.str.length,0);
  const size=weight?current.reduce((sum,item)=>sum+item.size*item.str.length,0)/weight:10;
  const finalText=text.replace(/\s{2,}/g,' ').trim();
  if(finalText){lines.push({text:finalText,x:current[0]!.x,y:current[0]!.y,size,bold:current.filter(item=>item.bold).reduce((sum,item)=>sum+item.str.length,0)>finalText.length/2});charCount+=finalText.length;}
  current=[];};
 for(const item of usable){
  if(current.length&&Math.abs(item.y-top)>Math.max(1.2,item.size*0.5))flush();
  if(!current.length)top=item.y;
  current.push(item);
  if(item.hasEOL)flush();
 }
 flush();
 return{lines,charCount};
}

interface Para{kind:'p';text:string;page:number;open:boolean}
interface Head{kind:'heading';text:string;level:number;page:number}
type Draft=Para|Head;

const cleanJoin=(a:string,b:string):string=>{
 if(/[-‐‑]$/.test(a)&&/^[a-z]/.test(b))return a.slice(0,-1)+b;
 if(/[A-Za-z0-9,;:%)\]]$/.test(a)&&/^[A-Za-z0-9(\[“"]/.test(b))return a+' '+b;
 return a+b;
};
const headingLevelOf=(line:PdfLine,bodySize:number):number=>{
 if(line.size<bodySize*1.13||line.text.length>60||CLOSED.test(line.text))return 0;
 if(line.size>=bodySize*1.45)return 1;
 if(line.size>=bodySize*1.28)return 2;
 return 3;
};
const mutualPrefix=(a:string,b:string):boolean=>{
 const x=normalizeTitle(a),y=normalizeTitle(b);
 const n=Math.min(10,x.length,y.length);if(n<4)return x===y&&x.length>0;
 return x.slice(0,n)===y.slice(0,n);
};

/** Builds the reflowable book from per-page extracted items. */
export function buildPdfBook(pages:PdfPageItems[],outline:PdfOutlineEntry[]|undefined,meta:{title?:string;author?:string},opts:{signal?:AbortSignal;onProgress?:(done:number,total:number)=>void}={}):Book{
 const total=pages.length,textual:{page:number;lines:PdfLine[]}[]=[];let scanPages=0;
 for(const page of pages){
  if(opts.signal?.aborted)throw new Error('已取消解析 PDF。');
  const {lines,charCount}=linesFromItems(page.items);
  if(charCount>=20)textual.push({page:page.page,lines});else scanPages++;
  opts.onProgress?.(page.page,total);
 }
 if(!textual.length||textual.length<Math.max(1,Math.floor(total*0.25)))throw new Error(PDF_SCAN_CODE);

 // Repeated headers/footers and bare page numbers in the top/bottom margins are
 // furniture — but short pages (title pages, covers) are exempt: their few lines
 // are content, not running furniture.
 const stripped=new Map<number,Set<number>>();
 const strip=(page:number,lines:PdfLine[],line:PdfLine)=>{const set=stripped.get(page)||new Set<number>();set.add(lines.indexOf(line));stripped.set(page,set);};
 const isStripped=(page:number,lines:PdfLine[],line:PdfLine)=>stripped.get(page)?.has(lines.indexOf(line))===true;
 const repeats=new Map<string,number>();
 for(const {page,lines} of textual)for(const line of [...lines.slice(0,2),...lines.slice(-2)])
  if(PAGE_NUMBER.test(line.text.trim()))strip(page,lines,line);
 for(const {page,lines} of textual)for(const line of [...lines.slice(0,2),...lines.slice(-2)]){
  const key=normalizeForRepeat(line.text);if(key.length<2)continue;
  repeats.set(key,(repeats.get(key)||0)+1);
 }
 for(const {page,lines} of textual)for(const line of [...lines.slice(0,2),...lines.slice(-2)])
  if((repeats.get(normalizeForRepeat(line.text))||0)>=Math.max(2,Math.floor(textual.length*0.3)))strip(page,lines,line);

 const weights=new Map<number,number>();
 for(const {page,lines} of textual)for(const line of lines){if(isStripped(page,lines,line))continue;
  const bucket=Math.round(line.size*2)/2;weights.set(bucket,(weights.get(bucket)||0)+line.text.length);}
 let bodySize=12,bodyWeight=-1;for(const [size,weight] of weights)if(weight>bodyWeight){bodyWeight=weight;bodySize=size;}

 // Walk visible lines: paragraphs merge on small gaps/continuation, break on gaps,
 // indents, page starts after closed sentences, and font-tier headings.
 const drafts:Draft[]=[];let prevLine:PdfLine|undefined;
 for(const {page,lines} of textual){
  const kept=lines.filter(line=>!isStripped(page,lines,line));
  const minX=Math.min(...(kept.length?kept.map(line=>line.x):[0]));
  let firstOfPage=true;
  for(const line of kept){
   const level=headingLevelOf(line,bodySize),prev=drafts.at(-1);
   const gapBreak=!firstOfPage&&prevLine!==undefined&&prevLine.y-line.y>prevLine.size*1.6+1;
   const indentBreak=!firstOfPage&&line.x-minX>Math.max(10,line.size*1.4);
   const pageStartBreak=firstOfPage&&prev?.kind==='p'&&CLOSED.test(prev.text);
   if(level){if(prev&&prev.kind==='p')prev.open=false;drafts.push({kind:'heading',text:line.text,level,page});}
   else if(!prev||prev.kind==='heading'||gapBreak||indentBreak||pageStartBreak){
    drafts.push({kind:'p',text:line.text,page,open:!CLOSED.test(line.text)});
   }else if(prev.kind==='p'){
    prev.text=cleanJoin(prev.text,line.text);prev.open=!CLOSED.test(prev.text);
   }
   prevLine=line;firstOfPage=false;
  }
 }

 // Section boundaries: outline entries matched to drafts win; otherwise font headings of tier 1-2.
 const starts:{title:string;page:number;index:number}[]=[];
 if(outline?.length){
  for(const entry of outline){
   if(entry.level>2)continue;
   const floor=starts.length?starts.at(-1)!.index+1:0;
   const index=drafts.findIndex((draft,i)=>i>=floor&&draft.page===entry.page&&mutualPrefix(draft.text,entry.title));
   if(index>=0)starts.push({title:entry.title,page:entry.page,index});
  }
 }else{
  drafts.forEach((draft,index)=>{if(draft.kind==='heading'&&draft.level<=2)starts.push({title:draft.text,page:draft.page,index});});
 }

 const toBlock=(draft:Draft):BookBlock=>draft.kind==='heading'
  ?{kind:'heading',text:draft.text,level:Math.min(6,Math.max(2,draft.level+1)),page:draft.page}
  :{kind:'p',text:draft.text,page:draft.page};
 const sections:BookSection[]=[];const warnings:string[]=[];
 const pushSection=(title:string,page:number,items:Draft[])=>{
  if(!items.length)return;
  sections.push({title:title||'正文',page,blocks:items.map(toBlock)});};
 if(starts.length){
  if(starts[0]!.index>0)pushSection('卷首',drafts[0]!.page,drafts.slice(0,starts[0]!.index));
  for(let i=0;i<starts.length;i++){
   const start=starts[i]!,end=i+1<starts.length?starts[i+1]!.index:drafts.length;
   pushSection(start.title,start.page,drafts.slice(start.index+1,end));
  }
 }else if(drafts.length){
  pushSection('',textual[0]!.page,drafts);
 }
 if(scanPages>0&&textual.length)warnings.push(`有 ${scanPages} 页无法提取文字（扫描或图片页），重排视图不含这些页的内容。`);

 const charTotal=sections.reduce((sum,section)=>sum+section.blocks.reduce((inner,block)=>inner+block.text.length,0),0);
 if(charTotal>BOOK_LIMITS.text||sections.length>BOOK_LIMITS.chapters)throw new Error(PDF_TOO_LARGE_CODE);

 const title=meta.title?.trim()||drafts.find(draft=>draft.kind==='heading'&&draft.level===1)?.text||outline?.[0]?.title||'';
 return{kind:'pdf',title,author:meta.author?.trim()||undefined,sections,images:{},warnings};
}
