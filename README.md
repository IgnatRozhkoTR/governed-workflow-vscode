# Governed Workflow for VS Code

A VS Code client for [Governed Workflow](https://github.com/IgnatRozhkoTR/governed-workflow). It is a second UI next to the web admin panel: the same projects, workspaces and approval gates, shown inside the editor. It holds no workflow logic of its own. Every action goes through the admin panel's HTTP and WebSocket API.

## What it does

- Open any workspace in the **Workspace Control** panel, an editor tab with the same tabs as the web panel: pre-planning, planning, research, phase control, code changes, review, progress, reflection, scratchpads and settings.
- Approve or reject the current user gate and the plan, set the phase, toggle YOLO mode and notify Claude from the panel, the sidebar or the status bar.
- Comment anywhere. Comments on plan items, scope, findings and criteria live in the panel. Code comments sit on lines in the editor and the diff editor, on files and folders from the explorer, and in the Comments view. All of them are the same threads the web panel and the agents see.
- Review the branch diff in VS Code's native diff editor, from the **Changes** view in the sidebar or the panel's Changes tab.
- Create projects and workspaces, run project setup, archive workspaces and remove projects.
- Run the workspace's Claude Code session in an editor tab, full screen or the terminal panel, attach images to it, and manage the panel's other terminal sessions.

## Workspace Control panel

Selecting a workspace in **Projects** opens the panel and keeps it on that workspace. The **Workspace** view in the sidebar is a launcher into it: each row (phase, gate, plan, discussions, research, review threads, progress, code changes, reflection, scratchpads, settings) shows a short status and opens the panel on that tab. The title bar button opens the panel on its last tab, and the overflow menu holds switch workspace, set phase, YOLO mode and the Claude actions. While a plan waits for approval, approve and reject buttons appear on the view and a "Plan: pending" item appears in the status bar.

The panel follows the VS Code theme and the workspace locale. Its strings come from the admin panel, so the RU translation matches the web. The panel stays alive in the background and survives window reloads.

Native features stay native. Opening a file, a diff, a terminal or the worktree from the panel uses the editor, not a copy of it.

## Changes view

The **Changes** view in the Governed Workflow sidebar lists the files the active workspace changed, either on the branch against its source branch (default) or uncommitted. The title bar switches between the two, switches between a folder tree (default, with single-child folder chains merged as in Source Control) and a flat list, refreshes, and opens all changes in the multi-file diff editor. Multi-repo workspaces get one group per repository. Each file shows its status letter and colour and its added and removed line counts, and the view's badge counts the changed files. Mode and layout are remembered per window.

Clicking a file opens its diff in the editor group you last used, replacing that group's preview tab, so with a split editor one side keeps your code and the other shows the diff. Diffs opened from the Control Panel's Changes tab follow the same rule. The context menu opens the working file or copies its path. The view loads only while it is visible and reloads when the workspace or its state changes.

## Picking a workspace opens its worktree

Picking a workspace (the Projects view, Switch Workspace, or the switch button in Workspace Control) also opens its worktree when this window is not already on it. A window counts as already there when one of its folders is the worktree or sits inside it, so a window on one repo of a multi-repo workspace stays put. `governedWorkflow.onSelectWorkspace` chooses how: `newWindow` (default), `sameWindow`, `addFolder` (adds the worktree as another folder, no reload) or `off` (only switch the panel). **Open Worktree** keeps asking which window to use. When the worktree is on neither this machine nor reachable over SSH, the workspace only opens in the panel.

A window remembers the workspace picked in it. A window opened by a pick shows that workspace right away. Any other window opened on a worktree finds its workspace with one projects list call plus one workspaces list call for the project that contains the folder; nothing else is fetched.

## Worktrees on the admin panel's machine

When VS Code runs on a laptop and `governedWorkflow.serverUrl` points at another machine (for example `http://MacBook-Pro-Ignat.local:5111`), picking a workspace whose worktree is not on the laptop opens it on the panel's machine in a Remote-SSH window, following `governedWorkflow.onSelectWorkspace` (`addFolder` opens a new window, since a remote folder cannot join a local window).

- **SSH target:** `governedWorkflow.sshHost` (for example `ig@mac` or an `~/.ssh/config` alias) when set; otherwise the user reported by the panel's `/api/server-info` at the `serverUrl` host, or just the host on panels without that endpoint. SSH keys or a password prompt are up to Remote-SSH.
- **Remote - SSH missing:** the extension offers to install it and then opens the worktree. Declining keeps the workspace in Workspace Control only.
- **The extension on the SSH host:** it adds itself to `remote.defaultExtensionsIfInstalledLocally`, so VS Code copies the local install (a VSIX install too) to the host on connect. The very first window on a new host may still start the extension on the laptop; it then offers **Reload Window** (or **Install on SSH Host...** if the copy did not happen). After an update of the local VSIX, update the host copy from the Extensions view.
- **In the new window** the workspace is selected automatically, and the admin token carries over because secret storage lives on the laptop. Nothing is prompted inside a remote window.

## Companions

Some setups need another extension. VS Code has no optional dependencies, so the extension offers them when they matter, with **Install**, **Not now** and **Don't ask again**. **Governed Workflow: Companions** lists them with their state and installs them.

- **Remote - SSH** (`ms-vscode-remote.remote-ssh`): needed only when VS Code runs on a different machine from the code and the admin panel. Offered when `governedWorkflow.serverUrl` is not localhost, and by **Governed Workflow: Work with Another Machine**, which opens Remote-SSH's Connect to Host when it is installed. Never offered inside a Remote-SSH window.

## Comments

- In an editor or a diff, use the `+` in the gutter to comment on a line or a range, or the file comment button for the whole file.
- In the explorer or an editor tab, **Add Workflow Comment** comments on a file or folder.
- The **Comments** view lists every thread in the workspace by area, with a badge for open ones. Filter, reply and resolve from there. Opening a comment jumps to its line, or to its place in the panel.
- Resolve or reopen a code thread from its header in the editor. **Resolve All in This File** sits next to it, on file rows of the Comments view, and in the editor title and context menus while the file has open threads.
- **Resolve All Comments** is on the title bar of the Comments view and of VS Code's Comments panel, and in the command palette. It asks first, then closes code review threads as out of scope and resolves the rest. VS Code gives extensions no menu on the panel's rows, so open a thread from there and use its header.

A comment made in the editor shows up in the panel's Review tab, and the reverse is true too. Both refresh within one state update.

## Deployment setups

**Same machine, or Remote-SSH.** The workspace's working directory exists on the machine running VS Code. The extension opens local files directly, so the editor, language servers and git work as usual. Under Remote-SSH the extension runs on the remote host, next to the worktrees, and talks to the panel from there. Set `governedWorkflow.serverUrl` to the panel's address as seen from the remote host, usually `http://localhost:5111`.

**Panel on another LAN machine.** The admin panel runs on a different host and the code is not on this machine. Point `governedWorkflow.serverUrl` at that host, for example `http://192.168.1.20:5111`, and turn on network access on the panel host (Settings, System, in the web panel or in Workspace Control), then restart the panel so it binds to the LAN. The extension then reads and writes files through the panel: a `gw-file` file system for the working tree and a `gw-base` virtual document for the base branch. Saving a `gw-file` document writes it back to the remote worktree. Only UTF-8 text files can be saved this way.

The extension prefers the workspace side (`extensionKind: workspace, ui`) and falls back to the UI side when there is no remote. The panel's webview never talks to the network itself. Every request goes through the extension host, so the token stays in secret storage and no CORS setup is needed.

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `governedWorkflow.serverUrl` | `http://localhost:5111` | Base URL of the admin panel. |
| `governedWorkflow.pollIntervalSeconds` | `10` | State polling interval while the window is focused and the Workspace Control panel is not visible. While the panel is visible and the window focused, the state is polled every 3 seconds (cheap ETag/304 requests). Minimum 3. |
| `governedWorkflow.terminal.layout` | `editor` | Where the Claude terminal opens: `panel` (the terminal panel; drag it to the bottom or the secondary side bar), `editor` (an editor tab) or `fullscreen` (an editor tab with its group maximised). Switch from the status bar item, **Claude Terminal Layout…** or **Toggle Claude Terminal Full Screen** (`Ctrl+Alt+Shift+Enter`); an open terminal moves without reconnecting. |
| `governedWorkflow.terminal.maximize` | `true` | Deprecated. While `terminal.layout` is unset, an explicit `true` selects `fullscreen`. |
| `governedWorkflow.onSelectWorkspace` | `newWindow` | What picking a workspace does when this window is not on its worktree: `newWindow`, `sameWindow`, `addFolder` or `off`. |
| `governedWorkflow.sshHost` | empty | SSH target for worktrees on the admin panel's machine, e.g. `ig@mac` or an `~/.ssh/config` alias. Empty: the panel's reported user at the `serverUrl` host. |

## Token setup

The panel requires an admin bearer token. Generate one on the panel's host:

```bash
python3 admin-panel/backend/app.py auth-token
```

Then run **Governed Workflow: Set Admin Token** in VS Code and paste the token. It is stored in VS Code's secret storage, not in settings.

## Browser harness (dev only)

`npm run harness` serves the built panel (`dist/webview`) in a normal browser tab against a live admin panel, so it can be checked visually without installing the .vsix. The page runs the real host code (`controlPanel`, `rpcHost`, `apiBridge`, `nativeActions`, the state poller) bundled for node, with `vscode` replaced by `scripts/harness/vscodeShim.mjs`. Native actions (open file or diff, terminal, save, copy, external links) are logged to the harness console and acknowledged. The harness is excluded from the .vsix.

```bash
npm run build
GW_TOKEN=<token> GW_PROJECT=<project id> GW_BRANCH=<branch> npm run harness
# open http://localhost:5199/  (or /?project=<id>&branch=<branch>)
```

Optional: `GW_SERVER_URL` (default `http://localhost:5111`), `GW_HARNESS_PORT` (default `5199`), `GW_HARNESS_HOST` (bind address, default `127.0.0.1`; use `0.0.0.0` to open the harness on the LAN, where anyone who reaches it can use the token), `GW_TOKEN_FILE` (read the token from a file instead of `GW_TOKEN`; the value is never logged). Rebuild the panel with `npm run build` and reload the page; restart the harness after host-code changes.

The panel stores only a SHA-256 hash of the admin token, so an existing token cannot be read back. Reuse the token already pasted into VS Code, or create one with `python3 admin-panel/backend/app.py auth-token`. That command refuses to run when a token exists; `--force` rotates it and disconnects every client that uses the old one, including VS Code.

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
