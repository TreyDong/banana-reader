/**
 * Bundled PDF text/outline extraction over an isolated MessageChannel.
 * The upstream worker handler runs locally without registering globals,
 * starting an external worker, or sharing Obsidian's native PDF worker.
 */
import {getDocument,PDFWorker} from 'pdfjs-dist';
import {WorkerMessageHandler} from 'pdfjs-dist/build/pdf.worker.mjs';
import {buildPdfBook,type PdfItem,type PdfOutlineEntry} from './pdfbook';
import {type Book} from './formats';
import {arrayValue,objectValue} from './core';
import type {TextItem} from 'pdfjs-dist/types/src/display/api';




export type PdfEngine={parsePdfFile:(bytes:Uint8Array,signal?:AbortSignal,onProgress?:(done:number,total:number)=>void)=>Promise<Book>};
export async function parsePdfFile(bytes:Uint8Array,signal?:AbortSignal,onProgress?:(done:number,total:number)=>void):Promise<Book>{
 // A dedicated port keeps our worker entirely separate from Obsidian's PDF.js.
 // PDF.js 4.10.38's generated constructor declaration incorrectly narrows port
 // to null; its runtime and PDFWorkerParameters accept a message port.
 const channel=new MessageChannel();
 WorkerMessageHandler.initializeFromPort(channel.port1);channel.port1.start();channel.port2.start();
 const PortWorker=PDFWorker as unknown as {new(options:{port:MessagePort}):PDFWorker};
 const worker=new PortWorker({port:channel.port2});
 const task=getDocument({data:bytes,worker,isEvalSupported:false,disableFontFace:true});
 try{const doc=await task.promise;
  const metadata=await doc.getMetadata().catch(()=>undefined) as {info?:{Title?:unknown;Author?:unknown}}|undefined;
  const outline:PdfOutlineEntry[]=[];
  const walk=async(entries:unknown[],level:number)=>{
   for(const raw of entries){const entry=objectValue(raw);
    if(signal?.aborted)throw new Error('已取消解析 PDF。');
    let page=0;
    try{
     let dest=entry.dest;
     if(typeof dest==='string')dest=await doc.getDestination(dest)??null;
     const ref=objectValue(arrayValue(dest)[0]);if(typeof ref.num==='number'&&typeof ref.gen==='number')page=(await doc.getPageIndex({num:ref.num,gen:ref.gen}))+1;else if(typeof arrayValue(dest)[0]==='number')page=Number(arrayValue(dest)[0])+1;
    }catch{/* named destinations can be dangling; skip them */}
    if(level<=2&&page&&typeof entry.title==='string'&&entry.title.trim())outline.push({title:entry.title.trim(),level,page});
    if(level<4&&Array.isArray(entry.items)&&entry.items.length)await walk(entry.items,level+1);
   }};
  const root=await doc.getOutline().catch(()=>undefined) as unknown[]|undefined;
  if(root?.length)await walk(root,1);

  const pages:{page:number;items:PdfItem[]}[]=[];
  for(let number=1;number<=doc.numPages;number++){
   if(signal?.aborted)throw new Error('已取消解析 PDF。');
   const page=await doc.getPage(number);
   const content=await page.getTextContent();
   const items:PdfItem[]=content.items.filter((item):item is TextItem=>'str' in item).map(item=>{
    const transform=Array.isArray(item.transform)?item.transform as number[]:[1,0,0,1,0,0];
    return{str:item.str,hasEOL:item.hasEOL===true,x:Number(transform[4])||0,y:Number(transform[5])||0,
     size:Math.abs(Number(transform[3]))||Math.abs(Number(transform[0]))||10,
     bold:/bold|black|heavy|semib/i.test(content.styles[item.fontName]?.fontFamily||'')};});
   pages.push({page:number,items});
   page.cleanup();
  }
  return buildPdfBook(pages,outline.length?outline:undefined,
   {title:typeof metadata?.info?.Title==='string'?metadata.info.Title:undefined,author:typeof metadata?.info?.Author==='string'?metadata.info.Author:undefined},
   {signal,onProgress:(done,total)=>onProgress?.(done,total)});
 }finally{await task.destroy().catch(()=>{});worker.destroy();channel.port1.close();channel.port2.close();}
}
