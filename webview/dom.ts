// IDと要素の型は、拡張が生成する固定のHTMLシェルに対応する。
interface Elements {
  'use-latest': HTMLButtonElement;
  'use-draft': HTMLButtonElement;
  'image-file': HTMLButtonElement;
  'search': HTMLInputElement;
  'search-prev': HTMLButtonElement;
  'search-next': HTMLButtonElement;
  'query': HTMLInputElement;
  'clear': HTMLButtonElement;
}

export function elementById<K extends string>(id: K): K extends keyof Elements ? Elements[K] : HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`要素が見つかりません: ${id}`);
  return element as K extends keyof Elements ? Elements[K] : HTMLElement;
}
