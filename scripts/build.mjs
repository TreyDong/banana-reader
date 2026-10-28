import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const notices = (await Promise.all(['LICENSE','THIRD_PARTY_NOTICES.md'].map(name=>readFile(new URL('../'+name,import.meta.url),'utf8')))).join('\n\n');
// pdf.js is bundled into main.js: community and BRAT installers only fetch
// main.js, manifest.json and styles.css, so the plugin must stay self-contained.
await build({absWorkingDir:projectRoot,entryPoints:['src/main.ts'],outfile:'main.js',bundle:true,format:'cjs',platform:'node',target:'es2022',external:['obsidian','electron'],legalComments:'inline',banner:{js:'/*!\n'+notices.replaceAll('*/','* /')+'\n*/'},logLevel:'info'});
