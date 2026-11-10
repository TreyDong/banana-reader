import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {assertNoDynamicCode, pdfNoEval} from './build.mjs';

// Separate local candidate: never change the desktop release metadata or user data.
const root = fileURLToPath(new URL('../', import.meta.url));
const version = '0.15.2-mobile.15';
const output = new URL(`../dist/gloss-reader-${version}/`, import.meta.url);
const read = name => readFile(new URL(`../${name}`, import.meta.url));
const manifest = JSON.parse(await read('manifest.json'));
assert.equal(manifest.id, 'gloss-reader');
assert.equal(manifest.version, '0.15.1');
assert.equal(manifest.isDesktopOnly, true);
const notices = (await Promise.all(['LICENSE', 'THIRD_PARTY_NOTICES.md'].map(read))).map(x => x.toString()).join('\n\n');
const result = await build({absWorkingDir:root, entryPoints:['src/main.ts'], outfile:'main.js', bundle:true, write:false, format:'cjs', platform:'node', target:'es2022', external:['obsidian'], plugins:[pdfNoEval], legalComments:'inline', banner:{js:'/*!\n'+notices.replaceAll('*/','* /')+'\n*/'}, logLevel:'info'});
assertNoDynamicCode(result.outputFiles[0].text);
const files = {
 'main.js': result.outputFiles[0].contents,
 'manifest.json': Buffer.from(JSON.stringify({...manifest, version, isDesktopOnly:false}, null, 2)+'\n'),
 'styles.css': await read('styles.css')
};
// Refuse to overwrite a previous candidate; preserve it for comparison.
await mkdir(new URL('../dist/', import.meta.url), {recursive:true});
await mkdir(output);
for (const [name, bytes] of Object.entries(files)) {
 await writeFile(new URL(name, output), bytes, {flag:'wx'});
 console.log(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
}
console.log(`Local mobile candidate: ${fileURLToPath(output)}`);
