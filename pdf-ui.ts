import {anchorRange} from './reading-ui';
import {indexPassages,type Anchor,type Passage,type MarkStyle} from './core';
export interface PdfMark {id:string;anchor:Anchor;kind:'highlight'|'thread';color?:string;style?:MarkStyle;active?:boolean}
/** Uses only Obsidian's rendered PDF pages/text layer. Never converts a PDF into a note. */
export class NativePdf {
 page=1;blocks:HTMLElement[]=[];text='';passages:Passage[]=[];
 private observer:MutationObserver;private resize:ResizeObserver;private frame=0;private closed=false;private observed?:Element;
 constructor(readonly host:HTMLElement,private changed:()=>void,private geometry:()=>void){
  this.observer=new MutationObserver(()=>this.schedule());this.observer.observe(host,{childList:true,subtree:true,characterData:true});
  this.resize=new ResizeObserver(()=>{this.schedule();this.geometry();});this.resize.observe(host);host.addEventListener('scroll',this.scrolled,true);this.schedule();
 }
 private scrolled=()=>{this.schedule();this.geometry();};
 private schedule(){cancelAnimationFrame(this.frame);this.frame=requestAnimationFrame(()=>this.scan());}
 get pages(){return Array.from(this.host.querySelectorAll<HTMLElement>('.page[data-page-number]'));}
 get total(){return Number(this.host.querySelector<HTMLInputElement>('.pdf-page-input')?.max)||this.pages.length;}
 private scan(forced?:number){
  if(this.closed)return;const pages=this.pages;if(!pages.length)return;
  const viewport=this.host.getBoundingClientRect();let page=forced?pages.find(p=>Number(p.dataset.pageNumber)===forced):undefined;
  if(!page){let best=-1;for(const candidate of pages){const r=candidate.getBoundingClientRect(),visible=Math.max(0,Math.min(r.bottom,viewport.bottom)-Math.max(r.top,viewport.top));if(visible>best){best=visible;page=candidate;}}}
  if(!page)return;const n=Number(page.dataset.pageNumber),layer=page.querySelector<HTMLElement>('.textLayer'),blocks=layer?Array.from(layer.querySelectorAll<HTMLElement>('span')).filter(s=>!!s.textContent?.trim()&&!s.querySelector('span')):[];
  if(this.observed!==page){if(this.observed)this.resize.unobserve(this.observed);this.observed=page;this.resize.observe(page);}
  if(this.page===n&&blocks.length===this.blocks.length&&blocks.every((b,i)=>b===this.blocks[i]))return;
  this.page=n;this.blocks=blocks;const ix=indexPassages(blocks.map(b=>b.textContent||''));this.text=ix.text;this.passages=ix.passages;this.passages.forEach(p=>p.source='PDF 第 '+n+' 页');this.changed();
 }
 async ready(signal?:AbortSignal){let elapsed=0,last=Date.now();while(elapsed<20000&&!this.closed&&!signal?.aborted){const now=Date.now();if(this.host.ownerDocument.visibilityState!=='hidden')elapsed+=now-last;last=now;this.scan();if(this.pages.some(p=>p.querySelector<HTMLCanvasElement>('canvas')?.width))return;await new Promise(r=>setTimeout(r,100));}if(signal?.aborted||this.closed)throw new Error('已取消打开 PDF。');throw new Error('PDF 原版视图尚未就绪，请检查文件是否损坏或需要密码，然后重新打开。');}
 activateRange(range:Range){const start=(range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement) as Element|null,end=(range.endContainer.nodeType===1?range.endContainer:range.endContainer.parentElement) as Element|null,a=start?.closest<HTMLElement>('.page[data-page-number]'),b=end?.closest<HTMLElement>('.page[data-page-number]');if(!a||!b||a!==b)return false;this.scan(Number(a.dataset.pageNumber));return true;}
 range(anchor:Anchor){return anchor.pdfPage===this.page?anchorRange(this.blocks,this.passages,this.text,anchor):null;}
 async go(page:number){const target=this.pages.find(p=>Number(p.dataset.pageNumber)===page);if(!target)throw new Error('PDF 对应页面尚未加载。');target.scrollIntoView({block:'start',behavior:'instant'});const until=Date.now()+8000;while(Date.now()<until&&!this.closed){this.scan(page);if(this.blocks.length||target.querySelector('canvas')){if(this.blocks.length)return;await new Promise(r=>setTimeout(r,100));}else await new Promise(r=>setTimeout(r,80));}this.scan(page);}
 paint(marks:PdfMark[]){this.host.querySelectorAll('.gloss-pdf-overlay').forEach(el=>el.remove());const page=this.pages.find(p=>Number(p.dataset.pageNumber)===this.page);if(!page)return;const box=page.getBoundingClientRect();if(!box.width||!box.height)return;const overlay=page.ownerDocument.createElement('div');overlay.className='gloss-pdf-overlay';page.append(overlay);
  for(const mark of marks){const range=this.range(mark.anchor);if(!range)continue;const seen=new Set<string>();for(const r of Array.from(range.getClientRects())){if(!r.width||!r.height)continue;const key=[r.x,r.y,r.width,r.height].map(Math.round).join(',');if(seen.has(key))continue;seen.add(key);const el=overlay.ownerDocument.createElement('div');el.className='gloss-pdf-mark';el.dataset.kind=mark.kind;el.dataset.style=mark.style||'highlight';el.dataset.color=mark.color||'yellow';el.dataset.id=mark.id;if(mark.active)el.classList.add('is-active');Object.assign(el.style,{left:100*(r.left-box.left)/box.width+'%',top:100*(r.top-box.top)/box.height+'%',width:100*r.width/box.width+'%',height:100*r.height/box.height+'%'});overlay.append(el);}}
 }
 hit(x:number,y:number){return Array.from(this.host.querySelectorAll<HTMLElement>('.gloss-pdf-mark')).reverse().find(el=>{const r=el.getBoundingClientRect();return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom;})?.dataset.id;}
 destroy(){this.closed=true;cancelAnimationFrame(this.frame);this.observer.disconnect();this.resize.disconnect();this.host.removeEventListener('scroll',this.scrolled,true);}
}
