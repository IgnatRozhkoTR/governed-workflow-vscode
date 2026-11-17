export const MAX_PREVIEW_LENGTH = 80;
const ELLIPSIS = '…';
const ESCAPED_CHARACTER = /\\([\\`*_{}[\]()#+\-.!|<>~])/g;
const PROTECTED_CHARACTER = /[-]/g;
const PROTECTED_RANGE_START = 0xe000;
const FENCE_LINE = /^[ \t]*(```|~~~).*$/gm;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const HTML_TAG = /<\/?[A-Za-z][^>]*>/g;
const IMAGE = /!\[([^\]]*)\]\([^)]*\)/g;
const INLINE_LINK = /\[([^\]]*)\]\([^)]*\)/g;
const REFERENCE_LINK = /\[([^\]]+)\]\[[^\]]*\]/g;
const REFERENCE_DEFINITION = /^[ \t]*\[[^\]]+\]:.*$/gm;
const HORIZONTAL_RULE = /^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm;
const HEADING_MARKER = /^[ \t]{0,3}#{1,6}[ \t]+|[ \t]+#+[ \t]*$/gm;
const BLOCKQUOTE_MARKER = /^[ \t]*(>[ \t]?)+/gm;
const LIST_MARKER = /^[ \t]*([-*+]|\d+[.)])[ \t]+(\[[ xX]\][ \t]+)?/gm;
const INLINE_CODE = /(`+)([\s\S]*?)\1/g;
const STRONG_ASTERISK = /\*\*(\S(?:[\s\S]*?\S)?)\*\*/g;
const EMPHASIS_ASTERISK = /\*(\S(?:[\s\S]*?\S)?)\*/g;
const STRIKETHROUGH = /~~(\S(?:[\s\S]*?\S)?)~~/g;
const STRONG_UNDERSCORE = /(^|\W)__(\S(?:[\s\S]*?\S)?)__(?!\w)/g;
const EMPHASIS_UNDERSCORE = /(^|\W)_(\S(?:[\s\S]*?\S)?)_(?!\w)/g;
const WHITESPACE_RUN = /\s+/g;

// The inline preview is a single line of plain text: Markdown syntax is dropped, the words it marks up are kept.
// Underscore emphasis needs a non-word character on both sides so snake_case identifiers survive.
export function markdownToPlainPreview(text: string, maxLength = MAX_PREVIEW_LENGTH): string {
  const plain = restoreEscaped(stripInlineSyntax(stripBlockSyntax(protectEscaped(text))));
  return truncate(plain.replace(WHITESPACE_RUN, ' ').trim(), maxLength);
}

function stripBlockSyntax(text: string): string {
  return text
    .replace(FENCE_LINE, '')
    .replace(HTML_COMMENT, ' ')
    .replace(HTML_TAG, ' ')
    .replace(REFERENCE_DEFINITION, '')
    .replace(HORIZONTAL_RULE, '')
    .replace(HEADING_MARKER, '')
    .replace(BLOCKQUOTE_MARKER, '')
    .replace(LIST_MARKER, '');
}

function stripInlineSyntax(text: string): string {
  return text
    .replace(IMAGE, '$1')
    .replace(INLINE_LINK, '$1')
    .replace(REFERENCE_LINK, '$1')
    .replace(INLINE_CODE, (_match, _fence: string, code: string) => code.trim())
    .replace(STRONG_ASTERISK, '$1')
    .replace(EMPHASIS_ASTERISK, '$1')
    .replace(STRIKETHROUGH, '$1')
    .replace(STRONG_UNDERSCORE, '$1$2')
    .replace(EMPHASIS_UNDERSCORE, '$1$2');
}

// Escaped characters are swapped for private-use code points so no syntax rule can consume them.
function protectEscaped(text: string): string {
  return text.replace(ESCAPED_CHARACTER, (_match, character: string) => String.fromCharCode(PROTECTED_RANGE_START + character.charCodeAt(0)));
}

function restoreEscaped(text: string): string {
  return text.replace(PROTECTED_CHARACTER, (character) => String.fromCharCode(character.charCodeAt(0) - PROTECTED_RANGE_START));
}

function truncate(text: string, maxLength: number): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1).trimEnd()}${ELLIPSIS}`;
}
