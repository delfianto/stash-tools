import { readFileSync, existsSync, writeFileSync } from "node:fs";
import type { CupCategory } from "./measurementParser.ts";
import pino from "pino";

const log = pino({ name: "performerRules" });

// ---------------------------------------------------------------------------
// Rule schema
// ---------------------------------------------------------------------------

interface TagsCondition {
  any?: string[];
  all?: string[];
  none?: string[];
}

interface PerformerRuleCondition {
  // ISO 3166-1 alpha-2 country code, e.g. "JP", "GB"
  country?: { any?: string[]; none?: string[] };
  // Stash ethnicity string, e.g. "Caucasian", "Asian" — case-insensitive match
  ethnicity?: { any?: string[] };
  // Derived from parsed measurements
  cup_category?: { any?: CupCategory[] };
  // Existing tags on the performer
  tags?: TagsCondition;
}

export interface PerformerRule {
  description?: string;
  // When true, all add-targets from OTHER exclusive rules are automatically removed
  // when this rule fires. Use this for mutually exclusive tag groups (e.g. cup sizes)
  // so the correct tag always replaces the wrong one — even across batch runs.
  exclusive?: boolean;
  if: PerformerRuleCondition;
  then: { add?: string[]; remove?: string[] };
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

export function loadPerformerRules(filePath: string): PerformerRule[] {
  if (!existsSync(filePath)) {
    log.debug({ filePath }, "performer_rules_file_not_found");
    return [];
  }
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      log.warn({ filePath }, "performer_rules_must_be_array");
      return [];
    }
    log.info({ filePath, count: parsed.length }, "performer_rules_loaded");
    return parsed as PerformerRule[];
  } catch (err) {
    log.error({ filePath, error: String(err) }, "performer_rules_load_failed");
    return [];
  }
}

export function validatePerformerRules(raw: string): { count: number; error: string } {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return { count: 0, error: "Must be a JSON array" };
    return { count: parsed.length, error: "" };
  } catch (err) {
    return { count: 0, error: String(err) };
  }
}

export function readPerformerRulesRaw(filePath: string): string {
  if (!existsSync(filePath)) return "[]";
  return readFileSync(filePath, "utf-8");
}

export function writePerformerRules(
  filePath: string,
  raw: string,
): { count: number; error: string } {
  const result = validatePerformerRules(raw);
  if (result.error) return result;
  writeFileSync(filePath, raw, "utf-8");
  log.info({ filePath, count: result.count }, "performer_rules_saved");
  return result;
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

function conditionMatches(
  cond: PerformerRuleCondition,
  tagSet: Set<string>,
  country: string,
  ethnicity: string,
  cupCategory: CupCategory | null,
): boolean {
  if (cond.country?.any?.length) {
    // Unknown country → can't confirm → skip rule
    if (!country) return false;
    if (!cond.country.any.includes(country)) return false;
  }
  if (cond.country?.none?.length) {
    // Unknown country → can't confirm absence → skip rule
    if (!country) return false;
    if (cond.country.none.includes(country)) return false;
  }

  if (cond.ethnicity?.any?.length) {
    if (!ethnicity) return false;
    const lc = ethnicity.toLowerCase();
    if (!cond.ethnicity.any.some((e) => e.toLowerCase() === lc)) return false;
  }

  if (cond.cup_category?.any?.length) {
    // No measurements → can't determine cup → skip rule
    if (!cupCategory || !cond.cup_category.any.includes(cupCategory)) return false;
  }

  if (cond.tags) {
    const { any: anyTags, all: allTags, none: noneTags } = cond.tags;
    if (anyTags?.length && !anyTags.some((t) => tagSet.has(t))) return false;
    if (allTags?.length && !allTags.every((t) => tagSet.has(t))) return false;
    if (noneTags?.length && noneTags.some((t) => tagSet.has(t))) return false;
  }

  return true;
}

export interface PerformerApplyResult {
  tags: string[];
  removed: Set<string>;
  ruleLog: string[];
}

export function applyPerformerRules(
  tags: string[],
  country: string,
  ethnicity: string,
  cupCategory: CupCategory | null,
  rules: PerformerRule[],
  localTagNames: Set<string>,
): PerformerApplyResult {
  const tagSet = new Set(tags);
  const removed = new Set<string>();
  const ruleLog: string[] = [];

  // Union of all add-targets from exclusive rules — the full "exclusive group".
  // When any exclusive rule fires, every tag in this set that isn't being added
  // by the firing rule is automatically removed. This makes mutually exclusive
  // groups (e.g. cup sizes) self-correcting across batch runs without relying on
  // hand-written remove lists in every rule.
  const exclusiveGroupTags = new Set<string>();
  for (const rule of rules) {
    if (rule.exclusive) {
      for (const t of rule.then?.add ?? []) exclusiveGroupTags.add(t);
    }
  }

  for (const rule of rules) {
    if (!rule.if || !rule.then) {
      log.warn({ description: rule.description }, "performer_rule_missing_if_or_then_skipped");
      continue;
    }
    if (!conditionMatches(rule.if, tagSet, country, ethnicity, cupCategory)) continue;

    const desc = rule.description ?? "unnamed rule";
    const tagsToAdd = new Set(rule.then.add ?? []);
    const actualRemovals: string[] = [];
    const actualAdditions: string[] = [];

    // Exclusive rule: sweep out all other members of the exclusive group first.
    if (rule.exclusive) {
      for (const t of exclusiveGroupTags) {
        if (!tagsToAdd.has(t) && tagSet.has(t)) {
          tagSet.delete(t);
          removed.add(t);
          actualRemovals.push(t);
        }
      }
    }

    for (const t of rule.then.remove ?? []) {
      if (tagSet.has(t)) {
        tagSet.delete(t);
        removed.add(t);
        actualRemovals.push(t);
      }
    }

    for (const t of tagsToAdd) {
      if (!localTagNames.has(t)) {
        log.warn({ tag: t, rule: desc }, "performer_rule_unknown_tag_skipped");
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
        "performer_rule_applied",
      );
    }
  }

  return { tags: [...tagSet].sort(), removed, ruleLog };
}
