export type TabId = 'preplanning' | 'planning' | 'research' | 'phase' | 'changes' | 'review'
                  | 'progress' | 'reflection' | 'scratchpads' | 'settings';
export type SettingsSectionId = 'task' | 'workflow' | 'phases' | 'reviewMode' | 'verification'
                  | 'rules' | 'git' | 'claude' | 'system';
export type Topic = 'comments' | 'context' | 'criteria' | 'proposals' | 'scratchpads' | 'diff' | 'history'
                  | 'verification' | 'reviewPipeline' | 'reviewThreads' | 'git' | 'settings' | 'rules' | 'phases';
export type PanelAction = 'setPhase' | 'rejectPlan' | 'approvePlan';

export interface CommentRef {
  readonly scope: string;
  readonly target: string;
}

export interface NavTarget {
  readonly tab: TabId;
  readonly section?: SettingsSectionId | string;
  readonly anchor?: string;
  readonly action?: PanelAction;
  readonly comment?: CommentRef;
}

export const TAB_ORDER: readonly TabId[] =
  ['preplanning', 'planning', 'research', 'phase', 'changes', 'review', 'progress', 'reflection', 'scratchpads', 'settings'];

export const TOPICS: readonly Topic[] = [
  'comments', 'context', 'criteria', 'proposals', 'scratchpads', 'diff', 'history',
  'verification', 'reviewPipeline', 'reviewThreads', 'git', 'settings', 'rules', 'phases',
];

// The web opens the settings dashboard on the first visit to a workspace.
export const DEFAULT_NAV: NavTarget = { tab: 'settings' };

const PANEL_ACTIONS: readonly PanelAction[] = ['setPhase', 'rejectPlan', 'approvePlan'];

export function isNavTarget(value: unknown): value is NavTarget {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return TAB_ORDER.includes(candidate.tab as TabId)
    && isOptionalString(candidate.section)
    && isOptionalString(candidate.anchor)
    && (candidate.action === undefined || PANEL_ACTIONS.includes(candidate.action as PanelAction))
    && (candidate.comment === undefined || isCommentRef(candidate.comment));
}

export function isCommentRef(value: unknown): value is CommentRef {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.scope === 'string' && candidate.scope !== '' && typeof candidate.target === 'string';
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}
