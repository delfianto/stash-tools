import { Hono } from "hono";
import { cors } from "hono/cors";
import { serveStatic } from "hono/bun";
import { streamSSE } from "hono/streaming";
import pino from "pino";
import { config } from "./config.ts";
import { StashRenamer } from "./renamer.ts";
import { AutoTagger } from "./tagger.ts";
import { loadTagRules, validateTagRules, readTagRulesRaw, writeTagRules } from "./tagRules.ts";
import { PerformerTagger } from "./performerTagger.ts";
import {
  loadPerformerRules,
  validatePerformerRules,
  readPerformerRulesRaw,
  writePerformerRules,
} from "./performerRules.ts";
import { parseCupCategory } from "./measurementParser.ts";
import type { Candidate } from "@shared/types";

const log = pino({ name: "server" });

// ---------------------------------------------------------------------------
// Singletons
// ---------------------------------------------------------------------------

const _cache = new Map<string, Candidate>();
let _renamer: StashRenamer | null = null;
let _tagger: AutoTagger | null = null;
let _performerTagger: PerformerTagger | null = null;

function getRenamer(): StashRenamer {
  if (!_renamer) _renamer = new StashRenamer(config);
  return _renamer;
}

function getTagger(): AutoTagger {
  if (!_tagger) _tagger = new AutoTagger(config);
  return _tagger;
}

function getPerformerTagger(): PerformerTagger {
  if (!_performerTagger) _performerTagger = new PerformerTagger(config);
  return _performerTagger;
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

app.get("/api/tagger/scene-ids", async (c) => {
  const studio = c.req.query("studio") || undefined;
  const performer = c.req.query("performer") || undefined;
  try {
    const result = await getTagger().getAllSceneIds({ studio, performer });
    return c.json(result);
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

    // Load rules fresh each run so edits to tag-rules.json take effect immediately
    const rules = loadTagRules(config.tagRulesFile);
    const localTagNames = new Set(localTagMap.keys());
    let updated = 0;
    let errors = 0;

    for (const sceneId of sceneIds) {
      if (stream.aborted) break;

      let result;
      try {
        const scene = await tagger.getScene(sceneId);
        if (!scene) {
          result = {
            sceneId,
            sceneTitle: "",
            stashdbId: "",
            matchedTags: [] as string[],
            filteredOut: [] as string[],
            newTags: [] as string[],
            removedTags: [] as string[],
            ruleLog: [] as string[],
            updated: false,
            error: "Scene not found",
          };
        } else {
          result = await tagger.processScene(
            scene,
            localTagNames,
            localTagMap,
            tagAncestors,
            dryRun,
            rules,
          );
        }
      } catch (err) {
        result = {
          sceneId,
          sceneTitle: "",
          stashdbId: "",
          matchedTags: [] as string[],
          filteredOut: [] as string[],
          newTags: [] as string[],
          removedTags: [] as string[],
          ruleLog: [] as string[],
          updated: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      if (result.newTags.length || result.removedTags.length) updated++;
      if (result.error) errors++;

      await stream.writeSSE({
        data: JSON.stringify({
          type: "result",
          scene_id: result.sceneId,
          scene_title: result.sceneTitle,
          matched: result.matchedTags,
          filtered_out: result.filteredOut,
          new_tags: result.newTags,
          removed_tags: result.removedTags,
          rule_log: result.ruleLog,
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
// Performer Tagger JSON API
// ---------------------------------------------------------------------------

app.get("/api/performer-tagger/performers", async (c) => {
  const page = Number(c.req.query("page") ?? 1);
  const perPage = Number(c.req.query("per_page") ?? 50);
  const country = c.req.query("country") || undefined;
  const ethnicity = c.req.query("ethnicity") || undefined;

  try {
    const pt = getPerformerTagger();
    const { performers, total } = await pt.getPerformersPage(page, perPage, { country, ethnicity });
    const totalPages = Math.max(1, Math.ceil(total / perPage));

    const mapped = performers.map((p) => ({
      id: String(p.id),
      name: p.name ?? `Performer ${p.id}`,
      country: p.country ?? "",
      ethnicity: p.ethnicity ?? "",
      measurements: p.measurements ?? "",
      cup_category: parseCupCategory(p.measurements ?? "") ?? "",
      tags: (p.tags ?? []).map((t) => t.name).sort(),
      stash_url: `${config.baseUrl}/performers/${p.id}`,
    }));

    return c.json({ performers: mapped, total, page, per_page: perPage, total_pages: totalPages });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

app.get("/api/performer-tagger/meta", async (c) => {
  try {
    const result = await getPerformerTagger().getPerformerMeta();
    return c.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

app.get("/api/performer-tagger/performer-ids", async (c) => {
  const country = c.req.query("country") || undefined;
  const ethnicity = c.req.query("ethnicity") || undefined;
  try {
    const result = await getPerformerTagger().getAllPerformerIds({ country, ethnicity });
    return c.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

// ---------------------------------------------------------------------------
// Performer Tagger SSE
// ---------------------------------------------------------------------------

app.post("/performer-tagger/tag", async (c) => {
  const form = await c.req.formData();
  const performerIds = form.getAll("performer_ids").map(String);
  const dryRun = form.get("dry_run") === "1";

  return streamSSE(c, async (stream) => {
    const pt = getPerformerTagger();
    let localTagMap: Map<string, string>;

    try {
      localTagMap = await pt.getLocalTagMap();
    } catch (err) {
      await stream.writeSSE({ data: JSON.stringify({ type: "error", error: String(err) }) });
      return;
    }

    const rules = loadPerformerRules(config.performerRulesFile);
    let updated = 0;
    let errors = 0;

    for (const performerId of performerIds) {
      if (stream.aborted) break;

      let result;
      try {
        const performer = await pt.getPerformer(performerId);
        if (!performer) {
          result = {
            performerId,
            performerName: "",
            measurements: "",
            cupCategory: "",
            addedTags: [] as string[],
            removedTags: [] as string[],
            ruleLog: [] as string[],
            updated: false,
            error: "Performer not found",
          };
        } else {
          result = await pt.processPerformer(performer, localTagMap, rules, dryRun);
        }
      } catch (err) {
        result = {
          performerId,
          performerName: "",
          measurements: "",
          cupCategory: "",
          addedTags: [] as string[],
          removedTags: [] as string[],
          ruleLog: [] as string[],
          updated: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      if (result.addedTags.length || result.removedTags.length) updated++;
      if (result.error) errors++;

      await stream.writeSSE({
        data: JSON.stringify({
          type: "result",
          performer_id: result.performerId,
          performer_name: result.performerName,
          measurements: result.measurements,
          cup_category: result.cupCategory,
          added_tags: result.addedTags,
          removed_tags: result.removedTags,
          rule_log: result.ruleLog,
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
// Rules API
// ---------------------------------------------------------------------------

app.get("/api/rules", (c) => {
  const tagResult = validateTagRules(readTagRulesRaw(config.tagRulesFile));
  const performerResult = validatePerformerRules(readPerformerRulesRaw(config.performerRulesFile));
  return c.json({ tagRules: tagResult, performerRules: performerResult });
});

app.get("/api/rules/tag-rules", (c) => {
  return c.json({ content: readTagRulesRaw(config.tagRulesFile) });
});

app.get("/api/rules/performer-rules", (c) => {
  return c.json({ content: readPerformerRulesRaw(config.performerRulesFile) });
});

app.put("/api/rules/tag-rules", async (c) => {
  const body = await c.req.json<{ content: string }>();
  const result = writeTagRules(config.tagRulesFile, body.content);
  return c.json(result, result.error ? 400 : 200);
});

app.put("/api/rules/performer-rules", async (c) => {
  const body = await c.req.json<{ content: string }>();
  const result = writePerformerRules(config.performerRulesFile, body.content);
  return c.json(result, result.error ? 400 : 200);
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
