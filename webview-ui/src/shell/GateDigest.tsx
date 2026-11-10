import { PLAN_APPROVAL_NAV, REVIEW_BLOCKING_NAV, blockingThreadCount, isCodeReviewGate, type NavTarget } from '@shared/navigation';
import type { ComponentChildren, FunctionComponent, JSX, RefObject } from 'preact';
import { useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getReviewPipelineSummary, type ReviewPipelineSummary } from '../api/phaseControl';
import { listCriteria } from '../api/planning';
import { Icon, Popover, type DialogNotice } from '../components';
import { pluralKey } from '../components/plural';
import { classNames } from '../components/types';
import { useT } from '../i18n/i18n';
import { RpcError } from '../rpc/rpcClient';
import { useResource, useStore, useWorkspaceState, type Resource } from '../store/hooks';
import { countFailedDiagrams } from '../tabs/planning/diagramCheck';
import { mergeScopes } from '../tabs/planning/scopeModel';
import { normalizeSystemDiagrams } from '../tabs/planning/systemDiagram';
import { countOpenDiscussions, provenDiscussionIds } from '../tabs/preplanning/discussionLogic';
import { impactSections } from '../tabs/preplanning/impact';
import { flashNavTarget } from './attentionFlash';
import { resolvedBlockingCount } from '../tabs/review/reviewBlocking';
import { useBranchCommitCount, useBranchFiles, useFindingsTally, useVerificationRunStatus } from './branchFacts';
import {
  THREADS_ITEM_ID, VERIFICATION_ITEM_ID, committedFileCount, criteriaCounts, planShape, planWarnings, preplanningWarnings, presentFindings, researchCounts, resourceValue,
  reviewThreadFindings, splitDigestRow, uncommittedFileNotes, verificationWarnings, withWarnings, type BranchFiles, type CriteriaCounts, type DigestItem, type FindingsTally,
  type GateWarning,
} from './gateDigestModel';
import { columnGap, digestLayout, hiddenDigestItems, observeContentResize, observeResize, renderedWidth, type DigestLayout, type DigestLayoutInput } from './layout';
import { useTabTitle } from './tabTitles';
import { useRememberedNavigate } from './useRememberedNavigate';

const PREPLANNING_GATE_PHASE = '1.4';
const PLAN_PHASES: ReadonlySet<string> = new Set(['2.0', '2.1']);
const FINAL_APPROVAL_GATE_PHASE = '4.2';
const NOT_FOUND_STATUS = 404;
const WARNING_ICON = 'warning';
const DIGEST_DETAILS_ID = 'gw-gate-digest-details';

type Translate = ReturnType<typeof useT>;

interface PipelineSummaryView {
  readonly summary?: ReviewPipelineSummary;
}

// What the decision bar knows about the gate: the chips to show, the points worth checking before Approve, what
// the server will refuse the approval on, and what the approval itself will do that the Approve dialog should state.
export interface GateDigestData {
  readonly items: readonly DigestItem[];
  readonly warnings: readonly GateWarning[];
  readonly blockers: readonly GateWarning[];
  readonly approvalNotes?: readonly GateWarning[];
}

interface DigestSourceProps {
  readonly children: (digest: GateDigestData) => JSX.Element;
}

const NO_DIGEST: GateDigestData = { items: [], warnings: [], blockers: [] };

function digestSourceFor(phase: string): FunctionComponent<DigestSourceProps> | undefined {
  if (phase === PREPLANNING_GATE_PHASE) {
    return PreplanningDigest;
  }
  if (PLAN_PHASES.has(phase)) {
    return PlanDigest;
  }
  if (isCodeReviewGate(phase)) {
    return CodeReviewDigest;
  }
  return phase === FINAL_APPROVAL_GATE_PHASE ? FinalApprovalDigest : undefined;
}

// Loads what the user is about to approve and hands it to the bar, which shows it as chips and in the Approve dialog.
export function GateDigestSource({ phase, children }: DigestSourceProps & { readonly phase: string }): JSX.Element {
  const Source = digestSourceFor(phase);
  return Source === undefined ? children(NO_DIGEST) : <Source>{children}</Source>;
}

function PlanDigest({ children }: DigestSourceProps): JSX.Element {
  const t = useT();
  const { plan } = useWorkspaceState();
  const { criteria, warnings } = usePlanReview();
  const shape = planShape(plan);
  const diagrams = useMemo(() => normalizeSystemDiagrams(plan.systemDiagram).entries.length, [plan.systemDiagram]);
  const items: DigestItem[] = [
    { id: 'plan', icon: 'checklist', chip: t('vsc.digest.planChip', { ...shape }), detail: t('vsc.digest.planDetail', { ...shape }), nav: PLAN_APPROVAL_NAV },
    criteriaItem(t, criteria),
    { id: 'diagrams', icon: 'type-hierarchy', chip: t('vsc.digest.diagramsChip', { count: diagrams }), detail: t('vsc.digest.diagramsDetail', { count: diagrams }), nav: { tab: 'planning', anchor: 'plan-architecture' } },
  ];
  return children({ items, warnings, blockers: [] });
}

export interface PlanReview {
  readonly criteria: Resource<CriteriaCounts>;
  readonly warnings: readonly GateWarning[];
  // Every count has loaded or failed, so the warnings are final.
  readonly isSettled: boolean;
}

function isSettled(resource: Resource<unknown>): boolean {
  return !resource.loading && (resource.data !== undefined || resource.error !== undefined);
}

// What is worth checking before the plan is approved, shared by the bar and every other way of approving the plan.
export function usePlanReview(isActive = true): PlanReview {
  const { plan, scope } = useWorkspaceState();
  const criteria = useResource('criteria', 'digest', async () => criteriaCounts((await listCriteria()).criteria), { active: isActive });
  const failedDiagrams = useResource('context', 'digest.diagrams', () => countFailedDiagrams(plan.systemDiagram), { active: isActive });
  const merged = mergeScopes(scope);
  const warnings = planWarnings({ criteria: criteria.data, failedDiagrams: failedDiagrams.data, isScopeEmpty: merged.must.length + merged.may.length === 0 });
  return { criteria, warnings, isSettled: isSettled(criteria) && isSettled(failedDiagrams) };
}

// The Approve dialog lists the same warnings as the digest, each opening the material it is about.
export function useWarningNotices(): (warnings: readonly GateWarning[]) => readonly DialogNotice[] {
  const t = useT();
  const jump = useDigestJump();
  return (warnings) => warnings.map((warning) => ({ text: warningText(t, warning), onOpen: () => jump(warning.nav) }));
}

// A digest link to a spot inside a tab lands there on every click, once whatever it opens has finished drawing.
function useDigestJump(): (nav: NavTarget) => void {
  const navigate = useRememberedNavigate();
  return (nav) => {
    navigate(nav);
    if (nav.anchor !== undefined) {
      flashNavTarget(nav);
    }
  };
}

// Approving the plan accepts every proposed criterion, so pending ones are stated as what the approval will do.
function criteriaItem(t: Translate, criteria: Resource<CriteriaCounts>): DigestItem {
  const total = resourceValue(criteria, (counts) => counts.total);
  const accepted = resourceValue(criteria, (counts) => counts.accepted);
  const pending = resourceValue(criteria, (counts) => counts.pending);
  const toAccept = criteria.data?.pending ?? 0;
  return {
    id: 'criteria',
    icon: 'tasklist',
    chip: toAccept > 0 ? t(pluralKey('vsc.digest.criteriaToAccept', toAccept), { count: toAccept }) : t('vsc.digest.criteriaChip', { total }),
    detail: t('vsc.digest.criteriaDetail', { total, accepted, pending }),
    nav: { tab: 'planning', anchor: 'plan-criteria' },
  };
}

// Approving a code review commits the working tree, so the dialog lists the uncommitted files that go in with it and a
// verification that never ran or failed.
function CodeReviewDigest({ children }: DigestSourceProps): JSX.Element {
  const t = useT();
  const files = useBranchFiles();
  const verification = useVerificationRunStatus();
  const status = resourceValue(verification, (value) => value.label);
  const findings = useReviewThreadFindings();
  const items: DigestItem[] = [
    filesItem(t, files),
    useThreadsItem(),
    { id: VERIFICATION_ITEM_ID, icon: 'beaker', chip: t('vsc.digest.verificationChip', { status }), detail: t('vsc.digest.verificationDetail', { status }), nav: { tab: 'phase', anchor: 'verification-results' } },
  ];
  const verificationChecks = verification.data === undefined ? [] : verificationWarnings(verification.data.runStatus, verification.data.label);
  return children({ items, warnings: [...findings.warnings, ...verificationChecks], blockers: findings.blockers, approvalNotes: uncommittedFileNotes(files.data) });
}

// Split like Code Changes ("0 in branch · 2 uncommitted"), so the two never read as contradicting each other.
function filesItem(t: Translate, files: Resource<BranchFiles>): DigestItem {
  const base = { id: 'files', icon: 'diff', nav: { tab: 'changes' } } as const;
  const total = resourceValue(files, (value) => value.total);
  const uncommitted = files.data?.uncommitted ?? 0;
  if (files.data === undefined || uncommitted === 0) {
    return { ...base, chip: t('vsc.digest.filesChip', { count: total }), detail: t('vsc.digest.filesDetail', { count: total }) };
  }
  const split = { count: total, committed: committedFileCount(files.data), uncommitted };
  return { ...base, chip: t('vsc.digest.filesSplitChip', split), detail: t('vsc.digest.filesSplitDetail', split) };
}

// Finishing the ticket approves the whole branch: what was committed, how much it touches, what still blocks, what review found.
function FinalApprovalDigest({ children }: DigestSourceProps): JSX.Element {
  const t = useT();
  const workspaceId = useWorkspaceState().workspace_id;
  const pipeline = useResource('reviewPipeline', `digest.summary:${workspaceId}`, () => loadPipelineSummary(workspaceId));
  const commitCount = resourceValue(useBranchCommitCount(), (count) => count);
  const files = useBranchFiles();
  const threads = useThreadsItem();
  const findings = findingsItem(t, useFindingsTally());
  const items: DigestItem[] = [
    { id: 'commits', icon: 'git-commit', chip: t('vsc.digest.commitsChip', { count: commitCount }), detail: t('vsc.digest.commitsDetail', { count: commitCount }), nav: { tab: 'changes' } },
    filesItem(t, files),
    threads,
    findings,
    pipelineItem(t, pipeline),
  ];
  return children({ items, ...useReviewThreadFindings() });
}

// "5 fixed · 2 false positive": only the resolutions that occur, in the server's own words.
export function findingsSummary(t: Translate, tally: FindingsTally): string {
  const parts = presentFindings(tally).map((resolution) => t('vsc.digest.findingsPart', { count: tally[resolution], resolution: t(resolutionLabelKey(resolution)) }));
  return parts.length === 0 ? t('vsc.digest.findingsNone') : parts.join(' · ');
}

// The web has no label for an unresolved finding, so "open" is this extension's own word.
function resolutionLabelKey(resolution: string): string {
  return resolution === 'open' ? 'vsc.digest.findingOpen' : `review.resolution.${resolution}`;
}

function findingsItem(t: Translate, tally: FindingsTally): DigestItem {
  const summary = findingsSummary(t, tally);
  return { id: 'findings', icon: 'checklist', chip: t('vsc.digest.findingsChip', { summary }), detail: t('vsc.digest.findingsDetail', { summary }), nav: { tab: 'review' } };
}

function PreplanningDigest({ children }: DigestSourceProps): JSX.Element {
  const t = useT();
  const state = useWorkspaceState();
  const research = researchCounts(state.research);
  const discussions = countOpenDiscussions(state.discussions, provenDiscussionIds(state.research));
  const impact = impactSections(state.impact_analysis).length;
  const items: DigestItem[] = [
    { id: 'research', icon: 'search', chip: t('vsc.digest.researchChip', { ...research }), detail: t('vsc.digest.researchDetail', { ...research }), nav: { tab: 'preplanning', anchor: 'preplanning-research' } },
    { id: 'discussions', icon: 'comment-discussion', chip: t('vsc.attention.openDiscussions', { count: discussions }), detail: t('vsc.attention.openDiscussions', { count: discussions }), nav: { tab: 'preplanning', anchor: 'preplanning-discussions' } },
    { id: 'impact', icon: 'pulse', chip: t('vsc.digest.impactChip', { count: impact }), detail: t('vsc.digest.impactDetail', { count: impact }), nav: { tab: 'preplanning', anchor: 'preplanning-impact' } },
  ];
  return children({ items, warnings: preplanningWarnings(research, discussions), blockers: [] });
}

export function useBlockingThreadCount(): number {
  return useStore((s) => (s.state === null ? 0 : blockingThreadCount(s.state.comments)));
}

export function useResolvedBlockingCount(): number {
  return useStore((s) => (s.state === null ? 0 : resolvedBlockingCount(s.state)));
}

function useReviewThreadFindings(): Pick<GateDigestData, 'warnings' | 'blockers'> {
  const isYolo = useWorkspaceState().yolo_mode;
  return reviewThreadFindings(useBlockingThreadCount(), useResolvedBlockingCount(), isYolo);
}

// Threads count by the server's approval rule (the Review tab's own helper), so the chip matches what blocks approval.
// With none blocking, the Review tab has nothing to show for this decision, so the chip only states the count.
function useThreadsItem(): DigestItem {
  const t = useT();
  const count = useBlockingThreadCount();
  const item = { id: THREADS_ITEM_ID, icon: 'comment-discussion', chip: t('vsc.digest.threadsChip', { count }), detail: t('vsc.digest.threadsDetail', { count }) };
  return count > 0 ? { ...item, nav: REVIEW_BLOCKING_NAV } : item;
}

function pipelineItem(t: Translate, pipeline: Resource<PipelineSummaryView>): DigestItem {
  const base = { id: 'pipeline', icon: 'checklist', nav: { tab: 'phase', anchor: 'review-pipeline' } } as const;
  const summary = pipeline.data?.summary;
  if (pipeline.data !== undefined && summary === undefined) {
    return { ...base, chip: t('vsc.digest.pipelineNotRun'), detail: t('vsc.digest.pipelineNotRun') };
  }
  const count = resourceValue(pipeline, (view) => view.summary?.files_with_findings ?? 0);
  const chip = t(pluralKey('vsc.digest.pipelineChip', summary?.files_with_findings ?? 0), { count });
  const detail = summary === undefined
    ? chip
    : t('vsc.digest.pipelineDetail', { state: summary.state, withFindings: summary.files_with_findings, clean: summary.files_clean, failed: summary.files_failed });
  return { ...base, chip, detail };
}

// A workspace that never ran the review pipeline has no summary (404); that is a neutral state to show, not an error.
// The web offers no run at the final gate, so the chip only leads to the pipeline card on Phase Control.
async function loadPipelineSummary(workspaceId: number): Promise<PipelineSummaryView> {
  try {
    return { summary: await getReviewPipelineSummary(workspaceId) };
  } catch (error) {
    if (error instanceof RpcError && error.status === NOT_FOUND_STATUS) {
      return {};
    }
    throw error;
  }
}

function useDigestWorkspaceKey(): string {
  const workspace = useStore((s) => s.workspace);
  return workspace === null ? 'decision.digest' : `decision.digest:${workspace.projectId}/${workspace.branch}`;
}

export interface DigestViewProps {
  readonly digest: GateDigestData;
  readonly title?: ComponentChildren;
  readonly actions?: ComponentChildren;
}

// The bar's rows: the title, the chips that fit and the actions on the first; a second row only when warnings need it.
export function DigestView({ digest, title, actions }: DigestViewProps): JSX.Element {
  const t = useT();
  const workspaceKey = useDigestWorkspaceKey();
  if (digest.items.length === 0) {
    return <div class="gw-decision-bar-row">{title}{actions}</div>;
  }
  const warningItems = [...digest.blockers, ...digest.warnings].map((warning): DigestItem => {
    const text = warningText(t, warning);
    return { id: warning.id, icon: WARNING_ICON, chip: text, detail: text, nav: warning.nav, isWarning: true };
  });
  return <DigestBody key={workspaceKey} items={withWarnings(digest.items, warningItems)} title={title} actions={actions} />;
}

interface DigestBodyProps {
  readonly items: readonly DigestItem[];
  readonly title: ComponentChildren;
  readonly actions: ComponentChildren;
}

// Chips are placed whole, warnings first, from their measured natural widths; a chip that does not fit is counted
// behind "+N more" rather than squeezed. "+N more" opens a floating list of just those hidden chips, which closes on
// a pick, an outside click or Escape, so it never stays pinned over the content.
function DigestBody({ items, title, actions }: DigestBodyProps): JSX.Element {
  const [isExpanded, setExpanded] = useState(false);
  const [toggleElement, setToggleElement] = useState<HTMLButtonElement | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLSpanElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const { warnings, counts } = splitDigestRow(items);
  const ordered = [...warnings, ...counts];
  const layout = useDigestLayout({ rowRef, slotRef, measureRef }, warnings.length);
  const firstRow = ordered.slice(0, layout.firstRow);
  const secondRow = ordered.slice(firstRow.length, firstRow.length + layout.secondRow);
  const hidden = hiddenDigestItems(ordered, layout);
  const toggle = <DigestToggle buttonRef={setToggleElement} hiddenCount={hidden.length} isMoreShort={layout.isMoreShort} isExpanded={isExpanded} onToggle={() => setExpanded(!isExpanded)} />;
  return (
    <>
      <div ref={rowRef} class="gw-decision-bar-row">
        {title}
        <span ref={slotRef} class="gw-gate-digest-slot">
          <DigestChips items={firstRow} />
          {!layout.hasSecondRow && toggle}
        </span>
        {actions}
      </div>
      {layout.hasSecondRow && (
        <div class="gw-decision-bar-row gw-gate-digest-second-row">
          <span class={classNames('gw-gate-digest-second-chips', layout.isSecondRowWrapped && 'gw-gate-digest-second-chips-wrapped')}><DigestChips items={secondRow} /></span>
          {toggle}
        </div>
      )}
      <Popover open={isExpanded && hidden.length > 0} anchor={toggleElement} onClose={() => setExpanded(false)}>
        <ul id={DIGEST_DETAILS_ID} class="gw-gate-digest-details" onClick={() => setExpanded(false)}>
          {hidden.map((item) => <li key={item.id}><DigestEntry item={item} text={item.detail} className="gw-link gw-gate-digest-line" /></li>)}
        </ul>
      </Popover>
      <DigestMeasure measureRef={measureRef} items={ordered} />
    </>
  );
}

interface DigestLayoutRefs {
  readonly rowRef: RefObject<HTMLElement>;
  readonly slotRef: RefObject<HTMLElement>;
  readonly measureRef: RefObject<HTMLElement>;
}

const TOGGLE_SAMPLES = 3;
const EVERY_CHIP_ON_FIRST_ROW: DigestLayout = { firstRow: Number.POSITIVE_INFINITY, secondRow: 0, hasSecondRow: false, isMoreShort: false, isSecondRowWrapped: false };

function isSameLayout(left: DigestLayout, right: DigestLayout): boolean {
  return left.firstRow === right.firstRow && left.secondRow === right.secondRow && left.hasSecondRow === right.hasSecondRow
    && left.isMoreShort === right.isMoreShort && left.isSecondRowWrapped === right.isSecondRowWrapped;
}

// Re-placed whenever the row, the room beside the actions, or any chip's natural width changes.
function useDigestLayout({ rowRef, slotRef, measureRef }: DigestLayoutRefs, warningCount: number): DigestLayout {
  const [layout, setLayout] = useState(EVERY_CHIP_ON_FIRST_ROW);
  useLayoutEffect(() => {
    const [row, slot, measure] = [rowRef.current, slotRef.current, measureRef.current];
    if (row === null || slot === null || measure === null) {
      return undefined;
    }
    const place = (): void => {
      const next = digestLayout(measuredDigestWidths(row, slot, measure, warningCount));
      setLayout((current) => (isSameLayout(current, next) ? current : next));
    };
    place();
    const stops = [observeResize(row, place), observeResize(slot, place), observeContentResize(measure, place)];
    return () => stops.forEach((stop) => stop());
  }, [warningCount]);
  return layout;
}

// The measuring copy holds every chip in order, then the expander bare, with "+N more" and with "+N".
function measuredDigestWidths(row: HTMLElement, slot: HTMLElement, measure: HTMLElement, warningCount: number): DigestLayoutInput {
  const widths = Array.from(measure.children).map(renderedWidth);
  const [toggleWidth = 0, moreToggleWidth = 0, shortMoreToggleWidth = 0] = widths.slice(-TOGGLE_SAMPLES);
  const chipWidths = widths.slice(0, -TOGGLE_SAMPLES);
  return {
    firstRowWidth: slot.clientWidth,
    fullRowWidth: row.clientWidth,
    gap: columnGap(slot),
    warningWidths: chipWidths.slice(0, warningCount),
    countWidths: chipWidths.slice(warningCount),
    toggleWidth,
    moreToggleWidth,
    shortMoreToggleWidth,
  };
}

function DigestChips({ items }: { readonly items: readonly DigestItem[] }): JSX.Element {
  return <>{items.map((item) => <DigestEntry key={item.id} item={item} text={item.chip} className="gw-gate-digest-chip" />)}</>;
}

interface DigestToggleProps {
  readonly buttonRef: (element: HTMLButtonElement | null) => void;
  readonly hiddenCount: number;
  readonly isMoreShort: boolean;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
}

// With every chip on show there is nothing more to reveal, so the expander appears only while chips are hidden.
function DigestToggle({ buttonRef, hiddenCount, isMoreShort, isExpanded, onToggle }: DigestToggleProps): JSX.Element | null {
  const t = useT();
  if (hiddenCount === 0) {
    return null;
  }
  const label = isExpanded ? t('vsc.digest.collapse') : t('vsc.digest.expandHidden', { count: hiddenCount });
  return (
    <button ref={buttonRef} type="button" class="gw-gate-digest-toggle" aria-haspopup="dialog" aria-expanded={isExpanded} aria-controls={isExpanded ? DIGEST_DETAILS_ID : undefined} title={label} aria-label={label} onClick={onToggle}>
      <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} />
      <span class="gw-gate-digest-more">{t(isMoreShort ? 'vsc.digest.moreShort' : 'vsc.digest.more', { count: hiddenCount })}</span>
    </button>
  );
}

// An invisible copy at natural width, so every chip can be measured whether or not it is shown.
// The "+N more" and "+N" samples count every chip, the widest they can get.
interface DigestMeasureProps {
  readonly items: readonly DigestItem[];
  readonly measureRef: RefObject<HTMLSpanElement>;
}

function DigestMeasure({ items, measureRef }: DigestMeasureProps): JSX.Element {
  const t = useT();
  return (
    <span ref={measureRef} class="gw-gate-digest-measure" aria-hidden="true">
      {items.map((item) => (
        <span key={item.id} class={classNames('gw-gate-digest-chip', item.isWarning === true && 'gw-gate-digest-warning')}><Icon name={item.icon} /><span>{item.chip}</span></span>
      ))}
      <span class="gw-gate-digest-toggle"><Icon name="chevron-right" /></span>
      <span class="gw-gate-digest-toggle"><Icon name="chevron-right" /><span class="gw-gate-digest-more">{t('vsc.digest.more', { count: items.length })}</span></span>
      <span class="gw-gate-digest-toggle"><Icon name="chevron-right" /><span class="gw-gate-digest-more">{t('vsc.digest.moreShort', { count: items.length })}</span></span>
    </span>
  );
}

// Counted phrases ("1 thread blocks", "8 threads block") take the plural form; label-and-number warnings do not need one.
export function warningText(t: Translate, warning: GateWarning): string {
  const key = warning.hasPluralForms === true ? pluralKey(warning.messageKey, warning.count) : warning.messageKey;
  return t(key, { ...warning.params, count: warning.count });
}

interface DigestEntryProps {
  readonly item: DigestItem;
  readonly text: string;
  readonly className: string;
}

// A chip that opens something says where in its tooltip; one with nothing to open is plain text.
function DigestEntry({ item, text, className }: DigestEntryProps): JSX.Element {
  const t = useT();
  const jump = useDigestJump();
  const tabTitle = useTabTitle();
  const { nav } = item;
  const classes = classNames(className, item.isWarning === true && 'gw-gate-digest-warning');
  const content = <><Icon name={item.icon} /><span>{text}</span></>;
  if (nav === undefined) {
    return <span class={classNames(classes, 'gw-gate-digest-static')} title={item.detail}>{content}</span>;
  }
  const title = `${item.detail}\n${t('vsc.digest.opens', { place: tabTitle(nav.tab) })}`;
  return <button type="button" class={classes} title={title} onClick={() => jump(nav)}>{content}</button>;
}
