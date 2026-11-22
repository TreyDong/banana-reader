export interface WorkspacePaths {notesDir:string;diaryDir:string;materialsDir:string;booksDir:string;attachmentsDir:string}
export const DEFAULT_WORKSPACE:WorkspacePaths={notesDir:'笔记',diaryDir:'笔记/日记',materialsDir:'资料',booksDir:'资料/书籍',attachmentsDir:'附件'};
let current:WorkspacePaths={...DEFAULT_WORKSPACE};
export const workspacePaths=():WorkspacePaths=>({...current});
const relative=(value:unknown,fallback:string):string=>{
 if(typeof value!=='string')return fallback;
 const path=value.trim().replace(/\\/g,'/').replace(/\/+$/,'');
 return !path||path.startsWith('/')||path.includes(':')||path.split('/').some(p=>!p||p.startsWith('.'))?fallback:path;
};
export function configureWorkspace(value:unknown):WorkspacePaths{
 const raw=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const folders=raw.materialFolders&&typeof raw.materialFolders==='object'?raw.materialFolders as Record<string,unknown>:{};
 const materialsDir=relative(raw.materialsDir,DEFAULT_WORKSPACE.materialsDir),notesDir=relative(raw.notesDir,DEFAULT_WORKSPACE.notesDir);
 current={notesDir,diaryDir:relative(raw.diaryDir,notesDir+'/日记'),materialsDir,booksDir:relative(folders.books,materialsDir+'/书籍'),attachmentsDir:relative(raw.attachmentsDir,DEFAULT_WORKSPACE.attachmentsDir)};
 return workspacePaths();
}
/** Replace only known former defaults; keep every explicit custom folder and other setting. */
export function readerPathSettings<T extends {zlibFolder?:string;shelfFolder?:string;exportFolder?:string;workspacePathsVersion?:number}>(saved:T,paths=workspacePaths()):T&{zlibFolder:string;shelfFolder:string;exportFolder:string;workspacePathsVersion:number}{
 const pick=(value:unknown,old:string[],fallback:string)=>typeof value==='string'&&(saved.workspacePathsVersion===1||!old.includes(value))?value:fallback;
 return {...saved,workspacePathsVersion:1,zlibFolder:pick(saved.zlibFolder,['','收集箱','01_收集箱','04_剪藏/书籍'],paths.booksDir),shelfFolder:pick(saved.shelfFolder,['','04_剪藏'],paths.materialsDir),exportFolder:pick(saved.exportFolder,['收集箱','01_收集箱'],paths.notesDir)};
}
