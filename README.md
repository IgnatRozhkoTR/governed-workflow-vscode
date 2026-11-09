# Governed Workflow for VS Code

A VS Code client for [Governed Workflow](https://github.com/IgnatRozhkoTR/governed-workflow). It is a second UI next to the web admin panel: the same projects, workspaces and approval gates, shown inside the editor. It holds no workflow logic of its own. Every action goes through the admin panel's HTTP and WebSocket API.

## What it does

- Open any workspace in the **Workspace Control** panel, an editor tab with the same tabs as the web panel: pre-planning, planning, research, phase control, code changes, review, progress, reflection, scratchpads and settings.
- Approve or reject the current user gate and the plan, set the phase, toggle YOLO mode and notify Claude from the panel, the sidebar or the status bar.
- Comment anywhere. Comments on plan items, scope, findings and criteria live in the panel. Code comments sit on lines in the editor and the diff editor, on files and folders from the explorer, and in the Comments view. All of them are the same threads the web panel and the agents see.
- Review the branch diff in VS Code's native diff editor.
- Create projects and workspaces, run project setup, archive workspaces and remove projects.
- Run the workspace's Claude Code session in a full-size editor terminal, attach images to it, and manage the panel's other terminal sessions.

## Workspace Control panel

Selecting a workspace in **Projects** opens the panel and keeps it on that workspace. The **Workspace** view in the sidebar is a launcher into it: each row (phase, gate, plan, discussions, research, review threads, progress, code changes, reflection, scratchpads, settings) shows a short status and opens the panel on that tab. The title bar button opens the panel on its last tab, and the overflow menu holds switch workspace, set phase, YOLO mode and the Claude actions. While a plan waits for approval, approve and reject buttons appear on the view and a "Plan: pending" item appears in the status bar.

The panel follows the VS Code theme and the workspace locale. Its strings come from the admin panel, so the RU translation matches the web. The panel stays alive in the background and survives window reloads.

Native features stay native. Opening a file, a diff, a terminal or the worktree from the panel uses the editor, not a copy of it.

## Comments

- In an editor or a diff, use the `+` in the gutter to comment on a line or a range, or the file comment button for the whole file.
- In the explorer or an editor tab, **Add Workflow Comment** comments on a file or folder.
- The **Comments** view lists every thread in the workspace by area, with a badge for open ones. Filter, reply and resolve from there. Opening a comment jumps to its line, or to its place in the panel.

A comment made in the editor shows up in the panel's Review tab, and the reverse is true too. Both refresh within one state update.

## Deployment setups

**Same machine, or Remote-SSH.** The workspace's working directory exists on the machine running VS Code. The extension opens local files directly, so the editor, language servers and git work as usual. Under Remote-SSH the extension runs on the remote host, next to the worktrees, and talks to the panel from there. Set `governedWorkflow.serverUrl` to the panel's address as seen from the remote host, usually `http://localhost:5111`.

**Panel on another LAN machine.** The admin panel runs on a different host and the code is not on this machine. Point `governedWorkflow.serverUrl` at that host, for example `http://192.168.1.20:5111`, and turn on network access on the panel host (Settings, System, in the web panel or in Workspace Control), then restart the panel so it binds to the LAN. The extension then reads and writes files through the panel: a `gw-file` file system for the working tree and a `gw-base` virtual document for the base branch. Saving a `gw-file` document writes it back to the remote worktree. Only UTF-8 text files can be saved this way.

The extension prefers the workspace side (`extensionKind: workspace, ui`) and falls back to the UI side when there is no remote. The panel's webview never talks to the network itself. Every request goes through the extension host, so the token stays in secret storage and no CORS setup is needed.

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

All commands are in the `Governed Workflow` category. The main ones are open Workspace Control, switch workspace, approve or reject the plan or the gate, set phase, toggle YOLO mode, notify Claude, resume or start Claude, attach an image, terminal sessions, run project setup, and set token. Commands that act on a tree item or a file (remove project, archive workspace, add workflow comment, the comment actions) are in the context menus.

## Build

```bash
npm install
npm run build        # bundle dist/extension.js and the panel into dist/webview/
npm run typecheck
npm test
npm run package      # produce a .vsix
```

Both bundles are produced with esbuild. The extension bundle keeps `vscode` external. The panel is a Preact app in `webview-ui/`, bundled for the browser with mermaid, marked, DOMPurify, highlight.js and the codicons, so it works offline under a strict CSP.

## License

Apache License 2.0. See `LICENSE`.
