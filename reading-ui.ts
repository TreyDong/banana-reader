// Margin geometry and mark segmentation adapted for Obsidian from Nutlope/gloss.
// References: components/reader/Margin.tsx, Block.tsx, lib/anchor.ts (54b13b8).
import {resolveAnchor, type Anchor, type Passage, type MarkStyle, type Thread, markStyle} from './core';
export interface MarginItem {id: string; desired: number; height: number; created: number; mini?:boolean; sourceY?:number; note?:boolean}
export function placeMarginItems(items: MarginItem[], active?: string): Record<string, number> {
  if (!items.length) return {};
  const tops = items.map(i => i.desired), ai = items.findIndex(i => i.id === active), gap = (i:number) => items[i-1].mini&&items[i].mini?4:16;
  const forward = (from: number) => {for (let i = Math.max(1, from); i < items.length; i++) tops[i] = Math.max(tops[i], tops[i - 1] + items[i - 1].height + gap(i));};
  if (ai < 0) {tops[0] = Math.max(0, tops[0]); forward(1);}
  else {forward(ai + 1); for (let i = ai - 1; i >= 0; i--) tops[i] = Math.min(tops[i], tops[i + 1] - gap(i+1) - items[i].height); if (tops[0] < 0) {tops[0] = 0; forward(1);}}
  return Object.fromEntries(items.map((item, i) => [item.id, tops[i]]));
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
