'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DocumentSession}=require('../webview/session');
const {textChange}=require('../src/text-change');
function setup() {const sent=[];const s=new DocumentSession(message=>sent.push(message),()=>{});s.receive({text:'a',version:1});return {s,sent};}
test('serializes rapid typing and never rolls a newer draft back to an older ack',async()=>{
 const {s,sent}=setup();s.edit('ab');s.pump();s.edit('abc');s.pump();assert.equal(sent.length,1);
 const flushed=s.flush();s.receive({id:1,text:'ab',version:2});assert.equal(s.text,'abc');assert.equal(sent.length,2);
 assert.equal(sent[1].version,2);s.receive({id:2,text:'abc',version:3});assert.equal(await flushed,true);assert.equal(s.dirty,false);
});
test('external changes update clean sessions but preserve conflicting drafts',()=>{
 const {s}=setup();s.receive({text:'external',version:2});assert.equal(s.text,'external');
 s.edit('my draft');s.receive({text:'new external',version:3});assert.equal(s.text,'my draft');assert.equal(s.conflict,true);
 s.resolve(false);assert.equal(s.text,'new external');assert.equal(s.conflict,false);
});
test('rejected edits can be retried against the latest version explicitly',async()=>{
 const {s,sent}=setup();s.edit('draft');s.pump();s.receive({id:1,text:'remote',version:4,rejected:true});
 assert.equal(await s.flush(),false);assert.equal(s.text,'draft');s.resolve(true);
 assert.equal(sent.at(-1).version,4);assert.equal(sent.at(-1).text,'draft');
 s.receive({id:2,text:'draft',version:5});assert.equal(s.conflict,false);
});
test('document replacement preserves unchanged text, CRLF and surrogate pairs',()=>{
 for(const [a,b] of [['a\r\nb','a\r\nB'],['😀hello','😁hello'],['abc',''],['','新規'],['hello','hello!']]) {
  const d=textChange(a,b);assert.equal(a.slice(0,d.start)+d.text+a.slice(d.end),b);
 }
 assert.equal(textChange('same','same'),undefined);
});
