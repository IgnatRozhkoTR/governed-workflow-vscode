import { currentLocale } from '../i18n/i18n';

export type PluralCategory = 'one' | 'few' | 'many' | 'other';

export function pluralCategory(locale: string, count: number): PluralCategory {
  const category = new Intl.PluralRules(locale).select(count);
  return category === 'one' || category === 'few' || category === 'many' ? category : 'other';
}

export function pluralKey(baseKey: string, count: number): string {
  return `${baseKey}.${pluralCategory(currentLocale(), count)}`;
}
