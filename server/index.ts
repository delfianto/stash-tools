import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { streamSSE } from "hono/streaming";
import pino from "pino";
import { config } from "./config.ts";
import { StashRenamer } from "./renamer.ts";
import { AutoTagger } from "./tagger.ts";
import type { Candidate } from "@shared/types";

const log = pino({ name: "server" });

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

const _cache = new Map<string, Candidate>();
let _renamer: StashRenamer | null = null;
let _tagger: AutoTagger | null = null;

function getRenamer(): StashRenamer {
  if (!_renamer) _renamer = new StashRenamer(config);
  return _renamer;
}

function getTagger(): AutoTagger {
  if (!_tagger) _tagger = new AutoTagger(config);
  return _tagger;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

const app = new Hono();

app.use(
  "/*",
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

// ---------------------------------------------------------------------------
// Renamer JSON API
// ---------------------------------------------------------------------------

app.post("/api/scan", async (c) => {
  const form = await c.req.formData();
  const mode = (form.get("mode") as string | null) ?? "organize";

  let candidates: Candidate[];
  try {
    candidates = await getRenamer().scan();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error({ error: msg }, "scan_error");
    return c.json({ error: msg }, 500);
  }

  _cache.clear();
  for (const c of candidates) _cache.set(c.currentPath, c);

  return c.json({ mode, candidates });
});

app.post("/api/execute", async (c) => {
  const form = await c.req.formData();
  const mode = ((form.get("mode") as string | null) ?? "organize") as "organize" | "rename";
  const dryRun = form.get("dry_run") === "1";
  const paths = form.getAll("paths").map(String);

  const selected = paths.flatMap((p) => {
    const candidate = _cache.get(p);
    return candidate ? [candidate] : [];
  });

  if (!selected.length) return c.json({ results: [] });

  let results;
  try {
    results = await getRenamer().executeMoves(selected, mode, dryRun);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }

  if (!dryRun) {
    for (const r of results) {
      if (r.ok) _cache.delete(r.src);
    }
  }

  return c.json({ mode, dry_run: dryRun, results });
});

// ---------------------------------------------------------------------------
// Tagger JSON API
// ---------------------------------------------------------------------------

app.get("/api/tagger/tags", async (c) => {
  try {
    const tagMap = await getTagger().getLocalTagMap();
    const tags = [...tagMap.keys()].sort();
    return c.json({ tags, count: tags.length });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

app.get("/api/tagger/scenes", async (c) => {
  const page = Number(c.req.query("page") ?? 1);
  const perPage = Number(c.req.query("per_page") ?? 50);
  const studio = c.req.query("studio") || undefined;
  const performer = c.req.query("performer") || undefined;

  try {
    const tagger = getTagger();
    const { scenes, total } = await tagger.getScenesPage(page, perPage, { studio, performer });
    const totalPages = Math.max(1, Math.ceil(total / perPage));

    const endpoint = config.dbEndpoint;
    const mapped = scenes.map((s) => {
      const stashdbId = s.stash_ids?.find((sid) => sid.endpoint === endpoint)?.stash_id ?? "";
      return {
        id: String(s.id),
        title: s.title ?? `Scene ${s.id}`,
        stashdb_id: stashdbId,
        tags: (s.tags ?? []).map((t) => t.name),
        studio: s.studio?.name ?? "",
        performers: (s.performers ?? []).map((p) => p.name).sort(),
        stash_url: `${config.baseUrl}/scenes/${s.id}`,
        stashdb_url: stashdbId ? `${config.dbBaseUrl}/scenes/${stashdbId}` : "",
      };
    });

    return c.json({ scenes: mapped, total, page, per_page: perPage, total_pages: totalPages });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

// ---------------------------------------------------------------------------
// Tagger SSE
// ---------------------------------------------------------------------------

app.post("/tagger/tag", async (c) => {
  const form = await c.req.formData();
  const sceneIds = form.getAll("scene_ids").map(String);
  const dryRun = form.get("dry_run") === "1";

  return streamSSE(c, async (stream) => {
    const tagger = getTagger();
    let localTagMap: Map<string, string>;
    let tagAncestors: Map<string, Set<string>>;

    try {
      localTagMap = await tagger.getLocalTagMap();
      tagAncestors = await tagger.getTagAncestors();
    } catch (err) {
      await stream.writeSSE({
        data: JSON.stringify({ type: "error", error: String(err) }),
      });
      return;
    }

    const localTagNames = new Set(localTagMap.keys());
    let updated = 0;
    let errors = 0;

    for (const sceneId of sceneIds) {
      if (stream.aborted) break;

      const scene = await tagger.getScene(sceneId);
      if (!scene) {
        errors++;
        await stream.writeSSE({
          data: JSON.stringify({
            type: "result",
            scene_id: sceneId,
            scene_title: "",
            matched: [],
            filtered_out: [],
            new_tags: [],
            updated: false,
            dry_run: dryRun,
            error: "Scene not found",
          }),
        });
        continue;
      }

      const result = await tagger.processScene(
        scene,
        localTagNames,
        localTagMap,
        tagAncestors,
        dryRun,
      );

      if (result.newTags.length) updated++;
      if (result.error) errors++;

      await stream.writeSSE({
        data: JSON.stringify({
          type: "result",
          scene_id: result.sceneId,
          scene_title: result.sceneTitle,
          matched: result.matchedTags,
          filtered_out: result.filteredOut,
          new_tags: result.newTags,
          updated: result.updated,
          dry_run: dryRun,
          error: result.error,
        }),
      });
    }

    await stream.writeSSE({
      data: JSON.stringify({ type: "done", updated, errors, dry_run: dryRun }),
    });
  });
});

// ---------------------------------------------------------------------------
// Static SPA (must be last)
// ---------------------------------------------------------------------------

app.use("/*", serveStatic({ root: "./static" }));
app.use("/*", serveStatic({ path: "./static/index.html" }));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const port = Number(process.env["PORT"] ?? 8000);
log.info({ port, stash: config.baseUrl }, "server_starting");

export default {
  port,
  fetch: app.fetch,
};
