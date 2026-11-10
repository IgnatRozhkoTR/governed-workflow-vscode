const SNAKE_CASE_PATTERN = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

export function sentenceCase(key: string): string {
  if (!SNAKE_CASE_PATTERN.test(key)) {
    return key;
  }
  const words = key.split('_').join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function humanizeKey(translate: (key: string) => string, key: string): string {
  if (!SNAKE_CASE_PATTERN.test(key)) {
    return key;
  }
  const messageKey = `vsc.detailKey.${key}`;
  const known = translate(messageKey);
  return known === messageKey ? sentenceCase(key) : known;
}
