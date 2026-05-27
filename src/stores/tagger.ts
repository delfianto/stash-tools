import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { readSSE } from "@/utils/readSSE";
import type { Scene, SceneStatus } from "@shared/types";

export type { Scene, SceneStatus };

export const useTaggerStore = defineStore("tagger", () => {
  const scenes = ref<Scene[]>([]);
  const tags = ref<string[]>([]);
  const tagCount = ref(0);
  const page = ref(1);
  const perPage = ref(50);
  const total = ref(0);
  const totalPages = ref(1);
  const loadingScenes = ref(false);
  const loadingTags = ref(false);
  const tagging = ref(false);
  const dryRun = ref(false);
  const selected = ref<Set<string>>(new Set());
  const statuses = ref<Map<string, SceneStatus>>(new Map());
  const progressText = ref("");

  // Filters
  const studioFilter = ref("");
  const performerFilter = ref("");

  const uniqueStudios = computed(() =>
    [...new Set(scenes.value.map((s) => s.studio).filter(Boolean))].sort(),
  );

  const uniquePerformers = computed(() =>
    [...new Set(scenes.value.flatMap((s) => s.performers))].sort(),
  );

  const filteredScenes = computed(() => scenes.value);

  async function loadTags() {
    loadingTags.value = true;
    try {
      const resp = await fetch("/api/tagger/tags");
      const data = await resp.json();
      tags.value = data.tags ?? [];
      tagCount.value = data.count ?? 0;
    } finally {
      loadingTags.value = false;
    }
  }

  async function loadScenes(p = page.value) {
    loadingScenes.value = true;
    statuses.value = new Map();
    try {
      const params = new URLSearchParams({ page: String(p), per_page: String(perPage.value) });
      if (studioFilter.value) params.set("studio", studioFilter.value);
      if (performerFilter.value) params.set("performer", performerFilter.value);
      const resp = await fetch(`/api/tagger/scenes?${params}`);
      const data = await resp.json();
      scenes.value = (data.scenes ?? []).map((s: Record<string, unknown>) => ({
        id: String(s["id"]),
        title: String(s["title"]),
        stashdbId: String(s["stashdb_id"] ?? ""),
        tags: (s["tags"] as string[]) ?? [],
        studio: String(s["studio"] ?? ""),
        performers: (s["performers"] as string[]) ?? [],
        stashUrl: String(s["stash_url"] ?? ""),
        stashdbUrl: String(s["stashdb_url"] ?? ""),
      }));
      total.value = data.total ?? 0;
      page.value = data.page ?? p;
      totalPages.value = data.total_pages ?? 1;
      selected.value = new Set(scenes.value.filter((s) => s.stashdbId).map((s) => s.id));
    } finally {
      loadingScenes.value = false;
    }
  }

  async function tagSelected() {
    const ids = [...selected.value];
    if (!ids.length) return;

    tagging.value = true;
    progressText.value = `Tagging ${ids.length} scene(s)…`;

    for (const id of ids) {
      statuses.value.set(id, { variant: "loading", text: "…" });
    }

    let done = 0;
    let tagged = 0;
    let errors = 0;

    const form = new FormData();
    form.append("dry_run", dryRun.value ? "1" : "0");
    ids.forEach((id) => form.append("scene_ids", id));

    try {
      const resp = await fetch("/tagger/tag", { method: "POST", body: form });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      await readSSE(resp, (d) => {
        if (d["type"] === "result") {
          done++;
          const newTags = (d["new_tags"] as string[] | undefined) ?? [];
          if (newTags.length) tagged++;
          if (d["error"]) errors++;

          const sceneId = String(d["scene_id"]);
          const filtered = (d["filtered_out"] as string[] | undefined) ?? [];

          if (d["error"] && d["error"] !== "No StashDB ID") {
            statuses.value.set(sceneId, { variant: "error", text: String(d["error"]) });
          } else if (!newTags.length) {
            if (d["error"] === "No StashDB ID") {
              statuses.value.set(sceneId, { variant: "muted", text: "no StashDB ID" });
            } else {
              statuses.value.set(sceneId, { variant: "ok", text: "up to date", filtered });
            }
          } else if (dryRun.value) {
            statuses.value.set(sceneId, { variant: "dry", text: newTags.join(", "), filtered });
          } else {
            statuses.value.set(sceneId, { variant: "ok", text: newTags.join(", "), filtered });
          }

          const verb = dryRun.value ? "would tag" : "tagged";
          progressText.value =
            `${done} / ${ids.length} done` +
            (tagged ? ` — ${tagged} ${verb}` : "") +
            (errors ? ` — ${errors} error(s)` : "");
        } else if (d["type"] === "done") {
          const verb = dryRun.value ? "would tag" : "tagged";
          progressText.value =
            `Done — ${Number(d["updated"])} ${verb}` +
            (d["errors"] ? `, ${Number(d["errors"])} error(s)` : "");
        } else if (d["type"] === "error") {
          progressText.value = `Error: ${String(d["error"])}`;
        }
      });
    } catch (err) {
      progressText.value = `Request failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      tagging.value = false;
    }
  }

  watch([studioFilter, performerFilter], () => {
    page.value = 1;
    loadScenes(1);
  });

  function toggleSelect(id: string) {
    if (selected.value.has(id)) selected.value.delete(id);
    else selected.value.add(id);
  }

  function selectAll(val: boolean) {
    if (val) {
      selected.value = new Set(filteredScenes.value.filter((s) => s.stashdbId).map((s) => s.id));
    } else {
      selected.value = new Set();
    }
  }

  return {
    scenes,
    tags,
    tagCount,
    page,
    perPage,
    total,
    totalPages,
    loadingScenes,
    loadingTags,
    tagging,
    dryRun,
    selected,
    statuses,
    progressText,
    studioFilter,
    performerFilter,
    uniqueStudios,
    uniquePerformers,
    filteredScenes,
    loadTags,
    loadScenes,
    tagSelected,
    toggleSelect,
    selectAll,
  };
});
