import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileLensPlacement} from '../src/reading-ui';

const root={left:0,top:0,right:390,bottom:844};
const visible={left:0,top:72,right:390,bottom:820};
test('mobile selection toolbar stays near the selected text and within the reading area',()=>{
 const below=mobileLensPlacement([{left:100,right:180,top:150,bottom:172}],root,visible,250,48)!;
 assert.equal(below.below,true);assert.equal(below.top,184);assert.ok(below.left>=8&&below.left+250<=382);
 const above=mobileLensPlacement([{left:320,right:380,top:780,bottom:802}],root,visible,250,48)!;
 assert.equal(above.below,false);assert.equal(above.top,720);assert.ok(above.left+250<=382);
});
test('mobile selection toolbar uses visible lines and clamps to a reduced viewport',()=>{
 const keyboardViewport={left:0,top:72,right:390,bottom:420};
 const result=mobileLensPlacement([{left:20,right:200,top:20,bottom:40},{left:20,right:200,top:350,bottom:370},{left:20,right:200,top:600,bottom:620}],root,keyboardViewport,300,48)!;
 assert.equal(result.top,290);assert.ok(result.top+48<=412);assert.equal(result.below,false);
 assert.equal(mobileLensPlacement([],root,visible,250,48),null);
});
