import {type Reading,type Thread,type Highlight,resolveAnchor} from './core';
export type NotebookFilter='all'|'questions'|'highlights';
export type NotebookEntry={kind:'question';value:Thread}|{kind:'highlight';value:Highlight};
export function notebookCounts(reading:Reading){const questions=reading.threads.filter(t=>!t.removed).length,highlights=reading.highlights.filter(h=>!h.removed).length;return{all:questions+highlights,questions,highlights};}
export function notebookEntries(reading:Reading,filter:NotebookFilter='all',text?:string):NotebookEntry[]{
  const entries:NotebookEntry[]=[...reading.threads.filter(t=>!t.removed).map(value=>({kind:'question' as const,value})),...reading.highlights.filter(h=>!h.removed).map(value=>({kind:'highlight' as const,value}))];
  const position=(entry:NotebookEntry)=>{const a=entry.value.anchor;return a?(text===undefined?a.start:resolveAnchor(text,a)??a.start):0;};
  return entries.filter(entry=>filter==='all'||(filter==='questions'?entry.kind==='question':entry.kind==='highlight')).sort((a,b)=>position(a)-position(b)||a.value.created-b.value.created);
}
export function notebookTime(at:number,now=Date.now()){const seconds=Math.max(0,(now-at)/1000);if(seconds<60)return'刚刚';if(seconds<3600)return Math.floor(seconds/60)+' 分钟前';if(seconds<86400)return Math.floor(seconds/3600)+' 小时前';return new Date(at).toLocaleDateString('zh-CN',{month:'short',day:'numeric'});}
export function threadType(thread:Thread,commands:{id:string;name:string;prompt:string}[]=[]){
  if(thread.label)return thread.label;
  const command=commands.find(c=>thread.commandId===c.id||thread.messages.find(m=>m.role==='user')?.content.trim()===c.prompt.trim());
  if(command)return command.name;if(thread.commandId==='summary'||thread.messages.find(m=>m.role==='user')?.content.trim()==='请给出这篇文档的要旨、关键论点和阅读路线，引用段落编号。')return'总结';return thread.anchor?'提问':'全文问答';
}
