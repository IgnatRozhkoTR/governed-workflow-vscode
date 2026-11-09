# governed-workflow-vscode

VS Code extension that is a second UI for Governed Workflow, next to the admin panel. See `README.md` for setup and usage.

## Folder Map

- `src/api/` — typed HTTP and WebSocket client for the admin panel, payload types, errors.
- `src/config/` — settings reader and token storage (VS Code secrets).
- `src/state/` — workspace state polling and the active workspace holder.
- `src/fs/` — `gw-file` and `gw-base` virtual file systems and URI mapping.
- `src/views/` — tree views and virtual markdown documents.
- `src/diff/` — branch changes tree and native diff editor.
- `src/comments/` — review comment threads mapped onto code lines.
- `src/terminal/` — Claude session pseudoterminal over WebSocket.
- `src/commands/` — command handlers for projects, workspaces and gates.
- `src/annotations/` — extension point for future code annotations.
- `test/` — vitest unit tests and the `vscode` module stub.

## Commands

- `npm run build` — bundle `src/extension.ts` into `dist/extension.js`.
- `npm run typecheck` and `npm test` — must pass before handing off.

## Core Rule

- Thin client: no business logic. The admin panel API is the contract. Phase names, gate decisions and review rules come from the server payload, never from client-side lists.

NEVER commit, push, or create merge requests unless explicitly asked.
