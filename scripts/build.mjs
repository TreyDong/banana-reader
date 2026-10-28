import {build} from 'esbuild';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import ts from 'typescript';
const projectRoot=fileURLToPath(new URL('../',import.meta.url));
const probe='function isEvalSupported() {\n  try {\n    new Function("");\n    return true;\n  } catch {\n    return false;\n  }\n}';
const compiler=`    if (isEvalSupported && FeatureTest.isEvalSupported) {
      const compiled = new PostScriptCompiler().compile(code, domain, range);
      if (compiled) {
        return new Function("src", "srcOffset", "dest", "destOffset", compiled);
      }
    }`;
/** Inspect the complete dependency bundle's syntax without executing it. */
export function assertNoDynamicCode(source){
 const ast=ts.createSourceFile('main.js',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 const visit=node=>{
  if((ts.isNewExpression(node)||ts.isCallExpression(node))&&ts.isIdentifier(node.expression)&&['Function','eval'].includes(node.expression.text))throw new Error('Dynamic code remains in the installation bundle');
  ts.forEachChild(node,visit);
 };visit(ast);
}
/** Use pdf.js's existing interpreter; dependency drift must fail closed. */
export const pdfNoEval={name:'pdf-no-dynamic-code',setup(builder){
 builder.onLoad({filter:/[/\\]pdfjs-dist[/\\]build[/\\]pdf(?:\.worker)?\.mjs$/},async({path})=>{
  const version=JSON.parse(await readFile(new URL('../node_modules/pdfjs-dist/package.json',import.meta.url),'utf8')).version;
  if(version!=='4.10.38')throw new Error('Review the no-eval transform before changing pdf.js');
  let source=await readFile(path,'utf8');
  if(source.split(probe).length!==2)throw new Error('Unexpected PDF feature probe');
  source=source.replace(probe,'function isEvalSupported() { return false; }');
  if(path.endsWith('pdf.worker.mjs')){
   if(source.split(compiler).length!==2)throw new Error('Unexpected PDF PostScript compiler');
   source=source.replace(compiler,'    // Banana Reader: use the upstream PostScript interpreter below.');
  }
  assertNoDynamicCode(source);return{contents:source,loader:'js'};
 });
}};
export async function buildPlugin(){
 const notices=(await Promise.all(['LICENSE','THIRD_PARTY_NOTICES.md'].map(name=>readFile(new URL('../'+name,import.meta.url),'utf8')))).join('\n\n');
 const result=await build({absWorkingDir:projectRoot,entryPoints:['src/main.ts'],outfile:'main.js',bundle:true,write:false,format:'cjs',platform:'node',target:'es2022',external:['obsidian'],plugins:[pdfNoEval],legalComments:'inline',banner:{js:'/*!\n'+notices.replaceAll('*/','* /')+'\n*/'},logLevel:'info'});
 assertNoDynamicCode(result.outputFiles[0].text);await writeFile(new URL('../main.js',import.meta.url),result.outputFiles[0].contents);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildPlugin();
