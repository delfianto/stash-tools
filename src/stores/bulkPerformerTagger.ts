import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { readSSE } from "@/utils/readSSE";
import type { BatchLogEntry } from "@/components/BatchProgress.vue";

export const useBulkPerformerTaggerStore = defineStore("bulkPerformerTagger", () => {
  // Config
  const dryRun = ref(false);
  const countryFilter = ref("");
  const ethnicityFilter = ref("");

  // Filter options (all performers, not just current page)
  const availableCountries = ref<string[]>([]);
  const availableEthnicities = ref<string[]>([]);

  // Run state
  const running = ref(false);
  const stopping = ref(false);
  const stopRequested = ref(false);

  // Progress
  const currentPage = ref(0);
  const totalPages = ref(0);
  const processedCount = ref(0);
  const updatedCount = ref(0);
  const errorCount = ref(0);

  const log = ref<BatchLogEntry[]>([]);
  const MAX_LOG = 200;

  const progressPct = computed(() => {
    if (!totalPages.value) return 0;
    return Math.round((currentPage.value / totalPages.value) * 100);
  });

  function reset() {
    currentPage.value = 0;
    totalPages.value = 0;
    processedCount.value = 0;
    updatedCount.value = 0;
    errorCount.value = 0;
    log.value = [];
  }

  function pushLog(entry: BatchLogEntry) {
    log.value.unshift(entry);
    if (log.value.length > MAX_LOG) log.value.length = MAX_LOG;
  }

  async function tagPage(performerIds: string[]): Promise<void> {
    const form = new FormData();
    form.append("dry_run", dryRun.value ? "1" : "0");
    performerIds.forEach((id) => form.append("performer_ids", id));

    const resp = await fetch("/performer-tagger/tag", { method: "POST", body: form });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

    await readSSE(resp, (d) => {
      if (d["type"] !== "result") return;

      processedCount.value++;
      const id = String(d["performer_id"]);
      const title = String(d["performer_name"] ?? id);
      const addedTags = (d["added_tags"] as string[] | undefined) ?? [];
      const removedTags = (d["removed_tags"] as string[] | undefined) ?? [];
      const error = d["error"] as string | undefined;

      if (error) {
        errorCount.value++;
        pushLog({ id, title, variant: "error", text: error });
      } else if (!addedTags.length && !removedTags.length) {
        pushLog({ id, title, variant: "muted", text: "up to date" });
      } else {
        updatedCount.value++;
        const parts: string[] = [];
        if (addedTags.length) parts.push(`+${addedTags.join(", ")}`);
        if (removedTags.length) parts.push(`−${removedTags.join(", ")}`);
        pushLog({ id, title, variant: dryRun.value ? "dry" : "ok", text: parts.join(" ") });
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
        if (countryFilter.value) params.set("country", countryFilter.value);
        if (ethnicityFilter.value) params.set("ethnicity", ethnicityFilter.value);

        const resp = await fetch(`/api/performer-tagger/performers?${params}`);
        const data = await resp.json();

        totalPages.value = data.total_pages ?? 1;
        currentPage.value = p;

        const performers: Array<{ id: string }> = data.performers ?? [];

        if (performers.length > 0 && !stopRequested.value) {
          await tagPage(performers.map((perf) => String(perf.id)));
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

  async function loadMeta() {
    try {
      const resp = await fetch("/api/performer-tagger/meta");
      const data = await resp.json();
      availableCountries.value = (data.countries as string[]) ?? [];
      availableEthnicities.value = (data.ethnicities as string[]) ?? [];
    } catch {
      // silently ignore — filters just won't be populated
    }
  }

  return {
    dryRun,
    countryFilter,
    ethnicityFilter,
    availableCountries,
    availableEthnicities,
    running,
    stopping,
    currentPage,
    totalPages,
    processedCount,
    updatedCount,
    errorCount,
    log,
    progressPct,
    start,
    stop,
    reset,
    loadMeta,
  };
});
