import type { JSX } from 'preact';
import { useMemo } from 'preact/hooks';
import { highlightCode, splitHighlightedLines } from '../lib/markdown';
import { classNames } from './types';

export interface CodeBlockProps {
  readonly code: string;
  readonly language?: string;
  readonly startLine?: number;
  readonly highlight?: readonly [number, number];
  readonly onLineClick?: (line: number) => void;
  readonly maxHeight?: number;
}

function isHighlighted(line: number, range: readonly [number, number] | undefined): boolean {
  return range !== undefined && line >= range[0] && line <= range[1];
}

export function CodeBlock({ code, language, startLine = 1, highlight, onLineClick, maxHeight }: CodeBlockProps): JSX.Element {
  const lines = useMemo(() => splitHighlightedLines(highlightCode(code, language)), [code, language]);
  return (
    <div class="gw-code-block" style={maxHeight === undefined ? undefined : { maxHeight: `${maxHeight}px` }}>
      <table class="hljs">
        <tbody>
          {lines.map((html, index) => {
            const line = startLine + index;
            return (
              <tr key={line} class={classNames(isHighlighted(line, highlight) && 'gw-code-line-highlight', onLineClick !== undefined && 'gw-code-line-clickable')}>
                <td class="gw-code-line-number" onClick={onLineClick === undefined ? undefined : () => onLineClick(line)}>{line}</td>
                <td class="gw-code-line" dangerouslySetInnerHTML={{ __html: html }} />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
