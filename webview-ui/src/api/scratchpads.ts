import type { Scratchpad, ScratchpadContent } from '@api-types';
import { apiGet, apiPut, ws } from './request';

export interface ScratchpadSaveResult {
  readonly name: string;
  readonly title: string;
  readonly updated_at: string;
}

export function listScratchpads(repo?: string): Promise<{ files: Scratchpad[] }> {
  return apiGet<{ files: Scratchpad[] }>(ws('scratchpads'), { repo });
}

export function readScratchpad(name: string, repo?: string): Promise<ScratchpadContent> {
  return apiGet<ScratchpadContent>(ws('scratchpads/content'), { name, repo });
}

export function writeScratchpad(name: string, content: string, repo?: string): Promise<ScratchpadSaveResult> {
  return apiPut<ScratchpadSaveResult>(ws('scratchpads/content'), { content }, { name, repo });
}
