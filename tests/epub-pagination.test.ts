import test from 'node:test';
import assert from 'node:assert/strict';
import {paginateEpub} from '../src/epub-pagination';

test('pagination maps column breaks to original text offsets and removes its temporary layout',async()=>{
 let removed=false,attached=false;const node={length:5};let start=0;
 const range={setStart:(_node:unknown,n:number)=>{start=n;},setEnd:()=>{},getClientRects:()=>[{left:[0,0,132,132,264][start]}],detach:()=>{}};
 const doc:any={defaultView:{setTimeout},createRange:()=>range,createTreeWalker:()=>{let done=false;return{currentNode:node,nextNode:()=>{if(done)return false;done=true;return true;}};}};
 const copy:any={ownerDocument:doc,classList:{add(){}},setAttribute(){},style:{},getBoundingClientRect:()=>({left:0}),querySelectorAll:(q:string)=>q==='img'?[]:q.startsWith('section')?[{getClientRects:()=>[{left:0}]},{getClientRects:()=>[{left:132}]}]:[{}],remove:()=>{removed=true;}};
 const article:any={ownerDocument:doc,clientWidth:100,cloneNode:()=>copy,parentElement:{appendChild:()=>{attached=true;}}};
 const result=await paginateEpub(article,[{start:10,end:15,text:'abcde',number:1}],80,new AbortController().signal);
 assert.equal(attached,true);assert.equal(removed,true);assert.deepEqual(result.sectionPages,[1,2]);assert.deepEqual(result.pageStarts,[10,12,14]);assert.equal(result.pageCount,3);
});

test('cancelled pagination removes the temporary layout',async()=>{
 let removed=false;const controller=new AbortController();controller.abort();
 const copy:any={classList:{add(){}},setAttribute(){},style:{},remove:()=>{removed=true;}};
 const article:any={ownerDocument:{defaultView:{setTimeout}},clientWidth:100,cloneNode:()=>copy,parentElement:{appendChild(){}}};
 await assert.rejects(paginateEpub(article,[],80,controller.signal),/取消/);assert.equal(removed,true);
});
