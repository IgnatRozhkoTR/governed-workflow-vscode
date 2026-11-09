export type Codicon = string;
export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent';

export function toneClass(tone: Tone | undefined): string {
  return `gw-tone-${tone ?? 'neutral'}`;
}

export function classNames(...names: readonly (string | false | undefined)[]): string {
  return names.filter((name): name is string => typeof name === 'string' && name !== '').join(' ');
}
