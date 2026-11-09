import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import css from 'highlight.js/lib/languages/css';
import diff from 'highlight.js/lib/languages/diff';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import kotlin from 'highlight.js/lib/languages/kotlin';
import markdown from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import shell from 'highlight.js/lib/languages/shell';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { Marked, type TokenizerAndRendererExtension } from 'marked';

export const MERMAID_SLOT_CLASS = 'gw-mermaid-slot';
export const MERMAID_SOURCE_ATTRIBUTE = 'data-mermaid-source';

const LANGUAGES = { bash, css, diff, go, java, javascript, json, kotlin, markdown, python, shell, sql, typescript, xml, yaml };
const SPAN_TAG_PATTERN = /<span[^>]*>|<\/span>/g;
const SPAN_CLOSE = '</span>';

Object.entries(LANGUAGES).forEach(([name, language]) => hljs.registerLanguage(name, language));

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

// A lone "~" must stay literal so GFM never turns "~5 min ... ~10 min" into a single-tilde strikethrough (as on the web).
const literalTilde: TokenizerAndRendererExtension = {
  name: 'literalTilde',
  level: 'inline',
  start: (src) => {
    const index = src.indexOf('~');
    return index < 0 ? undefined : index;
  },
  tokenizer: (src) => (src.startsWith('~') && !src.startsWith('~~') ? { type: 'literalTilde', raw: '~', text: '~' } : undefined),
  renderer: () => '~',
};

function createMarked(isMermaidEnabled: boolean): Marked {
  const instance = new Marked({ gfm: true, breaks: false });
  instance.use({
    extensions: [literalTilde],
    renderer: {
      code: (code: string, language: string | undefined) => renderCodeBlock(code, language, isMermaidEnabled),
    },
  });
  return instance;
}

const markedWithMermaid = createMarked(true);
const markedPlain = createMarked(false);

function renderCodeBlock(code: string, language: string | undefined, isMermaidEnabled: boolean): string {
  const name = (language ?? '').trim().split(/\s+/)[0] ?? '';
  if (isMermaidEnabled && name === 'mermaid') {
    return `<div class="${MERMAID_SLOT_CLASS}" ${MERMAID_SOURCE_ATTRIBUTE}="${escapeHtml(code)}"></div>`;
  }
  return `<pre class="gw-code"><code class="hljs">${highlightCode(code, name)}</code></pre>`;
}

export function renderMarkdown(source: string, isMermaidEnabled = true): string {
  const html = (isMermaidEnabled ? markedWithMermaid : markedPlain).parse(source, { async: false }) as string;
  return sanitizeHtml(html);
}

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'script', 'iframe'], FORBID_ATTR: ['style'] });
}

export function highlightCode(code: string, language?: string): string {
  if (language !== undefined && language !== '' && hljs.getLanguage(language) !== undefined) {
    return hljs.highlight(code, { language, ignoreIllegals: true }).value;
  }
  return escapeHtml(code);
}

export function guessLanguage(path: string): string | undefined {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return hljs.getLanguage(extension) === undefined ? undefined : extension;
}

// hljs spans can cross line breaks; reopen them on every line so each line is valid HTML on its own.
export function splitHighlightedLines(html: string): string[] {
  const openTags: string[] = [];
  return html.split('\n').map((line) => {
    const prefix = openTags.join('');
    for (const tag of line.match(SPAN_TAG_PATTERN) ?? []) {
      if (tag === SPAN_CLOSE) {
        openTags.pop();
      } else {
        openTags.push(tag);
      }
    }
    return `${prefix}${line}${SPAN_CLOSE.repeat(openTags.length)}`;
  });
}

export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
