// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { MERMAID_SLOT_CLASS, MermaidSourceError, readMermaidSource, renderMarkdown } from '../../webview-ui/src/lib/markdown';

const FLOWCHART = 'flowchart LR\n  A --> B\n  B -->|"yes"| C';
const SEQUENCE = 'sequenceDiagram\n  X->>Y: call\n  X-->>Y: reply & <done>';

function mermaidSlot(source: string): Element {
  const container = document.createElement('div');
  container.innerHTML = renderMarkdown(`Flow:\n\n\`\`\`mermaid\n${source}\n\`\`\``);
  const slot = container.querySelector(`.${MERMAID_SLOT_CLASS}`);
  if (slot === null) {
    throw new Error('mermaid slot was not rendered');
  }
  return slot;
}

describe('renderMarkdown mermaid slots', () => {
  it('readMermaidSource_shouldReturnExactSource_whenFlowchartHasArrowEdges', () => {
    expect(readMermaidSource(mermaidSlot(FLOWCHART))).toBe(FLOWCHART);
  });

  it('readMermaidSource_shouldReturnExactSource_whenSequenceHasDashedArrowsAndMarkup', () => {
    expect(readMermaidSource(mermaidSlot(SEQUENCE))).toBe(SEQUENCE);
  });

  it('renderMarkdown_shouldKeepArrowsOutOfSlotMarkup_soSanitizerCannotStripThem', () => {
    expect(mermaidSlot(SEQUENCE).outerHTML).not.toMatch(/--!?>/);
  });

  it('renderMarkdown_shouldRenderCodeBlock_whenMermaidIsDisabled', () => {
    const html = renderMarkdown(`\`\`\`mermaid\n${FLOWCHART}\n\`\`\``, false);
    expect(html).not.toContain(MERMAID_SLOT_CLASS);
    expect(html).toContain('A --&gt; B');
  });

  it('renderMarkdown_shouldReplaceLoneSurrogate_whenMermaidSourceIsMalformedUnicode', () => {
    expect(readMermaidSource(mermaidSlot('flowchart LR\n  A["\uD800"] --> B'))).toBe('flowchart LR\n  A["\uFFFD"] --> B');
  });

  it('readMermaidSource_shouldThrowMermaidSourceError_whenMarkdownEmbedsRawSlotWithMalformedSource', () => {
    const container = document.createElement('div');
    container.innerHTML = renderMarkdown(`<div class="${MERMAID_SLOT_CLASS}" data-mermaid-encoded="%E0%A4%A"></div>`);
    const slot = container.querySelector(`.${MERMAID_SLOT_CLASS}`) as Element;

    expect(() => readMermaidSource(slot)).toThrow(MermaidSourceError);
  });

  it('readMermaidSource_shouldThrowMermaidSourceError_whenAttributeIsMalformed', () => {
    const slot = document.createElement('div');
    slot.setAttribute('data-mermaid-encoded', '%E0%A4%A');
    expect(() => readMermaidSource(slot)).toThrow(MermaidSourceError);
  });
});
