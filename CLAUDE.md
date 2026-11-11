# governed-workflow-vscode

VS Code extension that is a second UI for Governed Workflow, next to the admin panel. See `README.md` for setup and usage.

## Folder Map

- `src/api/` — typed HTTP and WebSocket client for the admin panel, payload types, errors.
- `src/shared/` — environment-neutral RPC protocol, navigation targets and paths, imported by the host and the webview.
- `src/webview/` — Workspace Control panel host: panel lifecycle, RPC routing, the `/api/` bridge and native actions.
- `src/config/`, `src/state/` — settings and token storage; state polling and the active workspace.
- `src/fs/` — `gw-file` and `gw-base` virtual file systems and URI mapping.
- `src/views/` — tree views: projects, the Workspace launcher into the panel, comments, context keys.
- `src/diff/` — branch changes tree and native diff editor.
- `src/comments/` — comments in editors, diffs and the explorer, shared with the panel.
- `src/terminal/` — Claude and other terminal sessions over WebSocket, image attach.
- `src/commands/` — command handlers for projects, workspaces and gates.
- `src/worktree/` — picking a workspace opens its worktree; window-to-workspace association on startup.
- `src/companions/` — registry and install prompts for optional companion extensions.
- `src/annotations/` — extension point for future code annotations.
- `webview-ui/` — the panel's Preact app: one folder per tab under `src/tabs/`, shared components, store and i18n. Binding module shapes live in `src/tabs/types.ts`.
- `test/` — vitest unit tests and the `vscode` module stub.

## Commands

- `npm run build` — bundle `src/extension.ts` into `dist/extension.js` and `webview-ui/` into `dist/webview/`.
- `npm run typecheck` and `npm test` — must pass before handing off.

## Core Rule

- Thin client: no business logic. The admin panel API is the contract. Phase names, gate decisions and review rules come from the server payload, never from client-side lists.

NEVER commit, push, or create merge requests unless explicitly asked.
