# stash-tools

> A web UI for people who are too lazy to click through Stash manually but somehow not too lazy to set up a whole separate app to avoid doing that.

Built entirely by Claude (Anthropic's AI) while the human "architect" was occupied with, and I quote, _something else_. The human's contribution was approximately: opening the terminal, typing prompts, and occasionally squinting at the screen to make sure nothing exploded. The code you're reading is the result of an AI being given increasingly ambitious tasks and a human nodding along going "yeah that looks right I guess."

No performers were harmed in the making of this software. Several JSON files were.

---

## What it does

### Renamer

Scans your Stash library and renames/organizes files using studio, performer, date, and title metadata. Because `VID_20190823_003.mp4` is not a name, it's a cry for help.

Supports fully configurable path and filename templates. Dry-run mode so you can see what chaos would unfold before actually committing to it.

### Auto Tagger

Browse scenes page by page, select ones you care about, and apply tags sourced from StashDB. Has a dry-run mode for the commitment-averse. Shows which tags were added _and_ removed because apparently that was being silently ignored before and nobody noticed for an embarrassingly long time.

### Bulk Tagger

Like Auto Tagger, but you press one button and it just… goes. Pages through your entire library, tags everything eligible, streams live progress via SSE, and produces a scrollable log of what happened. Perfect for people who want automation but still want to watch it work so they feel involved.

### Performer Tagger

Same concept as Auto Tagger but for performers. Auto-tags based on measurements, country, ethnicity, and whatever other attributes your `performer-rules.json` file specifies. Includes cup size categorisation (small/medium/large) via a bra size parser that exists in this codebase, yes, really.

### Bulk Performer Tagger

Performer Tagger but fully automated. Walks through every performer in your library page by page without you having to lift a finger. You can go make a coffee. You should make a coffee.

### Rules Editor

An in-app JSON editor for `tag-rules.json` and `performer-rules.json`. Shows a live count of rules, flags parse errors, lets you view the rule list with descriptions, and saves back to disk with server-side validation. Because editing raw JSON files on a server is a perfectly reasonable workflow that definitely doesn't cause accidents at 1am.

---

## Stack

| Layer         | Tech                                                                         |
| ------------- | ---------------------------------------------------------------------------- |
| Backend       | [Bun](https://bun.sh) + [Hono](https://hono.dev)                             |
| Frontend      | [Vue 3](https://vuejs.org) + [Vite+](https://viteplus.dev) (Rolldown-backed) |
| Styling       | [Tailwind CSS v4](https://tailwindcss.com)                                   |
| State         | [Pinia](https://pinia.vuejs.org)                                             |
| UI components | [Reka UI](https://reka-ui.com)                                               |
| Type checking | vue-tsc (strict mode, no `any`, no exceptions, no mercy)                     |
| Author        | Claude Sonnet 4.6 (the AI), a human (the supervisor)                         |

---

## Prerequisites

- [Bun](https://bun.sh) ≥ 1.3
- [Vite+](https://viteplus.dev) CLI (`vp`) — install once globally:
  ```bash
  curl -fsSL https://vite.plus | bash
  ```
- A running [Stash](https://github.com/stashapp/stash) instance
- A StashDB account and API key (for tag lookups)
- Mild tolerance for watching progress bars

---

## Setup

```bash
# 1. Install dependencies
vp install

# 2. Configure
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

**Renamer** (only needed if you use the Renamer)

| Variable                 | Default                                      | Description                                          |
| ------------------------ | -------------------------------------------- | ---------------------------------------------------- |
| `RENAMER_SOURCE`         | _(empty)_                                    | Root directory to scan for unorganised files         |
| `RENAMER_DEST`           | _(empty)_                                    | Base directory where organised files are moved       |
| `RENAMER_PATH_MAP`       | `{}`                                         | JSON map of Stash-internal → host paths (for Docker) |
| `RENAMER_DIR_STRUCTURE`  | `{studio_or_parent}`                         | Subdirectory template under `RENAMER_DEST`           |
| `RENAMER_FILE_STRUCTURE` | `{studio} - {date} - {performers} - {title}` | Filename template (extension added automatically)    |
| `RENAMER_DOTS`           | `false`                                      | `true` for `Studio.Name.mp4` style (why, but ok)     |
| `RENAMER_DATE_FORMAT`    | `%y.%m.%d`                                   | strftime — `%Y`=2024, `%y`=24, `%m`=11, `%d`=30      |

Template variables: `{studio}`, `{parent_studio}`, `{studio_or_parent}`, `{performers}`, `{performers_first}`, `{date}`, `{title}`.

---

## Running

```bash
# Development (API :8000 + Vite dev :5173, with HMR because we're not animals)
./run.sh dev

# Production (build UI then serve everything from :8000)
./run.sh prod

# Build UI only
./run.sh build

# API server only
./run.sh api
```

---

## Project layout

```
server/               Bun/Hono API server
  index.ts            Route definitions + SSE streaming
  tagger.ts           StashDB tag lookup and scene patching
  performerTagger.ts  Performer tag logic including bra size math
  renamer.ts          Scene scan and file rename/move logic
  tagRules.ts         Tag rule loader, validator, and writer
  performerRules.ts   Performer rule loader, validator, and writer
  config.ts           Env-var validation via Zod (it will yell at you)
  client.ts           Stash GraphQL client

src/
  pages/              One component per route
  stores/             Pinia stores — one per feature, composition style
  components/         Shared UI primitives (StatusBadge, BatchProgress, etc.)
  utils/              readSSE.ts because three stores had identical SSE loops

shared/               Types only — no runtime code, no drama
static/               Built frontend output (git-ignored, generated on build)
```

---

## Rules files

Rules live under the `rules/` directory:

- `rules/scene.json` — tag rules applied to scenes
- `rules/performer.json` — tag rules applied to performers

Paths are configurable via `STASH_TAG_RULES_FILE` / `STASH_PERFORMER_RULES_FILE` if you want them somewhere else for some reason. Each file is a JSON array of rule objects with a `description` field and whatever matching/action fields the engine expects.

You can edit them in-app via the **Rules** page without touching the filesystem directly. The editor validates JSON before saving and shows a count of loaded rules and any parse errors. It's the kind of feature that sounds minor until you've corrupted a rule file at midnight.

---

## Known features that sound made up but are real

- **Cup size categorisation** — parses bra measurements (both US and Japanese sizing conventions) and classifies performers as `small`, `medium`, or `large`. This is not a joke, it's a rule input.
- **Select all across pages** — when you check all performers or scenes on the current page, a banner appears offering to select your entire filtered result set across all pages in one click. It fetches all IDs from the server. Yes, all of them.
- **SSE progress streaming** — long-running tag operations stream results back to the browser in real time. You can watch your library get tagged like it's some kind of deranged progress bar artform.
- **Dry-run mode everywhere** — every tagging operation supports dry run. The results display what _would_ have happened in a faint accent colour. Very tasteful. Very non-destructive.
- **Filter persistence during bulk runs** — country/ethnicity/studio/performer filters apply to bulk operations too. The bulk tagger is not just blindly doing everything; it respects your preferences.

---

## Authorship disclosure

This codebase was written by **Claude Sonnet 4.6**, an AI assistant made by Anthropic.

The human provided:

- The initial feature requests
- Occasional "yeah that looks right" approvals
- Architectural guidance in the form of "make it like the other one"
- The prompt "make it funny, absurd, borderline sarcastic" for this very README
- Their hands, which were apparently busy doing something else throughout

To be clear: the AI wrote the code, the human reviewed patterns and ensured sensibility. This is either the future of software development or a cautionary tale. Possibly both.

If something is broken, it is unclear whose fault that is. Probably both of ours.

---

## License

Do whatever you want with it. It was written by an AI at the request of a human who was multitasking. The moral complexity here is left as an exercise for the reader.
