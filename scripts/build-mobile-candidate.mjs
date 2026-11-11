import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {assertNoDynamicCode, pdfNoEval} from './build.mjs';

// Phone build of the current release: same version number, but installable on a phone.
// The desktop release keeps isDesktopOnly true; this build never becomes a community release.
const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFile(new URL(`../${name}`, import.meta.url));
const manifest = JSON.parse(await read('manifest.json'));
assert.equal(manifest.id, 'gloss-reader');
assert.equal(manifest.isDesktopOnly, true);
const version = manifest.version;
const output = new URL(`../dist/gloss-reader-${version}-mobile/`, import.meta.url);
const notices = (await Promise.all(['LICENSE', 'THIRD_PARTY_NOTICES.md'].map(read))).map(x => x.toString()).join('\n\n');
const result = await build({absWorkingDir:root, entryPoints:['src/main.ts'], outfile:'main.js', bundle:true, write:false, format:'cjs', platform:'node', target:'es2022', external:['obsidian'], plugins:[pdfNoEval], legalComments:'inline', banner:{js:'/*!\n'+notices.replaceAll('*/','* /')+'\n*/'}, logLevel:'info'});
assertNoDynamicCode(result.outputFiles[0].text);
const files = {
 'main.js': result.outputFiles[0].contents,
 'manifest.json': Buffer.from(JSON.stringify({...manifest, isDesktopOnly:false}, null, 2)+'\n'),
 'styles.css': await read('styles.css')
};
await mkdir(new URL('../dist/', import.meta.url), {recursive:true});
await mkdir(output, {recursive:true});
for (const [name, bytes] of Object.entries(files)) {
 await writeFile(new URL(name, output), bytes);
 console.log(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
}
console.log(`Phone build (not a community release): ${fileURLToPath(output)}`);
