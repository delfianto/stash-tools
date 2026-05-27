// Shared types between the Bun backend and the Vue frontend.

// ---------------------------------------------------------------------------
// Performer Tagger
// ---------------------------------------------------------------------------

export interface Performer {
  id: string;
  name: string;
  country: string;
  ethnicity: string;
  measurements: string;
  cupCategory: string; // "small" | "medium" | "large" | ""
  tags: string[];
  stashUrl: string;
}

export interface PerformerTagResult {
  performerId: string;
  performerName: string;
  measurements: string;
  cupCategory: string;
  addedTags: string[];
  removedTags: string[];
  ruleLog: string[];
  updated: boolean;
  error: string;
}

export interface PerformerStatus {
  variant: "ok" | "error" | "dry" | "muted" | "loading";
  text: string;
}

// ---------------------------------------------------------------------------
// Renamer
// ---------------------------------------------------------------------------

export interface Candidate {
  currentPath: string;
  renameTarget: string;
  organizeTarget: string;
  sceneId: string;
  sceneTitle: string;
  studio: string;
  performers: string[];
  date: string;
}

export interface MoveResult {
  src: string;
  dst: string;
  ok: boolean;
  error: string;
  dryRun: boolean;
}

// ---------------------------------------------------------------------------
// Tagger
// ---------------------------------------------------------------------------

export interface Scene {
  id: string;
  title: string;
  stashdbId: string;
  tags: string[];
  studio: string;
  performers: string[];
  stashUrl: string;
  stashdbUrl: string;
}

export interface TagResult {
  sceneId: string;
  sceneTitle: string;
  stashdbId: string;
  matchedTags: string[];
  filteredOut: string[];
  newTags: string[];
  removedTags: string[];
  ruleLog: string[];
  updated: boolean;
  error: string;
}

export interface SceneStatus {
  variant: "ok" | "error" | "dry" | "muted" | "pending" | "loading";
  text: string;
  filtered?: string[];
}

// ---------------------------------------------------------------------------
// SSE event shapes (POST /tagger/tag)
// ---------------------------------------------------------------------------

export interface SseResult {
  type: "result";
  scene_id: string;
  scene_title: string;
  matched: string[];
  filtered_out: string[];
  new_tags: string[];
  removed_tags: string[];
  rule_log: string[];
  updated: boolean;
  dry_run: boolean;
  error: string;
}

export interface SseDone {
  type: "done";
  updated: number;
  errors: number;
  dry_run: boolean;
}

export interface SseError {
  type: "error";
  error: string;
}
