# MoneyNote — Agent Workflow Rules

## Commands
- Unit tests: `npm test` (vitest run) — run before finishing ANY task
- E2E (builds first): `npm run test:e2e`
- Lint: `npm run lint` · Build: `npm run build` (tsc -b + vite build)
- Dev: `npm run dev` (vite)

## Project shape
- React + Vite + TypeScript, dexie (IndexedDB) for local storage, dayjs for dates
- LLM features under `src/llm/` (client/service/prompts), chat UI under `src/components/chat/`
- P1–P7 roadmap tracked in ROADMAP.md; test coverage is a requirement for P1-7+ (169 unit + 5 Playwright E2E, merged in PR #6, v1.3.0)

## Hard rules (learned from real failures)
1. **Never leave a failing test in the working tree.** A failing test = task not done. Fix or revert before moving on.
2. **Update plan checkboxes as you go.** Tick `- [ ]` boxes in `docs/superpowers/plans/*.md` in the same commit you complete the step.
3. **Commit only intended files.** Check `git status` before every commit; never commit secrets or local DB dumps.
4. **Push discipline:** after a merge, verify `git status` shows no unpushed commits (main has silently drifted before).
5. **Timezones:** date parsing/formatting goes through dayjs; tests must not assume a fixed TZ offset.

## In-flight work (as of 2026-08-06)
- P1-7 (tests + E2E) is DONE and merged on `main`. Remaining: `main` is ahead of origin by 2 commits (README overhaul) — push when the user asks; branch `docs/agent-guidelines` exists unmerged (awaiting user decision).
