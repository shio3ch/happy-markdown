'use strict';

const MarkdownIt = require('markdown-it');
const sanitize = require('sanitize-html');
const hljs = require('highlight.js');

// Source positions come from parsed list items, never a global checkbox regexp.
function renderMarkdown(source, { imageUri = value => value } = {}) {
  const tasks = new Map();
  const lines = source.split(/\r?\n/);
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    highlight(code, language) {
      const normalized = language.toLowerCase();
      if (!normalized || !hljs.getLanguage(normalized)) return '';
      try {
        return hljs.highlight(code, { language: normalized, ignoreIllegals: true }).value;
      } catch {
        // Markdown-it escapes the original code when highlighting cannot run.
        return '';
      }
    },
  });
  // Markdown has six heading levels. Seven hashes are a dedicated-view extension.
  md.block.ruler.before('heading', 'design_heading7', (state, startLine, endLine, silent) => {
    if (state.sCount[startLine] - state.blkIndent >= 4) return false;
    const line = state.src.slice(state.bMarks[startLine] + state.tShift[startLine], state.eMarks[startLine]);
    const match = /^#{7}(?:[ \t]+(.*)|$)/.exec(line);
    if (!match) return false;
    if (silent) return true;
    state.line = startLine + 1;
    const open = state.push('heading_open', 'h6', 1);
    open.map = [startLine, state.line];open.markup = '#######';
    open.attrSet('data-heading-level','7');open.attrSet('role','heading');open.attrSet('aria-level','7');
    const inline = state.push('inline','',0);
    inline.content = (match[1] || '').replace(/[ \t]+#+[ \t]*$/, '').trim();inline.map = open.map;inline.children = [];
    state.push('heading_close','h6',-1).markup = '#######';
    return true;
  }, {alt:['paragraph','reference','blockquote']});
  const headings = new Map();
  md.core.ruler.after('inline', 'design_tasks', state => {
    for (let i = 0; i < state.tokens.length; i++) {
      const item = state.tokens[i];
      const paragraph = state.tokens[i + 1];
      const inline = state.tokens[i + 2];
      if (item.type !== 'list_item_open' || paragraph?.type !== 'paragraph_open' ||
          inline?.type !== 'inline' || !/^\[[ xX]\](?:\s|$)/.test(inline.content)) continue;
      const line = item.map[0];
      const match = /^(?:[ \t]|>)*(?:[-+*]|\d+[.)])[ \t]+\[([ xX])\](?=\s|$)/.exec(lines[line]);
      const first = inline.children[0];
      if (!match || first?.type !== 'text' || !/^\[[ xX]\]/.test(first.content)) continue;
      const character = match[0].lastIndexOf('[') + 1;
      const checked = match[1].toLowerCase() === 'x';
      const id = String(line);
      tasks.set(id, { line, character, expected: lines[line], checked });
      item.attrJoin('class', 'task-list-item');
      const checkbox = new state.Token('html_inline', '', 0);
      checkbox.content = `<input type="checkbox" data-task="${id}" aria-label="${md.utils.escapeHtml(inline.content.slice(3).trim() || 'タスク')}"${checked ? ' checked' : ''}>`;
      first.content = first.content.slice(3).replace(/^\s/, '');
      inline.children.unshift(checkbox);
    }
  });
  md.renderer.rules.heading_open = (tokens, index, options, env, renderer) => {
    const text = tokens[index + 1].children.map(token => token.content).join('');
    const base = text.trim().toLowerCase().replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').replace(/\s/g, '-');
    const count = headings.get(base) || 0;
    headings.set(base, count + 1);
    tokens[index].attrSet('id', count ? `${base}-${count}` : base);
    return renderer.renderToken(tokens, index, options);
  };
  const originalImage = md.renderer.rules.image;
  md.renderer.rules.image = (tokens, index, ...rest) => {
    tokens[index].attrSet('src', imageUri(tokens[index].attrGet('src')));
    return originalImage(tokens, index, ...rest);
  };
  const html = sanitize(md.render(source), {
    allowedTags: sanitize.defaults.allowedTags.concat(['img', 'input', 'details', 'summary', 'u']),
    allowedAttributes: {
      ...sanitize.defaults.allowedAttributes,
      '*': ['id', 'class'],
      input: ['type', 'data-task', 'aria-label', 'checked', 'disabled'],
      details: ['open'],
      h6: ['role','aria-level','data-heading-level'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      th: ['align', 'style'], td: ['align', 'style'],
    },
    allowedStyles: { '*': { 'text-align': [/^(left|right|center)$/] } },
    allowedSchemes: ['http', 'https', 'mailto', 'vscode-webview-resource'],
    transformTags: {
      input: (tagName, attributes) => ({ tagName, attribs: {
        ...attributes, type: 'checkbox',
        ...(!tasks.has(attributes['data-task']) ? { disabled: '' } : {}),
      } }),
    },
  });
  return { html, tasks };
}

function taskEdit(tasks, message, currentVersion, getLine) {
  if (!message || message.type !== 'toggle' || message.version !== currentVersion ||
      typeof message.checked !== 'boolean' || typeof message.id !== 'string') return;
  const task = tasks.get(message.id);
  if (!task || getLine(task.line) !== task.expected || task.checked === message.checked) return;
  return { ...task, text: message.checked ? 'x' : ' ' };
}

module.exports = { renderMarkdown, taskEdit };
