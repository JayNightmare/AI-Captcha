# Project Memory

## Current Project State
- Project initialized using `yo code` for a TypeScript VS Code Extension.
- Core dependencies configured (TypeScript, ESLint, VS Code test runner).
- The project aims to act as a CAPTCHA for Git commits, verifying if the user actually wrote the code by quizzing them on staged diffs using an LLM.

## Active Tasks
### Completed
- Phase 1: Completed Extension Skeleton & Hook Setup (`package.json` updated, TCP socket & hook writing logic implemented in `src/extension.ts`).
- Phase 2: Implemented `handleDiff` and pre-caching mechanism with an LLM fallback loop (`fetch` used to bypass `node_modules` dependency).
- Phase 3: Created React Webview via CDN + babel-standalone in `src/webview.ts`, detecting focus/blur.
- Phase 4: Generated cryptographic hashes for success cases, and created `.github/workflows/verify.yaml` to flag suspicious PRs.
- Architecture Revision: Created an Express server in `backend/` to act as a proxy. Updated `src/extension.ts` to hit the proxy endpoint, securing the OpenRouter API key and enforcing the `google/gemma-4-31b-it:free` model on the server side.
- GitHub OAuth: Extension uses `vscode.authentication.getSession('github')` to acquire a GitHub token. Backend verifies it against `api.github.com/user` before proxying to OpenRouter. Prevents anonymous abuse of the endpoint.
- Sidebar: Created `src/sidebarProvider.ts` with a `WebviewViewProvider` that provides staged files view, commit message input, and inline CAPTCHA challenge. Registered via `viewsContainers.activitybar` in `package.json`. Hook remains as fallback.
- SCM Sidebar Rewrite: Full Source Control replacement. New files: `src/git/gitService.ts` (stateless git CLI wrapper with status/staging/branching/remotes/sync/stash), `src/sidebarHtml.ts` (UI separated from provider logic). Sidebar detects no-repo state (init/publish buttons), displays staged/unstaged/untracked files with stage/unstage/discard per file, branch selector, push/pull/fetch actions, platform detection from remote URL. File watchers auto-refresh sidebar. Diff view opens on filename click.

### Next Steps (Maintenance)
- Gather user feedback on real-world Git CAPTCHA performance.
- Potentially publish the extension or fine-tune LLM extraction accuracy.

## Architectural Decisions
- **Socket Communication**: Extension opens a local TCP socket for the `pre-commit` hook to communicate.
- **Hook Strategy**: `pre-commit` hook delays commit for up to 5 seconds to wait for CAPTCHA completion, then appends a hash tag `[CAPTCHA:...]` to the commit message.
- **Strict Verification**: Unfocusing the webview automatically fails the CAPTCHA.
- **Always Commit**: The hook always commits the changes, but flags the message as either success or fail to avoid frustrating users while strictly flagging suspicious behavior.
