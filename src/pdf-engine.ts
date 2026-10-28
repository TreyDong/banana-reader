/**
 * Lazy-loaded PDF engine (built as pdf-engine.js): pdf.js text extraction and
 * outline → buildPdfBook. Loaded only when a PDF opens with reflow, so main.js
 * stays light. pdf.js runs on the main thread via its bundled
 * WorkerMessageHandler (fake worker) — acceptable for text-only extraction,
 * and it avoids CSP-sensitive worker/eval paths.
 */
import {getDocument} from 'pdfjs-dist';
import * as pdfjsWorker from 'pdfjs-dist/build/pdf.worker.mjs';
import {buildPdfBook,type PdfItem,type PdfOutlineEntry} from './pdfbook';
import {type Book} from './formats';

(globalThis as Record<string,unknown>).pdfjsWorker=pdfjsWorker;

interface PdfJsDest{dest?:unknown;title?:unknown;items?:unknown[]}

export type PdfEngine={parsePdfFile:(bytes:Uint8Array,signal?:AbortSignal,onProgress?:(done:number,total:number)=>void)=>Promise<Book>};
export async function parsePdfFile(bytes:Uint8Array,signal?:AbortSignal,onProgress?:(done:number,total:number)=>void):Promise<Book>{
 const doc=await getDocument({data:bytes,isEvalSupported:false,disableFontFace:true}).promise;
 try{
  const metadata=await doc.getMetadata().catch(()=>undefined) as {info?:{Title?:unknown;Author?:unknown}}|undefined;
  const outline:PdfOutlineEntry[]=[];
  const walk=async(entries:PdfJsDest[],level:number)=>{
   for(const entry of entries){
    if(signal?.aborted)throw new Error('已取消解析 PDF。');
    let page=0;
    try{
     let dest=entry.dest as unknown;
     if(typeof dest==='string')dest=await doc.getDestination(dest)??null;
     if(Array.isArray(dest)&&dest[0])page=(await doc.getPageIndex(dest[0] as never))+1;
    }catch{/* named destinations can be dangling; skip them */}
    if(level<=2&&page&&typeof entry.title==='string'&&entry.title.trim())outline.push({title:entry.title.trim(),level,page});
    if(level<4&&Array.isArray(entry.items)&&entry.items.length)await walk(entry.items as PdfJsDest[],level+1);
   }};
  const root=await doc.getOutline().catch(()=>undefined) as PdfJsDest[]|undefined;
  if(root?.length)await walk(root,1);

  const pages:{page:number;items:PdfItem[]}[]=[];
  for(let number=1;number<=doc.numPages;number++){
   if(signal?.aborted)throw new Error('已取消解析 PDF。');
   const page=await doc.getPage(number);
   const content=await page.getTextContent() as {items:Record<string,unknown>[];styles?:Record<string,{fontFamily?:string}>};
   const items:PdfItem[]=content.items.filter(item=>typeof item.str==='string').map(item=>{
    const transform=Array.isArray(item.transform)?item.transform as number[]:[1,0,0,1,0,0];
    return{str:String(item.str),hasEOL:item.hasEOL===true,x:Number(transform[4])||0,y:Number(transform[5])||0,
     size:Math.abs(Number(transform[3]))||Math.abs(Number(transform[0]))||10,
     bold:/bold|black|heavy|semib/i.test(String(content.styles?.[String(item.fontName)]?.fontFamily||''))};});
   pages.push({page:number,items});
   page.cleanup();
  }
  return buildPdfBook(pages,outline.length?outline:undefined,
   {title:typeof metadata?.info?.Title==='string'?metadata.info.Title:undefined,author:typeof metadata?.info?.Author==='string'?metadata.info.Author:undefined},
   {signal,onProgress:(done,total)=>onProgress?.(done,total)});
 }finally{await doc.destroy().catch(()=>{});}
}
