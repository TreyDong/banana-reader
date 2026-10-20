// Native DOM annotation helpers for Banana Reader.
// Historical references and the replaced layout routine are recorded in notes/community-release-audit.md.
import {resolveAnchor, type Anchor, type Passage, type MarkStyle, type Thread, markStyle} from './core';
export interface MarginItem {id: string; desired: number; height: number; created: number; mini?:boolean; sourceY?:number; note?:boolean}
/** Solve spacing in cumulative-height coordinates; retain the active source when it fits. */
export function placeMarginItems(items: MarginItem[], active?: string): Record<string, number> {
  const offsets: number[] = [];
  let occupied = 0;
  items.forEach((item, index) => {
    offsets.push(occupied);
    const next = items[index + 1];
    occupied += item.height + (item.mini && next?.mini ? 4 : 16);
  });
  const requests = items.map((item, index) => item.desired - offsets[index]);
  const selected = items.findIndex(item => item.id === active);
  // Earlier cards have an upper envelope set by the pinned card, not by their heights.
  const ceilings: number[] = [];
  if (selected >= 0) requests.slice(0, selected + 1).reduceRight((limit, request, index) => {
    const level = Math.max(0, Math.min(limit, request));
    ceilings[index] = level;
    return level;
  }, Math.max(0, requests[selected]));
  let lower = 0;
  return Object.fromEntries(items.map((item, index) => {
    const request = selected >= 0 && index <= selected ? ceilings[index] : requests[index];
    lower = Math.max(lower, request);
    return [item.id, offsets[index] + lower];
  }));
}
export interface TextMark {id: string; start: number; end: number; kind: 'highlight' | 'thread' | 'pending'; color?: string; note?: boolean; style?:MarkStyle}
export interface Segment {start: number; end: number; highlights: TextMark[]; threads: TextMark[]; pending: boolean}
export function segmentMarks(length: number, marks: TextMark[]): Segment[] {
  const valid = marks.filter(m => m.end > m.start && m.end > 0 && m.start < length);
  const cuts = [...new Set([0, length, ...valid.flatMap(m => [Math.max(0, m.start), Math.min(length, m.end)])])].sort((a,b) => a-b);
  return cuts.slice(0,-1).map((start,i) => {const end = cuts[i+1], covering = valid.filter(m => m.start <= start && m.end >= end); return {start, end, highlights:covering.filter(m=>m.kind==='highlight'), threads:covering.filter(m=>m.kind==='thread'), pending:covering.some(m=>m.kind==='pending')};});
}
function locate(block: HTMLElement, offset: number): {node: Node; offset: number} {
  const walker = block.ownerDocument.createTreeWalker(block, 4); let seen = 0, last: Node = block;
  while (walker.nextNode()) {last = walker.currentNode; const len = last.textContent?.length || 0; if (seen+len >= offset) return {node:last,offset:offset-seen}; seen+=len;}
  return {node:last,offset:last.nodeType===3 ? last.textContent?.length || 0 : 0};
}
export function anchorRange(blocks: HTMLElement[], passages: Passage[], text: string, anchor: Anchor): Range | null {
  const start = resolveAnchor(text,anchor); if (start === null) return null;
  const end=start+anchor.quote.length, si=passages.findIndex(p=>p.end>start), ei=passages.findIndex(p=>p.end>=end);
  if(si<0||ei<0||!blocks[si]||!blocks[ei]) return null;
  const a=locate(blocks[si],start-passages[si].start),b=locate(blocks[ei],end-passages[ei].start),r=blocks[si].ownerDocument.createRange();
  try {r.setStart(a.node,a.offset);r.setEnd(b.node,b.offset);return r;} catch {return null;}
}
export function paintMarks(article: HTMLElement, blocks: HTMLElement[], passages: Passage[], marks: TextMark[], active?: string, fresh?: string): void {
  for(const el of Array.from(article.querySelectorAll('[data-gloss-mark]'))) el.replaceWith(...Array.from(el.childNodes));
  article.querySelectorAll('.gloss-note-dot').forEach(el=>el.remove()); article.normalize();
  for(let i=0;i<blocks.length;i++) {
    const block=blocks[i], p=passages[i], local=marks.map(m=>({...m,start:m.start-p.start,end:m.end-p.start})).filter(m=>m.end>0&&m.start<p.text.length);
    if(!local.length) continue;
    const segments=segmentMarks(p.text.length,local), walker=block.ownerDocument.createTreeWalker(block,4);
    const nodes:{node:Text;start:number;end:number}[]=[];let seen=0;
    while(walker.nextNode()){const node=walker.currentNode as Text; nodes.push({node,start:seen,end:seen+node.length});seen+=node.length;}
    for(const n of nodes.reverse()) for(const s of segments.slice().reverse()) {
      const start=Math.max(n.start,s.start),end=Math.min(n.end,s.end);
      if(end<=start||(!s.highlights.length&&!s.threads.length&&!s.pending))continue;
      const span=block.ownerDocument.createElement('span');span.dataset.glossMark='';
      if(s.highlights.length){span.classList.add('m-hl');span.dataset.h=s.highlights.map(h=>h.id).join(' ');const fill=s.highlights.filter(h=>markStyle(h.style)==='highlight').at(-1),line=s.highlights.filter(h=>markStyle(h.style)!=='highlight').at(-1);span.dataset.c=fill?.color||line?.color||'yellow';span.dataset.fill=String(!!fill);if(line){span.dataset.line=markStyle(line.style);span.dataset.lc=line.color||'yellow';}}
      if(s.threads.length){span.classList.add('m-gloss');span.dataset.g=s.threads.map(g=>g.id).join(' ');}
      if(s.pending)span.classList.add('m-pending');
      const ids=[...s.highlights,...s.threads].map(m=>m.id);
      if(active&&ids.includes(active))span.classList.add('is-active');if(fresh&&ids.includes(fresh))span.classList.add('is-new');
      const range=block.ownerDocument.createRange();range.setStart(n.node,start-n.start);range.setEnd(n.node,end-n.start);range.surroundContents(span);
      const note=s.highlights.find(h=>h.note&&h.end===end);
      if(note){const dot=block.ownerDocument.createElement('span');dot.className='gloss-note-dot';dot.dataset.h=note.id;dot.setAttribute('aria-hidden','true');span.after(dot);}
    }
  }
}

export function railMagnification(distance:number,radius=52):number{return 1+1.25*Math.exp(-Math.pow(distance/Math.max(1,radius),2)*2);}

/** Crowding depends on source positions, never the changing height or placed top of a card. */
export function compactMarginIds(items:MarginItem[],active?:string):Set<string>{
 const ordered=items.filter(i=>Number.isFinite(i.sourceY??i.desired)).slice().sort((a,b)=>(a.sourceY??a.desired)-(b.sourceY??b.desired));
 return new Set(ordered.filter((item,i)=>item.id!==active&&!item.note&&[ordered[i-1],ordered[i+1]].some(other=>other&&Math.abs((item.sourceY??item.desired)-(other.sourceY??other.desired))<88)).map(i=>i.id));
}
/** An absent active id and absent reference are not a matching reference. */
export function annotationAnchor(threads:Thread[],id?:string,reference?:{threadId:string;anchor:Anchor}):Anchor|undefined{
 if(!id)return;if(reference?.threadId===id)return reference.anchor;
 const thread=threads.find(t=>t.id===id&&!t.removed);return thread?.selection===false?undefined:thread?.anchor;
}


/** A compact document silhouette: short texts keep a natural reading-line density. */
export function readingMapMetrics(contentHeight:number,viewportHeight:number,lineHeight=32):{height:number;scale:number}{
 const extent=Math.max(1,Number.isFinite(contentHeight)?contentHeight:1),available=Math.max(24,(Number.isFinite(viewportHeight)?viewportHeight:104)-80);
 const leading=Math.max(12,Number.isFinite(lineHeight)?lineHeight:32),height=Math.min(available,Math.max(24,extent*2.4/leading));
 return {height,scale:height/extent};
}
export function readingMapViewport(top:number,visibleHeight:number,extent:number,scale:number):{top:number;height:number}{
 const size=Math.max(1,extent),start=Math.max(0,Math.min(size,top)),end=Math.max(start,Math.min(size,top+Math.max(0,visibleHeight)));
 const mapHeight=size*scale,height=Math.min(mapHeight,Math.max(6,(end-start)*scale));
 return {top:Math.min(Math.max(0,start*scale),Math.max(0,mapHeight-height)),height};
}
/** Inline marks split rectangles; merge pieces on one visual text line. */
export function readingMapLines(rects:{top:number;left:number;width:number;height:number}[],block:{top:number;left:number;width:number}):{top:number;width:number}[]{
 const lines:{y:number;left:number;right:number}[]=[];
 for(const r of rects.filter(r=>r.width>0&&r.height>2).sort((a,b)=>a.top-b.top||a.left-b.left)){
  const line=lines.find(l=>Math.abs(l.y-r.top)<1.5);
  if(line){line.left=Math.min(line.left,r.left);line.right=Math.max(line.right,r.left+r.width);}else lines.push({y:r.top,left:r.left,right:r.left+r.width});
 }
 return lines.map(l=>({top:Math.max(0,l.y-block.top),width:Math.max(2,Math.min(18,18*(l.right-l.left)/Math.max(1,block.width)))}));
}
