import type { PhaseScope, Plan, PlanSubPhase, PlanTask } from '@api-types';
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { Badge, Card, CodeRef, CommentIcon, EmptyState, Markdown, PlanApprovalBar, StatusDot } from '../../components';
import { useAnchorTarget } from '../../components/useAnchor';
import { useT } from '../../i18n/i18n';
import { useStore } from '../../store/hooks';

interface ExecutionPlanCardProps {
  readonly plan: Plan;
  readonly planStatus: string | null;
  readonly phase: string;
  readonly scope: Readonly<Record<string, PhaseScope>>;
}

export function isCurrentSubPhase(phase: string, subPhaseId: string): boolean {
  return subPhaseId !== '' && (phase === subPhaseId || phase.startsWith(`${subPhaseId}.`));
}

export function countDoneTasks(tasks: readonly PlanTask[]): number {
  return tasks.filter((task) => task.status === 'done').length;
}

export function ExecutionPlanCard({ plan, planStatus, phase, scope }: ExecutionPlanCardProps): JSX.Element {
  const t = useT();
  const items = plan.execution ?? [];
  return (
    <Card
      id="plan-execution"
      title={t('cards.executionPlan')}
      actions={<><PlanApprovalBar planStatus={planStatus} /><CommentIcon scope="plan" target={t('plan.entirePlan')} label={t('plan.entirePlan')} /></>}
    >
      {plan.description !== undefined && plan.description !== '' && <div class="gw-planning-description"><Markdown source={plan.description} compact /></div>}
      {items.length === 0 && <EmptyState icon="checklist" message={t('vsc.planning.noPlan')} />}
      {items.map((item, index) => (
        <SubPhaseCard key={item.id || index} item={item} index={index} phase={phase} scope={scope[item.id]} />
      ))}
    </Card>
  );
}

interface SubPhaseCardProps {
  readonly item: PlanSubPhase;
  readonly index: number;
  readonly phase: string;
  readonly scope: PhaseScope | undefined;
}

function SubPhaseCard({ item, index, phase, scope }: SubPhaseCardProps): JSX.Element {
  const t = useT();
  const tasks = item.tasks ?? [];
  const name = item.name ?? '';
  const mode = (item as { mode?: string }).mode;
  const isCurrent = isCurrentSubPhase(phase, item.id);
  return (
    <Card
      id={`subphase-${item.id || index}`}
      title={<><Badge label={item.id || String(index + 1)} tone={isCurrent ? 'warning' : 'info'} title={isCurrent ? t('vsc.planning.currentPhase') : undefined} /><span>{name === '' ? t('plan.group') : name}</span></>}
      badge={mode === undefined || mode === '' ? undefined : <Badge label={mode} tone="info" />}
      subtitle={scope === undefined ? undefined : <SubPhaseScope scope={scope} />}
      actions={<><span class="gw-muted">{t('plan.progress', { done: countDoneTasks(tasks), total: tasks.length })}</span><CommentIcon scope="plan" target={t('plan.subPhaseComment', { id: item.id, name })} /></>}
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
  const files = task.files ?? [];
  const hasDetail = (task.description ?? '') !== '' || files.length > 0;
  return (
    <li id={anchorId} ref={ref} class={`gw-planning-task${isHighlighted ? ' gw-planning-task-highlight' : ''}`}>
      <div class="gw-planning-task-header">
        <button type="button" class="gw-planning-task-toggle" aria-expanded={isExpanded} title={t('vsc.planning.expandTask')} disabled={!hasDetail} onClick={() => setExpanded(!isExpanded)}>
          <StatusDot status={task.status ?? 'pending'} />
          <span class="gw-planning-task-title">{task.title}</span>
        </button>
        {task.agent !== undefined && task.agent !== '' && <Badge label={task.agent} tone="info" />}
        {task.group !== undefined && task.group !== '' && <Badge label={task.group} tone="neutral" icon="git-merge" title={t('plan.group')} />}
        <CommentIcon scope="plan" target={`Task: ${task.title}`} />
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
