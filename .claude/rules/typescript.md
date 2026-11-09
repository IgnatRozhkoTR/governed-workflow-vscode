---
name: typescript
description: TypeScript conventions for the VS Code extension — strict types, thin ApiClient boundary, short functions, VS Code API usage.
paths:
  - "src/**/*.ts"
  - "test/**/*.ts"
---

# TypeScript conventions

## Runtime shape

- TypeScript in strict mode, compiled by esbuild into one CommonJS bundle at `dist/extension.js`. `vscode` is external.
- One feature per module under `src/`. Each module exports classes or functions; only `src/extension.ts` wires them into VS Code.
- Pure modules (`src/fs/uris.ts`, `src/comments/lineHash.ts`, `src/state/stateSections.ts`) must not touch the `vscode` runtime, so vitest can run them directly.

## Boundaries

- All admin panel calls go through `ApiClient` in `src/api/client.ts`. No raw `fetch` elsewhere.
- Payload shapes live in `src/api/types.ts`. Do not redeclare them in feature modules.
- No business rules on the client. Phase names, gate flags and review resolution come from the server payload.
- Failures are `ApiError` (status, code, message) or `AuthRequiredError` (401). Never throw bare `Error` or swallow errors silently.

## Types and nullability

- No `any`. Use `unknown` and narrow it at the boundary.
- Never return or pass `null`. Use `undefined` for absent optional values, and empty arrays for absent lists.
- Use `async`/`await` throughout. Do not mix in `.then()` chains.
- Prefer `const`; use `let` only for values that are reassigned.

## Naming

- Classes are nouns (`ApiClient`, `StatePoller`). Methods are verbs (`listProjects`, `refreshNow`).
- Booleans are questions (`isLocal`, `hasReplies`).
- Constants are `UPPER_SNAKE` (`TOKEN_SECRET_KEY`).
- Test names follow `methodName_shouldDoSomething_whenConditionMet`.

## Structure

- Keep functions under 20 lines. Extract named helpers rather than nesting callbacks.
- Register VS Code handlers once in `activate` through the module's `register*` function. Do not re-register on every refresh.
- Module-level mutable state goes in one place at the top of the module, not in closures.

## Don'ts

- No `console.log` in committed code. Surface problems to the user through `vscode.window` messages or the output channel.
- No comments that explain how code works. Comments are for business WHY only.
- No new runtime dependencies without a strong reason. `ws` is the only runtime dependency.
