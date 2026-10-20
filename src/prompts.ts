export interface ReadingCommand {id:string;name:string;prompt:string;builtin?:boolean}
export const MAX_COMMANDS=8;
export const DEFAULT_COMMANDS:ReadingCommand[]=[
  {id:'explain',name:'解释',prompt:'请解释这段话在文中的含义和作用。',builtin:true},
  {id:'define',name:'释义',prompt:'请解释选中文本中的概念或用词，并给出具体例子。',builtin:true},
  {id:'simplify',name:'简化',prompt:'请用更简单的语言解释选中文本。',builtin:true},
  {id:'counter',name:'反例',prompt:'这个判断有哪些前提和反例？',builtin:true},
  {id:'translate',name:'翻译',prompt:'请翻译选中文本：英文译中文，中文译英文。',builtin:true},
];
export function normalizeCommands(value:unknown):ReadingCommand[]{
  if(!Array.isArray(value))return DEFAULT_COMMANDS.map(c=>({...c}));
  const ids=new Set<string>();return value.filter(c=>c&&typeof c.id==='string'&&typeof c.name==='string'&&typeof c.prompt==='string').filter(c=>{if(ids.has(c.id))return false;ids.add(c.id);return true;}).slice(0,MAX_COMMANDS).map(c=>({id:c.id,name:c.name.trim().slice(0,16)||'指令',prompt:c.prompt.slice(0,8000),builtin:DEFAULT_COMMANDS.some(d=>d.id===c.id)}));
}
export function saveCommand(commands:ReadingCommand[],command:ReadingCommand):ReadingCommand[]{
  const name=command.name.trim(),prompt=command.prompt.trim();if(!name||name.length>16)throw new Error('指令名称需为1–16个字符。');if(!prompt||prompt.length>8000)throw new Error('Prompt 需为1–8,000个字符。');
  const at=commands.findIndex(c=>c.id===command.id);if(at<0&&commands.length>=MAX_COMMANDS)throw new Error('最多保留8条指令。');
  const next=commands.map(c=>({...c}));if(at<0)next.push({...command,name,prompt});else next[at]={...commands[at],...command,name,prompt};return next;
}
export function renderCommand(prompt:string,selection:string,title:string):string{return prompt.replace(/\{\{\s*(selection|title)\s*\}\}/g,(_,key)=>key==='selection'?selection:title);}
