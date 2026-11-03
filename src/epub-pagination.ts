import type {Passage} from './core';

/** Positions in the original reading text at the start of each laid-out page. */
export interface EpubPagination {pageStarts:number[];sectionPages:number[];pageCount:number}

/** Lay out an isolated copy in fixed-height columns; never mutate the reading DOM. */
export async function paginateEpub(article:HTMLElement,passages:Passage[],height:number,signal:AbortSignal):Promise<EpubPagination>{
 const win=article.ownerDocument.defaultView;if(!win||height<1||article.clientWidth<1)throw new Error('阅读区域尚未准备好。');
 const width=article.clientWidth,gap=32,stride=width+gap,copy=article.cloneNode(true) as HTMLElement;
 copy.classList.add('gloss-pagination-source');copy.setAttribute('aria-hidden','true');
 Object.assign(copy.style,{position:'fixed',left:'-100000px',top:'0',width:width+'px',height:height+'px',margin:'0',padding:'0',visibility:'hidden',pointerEvents:'none',columnWidth:width+'px',columnGap:gap+'px',columnFill:'auto',overflow:'visible'});
 article.parentElement.appendChild(copy);
 try{
  const check=()=>{if(signal.aborted)throw new Error('已取消打开文档。');};check();
  const images=Array.from(copy.querySelectorAll<HTMLImageElement>('img'));for(const image of images)image.loading='eager';
  await Promise.all(images.map(image=>image.decode().catch(()=>{})));check();
  const left=copy.getBoundingClientRect().left,pageOf=(x:number)=>Math.max(1,Math.floor((x-left+.5)/stride)+1);
  const sectionPages=Array.from(copy.querySelectorAll<HTMLElement>('section[data-section-index]'),section=>{const rect=section.getClientRects()[0];return rect?pageOf(rect.left):1;});
  const blocks=Array.from(copy.querySelectorAll<HTMLElement>('.gloss-passage'));if(blocks.length!==passages.length)throw new Error('分页时正文结构发生变化。');
  const starts=new Map<number,number>();let maxPage=1;
  for(let i=0;i<blocks.length;i++){
   check();const block=blocks[i],walker=copy.ownerDocument.createTreeWalker(block,4);let local=0;
   while(walker.nextNode()){
    const node=walker.currentNode as Text,len=node.length;if(!len)continue;const range=copy.ownerDocument.createRange();
    const pageAt=(offset:number)=>{range.setStart(node,offset);range.setEnd(node,offset+1);const rect=range.getClientRects()[0];return rect?pageOf(rect.left):0;};
    let start=0,current=pageAt(0),last=pageAt(len-1);if(current){maxPage=Math.max(maxPage,current,last);if(!starts.has(current))starts.set(current,passages[i].start+local);}
    while(current&&last>current&&start<len-1){let lo=start+1,hi=len-1;while(lo<hi){const mid=Math.floor((lo+hi)/2),p=pageAt(mid);if(p&&p>current)hi=mid;else lo=mid+1;}start=lo;const next=pageAt(start);if(next<=current)break;current=next;if(!starts.has(current))starts.set(current,passages[i].start+local+start);}
    local+=len;
   }
   if(i%100===99)await new Promise<void>(resolve=>win.setTimeout(resolve,0));
  }
  check();const pageCount=Math.max(maxPage,...sectionPages),pageStarts=Array.from({length:pageCount},(_,i)=>starts.get(i+1)??-1);
  return{pageStarts,sectionPages,pageCount};
 }finally{copy.remove();}
}
