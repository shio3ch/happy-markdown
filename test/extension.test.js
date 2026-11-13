'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');
test('host synchronizes drafts, rejects stale updates, saves and toggles tasks',async()=>{
 let provider,receive,changed,saved;let text='- [ ] task\r\n';let version=1;let fail=false;const sent=[];
 const uri={toString:()=> 'file:///test.md'};const noop={dispose(){}};
 const document={uri,eol:2,get version(){return version;},isDirty:false,getText:()=>text,lineAt:()=>({text:text.split('\r\n')[0]}),positionAt:offset=>offset,save:async()=>{document.isDirty=false;saved(document);return true;}};
 const vscode={EndOfLine:{CRLF:2},Uri:{joinPath:()=>uri},Range:class{constructor(...args){this.args=args;}},WorkspaceEdit:class{replace(uri,range,value){Object.assign(this,{uri,range,value});}},
 commands:{registerCommand:()=>noop,executeCommand:async()=>{}},
 window:{registerCustomEditorProvider:(id,p)=>{provider=p;return noop;}},
 workspace:{onDidChangeTextDocument:fn=>{changed=fn;return noop;},onDidSaveTextDocument:fn=>{saved=fn;return noop;},applyEdit:async edit=>{
  if(fail)return false;const a=edit.range.args;const start=a.length===2?a[0]:a[1];const end=a.length===2?a[1]:a[3];
  text=text.slice(0,start)+edit.value+text.slice(end);version++;document.isDirty=true;changed({document});return true;
 }}};
 const mod={exports:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../src/extension'),'utf8'),{module:mod,URL,require:name=>name==='vscode'?vscode:name==='./explorer'?{registerExplorer(){}}:name.startsWith('./')?require('../src/'+name.slice(2)):require(name)});
 mod.exports.activate({subscriptions:[],extensionUri:uri});
 provider.resolveCustomTextEditor(document,{active:true,webview:{cspSource:'https://test',asWebviewUri:()=> 'https://test/file',postMessage:m=>sent.push(m),onDidReceiveMessage:fn=>{receive=fn;return noop;}},onDidDispose(){}});
 await receive({type:'ready'});assert.equal(sent.at(-1).text,'- [ ] task\n');
 await receive({type:'edit',id:1,version:1,text:'- [ ] updated\n'});assert.equal(text,'- [ ] updated\r\n');assert.equal(sent.at(-1).id,1);
 await receive({type:'edit',id:2,version:1,text:'stale'});assert.equal(sent.at(-1).rejected,true);assert.equal(text,'- [ ] updated\r\n');
 await receive({type:'toggle',version:2,id:'0',checked:true});assert.equal(text,'- [x] updated\r\n');
 await receive({type:'save'});assert.equal(document.isDirty,false);
 fail=true;await receive({type:'edit',id:3,version:3,text:'blocked'});assert.equal(sent.at(-1).rejected,true);assert.equal(text,'- [x] updated\r\n');
});
