import type { PhaseScope, Plan, PlanSubPhase, PlanTask } from '@api-types';
import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Badge, Card, CodeRef, CommentIcon, EmptyState, Markdown, StatusDot } from '../../components';
import { pluralKey } from '../../components/plural';
import { classNames } from '../../components/types';
import { useAnchorTarget } from '../../components/useAnchor';
import { useT } from '../../i18n/i18n';
import { useStore } from '../../store/hooks';
import { PLAN_TARGET, subPhaseTarget, taskTarget } from './planTargets';
import { isCurrentSubPhase, shouldCollapseSubPhase } from './subPhaseModel';

interface ExecutionPlanCardProps {
  readonly plan: Plan;
  readonly phase: string;
  readonly scope: Readonly<Record<string, PhaseScope>>;
  readonly secondaryAction?: ComponentChildren;
}

const DONE_STATUS = 'done';
const IN_PROGRESS_STATUS = 'in_progress';
const PENDING_STATUS = 'pending';
const KNOWN_TASK_STATUSES: readonly string[] = [PENDING_STATUS, IN_PROGRESS_STATUS, DONE_STATUS];

export interface TaskProgress {
  readonly done: number;
  readonly inProgress: number;
  readonly total: number;
}

export function countDoneTasks(tasks: readonly PlanTask[]): number {
  return tasks.filter((task) => task.status === DONE_STATUS).length;
}

export function taskProgress(tasks: readonly PlanTask[]): TaskProgress {
  return {
    done: countDoneTasks(tasks),
    inProgress: tasks.filter((task) => task.status === IN_PROGRESS_STATUS).length,
    total: tasks.length,
  };
}

export function progressPercent(progress: TaskProgress): number {
  return progress.total === 0 ? 0 : Math.round((progress.done / progress.total) * 100);
}

export function ExecutionPlanCard({ plan, phase, scope, secondaryAction }: ExecutionPlanCardProps): JSX.Element {
  const t = useT();
  const items = plan.execution ?? [];
  return (
    <Card
      id="plan-execution"
      title={t('cards.executionPlan')}
      actions={<>{secondaryAction}<CommentIcon scope="plan" target={PLAN_TARGET} label={t('plan.entirePlan')} /></>}
    >
      {plan.description !== undefined && plan.description !== '' && <div class="gw-planning-description"><Markdown source={plan.description} compact /></div>}
      {items.length === 0 && <EmptyState icon="checklist" message={t('vsc.planning.noPlan')} />}
      {items.map((item, index) => (
        <SubPhaseCard key={item.id || index} item={item} index={index} phase={phase} scope={scope[item.id]} isCollapsedByDefault={shouldCollapseSubPhase(phase, items, item)} />
      ))}
    </Card>
  );
}

interface SubPhaseCardProps {
  readonly item: PlanSubPhase;
  readonly index: number;
  readonly phase: string;
  readonly scope: PhaseScope | undefined;
  readonly isCollapsedByDefault: boolean;
}

function SubPhaseCard({ item, index, phase, scope, isCollapsedByDefault }: SubPhaseCardProps): JSX.Element {
  const t = useT();
  const tasks = item.tasks ?? [];
  const name = item.name ?? '';
  const mode = (item as { mode?: string }).mode;
  const isCurrent = isCurrentSubPhase(phase, item.id);
  return (
    <Card
      id={`subphase-${item.id || index}`}
      defaultCollapsed={isCollapsedByDefault}
      collapsedPreview={t(pluralKey('vsc.planning.taskCount', tasks.length), { count: tasks.length })}
      title={<><Badge label={item.id || String(index + 1)} tone={isCurrent ? 'warning' : 'info'} title={isCurrent ? t('vsc.planning.currentPhase') : undefined} /><span>{name === '' ? t('plan.group') : name}</span></>}
      badge={mode === undefined || mode === '' ? undefined : <Badge label={mode} tone="info" />}
      subtitle={scope === undefined ? undefined : <SubPhaseScope scope={scope} />}
      actions={<><SubPhaseProgress tasks={tasks} /><CommentIcon scope="plan" target={subPhaseTarget(item.id)} /></>}
    >
      {tasks.length === 0 && <p class="gw-muted">{t('plan.noTasks')}</p>}
      <ul class="gw-planning-tasks">
        {tasks.map((task, taskIndex) => (
          <TaskRow key={taskIndex} task={task} anchorId={`task-${item.id}-${taskIndex}`} />
        ))}
      </ul>
    </Card>
  );
}

function SubPhaseProgress({ tasks }: { readonly tasks: readonly PlanTask[] }): JSX.Element {
  const t = useT();
  const progress = taskProgress(tasks);
  const percent = progressPercent(progress);
  return (
    <span class="gw-planning-progress">
      {progress.inProgress > 0 && <Badge label={t('vsc.planning.inProgressCount', { count: progress.inProgress })} tone="warning" />}
      <span class="gw-planning-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done} aria-label={t('vsc.planning.tasksDone')}>
        <span class="gw-planning-progress-fill" style={{ width: `${percent}%` }} />
      </span>
      <span class="gw-muted">{t('plan.progress', { done: progress.done, total: progress.total })}</span>
    </span>
  );
}

function taskStatusLabel(t: ReturnType<typeof useT>, status: string): string {
  return KNOWN_TASK_STATUSES.includes(status) ? t(`vsc.planning.taskStatus.${status}`) : status;
}

function SubPhaseScope({ scope }: { readonly scope: PhaseScope }): JSX.Element {
  return (
    <div class="gw-planning-subscope">
      {(scope.must ?? []).map((path) => <span class="gw-planning-subscope-item" key={`must:${path}`}><span class="gw-planning-glyph gw-planning-glyph-must">◆</span>{path}</span>)}
      {(scope.may ?? []).map((path) => <span class="gw-planning-subscope-item" key={`may:${path}`}><span class="gw-planning-glyph gw-planning-glyph-may">◇</span>{path}</span>)}
    </div>
  );
}

function TaskRow({ task, anchorId }: { readonly task: PlanTask; readonly anchorId: string }): JSX.Element {
  const t = useT();
  const [ref, isHighlighted] = useAnchorTarget<HTMLLIElement>(anchorId);
  const isAnchored = useStore((s) => s.nav.anchor === anchorId);
  const [isExpanded, setExpanded] = useState(false);
  useEffect(() => {
    if (isAnchored) {
      setExpanded(true);
    }
  }, [isAnchored]);
  const status = task.status ?? PENDING_STATUS;
  const statusLabel = taskStatusLabel(t, status);
  const files = task.files ?? [];
  const hasAgent = task.agent !== undefined && task.agent !== '';
  const hasDetail = (task.description ?? '') !== '' || files.length > 0;
  return (
    <li id={anchorId} ref={ref} class={classNames('gw-planning-task', `gw-planning-task-${status}`, isHighlighted && 'gw-planning-task-highlight')}>
      <div class="gw-planning-task-header">
        <button type="button" class="gw-planning-task-toggle" aria-expanded={isExpanded} title={t('vsc.planning.expandTask')} disabled={!hasDetail} onClick={() => setExpanded(!isExpanded)}>
          <StatusDot status={status} title={statusLabel} />
          <span class="gw-planning-task-title">{task.title}</span>
          {hasAgent && <span class="gw-planning-task-agent">{task.agent}</span>}
        </button>
        <span class="gw-planning-task-meta">
          {status !== PENDING_STATUS && <Badge label={statusLabel} tone={status === DONE_STATUS ? 'success' : 'warning'} />}
          {task.group !== undefined && task.group !== '' && <Badge label={task.group} tone="neutral" icon="git-merge" title={t('plan.group')} />}
          <CommentIcon scope="plan" target={taskTarget(task.title)} />
        </span>
      </div>
      {isExpanded && hasDetail && (
        <div class="gw-planning-task-detail">
          {task.description !== undefined && task.description !== '' && <p class="gw-planning-task-description">{task.description}</p>}
          {files.length > 0 && (
            <ul class="gw-planning-task-files" aria-label={t('vsc.planning.taskFiles')}>
              {files.map((file) => <li key={file}><CodeRef path={file} /></li>)}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}
