import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { readSSE } from "@/utils/readSSE";
import type { Performer, PerformerStatus } from "@shared/types";

export const usePerformerTaggerStore = defineStore("performerTagger", () => {
  const performers = ref<Performer[]>([]);
  const page = ref(1);
  const perPage = ref(50);
  const total = ref(0);
  const totalPages = ref(1);
  const loading = ref(false);
  const tagging = ref(false);
  const dryRun = ref(false);
  const selected = ref<Set<string>>(new Set());
  const statuses = ref<Map<string, PerformerStatus>>(new Map());
  const progressText = ref("");

  // Filters
  const countryFilter = ref("");
  const ethnicityFilter = ref("");

  const uniqueCountries = computed(() =>
    [...new Set(performers.value.map((p) => p.country).filter(Boolean))].sort(),
  );

  const uniqueEthnicities = computed(() =>
    [...new Set(performers.value.map((p) => p.ethnicity).filter(Boolean))].sort(),
  );

  async function loadPerformers(p = page.value) {
    loading.value = true;
    statuses.value = new Map();
    try {
      const params = new URLSearchParams({ page: String(p), per_page: String(perPage.value) });
      if (countryFilter.value) params.set("country", countryFilter.value);
      if (ethnicityFilter.value) params.set("ethnicity", ethnicityFilter.value);
      const resp = await fetch(`/api/performer-tagger/performers?${params}`);
      const data = await resp.json();
      performers.value = (data.performers ?? []).map((p: Record<string, unknown>) => ({
        id: String(p["id"]),
        name: String(p["name"]),
        country: String(p["country"] ?? ""),
        ethnicity: String(p["ethnicity"] ?? ""),
        measurements: String(p["measurements"] ?? ""),
        cupCategory: String(p["cup_category"] ?? ""),
        tags: (p["tags"] as string[]) ?? [],
        stashUrl: String(p["stash_url"] ?? ""),
      }));
      total.value = data.total ?? 0;
      page.value = data.page ?? p;
      totalPages.value = data.total_pages ?? 1;
      selected.value = new Set(performers.value.map((p) => p.id));
    } finally {
      loading.value = false;
    }
  }

  async function tagSelected() {
    const ids = [...selected.value];
    if (!ids.length) return;

    tagging.value = true;
    progressText.value = `Tagging ${ids.length} performer(s)…`;

    for (const id of ids) {
      statuses.value.set(id, { variant: "loading", text: "…" });
    }

    let done = 0;
    let tagged = 0;
    let errors = 0;

    const form = new FormData();
    form.append("dry_run", dryRun.value ? "1" : "0");
    ids.forEach((id) => form.append("performer_ids", id));

    try {
      const resp = await fetch("/performer-tagger/tag", { method: "POST", body: form });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

      await readSSE(resp, (d) => {
        if (d["type"] === "result") {
          done++;
          const addedTags = (d["added_tags"] as string[] | undefined) ?? [];
          const removedTags = (d["removed_tags"] as string[] | undefined) ?? [];
          if (addedTags.length || removedTags.length) tagged++;
          if (d["error"]) errors++;

          const pid = String(d["performer_id"]);
          if (d["error"]) {
            statuses.value.set(pid, { variant: "error", text: String(d["error"]) });
          } else if (!addedTags.length && !removedTags.length) {
            statuses.value.set(pid, { variant: "muted", text: "up to date" });
          } else {
            const parts: string[] = [];
            if (addedTags.length) parts.push(`+${addedTags.join(", ")}`);
            if (removedTags.length) parts.push(`−${removedTags.join(", ")}`);
            statuses.value.set(pid, {
              variant: dryRun.value ? "dry" : "ok",
              text: parts.join(" "),
            });
          }

          const verb = dryRun.value ? "would update" : "updated";
          progressText.value =
            `${done} / ${ids.length} done` +
            (tagged ? ` — ${tagged} ${verb}` : "") +
            (errors ? ` — ${errors} error(s)` : "");
        } else if (d["type"] === "done") {
          const verb = dryRun.value ? "would update" : "updated";
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

  watch([countryFilter, ethnicityFilter], () => {
    page.value = 1;
    loadPerformers(1);
  });

  function toggleSelect(id: string) {
    if (selected.value.has(id)) selected.value.delete(id);
    else selected.value.add(id);
  }

  function selectAll(val: boolean) {
    if (val) selected.value = new Set(performers.value.map((p) => p.id));
    else selected.value = new Set();
  }

  const allOnPageSelected = computed(
    () => performers.value.length > 0 && performers.value.every((p) => selected.value.has(p.id)),
  );

  const selectingAllPages = ref(false);

  async function selectAllPages() {
    selectingAllPages.value = true;
    try {
      const params = new URLSearchParams();
      if (countryFilter.value) params.set("country", countryFilter.value);
      if (ethnicityFilter.value) params.set("ethnicity", ethnicityFilter.value);
      const resp = await fetch(`/api/performer-tagger/performer-ids?${params}`);
      const data = await resp.json();
      selected.value = new Set((data.ids as string[]) ?? []);
    } finally {
      selectingAllPages.value = false;
    }
  }

  return {
    performers,
    page,
    perPage,
    total,
    totalPages,
    loading,
    tagging,
    dryRun,
    selected,
    statuses,
    progressText,
    countryFilter,
    ethnicityFilter,
    uniqueCountries,
    uniqueEthnicities,
    loadPerformers,
    tagSelected,
    toggleSelect,
    selectAll,
    allOnPageSelected,
    selectingAllPages,
    selectAllPages,
  };
});
