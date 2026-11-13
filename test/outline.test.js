'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {headingTree}=require('../webview/outline');
test('outline nests under the nearest shallower heading and handles skipped levels',()=>{
 const tree=headingTree([{level:1,label:'A'},{level:3,label:'A.1'},{level:7,label:'A.1.a'},{level:2,label:'A.2'},{level:1,label:'B'}]);
 assert.deepEqual(tree.map(n=>n.label),['A','B']);assert.deepEqual(tree[0].children.map(n=>n.label),['A.1','A.2']);assert.equal(tree[0].children[0].children[0].label,'A.1.a');
});
test('outline retains duplicate headings and supports empty documents',()=>{
 assert.deepEqual(headingTree([]),[]);const tree=headingTree([{level:2,label:'Same'},{level:2,label:'Same'}]);assert.equal(tree.length,2);
});
