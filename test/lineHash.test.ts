import { describe, expect, it } from 'vitest';
import { lineHash } from '../src/comments/lineHash';

// Expected values were produced by running lineHash from the admin panel's comments.js in node.
const GOLDEN_VALUES: ReadonlyArray<readonly [string, string, string]> = [
  ['an empty line', '', '1505'],
  ['a single character', 'a', '2b606'],
  ['indented code', '  return x;', '2850cf58'],
  ['tabs only', '\t\t', '596b77'],
  ['spaces only', '   ', 'b873f45'],
  ['accented latin text', 'const café = "naïve";', '9e538814'],
  ['CJK text', '日本語のコメント', '9566ee51'],
  ['emoji with a zero-width joiner sequence', '🚀 launch 👨‍👩‍👧', 'c68aafc6'],
  ['a 5000 character line', 'x'.repeat(5000), '6c9a05c5'],
  [
    'a long statement',
    'function veryLongName(argumentOne, argumentTwo, argumentThree) { return argumentOne + argumentTwo * argumentThree; } // trailing',
    '234e9985',
  ],
];

describe('lineHash', () => {
  it.each(GOLDEN_VALUES)('should match the web panel hash when the input is %s', (_name, input, expected) => {
    const result = lineHash(input);

    expect(result).toBe(expected);
  });

  it('should differ when only whitespace differs', () => {
    expect(lineHash('x = 1')).not.toBe(lineHash('x =  1'));
  });
});
