# Coding agent guide — stash-tools

This file is the canonical instruction set for all coding agents (Claude Code, Gemini CLI, Copilot, etc.). `CLAUDE.md` is a symlink to this file.

---

## Toolchain

This project uses **Vite+** (`vp`), the unified toolchain from VoidZero. It wraps Vite (Rolldown-backed), Oxlint, Oxfmt, and Vitest behind a single CLI.

```bash
vp install          # install / sync dependencies (replaces bun install for frontend)
vp dev              # Vite dev server only (:5173)
vp build            # production build → static/
vp check            # format + lint + type-check (read-only)
vp check --fix      # format + lint with auto-fix
vp lint src         # lint only
```

The **API server** (Bun/Hono) is separate from the Vite frontend:

```bash
bun --watch server/index.ts   # API on :8000
./run.sh dev                  # both together (recommended)
```

## Before you start

```bash
vp install          # always run after pulling
```

## Validation checklist

Run these before marking any task done:

```bash
vp check            # must pass with zero errors
bun run build       # vue-tsc type-check + vp build — must succeed clean
```

No test suite exists yet. Manual verification against a live Stash instance is required for server-side changes.

## Code style

- **Formatter**: Oxfmt (Prettier-compatible). `vp check --fix` auto-formats. Never hand-format.
- **Linter**: Oxlint. Fix all warnings — don't suppress with inline comments unless truly unavoidable.
- **TypeScript**: strict mode, no `any`, no unused vars/params. `noEmit` type-check via `vue-tsc`.
- **Vue SFCs**: `<script setup lang="ts">` always. No Options API.
- **Pinia stores**: composition-style (`defineStore(() => { ... })`), one store per feature.
- **Comments**: only when the _why_ is non-obvious. No JSDoc, no block comments describing what code does.
- **No new dependencies** without a clear reason — the bundle is intentionally lean.

## Architecture

```
server/        Bun + Hono API (runs standalone, not through Vite)
src/           Vue 3 SPA
  pages/       One component per route
  stores/      Pinia store per feature (tagger, renamer, bulkTagger)
  components/  Shared UI primitives
shared/        Types imported by both server and frontend
static/        Built SPA output — git-ignored, served by Hono in prod
```

Key constraint: `shared/` must only contain types — no runtime imports from either side.

## Adding a new page

1. Create `src/pages/MyPage.vue`
2. Create `src/stores/myFeature.ts` if the page needs state
3. Add the route in `src/main.ts`
4. Add a sidebar entry in `src/components/AppSidebar.vue`

## API / SSE pattern

- JSON endpoints live under `/api/` and are proxied by Vite dev server to `:8000`
- Long-running operations (tagging) stream results via SSE from `POST /tagger/tag` using Hono's `streamSSE`
- The frontend reads SSE with `ReadableStream` + `TextDecoder` — no `EventSource` (POST body needed)

## Environment

Config is validated at startup via Zod in `server/config.ts`. All variables are prefixed `STASH_`. See `.env.example` for the full list. Never hard-code URLs or credentials.

## Vite+ internals

- `vite.config.ts` imports from `vite-plus`, not `vite`
- `vite` in `node_modules` is aliased to `@voidzero-dev/vite-plus-core` via `overrides`
- `.vite-hooks/` contains the pre-commit hook (`vp staged` → `vp check --fix`) — commit this directory, it's shared tooling
- `AGENTS.md` (this file) is the source of truth; `CLAUDE.md` is a symlink to it

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
