import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { readSSE } from "@/utils/readSSE";
import type { BatchLogEntry } from "@/components/BatchProgress.vue";

export const useBulkTaggerStore = defineStore("bulkTagger", () => {
  // Config
  const dryRun = ref(false);
  const studioFilter = ref("");
  const performerFilter = ref("");

  // Run state
  const running = ref(false);
  const stopping = ref(false);
  const stopRequested = ref(false);

  // Progress
  const currentPage = ref(0);
  const totalPages = ref(0);
  const totalScenes = ref(0);
  const processedScenes = ref(0);
  const taggedScenes = ref(0);
  const errorCount = ref(0);
  const skippedScenes = ref(0);

  const log = ref<BatchLogEntry[]>([]);
  const MAX_LOG = 200;

  const progressPct = computed(() => {
    if (!totalPages.value) return 0;
    return Math.round((currentPage.value / totalPages.value) * 100);
  });

  function reset() {
    currentPage.value = 0;
    totalPages.value = 0;
    totalScenes.value = 0;
    processedScenes.value = 0;
    taggedScenes.value = 0;
    errorCount.value = 0;
    skippedScenes.value = 0;
    log.value = [];
  }

  function pushLog(entry: BatchLogEntry) {
    log.value.unshift(entry);
    if (log.value.length > MAX_LOG) log.value.length = MAX_LOG;
  }

  async function tagPage(page: number, sceneIds: string[]): Promise<void> {
    const form = new FormData();
    form.append("dry_run", dryRun.value ? "1" : "0");
    sceneIds.forEach((id) => form.append("scene_ids", id));

    const resp = await fetch("/tagger/tag", { method: "POST", body: form });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    await readSSE(resp, (d) => {
      if (d["type"] !== "result") return;

      processedScenes.value++;
      const id = String(d["scene_id"]);
      const title = String(d["scene_title"] ?? id);
      const newTags = (d["new_tags"] as string[] | undefined) ?? [];
      const removedTags = (d["removed_tags"] as string[] | undefined) ?? [];
      const filteredOut = (d["filtered_out"] as string[] | undefined) ?? [];
      const error = d["error"] as string | undefined;

      if (error && error !== "No StashDB ID") {
        errorCount.value++;
        pushLog({ id, title, variant: "error", text: error, page });
      } else if (error === "No StashDB ID") {
        skippedScenes.value++;
      } else if (!newTags.length && !removedTags.length) {
        pushLog({ id, title, variant: "muted", text: "up to date", filtered: filteredOut, page });
      } else {
        taggedScenes.value++;
        const parts: string[] = [];
        if (newTags.length) parts.push(`+${newTags.join(", ")}`);
        if (removedTags.length) parts.push(`−${removedTags.join(", ")}`);
        pushLog({
          id,
          title,
          variant: dryRun.value ? "dry" : "ok",
          text: parts.join(" "),
          filtered: filteredOut,
          page,
        });
      }
    });
  }

  async function start() {
    if (running.value) return;
    reset();
    running.value = true;
    stopping.value = false;
    stopRequested.value = false;

    try {
      const perPage = 50;
      let p = 1;

      while (true) {
        if (stopRequested.value) break;

        const params = new URLSearchParams({ page: String(p), per_page: String(perPage) });
        if (studioFilter.value) params.set("studio", studioFilter.value);
        if (performerFilter.value) params.set("performer", performerFilter.value);

        const resp = await fetch(`/api/tagger/scenes?${params}`);
        const data = await resp.json();

        totalPages.value = data.total_pages ?? 1;
        totalScenes.value = data.total ?? 0;
        currentPage.value = p;

        const scenes: Array<{ id: string; stashdb_id?: string }> = data.scenes ?? [];
        const eligible = scenes.filter((s) => s.stashdb_id);

        if (eligible.length > 0 && !stopRequested.value) {
          await tagPage(
            p,
            eligible.map((s) => String(s.id)),
          );
        }

        if (p >= totalPages.value || stopRequested.value) break;
        p++;
      }
    } finally {
      running.value = false;
      stopping.value = false;
    }
  }

  function stop() {
    stopRequested.value = true;
    stopping.value = true;
  }

  return {
    dryRun,
    studioFilter,
    performerFilter,
    running,
    stopping,
    stopRequested,
    currentPage,
    totalPages,
    totalScenes,
    processedScenes,
    taggedScenes,
    errorCount,
    skippedScenes,
    log,
    progressPct,
    start,
    stop,
    reset,
  };
});
