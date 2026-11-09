// Mermaid reuses element ids such as "arrowhead" across diagrams; two SVGs on one page would then share markers and styles.
export function deduplicateSvgIds(svg: SVGSVGElement, prefix: string): void {
  const renames = new Map<string, string>();
  svg.querySelectorAll('[id]').forEach((element) => {
    const oldId = element.getAttribute('id') ?? '';
    const newId = `${prefix}_${oldId}`;
    renames.set(oldId, newId);
    element.setAttribute('id', newId);
  });
  let markup = svg.innerHTML;
  renames.forEach((newId, oldId) => {
    markup = markup
      .split(`url(#${oldId})`).join(`url(#${newId})`)
      .split(`href="#${oldId}"`).join(`href="#${newId}"`)
      .split(`href='#${oldId}'`).join(`href='#${newId}'`);
  });
  svg.innerHTML = markup;
  svg.querySelectorAll('style').forEach((style) => {
    let css = style.textContent ?? '';
    renames.forEach((newId, oldId) => {
      css = css.split(`#${oldId}`).join(`#${newId}`);
    });
    style.textContent = css;
  });
}

export function hashText(text: string): string {
  let hash = 5381;
  for (let index = 0; index < text.length; index++) {
    hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(36);
}

const FLOWCHART_NODE_ID_PATTERN = /flowchart-(.+)-\d+$/;

export function mermaidNodeId(node: Element): string | undefined {
  const dataId = node.getAttribute('data-id');
  if (dataId !== null && dataId !== '') {
    return dataId;
  }
  return FLOWCHART_NODE_ID_PATTERN.exec(node.getAttribute('id') ?? '')?.[1];
}
