import { makeClient, type GQLClient } from "./client.ts";
import type { Config } from "./config.ts";
import type { TagResult } from "@shared/types";
import { applyTagRules, type TagRule } from "./tagRules.ts";
import pino from "pino";

const log = pino({ name: "tagger" });

// ---------------------------------------------------------------------------
// GraphQL queries
// ---------------------------------------------------------------------------

const QUERY_LOCAL_TAGS = `
query FindAllTagsWithParents {
  findTags(filter: { per_page: -1 }) {
    tags {
      id
      name
      parents { id name }
    }
  }
}
`;

const QUERY_SCENE_IDS = `
query FindSceneIds($filter: FindFilterType!) {
  findScenes(
    filter: $filter
    scene_filter: {
      stash_id_endpoint: { modifier: NOT_NULL, endpoint: "", stash_id: "" }
    }
  ) {
    count
    scenes {
      id
      stash_ids { stash_id endpoint }
      studio { name }
      performers { name }
    }
  }
}
`;

const QUERY_SCENES_PAGE = `
query FindScenesPage($filter: FindFilterType!) {
  findScenes(
    filter: $filter
    scene_filter: {
      stash_id_endpoint: { modifier: NOT_NULL, endpoint: "", stash_id: "" }
    }
  ) {
    count
    scenes {
      id
      title
      stash_ids { stash_id endpoint }
      tags { id name }
      studio { name }
      performers { name country }
    }
  }
}
`;

const QUERY_FIND_SCENE = `
query FindScene($id: ID!) {
  findScene(id: $id) {
    id
    title
    stash_ids { stash_id endpoint }
    tags { id name }
    studio { name }
    performers { name country }
  }
}
`;

const MUTATION_SCENE_UPDATE_TAGS = `
mutation SceneUpdateTags($id: ID!, $tag_ids: [ID!]!) {
  sceneUpdate(input: { id: $id, tag_ids: $tag_ids }) {
    id
  }
}
`;

// ---------------------------------------------------------------------------
// Tag hierarchy helpers
// ---------------------------------------------------------------------------

interface RawTag {
  id: string;
  name: string;
  parents: Array<{ id: string; name: string }>;
}

export function buildAncestorMap(tags: RawTag[]): Map<string, Set<string>> {
  const direct = new Map<string, Set<string>>();
  for (const tag of tags) {
    direct.set(tag.name, new Set(tag.parents.map((p) => p.name)));
  }

  const cache = new Map<string, Set<string>>();

  function ancestors(name: string, visiting: Set<string>): Set<string> {
    const cached = cache.get(name);
    if (cached) return cached;
    const result = new Set<string>();
    for (const parent of direct.get(name) ?? []) {
      if (!visiting.has(parent)) {
        result.add(parent);
        const next = new Set([...visiting, name]);
        for (const a of ancestors(parent, next)) result.add(a);
      }
    }
    cache.set(name, result);
    return result;
  }

  const out = new Map<string, Set<string>>();
  for (const tag of tags) out.set(tag.name, ancestors(tag.name, new Set()));
  return out;
}

export function filterRedundantParents(
  matched: string[],
  tagAncestors: Map<string, Set<string>>,
): string[] {
  const matchedSet = new Set(matched);
  const redundant = new Set<string>();
  for (const tag of matchedSet) {
    for (const ancestor of tagAncestors.get(tag) ?? []) {
      if (matchedSet.has(ancestor)) redundant.add(ancestor);
    }
  }
  if (redundant.size) log.debug({ removed: [...redundant].sort() }, "filtered_redundant_parents");
  return [...matchedSet].filter((t) => !redundant.has(t)).sort();
}

// ---------------------------------------------------------------------------
// Scene shape (internal)
// ---------------------------------------------------------------------------

interface StashScene {
  id: string | number;
  title?: string;
  stash_ids?: Array<{ stash_id: string; endpoint: string }>;
  tags?: Array<{ id: string; name: string }>;
  studio?: { name: string } | null;
  performers?: Array<{ name: string; country?: string | null }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeErrorResult(sceneId: string, error: string, title = ""): TagResult {
  return {
    sceneId,
    sceneTitle: title,
    stashdbId: "",
    matchedTags: [],
    filteredOut: [],
    newTags: [],
    removedTags: [],
    ruleLog: [],
    updated: false,
    error,
  };
}

// ---------------------------------------------------------------------------
// AutoTagger
// ---------------------------------------------------------------------------

export class AutoTagger {
  private callGQL: GQLClient;
  private _localTagMap: Map<string, string> | null = null;
  private _tagAncestors: Map<string, Set<string>> | null = null;

  constructor(private readonly config: Config) {
    this.callGQL = makeClient(config);
  }

  private async ensureTagsLoaded(): Promise<void> {
    if (this._localTagMap) return;
    const data = await this.callGQL(QUERY_LOCAL_TAGS, {});
    const tags = (data["findTags"] as { tags?: RawTag[] })?.tags ?? [];
    this._localTagMap = new Map(tags.map((t) => [t.name, t.id]));
    this._tagAncestors = buildAncestorMap(tags);
    log.info({ count: this._localTagMap.size }, "local_tags_loaded");
  }

  async getLocalTagMap(): Promise<Map<string, string>> {
    await this.ensureTagsLoaded();
    return this._localTagMap!;
  }

  async getTagAncestors(): Promise<Map<string, Set<string>>> {
    await this.ensureTagsLoaded();
    return this._tagAncestors!;
  }

  async getScenesPage(
    page: number,
    perPage: number,
    filters?: { studio?: string; performer?: string },
  ): Promise<{ scenes: StashScene[]; total: number }> {
    if (filters?.studio || filters?.performer) {
      const data = await this.callGQL(QUERY_SCENES_PAGE, {
        filter: { page: 1, per_page: -1, sort: "title", direction: "ASC" },
      });
      const find = data["findScenes"] as { count?: number; scenes?: StashScene[] };
      let all = find?.scenes ?? [];
      if (filters.studio) all = all.filter((s) => s.studio?.name === filters.studio);
      if (filters.performer)
        all = all.filter((s) => s.performers?.some((p) => p.name === filters.performer));
      const total = all.length;
      const start = (page - 1) * perPage;
      return { scenes: all.slice(start, start + perPage), total };
    }

    const data = await this.callGQL(QUERY_SCENES_PAGE, {
      filter: { page, per_page: perPage, sort: "title", direction: "ASC" },
    });
    const find = data["findScenes"] as { count?: number; scenes?: StashScene[] };
    return { scenes: find?.scenes ?? [], total: find?.count ?? 0 };
  }

  async getAllSceneIds(filters?: {
    studio?: string;
    performer?: string;
  }): Promise<{ ids: string[]; total: number }> {
    const data = await this.callGQL(QUERY_SCENE_IDS, {
      filter: { page: 1, per_page: -1, sort: "title", direction: "ASC" },
    });
    const find = data["findScenes"] as {
      count?: number;
      scenes?: Array<{
        id: string | number;
        stash_ids?: Array<{ stash_id: string; endpoint: string }>;
        studio?: { name: string } | null;
        performers?: Array<{ name: string }>;
      }>;
    };
    let all = find?.scenes ?? [];
    if (filters?.studio) all = all.filter((s) => s.studio?.name === filters.studio);
    if (filters?.performer)
      all = all.filter((s) => s.performers?.some((p) => p.name === filters!.performer));
    return { ids: all.map((s) => String(s.id)), total: all.length };
  }

  async getScene(sceneId: string): Promise<StashScene | null> {
    const data = await this.callGQL(QUERY_FIND_SCENE, { id: sceneId });
    return (data["findScene"] as StashScene | null) ?? null;
  }

  stashdbIdFor(scene: StashScene): string {
    return scene.stash_ids?.find((s) => s.endpoint === this.config.dbEndpoint)?.stash_id ?? "";
  }

  // Fetches StashDB tags for multiple scenes in a single HTTP request using GQL aliases.
  // Returns a map of stashdbId → tag name list.
  private async getStashdbSceneTagsBatch(
    entries: Array<{ stashdbId: string }>,
  ): Promise<Map<string, string[]>> {
    if (!entries.length) return new Map();

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKeyDb) headers["ApiKey"] = this.config.apiKeyDb;

    const aliases = entries
      .map((e, i) => `s${i}: findScene(id: ${JSON.stringify(e.stashdbId)}) { tags { name } }`)
      .join("\n");

    const resp = await fetch(this.config.dbEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: `{ ${aliases} }` }),
    });

    if (!resp.ok)
      throw new Error(`StashDB batch request failed: ${resp.status} ${resp.statusText}`);

    const json = (await resp.json()) as {
      data?: Record<string, { tags?: Array<{ name: string }> } | null>;
    };

    const result = new Map<string, string[]>();
    entries.forEach((e, i) => {
      result.set(e.stashdbId, json.data?.[`s${i}`]?.tags?.map((t) => t.name) ?? []);
    });
    return result;
  }

  // processScene accepts already-fetched stashdbTagNames so the caller can batch the
  // StashDB requests across multiple scenes. Pass [] for scenes with no stashdbId
  // (the early return fires before the parameter is used).
  async processScene(
    scene: StashScene,
    stashdbTagNames: string[],
    localTagNames: Set<string>,
    localTagMap: Map<string, string>,
    tagAncestors: Map<string, Set<string>>,
    dryRun: boolean,
    rules: TagRule[] = [],
  ): Promise<TagResult> {
    const sceneId = String(scene.id);
    const title = scene.title ?? `Scene ${sceneId}`;
    const stashdbId = this.stashdbIdFor(scene);
    const studio = scene.studio?.name ?? "";
    const performers = (scene.performers ?? []).map((p) => p.name);
    const performerCountries = (scene.performers ?? [])
      .map((p) => p.country)
      .filter((c): c is string => !!c);
    const performerCount = (scene.performers ?? []).length;

    if (!stashdbId) {
      return {
        sceneId,
        sceneTitle: title,
        stashdbId: "",
        matchedTags: [],
        filteredOut: [],
        newTags: [],
        removedTags: [],
        ruleLog: [],
        updated: false,
        error: "No StashDB ID",
      };
    }

    // 1. Intersect StashDB tags with local curated set
    const rawMatched = [...localTagNames].filter((t) => stashdbTagNames.includes(t)).sort();

    // 2. Drop parent tags when a more-specific child is also present
    const matched = filterRedundantParents(rawMatched, tagAncestors);
    const filteredOut = rawMatched.filter((t) => !matched.includes(t)).sort();

    // 3. Apply declarative tag rules against the union of existing + matched tags.
    //    Rules see the full picture so conditions like "has Lesbian AND mixed-gender tag"
    //    fire correctly even when one tag is existing and the other is incoming.
    const existingNames = new Set((scene.tags ?? []).map((t) => t.name));
    const combined = [...new Set([...existingNames, ...matched])];
    const {
      tags: adjusted,
      removed: removedByRules,
      ruleLog,
    } = applyTagRules(
      combined,
      studio,
      performers,
      performerCountries,
      performerCount,
      rules,
      localTagNames,
    );

    // 4. Compute what actually changes on the scene
    const adjustedSet = new Set(adjusted);
    const newTagNames = adjusted.filter((t) => !existingNames.has(t)).sort();
    const removedTagNames = [...existingNames]
      .filter((t) => removedByRules.has(t) && !adjustedSet.has(t))
      .sort();

    if (!newTagNames.length && !removedTagNames.length) {
      return {
        sceneId,
        sceneTitle: title,
        stashdbId,
        matchedTags: matched,
        filteredOut,
        newTags: [],
        removedTags: [],
        ruleLog,
        updated: false,
        error: "",
      };
    }

    if (dryRun) {
      return {
        sceneId,
        sceneTitle: title,
        stashdbId,
        matchedTags: matched,
        filteredOut,
        newTags: newTagNames,
        removedTags: removedTagNames,
        ruleLog,
        updated: false,
        error: "",
      };
    }

    // 5. Build final tag ID list: existing + new additions, minus rule removals
    const removedIds = new Set(
      (scene.tags ?? []).filter((t) => removedByRules.has(t.name)).map((t) => t.id),
    );
    const existingIds = (scene.tags ?? []).map((t) => t.id).filter((id) => !removedIds.has(id));
    const newIds = newTagNames.map((n) => localTagMap.get(n)).filter((id): id is string => !!id);
    const finalIds = [...new Set([...existingIds, ...newIds])];

    try {
      await this.callGQL(MUTATION_SCENE_UPDATE_TAGS, { id: sceneId, tag_ids: finalIds });
      log.info(
        { sceneId, added: newTagNames, removed: removedTagNames, filteredOut },
        "scene_tagged",
      );
      return {
        sceneId,
        sceneTitle: title,
        stashdbId,
        matchedTags: matched,
        filteredOut,
        newTags: newTagNames,
        removedTags: removedTagNames,
        ruleLog,
        updated: true,
        error: "",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ sceneId, error: msg }, "scene_update_failed");
      return {
        sceneId,
        sceneTitle: title,
        stashdbId,
        matchedTags: matched,
        filteredOut,
        newTags: newTagNames,
        removedTags: removedTagNames,
        ruleLog,
        updated: false,
        error: msg,
      };
    }
  }

  // Processes scenes in waves of `concurrency`:
  //   Phase 1 — concurrent Stash fetches for the whole wave
  //   Phase 2 — one batched StashDB request for all scenes in the wave that have a stashdbId
  //   Phase 3 — concurrent mutations
  //   Phase 4 — emit results
  // This reduces StashDB HTTP calls from N to ⌈N/concurrency⌉.
  async tagScenes(
    sceneIds: string[],
    localTagNames: Set<string>,
    localTagMap: Map<string, string>,
    tagAncestors: Map<string, Set<string>>,
    dryRun: boolean,
    rules: TagRule[],
    concurrency: number,
    onResult: (result: TagResult) => Promise<void>,
    isAborted: () => boolean,
  ): Promise<{ updated: number; errors: number }> {
    let updated = 0;
    let errors = 0;

    for (let i = 0; i < sceneIds.length; i += concurrency) {
      if (isAborted()) break;

      const wave = sceneIds.slice(i, i + concurrency);

      // Phase 1: fetch all scenes from Stash concurrently
      const sceneResults = await Promise.all(
        wave.map((id) =>
          this.getScene(id).catch((e: unknown) => (e instanceof Error ? e : new Error(String(e)))),
        ),
      );

      // Phase 2: batch StashDB tag fetch for scenes that have a stashdbId
      const stashdbEntries = sceneResults.flatMap((s, j) => {
        if (s instanceof Error || !s) return [];
        const stashdbId = this.stashdbIdFor(s);
        return stashdbId ? [{ stashdbId, waveIdx: j }] : [];
      });

      let stashdbTagMap = new Map<string, string[]>();
      let batchError = "";
      if (stashdbEntries.length) {
        try {
          stashdbTagMap = await this.getStashdbSceneTagsBatch(stashdbEntries);
        } catch (err) {
          batchError = err instanceof Error ? err.message : String(err);
          log.error({ error: batchError, wave: i / concurrency }, "stashdb_batch_failed");
        }
      }

      // Phase 3: process all scenes in the wave concurrently
      const waveResults = await Promise.all(
        wave.map(async (sceneId, j) => {
          const sceneOrErr = sceneResults[j];

          if (sceneOrErr instanceof Error) {
            return makeErrorResult(sceneId, sceneOrErr.message);
          }
          if (!sceneOrErr) {
            return makeErrorResult(sceneId, "Scene not found");
          }

          const stashdbId = this.stashdbIdFor(sceneOrErr);

          // Scene needs StashDB but the batch request failed
          if (stashdbId && batchError) {
            return makeErrorResult(
              sceneId,
              `StashDB fetch failed: ${batchError}`,
              sceneOrErr.title,
            );
          }

          const stashdbTags = stashdbTagMap.get(stashdbId) ?? [];
          return this.processScene(
            sceneOrErr,
            stashdbTags,
            localTagNames,
            localTagMap,
            tagAncestors,
            dryRun,
            rules,
          );
        }),
      );

      // Phase 4: emit
      for (const result of waveResults) {
        if (result.newTags.length || result.removedTags.length) updated++;
        if (result.error) errors++;
        await onResult(result);
      }
    }

    return { updated, errors };
  }
}
