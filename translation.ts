export const TRANSLATION_LANGUAGES:Record<string,string>={'zh-CN':'简体中文','zh-TW':'繁體中文',en:'英语',ja:'日语',ko:'韩语',fr:'法语',de:'德语',es:'西班牙语',ru:'俄语'};
export type GoogleRequest=(url:string,signal:AbortSignal)=>Promise<unknown>;
export function translationChunks(text:string,limit=1200):string[]{
 if(!Number.isInteger(limit)||limit<4)throw new Error('无效分段长度');const chars=Array.from(text),out:string[]=[];let at=0;while(at<chars.length){let end=Math.min(at+limit,chars.length);if(end<chars.length){for(let n=end;n>at+limit/2;n--)if(/[\s。！？.!?]/u.test(chars[n-1])){end=n;break;}}out.push(chars.slice(at,end).join(''));at=end;}return out;
}
export function translationPayload(payload:unknown):{text:string;source:string}{
 if(!Array.isArray(payload)||!Array.isArray(payload[0]))throw new Error('谷歌翻译返回格式无法识别。');const text=payload[0].map((part:unknown)=>Array.isArray(part)&&typeof part[0]==='string'?part[0]:'').join('');if(!text.trim())throw new Error('谷歌翻译未返回译文。');return{text,source:typeof payload[2]==='string'?payload[2]:''};
}
function language(code:string){return /^zh-(TW|HK|Hant)$/i.test(code)?'zh-tw':code.toLowerCase().split(/[-_]/)[0];}
async function cancellable<T>(work:Promise<T>,signal:AbortSignal):Promise<T>{
 if(signal.aborted)throw new Error('已停止');let abort:()=>void=()=>{};let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([work,new Promise<T>((_,reject)=>{timer=setTimeout(()=>reject(new Error('谷歌翻译请求超时。')),25000);abort=()=>reject(new Error('已停止'));signal.addEventListener('abort',abort,{once:true});})]);}finally{clearTimeout(timer);signal.removeEventListener('abort',abort);}
}
/** Only the explicit selection is sent. One detected target applies to all chunks. */
export async function googleTranslate(text:string,target:string,signal:AbortSignal,request:GoogleRequest):Promise<{text:string;target:string}>{
 if(signal.aborted)throw new Error('已停止');if(!text.trim())throw new Error('请先选择需要翻译的文字。');if(text.length>24000)throw new Error('单次翻译最多 24,000 字符，请缩小选文。');if(!TRANSLATION_LANGUAGES[target])target='zh-CN';const chunks=translationChunks(text);let used=target;
 const run=async(chunk:string)=>{if(signal.aborted)throw new Error('已停止');const url=new URL('https://translate.googleapis.com/translate_a/single');url.search=new URLSearchParams({client:'gtx',sl:'auto',tl:used,dt:'t',q:chunk}).toString();let payload:unknown;try{payload=await cancellable(request(url.href,signal),signal);}catch(e){if(signal.aborted)throw new Error('已停止');if((e as Error).message==='谷歌翻译请求过于频繁，请稍后重试。')throw e;throw new Error('谷歌翻译连接失败，请检查网络后重试。');}return translationPayload(payload);};
 let first=await run(chunks[0]);if(language(first.source)===language(used)){used=language(used).startsWith('zh')?'en':'zh-CN';first=await run(chunks[0]);}let result=first.text;for(const chunk of chunks.slice(1))result+=(await run(chunk)).text;if(signal.aborted)throw new Error('已停止');return{text:result.trim(),target:used};
}
