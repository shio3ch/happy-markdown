import MarkdownIt from 'markdown-it';
import type { Format } from './formatting';

const markdown = new MarkdownIt({ html: true, linkify: true });
const preserved = new WeakMap<Node, { text: string; source: string }>();
const links = new WeakMap<HTMLElement, { href: string; title: string | null }>();
const escape = (text: string) => text.replace(/[\\`*_\[\]<>~|]/g, '\\$&').replace(/\r?\n/g, '<br>');

export function renderCell(parent: HTMLElement, source: string) {
  parent.replaceChildren();
  const stack = [parent];
  const appendText = (text: string, original?: string) => {
    const node = document.createTextNode(text);
    if (original !== undefined) preserved.set(node, { text, source: original });
    stack[stack.length - 1].append(node);
  };
  const open = (tag: string, className?: string) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    stack[stack.length - 1].append(element); stack.push(element);
    return element;
  };
  const close = (tag: string) => { if (stack.length > 1 && stack[stack.length - 1].localName === tag) stack.pop(); };
  for (const token of markdown.parseInline(source.replace(/\\\|/g, '|'), {})[0]?.children || []) {
    const pair = /^(strong|em|s)_(open|close)$/.exec(token.type);
    if (pair) { if (pair[2] === 'open') open(pair[1]); else close(pair[1]); }
    else if (token.type === 'text') appendText(token.content);
    else if (token.type === 'code_inline') { open('code'); appendText(token.content); close('code'); }
    else if (token.type === 'link_open') links.set(open('span', 'cm-live-link'), { href: token.attrGet('href') || '', title: token.attrGet('title') });
    else if (token.type === 'link_close') close('span');
    else if (token.type === 'softbreak' || token.type === 'hardbreak' || token.type === 'html_inline' && /^<br\s*\/?>$/i.test(token.content))
      stack[stack.length - 1].append(document.createElement('br'));
    else if (token.type === 'html_inline' && /^<u\s*>$/i.test(token.content)) open('u');
    else if (token.type === 'html_inline' && /^<\/u\s*>$/i.test(token.content)) close('u');
    else if (token.type === 'image') {
      const element = open('span'); appendText(token.content); close('span');
      const title = token.attrGet('title');
      preserved.set(element, { text: token.content, source: `![${escape(token.content)}](<${token.attrGet('src') || ''}>${title ? ' "' + title.replace(/"/g, '\\"') + '"' : ''})` });
    } else appendText(token.content, token.content);
  }
}

export function serializeCell(parent: HTMLElement): string {
  function serialize(node: Node): string {
    const original = preserved.get(node);
    if (original && node.textContent === original.text) return original.source;
    if (node.nodeType === Node.TEXT_NODE) return escape(node.textContent || '').replace(/\u00a0/g, ' ');
    if (!(node instanceof HTMLElement)) return '';
    const contents = [...node.childNodes].map(serialize).join('');
    const tag = node.localName;
    if (tag === 'br') return '<br>';
    if (tag === 'code') {
      const text = (node.textContent || '').replace(/\|/g, '\\|');
      const fence = '`'.repeat(Math.max(1, ...[...text.matchAll(/`+/g)].map(match => match[0].length + 1)));
      const pad = /^`|`$/.test(text) || /^ .* $/.test(text) && /\S/.test(text) ? ' ' : '';
      return fence + pad + text + pad + fence;
    }
    const parentTag = node.parentElement?.localName || '';
    if (tag === 'strong' || tag === 'b') return ['strong', 'b'].includes(parentTag) ? contents : contents ? '**' + contents + '**' : '';
    if (tag === 'em' || tag === 'i') return ['em', 'i'].includes(parentTag) ? contents : contents ? '*' + contents + '*' : '';
    if (tag === 's' || tag === 'strike' || tag === 'del') return ['s', 'strike', 'del'].includes(parentTag) ? contents : contents ? '~~' + contents + '~~' : '';
    if (tag === 'u') return '<u>' + contents + '</u>';
    const link = links.get(node);
    if (link) return `[${contents}](<${link.href}>${link.title ? ' "' + link.title.replace(/"/g, '\\"') + '"' : ''})`;
    if (tag === 'div' || tag === 'p') return (node.previousSibling ? '<br>' : '') + contents;
    return contents;
  }
  return [...parent.childNodes].map(serialize).join('').replace(/(?<!\\)\|/g, '\\|')
    .replace(/^ +| +$/g, spaces => '&#32;'.repeat(spaces.length));
}

export function insertCellText(parent: HTMLElement, text: string) {
  const selection = window.getSelection();
  let range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
  if (!range || !parent.contains(range.commonAncestorContainer)) { range = document.createRange(); range.selectNodeContents(parent); range.collapse(false); }
  range.deleteContents();
  const fragment = document.createDocumentFragment();
  text.replace(/\r\n?/g, '\n').split('\n').forEach((line, index) => {
    if (index) fragment.append(document.createElement('br'));
    fragment.append(document.createTextNode(line));
  });
  const last = fragment.lastChild;
  range.insertNode(fragment);
  if (last) { range.setStartAfter(last); range.collapse(true); selection?.removeAllRanges(); selection?.addRange(range); }
}

export function insertCellImage(parent: HTMLElement, path: string) {
  const selection = window.getSelection();
  const range = selection?.rangeCount ? selection.getRangeAt(0) : undefined;
  if (!range || !parent.contains(range.commonAncestorContainer)) return false;
  const label = range.toString() || '画像の説明';
  const element = document.createElement('span'); element.textContent = label;
  preserved.set(element, { text: label, source: `![${escape(label)}](<${path.replace(/</g, '%3C').replace(/>/g, '%3E')}>)` });
  range.deleteContents(); range.insertNode(element); range.setStartAfter(element); range.collapse(true);
  selection?.removeAllRanges(); selection?.addRange(range); return true;
}

export function formatCell(parent: HTMLElement, kind: Format) {
  const tags: Partial<Record<Format, string>> = { bold: 'strong', italic: 'em', strike: 's', underline: 'u', 'inline-code': 'code' };
  const tag = tags[kind];
  if (!tag) return false;
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!parent.contains(range.commonAncestorContainer)) return false;
  const element = document.createElement(tag);
  element.append(range.extractContents());
  if (!element.textContent) element.textContent = 'テキスト';
  range.insertNode(element); range.selectNodeContents(element);
  selection.removeAllRanges(); selection.addRange(range);
  return true;
}
