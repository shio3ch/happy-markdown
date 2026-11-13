'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const {wrapSelection,formatLines}=require('../webview/formatting');
const {renderMarkdown}=require('../src/markdown');
test('inline formats preserve selected text and render safely',()=>{
 for(const [kind,expected,tag] of [['bold','**文字**','strong'],['italic','*文字*','em'],['underline','<u>文字</u>','u'],['strike','~~文字~~','s']]){
  const result=wrapSelection(kind,'文字');assert.equal(result.text,expected);assert.equal(result.text.slice(result.offset,result.offset+result.length),'文字');
  assert.match(renderMarkdown(result.text).html,new RegExp('<'+tag+'>文字</'+tag+'>'));
 }
 const code=wrapSelection('inline-code','`a`');assert.equal(code.text,'`` `a` ``');assert.match(renderMarkdown(code.text).html,/<code>`a`<\/code>/);
});
test('line formats replace existing markers and number nonempty lines',()=>{
 assert.equal(formatLines('bullet-list','1. first\n2. second'),'- first\n- second');
 assert.equal(formatLines('ordered-list','- first\n\n  - second'),'1. first\n\n  2. second');
 assert.equal(formatLines('quote','first\nsecond'),'> first\n> second');
 assert.equal(formatLines('heading','### title ###',2),'## title');
 assert.equal(formatLines('heading','plain ###',2),'## plain ###');
 assert.equal(formatLines('heading','title',7),'####### title');
});
test('level seven is a dedicated heading without altering code or standard headings',()=>{
 const {html}=renderMarkdown('# One\n\n###### Six\n\n####### Seven\n\n```md\n####### example\n```\n\n######## Not a heading');
 assert.match(html,/<h1 id="one">One/);assert.match(html,/<h6 id="six">Six/);
 assert.match(html,/<h6 data-heading-level="7" role="heading" aria-level="7" id="seven">Seven/);
 assert.match(html,/<p>######## Not a heading<\/p>/);
 assert.equal((html.match(/data-heading-level="7"/g)||[]).length,1);
});
