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

const QUERY_STASHDB_SCENE = `
query FindScene($id: ID!) {
  findScene(id: $id) {
    id
    tags { name }
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
      // Load all scenes and filter in application code to avoid ID lookups
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

  async getScene(sceneId: string): Promise<StashScene | null> {
    const data = await this.callGQL(QUERY_FIND_SCENE, { id: sceneId });
    return (data["findScene"] as StashScene | null) ?? null;
  }

  stashdbIdFor(scene: StashScene): string {
    return scene.stash_ids?.find((s) => s.endpoint === this.config.dbEndpoint)?.stash_id ?? "";
  }

  async getStashdbSceneTags(stashdbId: string): Promise<string[]> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.config.apiKeyDb) headers["ApiKey"] = this.config.apiKeyDb;

    const resp = await fetch(this.config.dbEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ query: QUERY_STASHDB_SCENE, variables: { id: stashdbId } }),
    });

    if (!resp.ok) throw new Error(`StashDB request failed: ${resp.status} ${resp.statusText}`);

    const json = (await resp.json()) as {
      data?: { findScene?: { tags?: Array<{ name: string }> } };
    };
    return json.data?.findScene?.tags?.map((t) => t.name) ?? [];
  }

  async processScene(
    scene: StashScene,
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

    let stashdbTagNames: string[];
    try {
      stashdbTagNames = await this.getStashdbSceneTags(stashdbId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ sceneId, error: msg }, "stashdb_fetch_failed");
      return {
        sceneId,
        sceneTitle: title,
        stashdbId,
        matchedTags: [],
        filteredOut: [],
        newTags: [],
        removedTags: [],
        ruleLog: [],
        updated: false,
        error: msg,
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
    const newIds = newTagNames.map((name) => localTagMap.get(name)!);
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
}
