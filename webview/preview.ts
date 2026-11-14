import { elementById as $ } from './dom';
import type { DocumentSnapshot, EditorMessage } from '../shared/messages';
import type { HeadingNode } from './outline';
import { headingTree } from './outline';
import { createSearch } from './preview-search';

type Heading = { level: number; label: string; element: HTMLElement };

export function createPreview(root: HTMLElement, send: (message: EditorMessage) => void) {
  const search = createSearch(root);
  let version: number | undefined, pending = false;
  root.addEventListener('change', event => {
    const box = event.target;
    if (!(box instanceof HTMLInputElement) || !box.matches('input[type="checkbox"][data-task]') || version === undefined || box.dataset.task === undefined) return;
    if (pending) { box.checked = !box.checked; return; }
    pending = true;
    root.querySelectorAll<HTMLInputElement>('input[data-task]').forEach(input => input.disabled = true);
    send({ type: 'toggle', id: box.dataset.task, checked: box.checked, version });
  });
  root.addEventListener('click', event => {
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (!link) return;
    event.preventDefault();
    const href = link.getAttribute('href');
    if (!href) return;
    if (href.startsWith('#')) {
      try { root.querySelector(`[id="${CSS.escape(decodeURIComponent(href.slice(1)))}"]`)?.scrollIntoView(); } catch {}
    } else send({ type: 'link', href });
  });
  function renderOutline() {
    const options=$('toc-options');
    const headings=[...root.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')].map(element=>({
      level:Number(element.dataset.headingLevel||element.tagName.slice(1)),
      label:(element.textContent || '').trim()||'（見出しなし）',element,
    }));
    options.replaceChildren();
    if(!headings.length) {
      const empty=document.createElement('p');empty.className='toc-empty';empty.textContent='見出しがありません';options.append(empty);return;
    }
    function list(nodes: HeadingNode<Heading>[]): HTMLUListElement {
      const ul=document.createElement('ul');
      for(const node of nodes) {
        const li=document.createElement('li'),button=document.createElement('button');
        button.type='button';button.textContent=node.label;button.title=`見出し ${node.level}: ${node.label}`;
        button.addEventListener('mousedown',event=>event.preventDefault());
        button.addEventListener('click',()=>{
          for(let parent=node.element.parentElement;parent&&parent!==root;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;
          node.element.setAttribute('tabindex','-1');node.element.focus({preventScroll:true});
          node.element.scrollIntoView({block:'start'});
          options.hidden=true;$('toc').setAttribute('aria-expanded','false');
        });
        li.append(button);if(node.children.length)li.append(list(node.children));ul.append(li);
      }
      return ul;
    }
    options.append(list(headingTree(headings)));
  }

  return { render(message: Pick<DocumentSnapshot, 'html' | 'version'>) {
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.task : undefined;
    const scroll = root.scrollTop;
    const details = [...root.querySelectorAll('details')].map(item => item.open);
    root.innerHTML = message.html;
    root.querySelectorAll('details').forEach((item,index) => { if (index < details.length) item.open = details[index]; });
    version = message.version; pending = false;
    const boxes = [...root.querySelectorAll<HTMLInputElement>('input[data-task]')];
    const remaining = boxes.filter(box => !box.checked).length;
    $('progress').textContent = `${boxes.length - remaining}/${boxes.length}件のタスクが完了`;
    renderOutline();
    search.refresh(false);
    boxes.find(box => box.dataset.task === focused)?.focus({ preventScroll: true });
    root.scrollTop = scroll;
  } };
}
