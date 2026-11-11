export const ON_SELECT_WORKSPACE_BEHAVIOURS = ['newWindow', 'sameWindow', 'addFolder', 'off'] as const;

export type OnSelectWorkspace = (typeof ON_SELECT_WORKSPACE_BEHAVIOURS)[number];

export const DEFAULT_ON_SELECT_WORKSPACE: OnSelectWorkspace = 'newWindow';

export function parseOnSelectWorkspace(value: unknown): OnSelectWorkspace {
  return ON_SELECT_WORKSPACE_BEHAVIOURS.includes(value as OnSelectWorkspace) ? (value as OnSelectWorkspace) : DEFAULT_ON_SELECT_WORKSPACE;
}
