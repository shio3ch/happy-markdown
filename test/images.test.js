'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const path=require('node:path').posix;
const {pickImage}=require('../src/images');
const uri=value=>({scheme:'file',authority:'',path:value});
function setup(source){const writes=[];return {writes,api:{Uri:{joinPath:(base,...parts)=>uri(path.join(base.path,...parts))},window:{showOpenDialog:async()=>source?[uri(source)]:undefined},workspace:{fs:{readFile:async()=>new Uint8Array([1,2]),createDirectory:async()=>{},writeFile:async(target,bytes)=>writes.push({target,bytes})}}}};}
test('local image selection encodes the relative path without copying',async()=>{
 const {api,writes}=setup('/docs/images/a (1).png');const result=await pickImage(api,{uri:uri('/docs/readme.md')});
 assert.equal(result.path,'images/a%20%281%29.png');assert.equal(writes.length,0);
});
test('outside images are copied to assets and cancellation writes nothing',async()=>{
 const {api,writes}=setup('/pictures/example.png');const result=await pickImage(api,{uri:uri('/docs/readme.md')});
 assert.match(result.path,/^assets\/example-[a-f0-9]+\.png$/);assert.equal(writes.length,1);assert.match(writes[0].target.path,/^\/docs\/assets\//);
 const canceled=setup();assert.deepEqual(await pickImage(canceled.api,{uri:uri('/docs/readme.md')}),{});assert.equal(canceled.writes.length,0);
});
test('unsaved documents and unsupported files cannot import images',async()=>{
 const {api,writes}=setup('/pictures/unsafe.exe');assert.ok((await pickImage(api,{uri:uri('/docs/readme.md')})).message);
 assert.ok((await pickImage(api,{uri:uri('/docs/readme.md'),isUntitled:true})).message);assert.equal(writes.length,0);
});
