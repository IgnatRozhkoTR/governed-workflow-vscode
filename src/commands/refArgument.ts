import type { WorkspaceRef } from '../api/types';

export type RefArgument = WorkspaceRef | { readonly ref: WorkspaceRef } | undefined;

export function unwrapRef(arg: RefArgument): WorkspaceRef | undefined {
  if (arg === undefined) {
    return undefined;
  }
  return 'ref' in arg ? arg.ref : arg;
}
