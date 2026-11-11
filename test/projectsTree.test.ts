import { describe, expect, it, vi } from 'vitest';
import type { ApiClient } from '../src/api/client';
import type { Project, WorkspaceSummary } from '../src/api/types';
import { ProjectItem, ProjectsTreeProvider, WorkspaceItem } from '../src/views/projectsTree';
import { TreeItemCollapsibleState } from './vscodeStub';

const SHOP: Project = { id: 'shop', name: 'Shop', path: '/p/shop', registered: '', project_type: 'git' } as Project;
const BLOG: Project = { id: 'blog', name: 'Blog', path: '/p/blog', registered: '', project_type: 'git' } as Project;

function providerFor() {
  const client = {
    listProjects: vi.fn(async () => [SHOP, BLOG]),
    listWorkspaces: vi.fn(async () => [{ branch: 'feature/a', status: 'active', phase: '1.0' } as WorkspaceSummary]),
  };
  return { client, provider: new ProjectsTreeProvider(client as unknown as ApiClient) };
}

describe('ProjectsTreeProvider', () => {
  it('getChildren_shouldReturnCollapsedProjectsWithStableIds_whenRootIsRequested', async () => {
    const { provider } = providerFor();

    const roots = await provider.getChildren();

    expect(roots.map((item) => item.collapsibleState)).toEqual([TreeItemCollapsibleState.Collapsed, TreeItemCollapsibleState.Collapsed]);
    expect(roots.map((item) => item.id)).toEqual(['project:shop', 'project:blog']);
  });

  it('getChildren_shouldNotFetchWorkspaces_whenOnlyRootIsRequested', async () => {
    const { client, provider } = providerFor();

    await provider.getChildren();

    expect(client.listWorkspaces).not.toHaveBeenCalled();
  });

  it('getChildren_shouldFetchOnlyTheExpandedProjectsWorkspaces_whenProjectIsExpanded', async () => {
    const { client, provider } = providerFor();

    const children = await provider.getChildren(new ProjectItem(SHOP));

    expect(client.listWorkspaces).toHaveBeenCalledTimes(1);
    expect(client.listWorkspaces).toHaveBeenCalledWith('shop');
    expect(children[0]).toBeInstanceOf(WorkspaceItem);
  });

  it('refresh_shouldNotFetchAnything_whenCalled', () => {
    const { client, provider } = providerFor();

    provider.refresh();

    expect(client.listProjects).not.toHaveBeenCalled();
    expect(client.listWorkspaces).not.toHaveBeenCalled();
  });
});
