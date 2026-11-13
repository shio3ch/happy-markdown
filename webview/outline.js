'use strict';
function headingTree(headings) {
  const roots=[],stack=[];
  for(const heading of headings) {
    const node={...heading,children:[]};
    while(stack.length && stack.at(-1).level>=node.level)stack.pop();
    (stack.length?stack.at(-1).children:roots).push(node);
    stack.push(node);
  }
  return roots;
}
module.exports={headingTree};
