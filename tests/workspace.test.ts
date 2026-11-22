import test from 'node:test';
import assert from 'node:assert/strict';
import {configureWorkspace,readerPathSettings} from '../src/workspace';
import {loadWorkspace} from '../src/workspace-desktop';
import {blockedPath,exportReading,freshReading} from '../src/core';
import {readingHijackEligible} from '../src/reading-hijack';
import {migrateReaderData,migrateStudioData,migrateHomeData,migratePublicationData,rewriteReadingLinks,migrateReaderIndex} from '../scripts/workspace-migration.mjs';

const map={'01_收集箱':'笔记','03_日记':'笔记/日记','02_自媒体/03_草稿':'笔记','04_剪藏/书籍':'资料/书籍','05_附件':'附件'};
test('workspace defaults and explicit custom settings preserve unknown values without broadening the shelf',async()=>{
 const paths=await loadWorkspace(false);
 assert.deepEqual(readerPathSettings({zlibFolder:'收集箱',shelfFolder:'',exportFolder:'收集箱',unknown:{keep:true}},paths),{zlibFolder:'资料/书籍',shelfFolder:'资料',exportFolder:'笔记',unknown:{keep:true},workspacePathsVersion:1});
 const custom={zlibFolder:'My books',shelfFolder:'Only here',exportFolder:'',unknown:42};
 assert.deepEqual(readerPathSettings(custom),{...custom,workspacePathsVersion:1});
 assert.equal(readerPathSettings({...custom,shelfFolder:'',workspacePathsVersion:1}).shelfFolder,'');
 assert.equal(configureWorkspace({notesDir:'随笔',materialsDir:'资源',materialFolders:{books:'资源/图书'},diaryDir:'../private'}).diaryDir,'随笔/日记');
 assert.equal(blockedPath('随笔/日记/20261107.md'),true);
 configureWorkspace({});
});
test('old/new diaries and company/investment sources cannot open, be hijacked, or join reader input',()=>{
 for(const path of ['笔记/日记/2026/11/20261107.md','03_日记/x.md','资料/日记/x.md','60_工作库/x.pdf','20_投资库/x.epub','资料/公司/x.md','资料/投资/x.md','笔记\\日记\\x.md']){
  assert.equal(blockedPath(path),true,path);assert.equal(readingHijackEligible(path,'md'),false,path);
 }
 assert.equal(blockedPath('资料/网页/日记软件介绍.md'),false);
 assert.equal(blockedPath('笔记/阅读笔记.md'),false);
});
test('reading migration preserves anchors/progress/unknown fields and exported source/annotation links',()=>{
 const reading=freshReading();reading.progress=.67;reading.highlights=[{id:'highlight-1',anchor:{quote:'synthetic quote',start:6,prefix:'start ',suffix:' end'},color:'yellow',note:'my fixture note',created:1}];reading.notes=[{id:'note-1',text:'synthetic thought',created:2}];
 const old='04_剪藏/书籍/Test.epub',next='资料/书籍/Test.epub';
 const input={version:5,unknown:{untouched:true},settings:{zlibFolder:'收集箱',shelfFolder:'',exportFolder:'收集箱',secretRef:'unchanged'},documents:{[old]:reading}};
 const before=structuredClone(input),result=migrateReaderData(input,map);
 assert.deepEqual(input,before);assert.deepEqual(result.documents[next],reading);assert.deepEqual(result.unknown,input.unknown);assert.equal(result.settings.secretRef,'unchanged');
 assert.deepEqual(migrateReaderData(result,map),result);
 const markdown=rewriteReadingLinks(exportReading(old,reading,'Fixture vault'),map);
 for(const link of markdown.match(/obsidian:\/\/[^\s)]+/g)||[]){const url=new URL(link);assert.equal(url.searchParams.get('path')||url.searchParams.get('file'),next);}
 assert.match(markdown,/anchor=highlight-1/);assert.match(markdown,/anchor=note-1/);assert.match(markdown,/synthetic quote/);
 assert.throws(()=>migrateReaderData({...input,documents:{[old]:reading,[next]:reading}},map),/collision/);
});
test('Studio moves session/image references and retains private sessions and unknown configuration',()=>{
 const privateSession={brief:'local private fixture',covers:[{vaultPath:'05_附件/Banana Studio/old.png'}]};
 const source={lastArticle:'02_自媒体/03_草稿/A.md',outputFolder:'05_附件/Banana Studio',custom:{keyPath:'/private/key',future:'keep'},sessions:{'02_自媒体/03_草稿/A.md':{referencePaths:['05_附件/r.png'],xTweets:[{text:'05_附件 must stay prose',images:['05_附件/x.png']}],figures:[{sourcePath:'02_自媒体/03_草稿/A.md',anchor:{articlePath:'02_自媒体/03_草稿/A.md'},vaultPath:'05_附件/f.png'}]},'03_日记/private.md':privateSession}};
 const before=structuredClone(source),result=migrateStudioData(source,map);
 assert.deepEqual(source,before);assert.equal(result.lastArticle,'笔记/A.md');assert.equal(result.outputFolder,'附件/Banana Studio');assert.deepEqual(result.custom,source.custom);
 assert.equal(result.sessions['笔记/A.md'].figures[0].anchor.articlePath,'笔记/A.md');assert.equal(result.sessions['笔记/A.md'].xTweets[0].text,'05_附件 must stay prose');
 assert.equal(result.sessions['笔记/日记/private.md'].brief,privateSession.brief);
 assert.deepEqual(migrateStudioData(result,map),result);
 assert.equal(migrateStudioData({...source,outputFolder:'Custom images'},map).outputFolder,'Custom images');
 const publication={version:1,future:42,records:[{sourcePath:'02_自媒体/03_草稿/A.md',coverPath:'05_附件/c.png'}],variants:[{path:'05_附件/v.md',images:['05_附件/i.png']}]};
 assert.equal(migratePublicationData(publication,map).variants[0].path,'附件/v.md');
});
test('home task fields and word baselines survive; index stamp and cache filename stay associated',()=>{
 const task={content:'description',desc:'other',items:[{id:'one',title:'check',status:0}],dueDate:null,custom:'keep'};
 const input={taskCache:{tasks:[task]},writingFolders:['03_日记','02_自媒体/03_草稿','Custom'],days:{today:{files:{'02_自媒体/03_草稿/A.md':{baseline:100,current:120}}}},lastWriting:{path:'02_自媒体/03_草稿/A.md'},inboxReview:{path:'01_收集箱/A.md'}};
 const result=migrateHomeData(input,map);assert.deepEqual(result.taskCache,input.taskCache);assert.deepEqual(result.days.today.files['笔记/A.md'],{baseline:100,current:120});assert.deepEqual(result.writingFolders,['笔记/日记','笔记','Custom']);
 const index=migrateReaderIndex({stamp:{path:'04_剪藏/书籍/Test.epub',mtime:123,size:99},chunks:[{text:'fixture',vector:[1,0]}]},map);
 assert.equal(index.index.stamp.path,'资料/书籍/Test.epub');assert.equal(index.index.stamp.mtime,123);assert.match(index.filename,/^[a-f0-9]{64}\.json$/);
});
