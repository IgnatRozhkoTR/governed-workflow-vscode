// The only place the client corrects server text. The admin panel's ru.json leaves these keys wholly or partly in
// English, and server messages override the client's own, so a Russian panel would show them untranslated. Each entry
// applies only while the server still returns exactly that untranslated text for the ru locale, so a fixed ru.json
// wins automatically. Remove an entry once the server translates it.
interface ServerTranslationGap {
  readonly untranslated: string;
  readonly ru: string;
}

export const SERVER_RU_TRANSLATION_GAPS: Readonly<Record<string, ServerTranslationGap>> = {
  'phase.impactAnalysis': { untranslated: 'Impact Analysis', ru: 'Анализ влияния' },
  'preplanning.impactAnalysis': { untranslated: 'Impact Analysis', ru: 'Анализ влияния' },
  'diff.tree': { untranslated: 'Tree', ru: 'Дерево' },
  'diff.list': { untranslated: 'List', ru: 'Список' },
  'diff.sideBySide': { untranslated: 'Side by Side', ru: 'Рядом' },
  'diff.inline': { untranslated: 'Inline', ru: 'В одной колонке' },
  'diff.branch': { untranslated: 'Branch', ru: 'Ветка' },
  'diff.uncommitted': { untranslated: 'Uncommitted', ru: 'Незакоммиченные' },
  'scope.contractMerged': { untranslated: 'Scope (объединённый)', ru: 'Область изменений (объединённая)' },
};
