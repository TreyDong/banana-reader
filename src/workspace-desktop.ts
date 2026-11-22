import {configureWorkspace,workspacePaths,type WorkspacePaths} from './workspace';
/** Desktop-only imports stay behind the platform check; mobile uses portable defaults. */
export async function loadWorkspace(desktop:boolean,vaultRoot?:string):Promise<WorkspacePaths>{
 configureWorkspace({});
 if(desktop){try{
  const [fs,os,path]=await Promise.all([import('node:fs/promises'),import('node:os'),import('node:path')]);
  const raw=JSON.parse(await fs.readFile(path.join(os.homedir(),'.config/banana/workspace.json'),'utf8')) as Record<string,unknown>;
  if(raw.version===1&&(!vaultRoot||typeof raw.vaultRoot!=='string'||path.resolve(raw.vaultRoot)===path.resolve(vaultRoot)))configureWorkspace(raw);
 }catch{/* A missing shared config never restores legacy folder defaults. */}}
 return workspacePaths();
}
