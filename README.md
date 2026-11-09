# Governed Workflow for VS Code

A VS Code client for [Governed Workflow](https://github.com/IgnatRozhkoTR/governed-workflow). It is a second UI next to the web admin panel: the same projects, workspaces and approval gates, shown inside the editor. It holds no workflow logic of its own. Every action goes through the admin panel's HTTP and WebSocket API.

## What it does

- Browse projects and workspaces, and follow a workspace's phase, plan, progress, research, criteria and scratchpads.
- Approve or reject the current user gate, with an optional commit message at the code review gate.
- Review the branch diff in VS Code's native diff editor and leave review comments on code lines.
- Create projects and workspaces.
- Run the workspace's Claude Code session in a full-size editor terminal.

Editing remote files and publishing to the marketplace are out of scope for v1.

## Deployment setups

**Same machine, or Remote-SSH.** The workspace's working directory exists on the machine running VS Code. The extension opens local files directly, so the editor, language servers and git work as usual.

**Panel on another machine.** The admin panel runs on a different LAN host and the code is not on this machine. The extension reads files through the panel: a `gw-file` virtual file system for the working tree and a `gw-base` virtual document for the base branch. These views are read-only.

The extension prefers the workspace side (`extensionKind: workspace, ui`). Under Remote-SSH it runs on the remote host, next to the worktrees, and falls back to the UI side when there is no remote.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `governedWorkflow.serverUrl` | `http://localhost:5111` | Base URL of the admin panel. |
| `governedWorkflow.pollIntervalSeconds` | `10` | State polling interval while the window is focused. Minimum 3. |
| `governedWorkflow.terminal.maximize` | `true` | Maximize the editor area when the Claude terminal opens. |

## Token setup

The panel requires an admin bearer token. Generate one on the panel's host:

```bash
python3 admin-panel/backend/app.py auth-token
```

Then run **Governed Workflow: Set Admin Token** in VS Code and paste the token. It is stored in VS Code's secret storage, not in settings.

## Commands

All commands are in the `Governed Workflow` category: set token, refresh, select workspace, open worktree, create project, create workspace, edit ticket context, open changes, open file diff, resume Claude, start Claude, approve gate, reject gate, and the review comment actions (create, reply, resolve, unresolve).

## Build

```bash
npm install
npm run build        # bundle to dist/extension.js
npm run typecheck
npm test
npm run package      # produce a .vsix
```

The bundle is produced with esbuild. `vscode` is external and provided by the host.

## License

Apache License 2.0. See `LICENSE`.
