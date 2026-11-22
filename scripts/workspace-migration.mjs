import {createHash} from 'node:crypto';

/** Pure helpers: no filesystem access, writes, logging or automatic migration. */
export function pathMapper(pathMap) {
  const entries=Object.entries(pathMap).sort((a,b)=>b[0].length-a[0].length);
  for(const pair of entries)for(const value of pair)if(typeof value!=='string'||!value||value.startsWith('/')||value.includes('\\')||value.split('/').some(p=>!p||p==='.'||p==='..'))throw new Error('Path map must contain vault-relative paths');
  return value=>{
    if(typeof value!=='string')return value;
    const entry=entries.find(([old])=>value===old||value.startsWith(old+'/'));
    return entry?entry[1]+value.slice(entry[0].length):value;
  };
}
function renameKeys(source,map) {
  const result={};
  for(const [key,value]of Object.entries(source||{})){
    const target=map(key);
    if(Object.hasOwn(result,target))throw new Error('Path collision: '+target);
    Object.defineProperty(result,target,{value,enumerable:true,writable:true,configurable:true});
  }
  return result;
}
export function migrateReaderData(input,pathMap,paths={notesDir:'笔记',materialsDir:'资料',booksDir:'资料/书籍'}) {
  const result=structuredClone(input),map=pathMapper(pathMap);
  result.documents=renameKeys(result.documents,map);
  const settings=result.settings||={};
  const defaults={zlibFolder:paths.booksDir,shelfFolder:paths.materialsDir,exportFolder:paths.notesDir};
  const old={zlibFolder:['','收集箱','01_收集箱','04_剪藏/书籍'],shelfFolder:['','04_剪藏'],exportFolder:['收集箱','01_收集箱']};
  for(const key of Object.keys(defaults))if(settings[key]===undefined||(settings.workspacePathsVersion!==1&&old[key].includes(settings[key])))settings[key]=defaults[key];
  settings.workspacePathsVersion=1;
  // Other settings, annotation IDs, quotes, progress and unknown fields are unchanged.
  return result;
}
const pathFields=new Set(['path','articlePath','sourcePath','vaultPath','coverPath','wechatCoverPath','taskFolder','folder','outputFolder','lastArticle']);
const pathLists=new Set(['referencePaths','images']);
function remapReferences(value,map,key='') {
  if(typeof value==='string')return pathFields.has(key)||pathLists.has(key)?map(value):value;
  if(Array.isArray(value))return value.map(item=>remapReferences(item,map,key));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,remapReferences(v,map,k)]));
  return value;
}
export function migrateStudioData(input,pathMap,paths={attachmentsDir:'附件'}) {
  const result=structuredClone(input),map=pathMapper(pathMap);
  // Private sessions remain local and intact; runtime privacy checks decide eligibility.
  result.sessions=remapReferences(renameKeys(result.sessions,map),map);
  if(typeof result.lastArticle==='string')result.lastArticle=map(result.lastArticle);
  if(!result.outputFolder||['Banana Studio','05_附件/Banana Studio','02_自媒体/05_附件/Banana Studio'].includes(result.outputFolder))result.outputFolder=paths.attachmentsDir+'/Banana Studio';
  if(result.publishRelay?.jobs)result.publishRelay.jobs=remapReferences(result.publishRelay.jobs,map);
  if(result.channels){
    for(const account of result.channels.accounts||[]){
      if(typeof account.publicationFolder==='string')account.publicationFolder=map(account.publicationFolder);
      if(account.config?.publishRelay?.jobs)account.config.publishRelay.jobs=remapReferences(account.config.publishRelay.jobs,map);
    }
    if(result.channels.calendarSources)result.channels.calendarSources=remapReferences(result.channels.calendarSources,map);
  }
  return result;
}
/** Companion publication.json uses separate records/variants; settings are not mixed into it. */
export function migratePublicationData(input,pathMap) {
  const result=structuredClone(input),map=pathMapper(pathMap);
  for(const key of ['records','variants'])if(Array.isArray(result[key]))result[key]=remapReferences(result[key],map);
  return result;
}
export function migrateHomeData(input,pathMap,paths={notesDir:'笔记',diaryDir:'笔记/日记'}) {
  const result=structuredClone(input),map=pathMapper(pathMap);
  for(const day of Object.values(result.days||{}))if(day.files)day.files=renameKeys(day.files,map);
  for(const key of ['lastWriting','inboxReview'])if(result[key]?.path)result[key].path=map(result[key].path);
  if(Array.isArray(result.writingFolders))result.writingFolders=[...new Set(result.writingFolders.map(p=>({'01_收集箱':paths.notesDir,'03_日记':paths.diaryDir,'02_自媒体/03_草稿':paths.notesDir})[p]||p))];
  return result;
}
/** Update exported reading links without touching quotes, prose, anchor IDs or unrelated URLs. */
export function rewriteReadingLinks(markdown,pathMap) {
  const map=pathMapper(pathMap);
  return markdown.replace(/obsidian:\/\/(?:open|banana-reader|gloss-reader)\?[^\s)<>"']+/g,link=>{
    const url=new URL(link);let changed=false;
    for(const key of ['path','file']){const old=url.searchParams.get(key);if(old!==null&&map(old)!==old){url.searchParams.set(key,map(old));changed=true;}}
    return changed?url.toString():link;
  });
}
/** Index filename and stamp must change together. Reuse only if source bytes are unchanged. */
export function migrateReaderIndex(input,pathMap) {
  const index=structuredClone(input),map=pathMapper(pathMap);
  if(!index.stamp?.path)throw new Error('Missing index source path');
  index.stamp.path=map(index.stamp.path);
  return {filename:createHash('sha256').update(index.stamp.path).digest('hex')+'.json',index};
}
