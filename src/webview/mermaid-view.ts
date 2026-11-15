// Mermaidの設定は共有状態なので、初期化から描画までを直列化する。
let queue: Promise<unknown> = Promise.resolve();
let nextId = 0;

const properties = /^(?:fill(?:-opacity|-rule)?|stroke(?:-width|-dasharray|-dashoffset|-linecap|-linejoin|-opacity)?|opacity|color|background-color|font(?:-family|-size|-weight|-style)?|text-anchor|dominant-baseline|alignment-baseline|text-decoration|paint-order|marker-(?:start|mid|end)|rx|ry)$/;

function safeValue(value: string) {
  if (/[\\@{}<>]|\/\*/.test(value)) return false;
  const withoutReferences = value.replace(/url\(\s*["']?#[\w.-]+["']?\s*\)/gi, '');
  return !/(?:url|image|image-set|var|attr|expression)\s*\(/i.test(withoutReferences)
    && !/[a-z-]+\s*\(/i.test(withoutReferences.replace(/(?:rgb|rgba|hsl|hsla)\([^()]*\)/gi, ''));
}

// SVGだけを許可し、外部リソース・操作・アニメーションを除く。CSSは図のShadow DOMへ隔離する。
export async function mermaidSvg(svg: string, document: Document) {
  const { default: createPurifier } = await import('dompurify');
  const purifier = createPurifier(document.defaultView!);
  const fragment = purifier.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true }, RETURN_DOM_FRAGMENT: true,
    FORBID_TAGS: ['foreignObject', 'a', 'image', 'use', 'animate', 'animateMotion', 'animateTransform', 'set'],
  });
  for (const element of fragment.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      if (attribute.name !== 'style' && (/href$/i.test(attribute.name) || (/[\\]|url\s*\(/i.test(attribute.value) && !safeValue(attribute.value))))
        element.removeAttribute(attribute.name);
    }
    const styled = element as SVGElement;
    if (styled.style) {
      // CSP下のDOMParserでは属性文字列が残っていてもelement.styleは空になる。
      // CSSOMで読み直し、許可した描画属性だけをスクリプトから適用する。
      const parsed = document.createElement('span').style;
      parsed.cssText = element.getAttribute('style') || '';
      const declarations = Array.from(parsed).map(name => [name, parsed.getPropertyValue(name)]);
      element.removeAttribute('style');
      for (const [name, value] of declarations)
        if (properties.test(name) && safeValue(value)) styled.style.setProperty(name, value);
    }
  }
  for (const style of fragment.querySelectorAll('style')) {
    const sheet = new document.defaultView!.CSSStyleSheet();
    // Mermaidが出力する通常のルールのみを扱い、@規則や入れ子は捨てる。
    for (const rule of (style.textContent || '').split('}')) {
      const brace = rule.indexOf('{');
      if (brace < 0 || /[{}@\\]/.test(rule.slice(0, brace))) continue;
      try { sheet.insertRule(rule + '}', sheet.cssRules.length); } catch { /* 不正なCSSは描画しない。 */ }
    }
    const rules: string[] = [];
    for (const rule of [...sheet.cssRules]) {
      if (!('style' in rule) || !('selectorText' in rule)) continue;
      const parsed = rule as CSSStyleRule;
      const declarations = Array.from(parsed.style).filter(name => properties.test(name) && safeValue(parsed.style.getPropertyValue(name)))
        .map(name => `${name}:${parsed.style.getPropertyValue(name)}${parsed.style.getPropertyPriority(name) ? ' !important' : ''}`);
      if (declarations.length) rules.push(`${parsed.selectorText}{${declarations.join(';')}}`);
    }
    style.textContent = rules.join('\n');
    style.setAttribute('nonce', document.querySelector<HTMLMetaElement>('meta[name="style-nonce"]')?.content || '');
  }
  if (!fragment.querySelector('svg')) throw new Error('SVGを生成できませんでした。');
  return fragment;
}

export function renderMermaid(target: HTMLElement, source: string, onRendered?: (rendered: boolean) => void, onResize?: () => void) {
  let disposed = false, generation = 0;
  const document = target.ownerDocument;
  const shadow = target.attachShadow({ mode: 'open' });
  target.setAttribute('role', 'img');
  target.setAttribute('aria-label', 'Mermaidの図');
  const render = () => {
    const current = ++generation;
    target.dataset.state = 'loading';
    target.setAttribute('aria-label', 'Mermaidの図');
    onRendered?.(false);
    shadow.textContent = '図を描画中…';
    queue = queue.catch(() => {}).then(async () => {
      if (disposed || current !== generation) return;
      let staging: HTMLElement | undefined;
      try {
        if (source.length > 50000) throw new Error('図の定義は50,000文字以内にしてください。');
        const { default: mermaid } = await import('mermaid');
        if (disposed || current !== generation) return;
        const dark = document.body.matches('.vscode-dark, .vscode-high-contrast');
        mermaid.initialize({
          startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true,
          theme: dark ? 'dark' : 'default', layout: 'dagre', htmlLabels: false,
          flowchart: { htmlLabels: false }, maxTextSize: 50000, maxEdges: 500,
          // 文書内のfrontmatter/directiveで安全設定やCSS・描画経路を上書きさせない。
          secure: [...new Set([...Object.keys(mermaid.mermaidAPI.defaultConfig), 'secure', 'dompurifyConfig', 'themeCSS', 'layout', 'look'])],
        });
        staging = document.createElement('div');
        staging.className = 'mermaid-measure';
        staging.setAttribute('aria-hidden', 'true');
        document.body.append(staging);
        const { svg } = await mermaid.render(`happy-mermaid-${++nextId}`, source, staging);
        const fragment = await mermaidSvg(svg, document);
        if (disposed || current !== generation) return;
        shadow.replaceChildren(fragment);
        target.dataset.state = 'ready';
        onRendered?.(true);
      } catch (error) {
        if (disposed || current !== generation) return;
        const message = document.createElement('p');
        message.textContent = 'Mermaidを表示できません。記法を確認してください。';
        const details = document.createElement('pre');
        details.textContent = error instanceof Error ? error.message.slice(0, 1200) : '図の描画に失敗しました。';
        shadow.replaceChildren(message, details);
        target.dataset.state = 'error';
        target.setAttribute('aria-label', 'Mermaidの描画エラー');
      } finally {
        staging?.remove();
        if (!disposed && current === generation) onResize?.();
      }
    });
  };
  const observer = new MutationObserver(render);
  observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  render();
  return () => { disposed = true; generation++; observer.disconnect(); target.remove(); };
}
