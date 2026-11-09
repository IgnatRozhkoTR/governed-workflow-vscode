import type { ContextUpdate, ProjectSettings, ReviewMode, WorkspaceContext } from '@api-types';
import { apiDelete, apiGet, apiPost, apiPut, project, ws } from './request';

export type { ProjectSettings };

export type ProjectSettingsPatch = Partial<Pick<ProjectSettings, 'fast_mode_default' | 'yolo_mode_default' | 'review_mode_default'>>;
export type AdvanceModes = Record<string, string>;
export type PhaseSettingsMap = Record<string, boolean>;

export interface ConfiguratorWarning {
  readonly target: string;
  readonly action: string;
  readonly reason: string | null;
}

export interface PhaseSettingsResponse {
  readonly settings: PhaseSettingsMap;
  readonly configurator_warnings?: readonly ConfiguratorWarning[];
}

export interface RuleSummary {
  readonly name: string;
  readonly description: string;
  readonly paths: readonly string[];
  readonly source: 'default' | 'user' | string;
  readonly error?: string;
}

export interface Rule {
  readonly name: string;
  readonly description: string;
  readonly paths: readonly string[];
  readonly body: string;
}

export type RuleDraft = Rule;
export type RulePatch = Partial<Omit<Rule, 'name'>>;

export interface CommandConfig {
  readonly claude_command: string;
  readonly skip_permissions: boolean;
  readonly restrict_to_workspace: boolean;
  readonly allowed_external_paths: string;
  readonly env_vars: string;
}

export type CommandConfigPatch = Partial<CommandConfig>;

export interface NetworkModeInfo {
  readonly bind_host: string;
  readonly network_enabled: boolean;
  readonly lan_ips: readonly string[];
}

export interface ModuleInfo {
  readonly id: string;
  readonly name: string;
  readonly description: string;
}

export interface ModulesSaveResult {
  readonly status: string;
  readonly configurator_warnings?: readonly ConfiguratorWarning[];
}

export function putContext(update: ContextUpdate): Promise<unknown> {
  return apiPut(ws('context'), update);
}

export async function searchPaths(query: string): Promise<readonly string[]> {
  const response = await apiGet<{ results: string[] }>(ws('search-paths'), { q: query });
  return response.results;
}

export function setWorkflowMode(mode: string): Promise<unknown> {
  return apiPut(ws('workflow-mode'), { mode });
}

export function setReviewMode(mode: ReviewMode | string): Promise<unknown> {
  return apiPut(ws('review-mode'), { mode });
}

export function getProjectSettings(): Promise<ProjectSettings> {
  return apiGet<ProjectSettings>(project('settings'));
}

export function putProjectSettings(patch: ProjectSettingsPatch): Promise<unknown> {
  return apiPut(project('settings'), patch);
}

export function getAdvanceModes(): Promise<AdvanceModes> {
  return apiGet<AdvanceModes>(project('advance-modes'));
}

export function putAdvanceModes(modes: AdvanceModes): Promise<AdvanceModes> {
  return apiPut<AdvanceModes>(project('advance-modes'), { modes });
}

export function getDevicePhaseSettings(): Promise<PhaseSettingsResponse> {
  return apiGet<PhaseSettingsResponse>('/api/phase-settings/device');
}

export function putDevicePhaseSettings(settings: PhaseSettingsMap): Promise<PhaseSettingsResponse> {
  return apiPut<PhaseSettingsResponse>('/api/phase-settings/device', { settings });
}

export function getProjectPhaseSettings(): Promise<PhaseSettingsResponse> {
  return apiGet<PhaseSettingsResponse>(project('phase-settings'));
}

export function putProjectPhaseSettings(settings: PhaseSettingsMap): Promise<PhaseSettingsResponse> {
  return apiPut<PhaseSettingsResponse>(project('phase-settings'), { settings });
}

export function listRules(): Promise<RuleSummary[]> {
  return apiGet<RuleSummary[]>(project('rules'));
}

export function getRule(name: string): Promise<Rule> {
  return apiGet<Rule>(project(`rules/${encodeURIComponent(name)}`));
}

export function createRule(rule: RuleDraft): Promise<Rule> {
  return apiPost<Rule>(project('rules'), rule);
}

export function updateRule(name: string, patch: RulePatch): Promise<Rule> {
  return apiPut<Rule>(project(`rules/${encodeURIComponent(name)}`), patch);
}

export function deleteRule(name: string): Promise<unknown> {
  return apiDelete(project(`rules/${encodeURIComponent(name)}`));
}

export function getCommandConfig(): Promise<CommandConfig> {
  return apiGet<CommandConfig>(ws('command'));
}

export function putCommandConfig(patch: CommandConfigPatch): Promise<unknown> {
  return apiPut(ws('command'), patch);
}

export function getNetworkMode(): Promise<NetworkModeInfo> {
  return apiGet<NetworkModeInfo>('/api/network-mode');
}

export function setNetworkMode(enabled: boolean): Promise<unknown> {
  return apiPut('/api/network-mode', { enabled });
}

export function restartServer(): Promise<unknown> {
  return apiPost('/api/restart');
}

export async function listModules(): Promise<readonly ModuleInfo[]> {
  const response = await apiGet<{ modules: ModuleInfo[] }>('/api/modules');
  return response.modules;
}

export async function getEnabledModules(): Promise<readonly string[]> {
  const response = await apiGet<{ modules: string[] }>('/api/modules/enabled');
  return response.modules;
}

export function setEnabledModules(modules: readonly string[]): Promise<ModulesSaveResult> {
  return apiPost<ModulesSaveResult>('/api/modules/enabled', { modules });
}
