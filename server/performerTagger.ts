import { makeClient, type GQLClient } from "./client.ts";
import type { Config } from "./config.ts";
import type { PerformerTagResult } from "@shared/types";
import { parseCupCategory } from "./measurementParser.ts";
import { applyPerformerRules, type PerformerRule } from "./performerRules.ts";
import pino from "pino";

const log = pino({ name: "performerTagger" });

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

const QUERY_LOCAL_TAGS = `
query FindAllTags {
  findTags(filter: { per_page: -1 }) {
    tags { id name }
  }
}
`;

const QUERY_PERFORMERS_PAGE = `
query FindPerformers($filter: FindFilterType!) {
  findPerformers(filter: $filter) {
    count
    performers {
      id
      name
      country
      ethnicity
      measurements
      tags { id name }
    }
  }
}
`;

const QUERY_FIND_PERFORMER = `
query FindPerformer($id: ID!) {
  findPerformer(id: $id) {
    id
    name
    country
    ethnicity
    measurements
    tags { id name }
  }
}
`;

const MUTATION_PERFORMER_UPDATE = `
mutation PerformerUpdate($id: ID!, $tag_ids: [ID!]!) {
  performerUpdate(input: { id: $id, tag_ids: $tag_ids }) {
    id
  }
}
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RawPerformer {
  id: string | number;
  name?: string;
  country?: string | null;
  ethnicity?: string | null;
  measurements?: string | null;
  tags?: Array<{ id: string; name: string }>;
}

// ---------------------------------------------------------------------------
// PerformerTagger
// ---------------------------------------------------------------------------

export class PerformerTagger {
  private callGQL: GQLClient;
  private _localTagMap: Map<string, string> | null = null;

  constructor(private readonly config: Config) {
    this.callGQL = makeClient(config);
  }

  private async ensureTagsLoaded(): Promise<void> {
    if (this._localTagMap) return;
    const data = await this.callGQL(QUERY_LOCAL_TAGS, {});
    const tags = (data["findTags"] as { tags?: Array<{ id: string; name: string }> })?.tags ?? [];
    this._localTagMap = new Map(tags.map((t) => [t.name, t.id]));
    log.info({ count: this._localTagMap.size }, "performer_local_tags_loaded");
  }

  async getLocalTagMap(): Promise<Map<string, string>> {
    await this.ensureTagsLoaded();
    return this._localTagMap!;
  }

  async getPerformersPage(
    page: number,
    perPage: number,
    filters?: { country?: string; ethnicity?: string },
  ): Promise<{ performers: RawPerformer[]; total: number }> {
    const data = await this.callGQL(QUERY_PERFORMERS_PAGE, {
      filter: { page: 1, per_page: -1, sort: "name", direction: "ASC" },
    });
    const find = data["findPerformers"] as {
      count?: number;
      performers?: RawPerformer[];
    };
    let all = find?.performers ?? [];

    if (filters?.country) all = all.filter((p) => p.country === filters.country);
    if (filters?.ethnicity)
      all = all.filter((p) => p.ethnicity?.toLowerCase() === filters.ethnicity!.toLowerCase());

    const total = all.length;
    const start = (page - 1) * perPage;
    return { performers: all.slice(start, start + perPage), total };
  }

  async getPerformer(performerId: string): Promise<RawPerformer | null> {
    const data = await this.callGQL(QUERY_FIND_PERFORMER, { id: performerId });
    return (data["findPerformer"] as RawPerformer | null) ?? null;
  }

  async processPerformer(
    performer: RawPerformer,
    localTagMap: Map<string, string>,
    rules: PerformerRule[],
    dryRun: boolean,
  ): Promise<PerformerTagResult> {
    const performerId = String(performer.id);
    const name = performer.name ?? `Performer ${performerId}`;
    const country = performer.country ?? "";
    const ethnicity = performer.ethnicity ?? "";
    const measurements = performer.measurements ?? "";
    const cupCategory = parseCupCategory(measurements);
    const localTagNames = new Set(localTagMap.keys());

    const existingTags = performer.tags ?? [];
    const existingNames = new Set(existingTags.map((t) => t.name));

    const {
      tags: adjusted,
      removed: removedByRules,
      ruleLog,
    } = applyPerformerRules(
      [...existingNames],
      country,
      ethnicity,
      cupCategory,
      rules,
      localTagNames,
    );

    const adjustedSet = new Set(adjusted);
    const addedTags = adjusted.filter((t) => !existingNames.has(t)).sort();
    const removedTags = [...existingNames]
      .filter((t) => removedByRules.has(t) && !adjustedSet.has(t))
      .sort();

    if (!addedTags.length && !removedTags.length) {
      return {
        performerId,
        performerName: name,
        measurements,
        cupCategory: cupCategory ?? "",
        addedTags: [],
        removedTags: [],
        ruleLog,
        updated: false,
        error: "",
      };
    }

    if (dryRun) {
      return {
        performerId,
        performerName: name,
        measurements,
        cupCategory: cupCategory ?? "",
        addedTags,
        removedTags,
        ruleLog,
        updated: false,
        error: "",
      };
    }

    const removedIds = new Set(
      existingTags.filter((t) => removedByRules.has(t.name)).map((t) => t.id),
    );
    const keptIds = existingTags.map((t) => t.id).filter((id) => !removedIds.has(id));
    const newIds = addedTags.map((n) => localTagMap.get(n)).filter((id): id is string => !!id);
    const finalIds = [...new Set([...keptIds, ...newIds])];

    try {
      await this.callGQL(MUTATION_PERFORMER_UPDATE, { id: performerId, tag_ids: finalIds });
      log.info({ performerId, added: addedTags, removed: removedTags }, "performer_tagged");
      return {
        performerId,
        performerName: name,
        measurements,
        cupCategory: cupCategory ?? "",
        addedTags,
        removedTags,
        ruleLog,
        updated: true,
        error: "",
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error({ performerId, error: msg }, "performer_update_failed");
      return {
        performerId,
        performerName: name,
        measurements,
        cupCategory: cupCategory ?? "",
        addedTags,
        removedTags,
        ruleLog,
        updated: false,
        error: msg,
      };
    }
  }
}
