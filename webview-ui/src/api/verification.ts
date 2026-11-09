import { apiDelete, apiGet, apiPost, apiPut, ws } from './request';

export interface VerificationStep {
  readonly id: number;
  readonly name: string;
  readonly command: string;
  readonly enabled: number;
  readonly fail_severity: string;
}

export interface VerificationProfile {
  readonly id: number;
  readonly name: string;
  readonly language: string;
  readonly steps: readonly VerificationStep[];
}

export interface AssignedProfile extends VerificationProfile {
  readonly assignment_id: number;
  readonly subpath: string;
}

export interface VerificationStepResult {
  readonly id: number;
  readonly profile_name: string;
  readonly step_name: string;
  readonly status: string;
  readonly output: string | null;
  readonly duration_ms: number | null;
}

export interface VerificationRun {
  readonly id: number;
  readonly phase: string;
  readonly status: string;
  readonly started_at: string;
  readonly completed_at: string | null;
  readonly steps: readonly VerificationStepResult[];
}

export interface VerificationMessage {
  readonly message: string;
}

export type VerificationResults = VerificationRun | VerificationMessage;

export interface VerificationResultsQuery {
  readonly phase?: string;
  readonly run_id?: number;
}

export function isVerificationRun(results: VerificationResults): results is VerificationRun {
  return 'steps' in results;
}

export function getVerificationResults(q?: VerificationResultsQuery): Promise<VerificationResults> {
  return apiGet<VerificationResults>(ws('verification/results'), { phase: q?.phase, run_id: q?.run_id });
}

export function runVerification(phase?: string): Promise<VerificationResults> {
  return apiPost<VerificationResults>(ws('verification/run'), phase === undefined ? {} : { phase });
}

export async function listAllProfiles(): Promise<VerificationProfile[]> {
  return (await apiGet<{ profiles: VerificationProfile[] }>('/api/verification/profiles')).profiles;
}

export async function listWorkspaceProfiles(): Promise<AssignedProfile[]> {
  return (await apiGet<{ profiles: AssignedProfile[] }>(ws('verification/profiles'))).profiles;
}

export function assignProfile(profileId: number, subpath = '.'): Promise<unknown> {
  return apiPost(ws('verification/assign'), { profile_id: profileId, subpath });
}

export function unassignProfile(assignmentId: number): Promise<unknown> {
  return apiDelete(ws(`verification/unassign/${assignmentId}`));
}

export function setStepEnabled(stepId: number, enabled: boolean): Promise<unknown> {
  return apiPut(`/api/verification/steps/${stepId}`, { enabled });
}
