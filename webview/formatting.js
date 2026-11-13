'use strict';
function wrapSelection(kind, selected) {
  const text = selected || (kind === 'inline-code' ? 'コード' : 'テキスト');
  const markers = {bold:['**','**'],italic:['*','*'],underline:['<u>','</u>'],strike:['~~','~~']};
  if (kind === 'inline-code') {
    const fence = '`'.repeat(Math.max(1,...[...text.matchAll(/`+/g)].map(m=>m[0].length+1)));
    const space = /^`|`$/.test(text) || (/^ .* $/.test(text) && /\S/.test(text)) ? ' ' : '';
    return {text:fence+space+text+space+fence, offset:fence.length+space.length, length:text.length};
  }
  const [open,close]=markers[kind];
  return {text:open+text+close,offset:open.length,length:text.length};
}
function formatLines(kind, text, level) {
  let number=0;
  return text.split('\n').map(line=>{
    const match=/^(\s*)(.*)$/.exec(line), indent=match[1], body=match[2];
    if (kind==='heading') return indent+'#'.repeat(level)+' '+(/^#{1,7}(?:[ \t]+|$)/.test(body) ? body.replace(/^#{1,7}(?:[ \t]+|$)/,'').replace(/[ \t]+#+[ \t]*$/,'') : body);
    if (kind==='quote') return indent+'> '+body;
    if (!body && text.includes('\n')) return line;
    const content=body.replace(/^(?:[-+*]|\d+[.)])[ \t]+/,'');
    return indent+(kind==='bullet-list'?'- ':`${++number}. `)+(content||'項目');
  }).join('\n');
}
module.exports={wrapSelection,formatLines};
