import type { EditorView } from '@codemirror/view';

type Axis = 'row' | 'column';
interface Actions {
  add(axis: Axis, boundary: number): void;
  remove(axis: Axis, index: number): void;
  move(axis: Axis, index: number, boundary: number): void;
  delete(): void;
  focusCell(): void;
  command(command: 'save' | 'undo' | 'redo'): void;
}
interface Control { element: HTMLElement; axis: Axis; index: number; gap: boolean; zone?: boolean }
interface MenuTarget { axis?: Axis; index: number; trigger: HTMLButtonElement }
interface PointerDrag { axis: Axis; index: number; source: string; id: number; x: number; y: number; started: boolean; boundary?: number; handle: HTMLButtonElement }
interface Geometry { root: DOMRect; table: DOMRect; viewport: DOMRect; editor: DOMRect; rows: DOMRect[]; columns: DOMRect[]; menuWidth: number; menuHeight: number }

/** 表の操作をメニューへ集約。文書変更は既存のCodeMirrorトランザクションへ委譲する。 */
export class TableControls {
  private readonly layer = document.createElement('div');
  private readonly options: HTMLButtonElement;
  private readonly menu = document.createElement('div');
  private controls: Control[] = [];
  private rows = 0;
  private columns = 0;
  private source = '';
  private disabled = false;
  private pointer?: PointerDrag;
  private geometry?: Geometry;
  private target?: MenuTarget;
  private generation = 0;
  private keyboard = false;
  private lastDrag?: { handle: HTMLButtonElement; time: number };
  private destroyed = false;
  private readonly observer?: ResizeObserver;
  private readonly outside = (event: Event) => {
    if (this.target && event.target instanceof Node && !this.menu.contains(event.target) && !this.target.trigger.contains(event.target)) this.closeMenu();
  };
  private readonly hover = (event: PointerEvent) => {
    this.showHover();
    if (this.pointer) { this.showHover(this.pointer.axis, this.pointer.index); return; }
    if (this.disabled || this.target || !this.geometry) return;
    if (event.target instanceof Element) {
      const control = event.target.closest<HTMLElement>('.cm-table-handle, .cm-table-column-zone');
      if (control && this.layer.contains(control)) { this.showHover('column' === control.dataset.axis ? 'column' : 'row', Number(control.dataset.index)); return; }
      const cell = event.target.closest('th, td');
      if (cell && cell.closest('table') === this.table) {
        const row = [...this.table.rows].indexOf(cell.parentElement as HTMLTableRowElement);
        if (row === 0) this.showHover('column', [...this.table.rows[0].cells].indexOf(cell as HTMLTableCellElement));
        else if (row > 0) this.showHover('row', row);
        return;
      }
    }
    const { table, viewport, rows, columns } = this.geometry;
    const x = event.clientX, y = event.clientY;
    if (x < viewport.left - 28 || x > Math.min(table.right, viewport.right) || y < table.top - 28 || y > table.bottom) return;
    if (event.target instanceof Element && event.target.closest('.cm-table-options, .cm-table-menu')) return;
    if (x < viewport.left) {
      const row = rows.findIndex(rect => y >= rect.top && y <= rect.bottom);
      if (row >= 0) this.showHover('row', row);
    } else if (y <= (rows[0]?.bottom ?? table.top)) {
      const column = columns.findIndex(rect => x >= rect.left && x <= rect.right);
      if (column >= 0) this.showHover('column', column);
    } else {
      const row = rows.findIndex(rect => y >= rect.top && y <= rect.bottom);
      if (row >= 0) this.showHover('row', row);
    }
  };
  private readonly leave = () => this.showHover();
  private readonly pointerIntent = () => { this.keyboard = false; this.keyboardFocus(); };
  private readonly measure = () => {
    if (this.destroyed) return;
    this.view.requestMeasure({ key: this,
      read: (): Geometry => ({ root: this.root.getBoundingClientRect(), table: this.table.getBoundingClientRect(),
        viewport: this.scroll.getBoundingClientRect(), editor: this.view.scrollDOM.getBoundingClientRect(),
        rows: [...this.table.rows].map(row => row.getBoundingClientRect()),
        columns: [...(this.table.rows[0]?.cells || [])].map(cell => cell.getBoundingClientRect()),
        menuWidth: this.menu.hidden ? 0 : this.menu.getBoundingClientRect().width,
        menuHeight: this.menu.hidden ? 0 : this.menu.getBoundingClientRect().height }),
      write: geometry => {
        if (this.destroyed) return;
        this.geometry = geometry;
        const { root, table, viewport, rows, columns } = geometry;
        for (const control of this.controls) {
          if (control.zone) {
            const rect = columns[control.index]; if (!rect) continue;
            const left = Math.max(rect.left, viewport.left), right = Math.min(rect.right, viewport.right);
            Object.assign(control.element.style, { left: `${left - root.left}px`, top: `${table.top - root.top - 28}px`, width: `${Math.max(0, right - left)}px` });
            control.element.hidden = right <= left; continue;
          }
          const rects = control.axis === 'row' ? rows : columns;
          const rect = rects[Math.min(control.index, rects.length - 1)];
          if (!rect) continue;
          const edge = control.index === rects.length;
          const position = control.axis === 'row'
            ? control.gap ? edge ? rect.bottom : rect.top : (rect.top + rect.bottom) / 2
            : control.gap ? edge ? rect.right : rect.left : (rect.left + rect.right) / 2;
          const style = control.element.style;
          if (control.axis === 'row') {
            style.top = `${position - root.top}px`; style.left = `${viewport.left - root.left}px`;
            if (control.gap) style.width = `${Math.max(0, Math.min(table.right, viewport.right) - viewport.left)}px`;
          } else {
            style.left = `${position - root.left}px`; style.top = `${table.top - root.top}px`;
            if (control.gap) style.height = `${table.height}px`;
          }
          control.element.hidden = control.axis === 'column' && (position < viewport.left - 1 || position > viewport.right + 1);
        }
        this.options.style.left = `${Math.min(table.right, viewport.right) - root.left - 22}px`;
        this.options.style.top = `${table.top - root.top - 26}px`;
        this.positionMenu(geometry);
      },
    });
  };

  constructor(private readonly view: EditorView, private readonly root: HTMLElement,
    private readonly scroll: HTMLElement, private readonly table: HTMLTableElement, private readonly actions: Actions) {
    this.layer.className = 'cm-table-controls'; this.layer.setAttribute('role', 'group'); this.layer.setAttribute('aria-label', 'テーブルの操作');
    this.options = this.button('テーブルのオプション', '…', () => this.openMenu({ index: 0, trigger: this.options }));
    this.options.className = 'cm-table-options'; this.options.setAttribute('aria-haspopup', 'menu'); this.options.setAttribute('aria-expanded', 'false');
    this.menu.className = 'cm-table-menu'; this.menu.setAttribute('role', 'menu'); this.menu.hidden = true;
    this.layer.append(this.options, this.menu); root.append(this.layer);
    this.layer.addEventListener('focusin', event => { if (this.keyboard && event.target instanceof HTMLButtonElement) this.keyboardFocus(event.target); });
    this.layer.addEventListener('focusout', event => { if (event.target instanceof Element) event.target.classList.remove('cm-table-control-focused'); });
    this.layer.addEventListener('keydown', event => {
      if (event.key === 'Tab') this.keyboard = true;
      if (event.key === 'Escape') {
        event.preventDefault(); event.stopPropagation(); this.clearDrag();
        if (this.target) { const trigger = this.target.trigger; this.closeMenu(); this.focusControl(trigger); }
        else this.actions.focusCell();
        return;
      }
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && ['s', 'z', 'y'].includes(key)) {
        event.preventDefault(); this.actions.command(key === 's' ? 'save' : key === 'y' || event.shiftKey ? 'redo' : 'undo');
      }
      if (this.target && this.menu.contains(event.target as Node) && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation(); this.keyboard = true;
        const items = [...this.menu.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const current = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
          : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }
    });
    root.addEventListener('pointermove', this.hover); root.addEventListener('pointerover', this.hover); root.addEventListener('pointerleave', this.leave);
    root.addEventListener('pointerdown', this.pointerIntent, true);
    root.ownerDocument.addEventListener('pointerdown', this.outside, true);
    root.ownerDocument.addEventListener('focusin', this.outside);
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(this.measure);
      for (const element of [root, table, view.scrollDOM]) this.observer.observe(element);
    }
    scroll.addEventListener('scroll', this.measure); view.scrollDOM.addEventListener('scroll', this.measure);
  }

  update(rows: number, columns: number, source: string) {
    if (source !== this.source) { this.clearDrag(); this.closeMenu(); this.showHover(); }
    this.source = source;
    if (rows !== this.rows || columns !== this.columns) {
      this.rows = rows; this.columns = columns;
      for (const control of this.controls) control.element.remove();
      this.controls = [];
      for (const [axis, count] of [['row', rows], ['column', columns]] as const) {
        for (let index = 0; index <= count; index++) {
          const gap = document.createElement('div'); gap.className = `cm-table-gap cm-table-${axis}-gap`;
          gap.dataset.axis = axis; gap.dataset.boundary = String(index); gap.setAttribute('aria-hidden', 'true');
          this.layer.append(gap); this.controls.push({ element: gap, axis, index, gap: true });
        }
        for (let index = 0; index < count; index++) this.handle(axis, index, count);
      }
      this.setDisabled(this.disabled);
    }
    this.measure();
  }

  private button(label: string, text: string, run: () => void, preserveFocus = true) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text; button.setAttribute('aria-label', label); button.title = label;
    if (preserveFocus) button.addEventListener('mousedown', event => event.preventDefault());
    button.addEventListener('click', event => {
      if (this.disabled || event.detail > 0 && this.lastDrag?.handle === button && Date.now() - this.lastDrag.time < 300) return;
      run();
    });
    return button;
  }

  private openMenu(target: MenuTarget) {
    if (this.disabled) return;
    const same = this.target?.trigger === target.trigger;
    this.closeMenu(); this.showHover(); if (same) return;
    this.target = target; target.trigger.setAttribute('aria-expanded', 'true');
    const generation = this.generation;
    const label = document.createElement('div'); label.className = 'cm-table-menu-label';
    const { axis, index } = target;
    label.textContent = axis === 'row' ? index === 0 ? '見出し行の操作' : `${index}行目の操作` : axis === 'column' ? `${index + 1}列目の操作` : 'テーブル全体の操作';
    this.menu.setAttribute('aria-label', label.textContent); this.menu.append(label);
    const item = (text: string, command: string, run: () => void, disabled = false) => {
      const button = this.button(text, text, () => {
        if (generation !== this.generation) return;
        this.closeMenu(); run();
      });
      button.setAttribute('role', 'menuitem'); button.dataset.command = command; button.disabled = disabled;
      if (command === 'delete') button.className = 'cm-table-menu-delete';
      this.menu.append(button);
    };
    const separator = () => { const line = document.createElement('div'); line.className = 'cm-table-menu-separator'; line.setAttribute('role', 'separator'); this.menu.append(line); };
    if (axis) {
      const row = axis === 'row', count = row ? this.rows : this.columns;
      item(row ? '上へ移動' : '左へ移動', 'back', () => this.actions.move(axis, index, index - 1), index === 0);
      item(row ? '下へ移動' : '右へ移動', 'forward', () => this.actions.move(axis, index, index + 2), index === count - 1);
      separator();
      item(row ? '上に行を追加' : '左に列を追加', 'before', () => this.actions.add(axis, index));
      item(row ? '下に行を追加' : '右に列を追加', 'after', () => this.actions.add(axis, index + 1));
      separator(); item(row ? '行を削除' : '列を削除', 'delete', () => this.actions.remove(axis, index));
    } else {
      item('末尾に行を追加', 'add-row', () => this.actions.add('row', this.rows));
      item('右端に列を追加', 'add-column', () => this.actions.add('column', this.columns));
      separator(); item('テーブルを削除', 'delete', () => this.actions.delete());
    }
    this.menu.hidden = false; this.measure();
    if (this.keyboard) this.menu.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }

  private closeMenu() {
    this.generation++; this.target?.trigger.setAttribute('aria-expanded', 'false'); this.target = undefined;
    this.menu.hidden = true; this.menu.replaceChildren();
  }

  private positionMenu({ root, table, viewport, editor, rows, columns, menuWidth, menuHeight }: Geometry) {
    if (!this.target) return;
    const { axis, index } = this.target, width = menuWidth || 220;
    const rect = axis === 'row' ? rows[index] : axis === 'column' ? columns[index] : table;
    if (!rect) return;
    const left = axis === 'row' ? viewport.left + 4 : axis === 'column' ? (rect.left + rect.right - width) / 2 : Math.min(table.right, viewport.right) - width;
    const top = axis === 'row' ? rect.top : table.top + 3;
    const minX = editor.width ? editor.left + 4 : root.left, maxX = editor.width ? editor.right - width - 4 : root.right - width;
    const minY = editor.height ? editor.top + 4 : root.top, maxY = editor.height ? editor.bottom - menuHeight - 4 : top;
    this.menu.style.left = `${Math.max(minX, Math.min(left, maxX)) - root.left}px`;
    this.menu.style.top = `${Math.max(minY, Math.min(top, maxY)) - root.top}px`;
  }

  private handle(axis: Axis, index: number, count: number) {
    const name = axis === 'row' ? index === 0 ? '見出し行' : `${index}行目` : `${index + 1}列目`;
    const handle = this.button(`${name}を移動`, '⠿', () => this.openMenu({ axis, index, trigger: handle }), false);
    handle.className = `cm-table-handle cm-table-${axis}-handle`; handle.dataset.axis = axis; handle.dataset.index = String(index);
    handle.setAttribute('aria-haspopup', 'menu'); handle.setAttribute('aria-expanded', 'false');
    handle.title = `${name}をドラッグして移動・クリックで操作（Alt＋矢印キーでも移動）`; handle.draggable = false;
    if (axis === 'column') {
      const zone = document.createElement('div'); zone.className = 'cm-table-column-zone'; zone.dataset.axis = axis; zone.dataset.index = String(index); zone.setAttribute('aria-hidden', 'true');
      this.layer.append(zone); this.controls.push({ element: zone, axis, index, gap: false, zone: true });
    }
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || this.disabled || this.pointer) return;
      event.preventDefault(); event.stopPropagation(); handle.focus();
      this.pointer = { axis, index, source: this.source, id: event.pointerId, x: event.clientX, y: event.clientY, started: false, handle };
      handle.setPointerCapture(event.pointerId);
    });
    handle.addEventListener('pointermove', event => {
      const drag = this.pointer, geometry = this.geometry;
      if (!drag || drag.id !== event.pointerId || !geometry) return;
      if (!drag.started && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 4) return;
      if (!drag.started) this.closeMenu();
      event.preventDefault(); drag.started = true; this.showHover();
      handle.classList.add('cm-table-drag-source'); this.root.classList.add('cm-table-dragging');
      this.layer.querySelector('.cm-table-drop-target')?.classList.remove('cm-table-drop-target');
      const { table, viewport } = geometry;
      const inside = event.clientX >= viewport.left - (axis === 'row' ? 28 : 8) && event.clientX <= Math.min(table.right, viewport.right) + 8
        && event.clientY >= table.top - (axis === 'column' ? 28 : 8) && event.clientY <= table.bottom + 8;
      drag.boundary = undefined; if (!inside) return;
      const rects = axis === 'row' ? geometry.rows : geometry.columns;
      const positions = rects.map(rect => axis === 'row' ? rect.top : rect.left); positions.push(axis === 'row' ? table.bottom : table.right);
      const coordinate = axis === 'row' ? event.clientY : event.clientX;
      drag.boundary = positions.reduce((nearest, position, i) => Math.abs(position - coordinate) < Math.abs(positions[nearest] - coordinate) ? i : nearest, 0);
      this.layer.querySelector(`.cm-table-${axis}-gap[data-boundary="${drag.boundary}"]`)?.classList.add('cm-table-drop-target');
    });
    handle.addEventListener('pointerup', event => {
      const drag = this.pointer; if (!drag || drag.id !== event.pointerId) return;
      const boundary = drag.boundary;
      if (drag.started) this.lastDrag = { handle, time: Date.now() };
      this.clearDrag();
      if (!this.disabled && drag.started && drag.source === this.source && boundary !== undefined && boundary !== index && boundary !== index + 1) this.actions.move(axis, index, boundary);
    });
    handle.addEventListener('pointercancel', () => this.clearDrag()); handle.addEventListener('lostpointercapture', () => this.clearDrag());
    handle.addEventListener('keydown', event => {
      const backward = axis === 'row' ? 'ArrowUp' : 'ArrowLeft', forward = axis === 'row' ? 'ArrowDown' : 'ArrowRight';
      if (!event.altKey || ![backward, forward].includes(event.key) || this.disabled) return;
      event.preventDefault(); event.stopPropagation(); const next = index + (event.key === backward ? -1 : 1);
      if (next < 0 || next >= count) return;
      this.closeMenu(); this.actions.move(axis, index, next < index ? next : next + 1);
      this.focusControl(this.layer.querySelector<HTMLButtonElement>(`.cm-table-${axis}-handle[data-index="${next}"]`));
    });
    this.layer.append(handle); this.controls.push({ element: handle, axis, index, gap: false });
  }

  private showHover(axis?: Axis, index?: number) {
    for (const control of this.controls) if (!control.gap && !control.zone) control.element.classList.toggle('cm-table-control-hover', control.axis === axis && control.index === index);
  }
  private keyboardFocus(button?: HTMLButtonElement) {
    this.layer.querySelector('.cm-table-control-focused')?.classList.remove('cm-table-control-focused'); button?.classList.add('cm-table-control-focused');
  }
  private focusControl(button: HTMLButtonElement | null) { if (button) { this.keyboard = true; this.keyboardFocus(button); button.focus(); } }
  private clearDrag() {
    const pointer = this.pointer; this.pointer = undefined; pointer?.handle.classList.remove('cm-table-drag-source');
    this.showHover();
    if (pointer?.handle.hasPointerCapture(pointer.id)) pointer.handle.releasePointerCapture(pointer.id);
    this.root.classList.remove('cm-table-dragging'); this.layer.querySelector('.cm-table-drop-target')?.classList.remove('cm-table-drop-target');
  }
  setDisabled(disabled: boolean) {
    this.disabled = disabled;
    if (disabled) { this.clearDrag(); this.closeMenu(); this.showHover(); }
    for (const button of this.layer.querySelectorAll('button')) button.disabled = disabled;
  }
  focusRow(row: number) { this.focusControl(this.layer.querySelector<HTMLButtonElement>(`.cm-table-row-handle[data-index="${row}"]`)); }
  destroy() {
    this.destroyed = true; this.observer?.disconnect(); this.clearDrag(); this.closeMenu();
    this.scroll.removeEventListener('scroll', this.measure); this.view.scrollDOM.removeEventListener('scroll', this.measure);
    this.root.removeEventListener('pointermove', this.hover); this.root.removeEventListener('pointerover', this.hover); this.root.removeEventListener('pointerleave', this.leave); this.root.removeEventListener('pointerdown', this.pointerIntent, true);
    this.root.ownerDocument.removeEventListener('pointerdown', this.outside, true); this.root.ownerDocument.removeEventListener('focusin', this.outside);
  }
}
