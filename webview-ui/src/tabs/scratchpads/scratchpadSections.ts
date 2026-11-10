import type { Scratchpad } from '@api-types';

export const ROOT_REPO = '';

export interface ScratchpadSection {
  readonly repo: string;
  readonly label: string;
  readonly files: readonly Scratchpad[];
}

export interface ScratchpadSelection {
  readonly repo: string;
  readonly name: string;
}

export function isSameSelection(left: ScratchpadSelection, right: ScratchpadSelection): boolean {
  return left.repo === right.repo && left.name === right.name;
}

export function resolveSelection(sections: readonly ScratchpadSection[], stored: ScratchpadSelection): ScratchpadSelection | undefined {
  const isStoredPresent = sections.some((section) => section.repo === stored.repo && section.files.some((file) => file.name === stored.name));
  return isStoredPresent ? stored : mostRecentFileWithBody(sections);
}

const UTF8 = new TextEncoder();
const HEADING_LINE_OVERHEAD_BYTES = '# \n'.length;

// The list only carries the title and byte size, so a pad whose size does not exceed its own "# Title" line holds nothing worth opening by default.
export function hasBody(file: Scratchpad): boolean {
  return file.size > UTF8.encode(file.title).length + HEADING_LINE_OVERHEAD_BYTES;
}

function mostRecentFileWithBody(sections: readonly ScratchpadSection[]): ScratchpadSelection | undefined {
  let latest: (ScratchpadSelection & { readonly updatedAt: string }) | undefined;
  for (const section of sections) {
    for (const file of section.files.filter(hasBody)) {
      if (latest === undefined || file.updated_at > latest.updatedAt) {
        latest = { repo: section.repo, name: file.name, updatedAt: file.updated_at };
      }
    }
  }
  return latest === undefined ? undefined : { repo: latest.repo, name: latest.name };
}

export function hasNoFiles(sections: readonly ScratchpadSection[]): boolean {
  return sections.every((section) => section.files.length === 0);
}

export function findFile(sections: readonly ScratchpadSection[], selection: ScratchpadSelection): Scratchpad | undefined {
  return sections.find((section) => section.repo === selection.repo)?.files.find((file) => file.name === selection.name);
}
