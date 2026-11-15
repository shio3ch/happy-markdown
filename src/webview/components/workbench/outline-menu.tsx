import type { RefObject } from 'react';
import type { Heading } from './preview';
import type { HeadingNode } from '../../outline';

export function Outline({ nodes, root, close }: { nodes: HeadingNode<Heading>[]; root: RefObject<HTMLElement | null>; close(): void }) {
  return <ul>{nodes.map((node, index) => <li key={index}>
    <button type="button" title={`見出し ${node.level}: ${node.label}`} onClick={() => {
      for (let parent = node.element.parentElement; parent && parent !== root.current; parent = parent.parentElement) {
        if (parent instanceof HTMLDetailsElement) parent.open = true;
      }
      node.element.setAttribute('tabindex', '-1'); node.element.focus({ preventScroll: true });
      node.element.scrollIntoView({ block: 'start' }); close();
    }}>{node.label}</button>
    {node.children.length > 0 && <Outline nodes={node.children} root={root} close={close} />}
  </li>)}</ul>;
}
