# stash-tools

A local web UI for managing a [Stash](https://github.com/stashapp/stash) library. Provides two tools:

- **Renamer** — scan scenes and batch-rename/organize files using studio, performer, and date metadata
- **Auto Tagger** — browse scenes and apply curated tags sourced from StashDB, one page at a time
- **Bulk Tagger** — same as Auto Tagger but fully automated: pages through the entire library and tags every eligible scene without any clicking

## Stack

| Layer         | Tech                                                                         |
| ------------- | ---------------------------------------------------------------------------- |
| Backend       | [Bun](https://bun.sh) + [Hono](https://hono.dev)                             |
| Frontend      | [Vue 3](https://vuejs.org) + [Vite+](https://viteplus.dev) (Rolldown-backed) |
| Styling       | [Tailwind CSS v4](https://tailwindcss.com)                                   |
| State         | [Pinia](https://pinia.vuejs.org)                                             |
| UI components | [Reka UI](https://reka-ui.com)                                               |
| Type checking | vue-tsc                                                                      |

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- [Vite+](https://viteplus.dev) CLI (`vp`) — install once globally:
  ```bash
  curl -fsSL https://vite.plus | bash
  ```
- A running [Stash](https://github.com/stashapp/stash) instance

## Setup

```bash
# 1. Install dependencies
vp install

# 2. Configure — one file for everything
cp .env.example .env
$EDITOR .env
```

### Configuration reference (`.env`)

**Stash connection**

| Variable            | Default                       | Description                        |
| ------------------- | ----------------------------- | ---------------------------------- |
| `STASH_SCHEME`      | `http`                        | `http` or `https`                  |
| `STASH_HOST`        | `localhost`                   | Stash hostname                     |
| `STASH_PORT`        | `9999`                        | Stash port                         |
| `STASH_API_KEY`     | _(empty)_                     | Stash API key (if auth is enabled) |
| `STASH_API_KEY_DB`  | _(empty)_                     | StashDB API key (for tag lookups)  |
| `STASH_DB_ENDPOINT` | `https://stashdb.org/graphql` | StashDB GraphQL endpoint           |

**Renamer** (only needed if you use the Renamer feature)

| Variable                 | Default                                      | Description                                             |
| ------------------------ | -------------------------------------------- | ------------------------------------------------------- |
| `RENAMER_SOURCE`         | _(empty)_                                    | Root directory to scan for unorganized files            |
| `RENAMER_DEST`           | _(empty)_                                    | Base directory where organized files are moved          |
| `RENAMER_PATH_MAP`       | `{}`                                         | JSON map of Stash-internal → host paths (for Docker)    |
| `RENAMER_DIR_STRUCTURE`  | `{studio_or_parent}`                         | Subdirectory template under `RENAMER_DEST`              |
| `RENAMER_FILE_STRUCTURE` | `{studio} - {date} - {performers} - {title}` | Filename template (extension added automatically)       |
| `RENAMER_DOTS`           | `false`                                      | `true` to produce `Studio.Name.mp4` style filenames     |
| `RENAMER_DATE_FORMAT`    | `%y.%m.%d`                                   | strftime pattern — `%Y`=2024, `%y`=24, `%m`=11, `%d`=30 |

Template variables for `RENAMER_DIR_STRUCTURE` and `RENAMER_FILE_STRUCTURE`: `{studio}`, `{parent_studio}`, `{studio_or_parent}`, `{performers}`, `{performers_first}`, `{date}`, `{title}`.

## Running

```bash
# Development (API on :8000 + Vite dev server on :5173, with HMR)
./run.sh dev

# Production (build UI then serve everything from :8000)
./run.sh prod

# Build UI only (outputs to static/)
./run.sh build

# API server only
./run.sh api
```

## Project layout

```
server/          Bun/Hono API server
  index.ts       Route definitions + SSE streaming
  tagger.ts      StashDB tag lookup and scene patching logic
  renamer.ts     Scene scan and file rename/organize logic
  config.ts      Env-var config with Zod validation
  client.ts      Stash GraphQL client

src/             Vue 3 frontend
  pages/         Route-level page components
  stores/        Pinia stores (one per feature)
  components/    Shared UI components

shared/          Types shared between server and frontend
static/          Built frontend output (git-ignored)
```

## Development notes

- The Vite dev server proxies `/api/*` and `/tagger/tag` to the Bun server on `:8000`, so both processes must be running during development (`./run.sh dev` starts both).
- Tag results stream via SSE from `POST /tagger/tag`.
- The pre-commit hook runs `vp check --fix` automatically on staged files.
