import { readFileSync, existsSync } from "node:fs";
import pino from "pino";

const log = pino({ name: "tagRules" });

// ---------------------------------------------------------------------------
// Rule schema
// ---------------------------------------------------------------------------

interface TagsCondition {
  any?: string[];
  all?: string[];
  none?: string[];
}

interface PerformerCountCondition {
  eq?: number;
  gt?: number;
  gte?: number;
  lt?: number;
  lte?: number;
}

interface RuleCondition {
  tags?: TagsCondition;
  studio?: { any?: string[] };
  performers?: { any?: string[] };
  // ISO 3166-1 alpha-2 country codes, e.g. "GB", "DE", "FR"
  performer_country?: { any?: string[]; none?: string[] };
  // Numeric comparisons against the scene's performer count
  performer_count?: PerformerCountCondition;
}

export interface TagRule {
  description?: string;
  if: RuleCondition;
  then: { add?: string[]; remove?: string[] };
}

// ---------------------------------------------------------------------------
// Loader — reads fresh from disk each call so edits take effect without restart
// ---------------------------------------------------------------------------

export function loadTagRules(filePath: string): TagRule[] {
  if (!existsSync(filePath)) {
    log.debug({ filePath }, "tag_rules_file_not_found");
    return [];
  }
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      log.warn({ filePath }, "tag_rules_must_be_array");
      return [];
    }
    log.info({ filePath, count: parsed.length }, "tag_rules_loaded");
    return parsed as TagRule[];
  } catch (err) {
    log.error({ filePath, error: String(err) }, "tag_rules_load_failed");
    return [];
  }
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

function conditionMatches(
  cond: RuleCondition,
  tagSet: Set<string>,
  studio: string,
  performers: string[],
  performerCountries: string[],
  performerCount: number,
): boolean {
  if (cond.tags) {
    const { any: anyTags, all: allTags, none: noneTags } = cond.tags;
    if (anyTags?.length && !anyTags.some((t) => tagSet.has(t))) return false;
    if (allTags?.length && !allTags.every((t) => tagSet.has(t))) return false;
    if (noneTags?.length && noneTags.some((t) => tagSet.has(t))) return false;
  }

  if (cond.studio?.any?.length && !cond.studio.any.includes(studio)) return false;

  if (cond.performers?.any?.length) {
    const pset = new Set(performers);
    if (!cond.performers.any.some((p) => pset.has(p))) return false;
  }

  if (cond.performer_country) {
    const cset = new Set(performerCountries);
    if (cond.performer_country.any?.length && !cond.performer_country.any.some((c) => cset.has(c)))
      return false;
    if (cond.performer_country.none?.length && cond.performer_country.none.some((c) => cset.has(c)))
      return false;
  }

  if (cond.performer_count) {
    const { eq, gt, gte, lt, lte } = cond.performer_count;
    if (eq !== undefined && performerCount !== eq) return false;
    if (gt !== undefined && performerCount <= gt) return false;
    if (gte !== undefined && performerCount < gte) return false;
    if (lt !== undefined && performerCount >= lt) return false;
    if (lte !== undefined && performerCount > lte) return false;
  }

  return true;
}

export interface ApplyResult {
  tags: string[];
  removed: Set<string>;
  ruleLog: string[];
}

/**
 * Apply declarative tag rules against the current working tag set.
 *
 * Rules operate on the union of existing scene tags and newly matched tags so
 * conditions can reference either. Tags removed by rules are tracked separately
 * so the caller can also strip them from the scene's existing tag list.
 *
 * Unknown tags (not in localTagNames) are skipped with a warning rather than
 * crashing — the rules file may reference tags that haven't been created yet.
 */
export function applyTagRules(
  tags: string[],
  studio: string,
  performers: string[],
  performerCountries: string[],
  performerCount: number,
  rules: TagRule[],
  localTagNames: Set<string>,
): ApplyResult {
  const tagSet = new Set(tags);
  const removed = new Set<string>();
  const ruleLog: string[] = [];

  for (const rule of rules) {
    if (!conditionMatches(rule.if, tagSet, studio, performers, performerCountries, performerCount))
      continue;

    const desc = rule.description ?? "unnamed rule";
    const actualRemovals: string[] = [];
    const actualAdditions: string[] = [];

    for (const t of rule.then.remove ?? []) {
      if (tagSet.has(t)) {
        tagSet.delete(t);
        removed.add(t);
        actualRemovals.push(t);
      }
    }

    for (const t of rule.then.add ?? []) {
      if (!localTagNames.has(t)) {
        log.warn({ tag: t, rule: desc }, "tag_rule_unknown_tag_skipped");
        continue;
      }
      if (!tagSet.has(t)) {
        tagSet.add(t);
        actualAdditions.push(t);
      }
    }

    if (actualRemovals.length || actualAdditions.length) {
      ruleLog.push(`[${desc}] -[${actualRemovals.join(", ")}] +[${actualAdditions.join(", ")}]`);
      log.debug(
        { rule: desc, removed: actualRemovals, added: actualAdditions },
        "tag_rule_applied",
      );
    }
  }

  return { tags: [...tagSet].sort(), removed, ruleLog };
}
