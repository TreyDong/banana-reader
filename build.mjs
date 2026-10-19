import { build } from 'esbuild';
import { readFile } from 'node:fs/promises';
const notices = (await Promise.all(['LICENSE','THIRD_PARTY_NOTICES.md'].map(name=>readFile(name,'utf8')))).join('\n\n');
await build({entryPoints:['main.ts'],outfile:'main.js',bundle:true,format:'cjs',platform:'node',target:'es2022',external:['obsidian','electron'],legalComments:'inline',banner:{js:'/*!\n'+notices.replaceAll('*/','* /')+'\n*/'},logLevel:'info'});
