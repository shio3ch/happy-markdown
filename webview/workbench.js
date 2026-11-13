import { createEditor } from './editor';
import { createPreview } from './preview';
import { DocumentSession } from './session';

const vscode = acquireVsCodeApi();
const $ = id => document.getElementById(id);
const restored = vscode.getState();
let mode = restored?.mode === 'edit' ? 'edit' : 'preview';
let editor, ready = false, switching = false;
const send = message => vscode.postMessage(message);
const session = new DocumentSession(send, refresh);
const preview = createPreview($('document'), send);
editor = createEditor($('editor'), text => {
  session.edit(text);
  session.pump();
}, { save: () => action('save'), undo: () => action('undo'), redo: () => action('redo') });

function persist() { if (ready) vscode.setState({ mode, draft: session.text, baseText: session.base }); }
function refresh() {
  if (!editor) return;
  editor.setText(session.text);
  $('conflict').hidden = !session.conflict;
  $('use-latest').disabled = $('use-draft').disabled = Boolean(session.pending);
  persist();
}
function showMode() {
  document.body.dataset.mode = mode;
  $('preview-info').hidden = mode !== 'preview';
  closeMenus();
  $('editor').hidden = mode !== 'edit';
  $('edit-actions').hidden = mode !== 'edit';
  $('document').hidden = mode !== 'preview';
  document.querySelector('.document-search').hidden = mode !== 'preview';
  $('mode-label').textContent = mode === 'edit' ? 'プレビュー' : '編集する';
  $('mode').setAttribute('aria-pressed', String(mode === 'edit'));
  $('mode').title = mode === 'edit' ? 'プレビューへ切り替え' : 'テキスト編集へ切り替え';
  if (mode === 'edit') { editor.view.requestMeasure(); editor.focus(); }
  persist();
}
async function action(type) {
  if (!ready) return;
  if (await session.flush()) send({ type });
}
$('mode').addEventListener('click', async () => {
  if (!ready || switching) return;
  switching = true;
  try {
    if (await session.flush()) { mode = mode === 'edit' ? 'preview' : 'edit'; showMode(); }
  } finally { switching = false; }
});
for (const id of ['save','undo','redo']) $(id).addEventListener('click', () => action(id));
for (const id of ['bold','italic','underline','strike','inline-code','bullet-list','ordered-list','quote','horizontal-rule','link','image-url','table','code']) {
  const kind = id;
  $(id).addEventListener('mousedown', event => event.preventDefault());
  $(id).addEventListener('click', () => { if (ready) { editor.format(kind); closeMenus(); } });
}
const menus = [];
function closeMenus() { menus.forEach(menu => menu.close()); }
for (const name of ['heading','image','toc']) {
  const container = $(name+'-menu'), trigger=$(name), options=$(name+'-options');
  let suppress = false;
  const close = (focus=false) => {
    options.hidden=true;trigger.setAttribute('aria-expanded','false');
    if(focus){suppress=true;trigger.focus();suppress=false;}
  };
  const open = () => {
    if(!ready)return;
    menus.forEach(menu=>menu.close());options.hidden=false;trigger.setAttribute('aria-expanded','true');
    options.style.left='0px';
    const overflow=options.getBoundingClientRect().right-window.innerWidth+12;
    if(overflow>0)options.style.left=`${-overflow}px`;
  };
  menus.push({close});
  container.addEventListener('mouseenter',open);
  container.addEventListener('mouseleave',()=>{if(!container.contains(document.activeElement))close();});
  container.addEventListener('focusin',()=>{if(!suppress&&options.hidden)open();});
  container.addEventListener('focusout',()=>setTimeout(()=>{if(!container.contains(document.activeElement))close();},0));
  trigger.addEventListener('mousedown',event=>event.preventDefault());
  trigger.addEventListener('click',open);
  container.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();close(true);return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();if(options.hidden)open();
      const buttons=[...options.querySelectorAll('button')];const index=buttons.indexOf(document.activeElement);
      if (!buttons.length) return;
      buttons[index < 0 ? (event.key==='ArrowDown'?0:buttons.length-1) : (index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();
    }
  });
  options.querySelectorAll('button').forEach(button=>button.addEventListener('mousedown',event=>event.preventDefault()));
}
document.addEventListener('pointerdown',event=>{if(!event.target.closest('.tool-dropdown'))closeMenus();});
document.querySelectorAll('[data-heading]').forEach(button=>button.addEventListener('click',()=>{
  if(ready)editor.format('heading',Number(button.dataset.heading));closeMenus();
}));
$('image-file').addEventListener('click',async()=>{
  closeMenus();
  if(!ready||!await session.flush())return;
  $('image-file').disabled=true;send({type:'pickImage'});
});

$('use-latest').addEventListener('click', () => session.resolve(false));
$('use-draft').addEventListener('click', () => session.resolve(true));
document.addEventListener('keydown', event => {
  if (event.defaultPrevented || !(event.ctrlKey || event.metaKey)) return;
  const key = event.key.toLowerCase();
  if (key === 's') { event.preventDefault(); action('save'); }
  if (key === 'f' && mode === 'preview') { event.preventDefault(); $('search').focus(); $('search').select(); }
  if (mode === 'preview' && (key === 'z' || key === 'y')) {
    event.preventDefault(); action(key === 'y' || event.shiftKey ? 'redo' : 'undo');
  }
});
window.addEventListener('message', event => {
  const message = event.data;
  if (message?.type === 'imageResult') {
    $('image-file').disabled = false;
    if (message.path) editor.format('image-file', message.path);
    if (message.message) $('message').textContent = message.message;
    editor.focus(); return;
  }
  if (message?.type !== 'snapshot') return;
  session.receive(message);
  preview.render(message);
  $('message').textContent = message.message || '';
  if (!ready) {
    ready = true;
    if (restored && typeof restored.draft === 'string' && restored.draft !== restored.baseText) {
      session.edit(restored.draft);
      if (restored.baseText !== message.text) { session.conflict = true; refresh(); }
      else session.pump();
    }
    showMode();
  }
});
send({ type: 'ready' });
