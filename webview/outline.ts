export type HeadingNode<T> = T & { children: HeadingNode<T>[] };
export function headingTree<T extends { level: number }>(headings: T[]): HeadingNode<T>[] {
  const roots: HeadingNode<T>[]=[],stack: HeadingNode<T>[]=[];
  for(const heading of headings) {
    const node: HeadingNode<T>={...heading,children:[]};
    while(stack.length && stack.at(-1)!.level>=node.level)stack.pop();
    (stack.length?stack.at(-1)!.children:roots).push(node);
    stack.push(node);
  }
  return roots;
}
