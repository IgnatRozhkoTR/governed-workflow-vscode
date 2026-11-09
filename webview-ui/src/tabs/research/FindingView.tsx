import type { JSX } from 'preact';
import { Commentable } from '../../components/Commentable';
import { findingCommentTarget, type Finding } from './findings';
import { ProofView } from './ProofView';

export function FindingView({ finding }: { readonly finding: Finding }): JSX.Element {
  return (
    <Commentable scope="research" target={findingCommentTarget(finding.summary)}>
      <div class="gw-research-finding">
        {finding.summary !== '' && <div class="gw-research-claim">{finding.summary}</div>}
        <ProofView proof={finding.proof} />
        {finding.details !== '' && <div class="gw-research-details">{finding.details}</div>}
      </div>
    </Commentable>
  );
}
