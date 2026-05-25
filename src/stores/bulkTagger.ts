import { defineStore } from "pinia";
import { ref, computed } from "vue";

export interface LogEntry {
  page: number;
  sceneId: string;
  title: string;
  variant: "ok" | "error" | "dry" | "muted";
  text: string;
  filtered?: string[];
}

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
  const skippedScenes = ref(0); // no StashDB ID

  // Live log (last N entries, newest first)
  const log = ref<LogEntry[]>([]);
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

  function pushLog(entry: LogEntry) {
    log.value.unshift(entry);
    if (log.value.length > MAX_LOG) log.value.length = MAX_LOG;
  }

  async function tagPage(page: number, sceneIds: string[]): Promise<void> {
    const form = new FormData();
    form.append("dry_run", dryRun.value ? "1" : "0");
    sceneIds.forEach((id) => form.append("scene_ids", id));

    const resp = await fetch("/tagger/tag", { method: "POST", body: form });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    const reader = resp.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const chunks = buf.split("\n\n");
      buf = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const line = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const d = JSON.parse(line.slice(6));

        if (d.type === "result") {
          processedScenes.value++;
          const sceneId = String(d.scene_id);
          const title = String(d.scene_title ?? sceneId);

          if (d.error && d.error !== "No StashDB ID") {
            errorCount.value++;
            pushLog({ page, sceneId, title, variant: "error", text: d.error });
          } else if (d.error === "No StashDB ID") {
            skippedScenes.value++;
            // not logged — these shouldn't appear since we only send stashdb-linked scenes
          } else if (!d.new_tags?.length) {
            pushLog({
              page,
              sceneId,
              title,
              variant: "muted",
              text: "up to date",
              filtered: d.filtered_out ?? [],
            });
          } else if (dryRun.value) {
            taggedScenes.value++;
            pushLog({
              page,
              sceneId,
              title,
              variant: "dry",
              text: d.new_tags.join(", "),
              filtered: d.filtered_out ?? [],
            });
          } else {
            taggedScenes.value++;
            pushLog({
              page,
              sceneId,
              title,
              variant: "ok",
              text: d.new_tags.join(", "),
              filtered: d.filtered_out ?? [],
            });
          }
        }
      }
    }
  }

  async function start() {
    if (running.value) return;
    reset();
    running.value = true;
    stopping.value = false;
    stopRequested.value = false;

    try {
      // First pass: load page 1 to get totalPages and totalScenes
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

        const scenes: Array<{ id: string; stashdb_id?: string; title?: string }> =
          data.scenes ?? [];
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
