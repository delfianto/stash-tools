import { defineStore } from "pinia";
import { ref, computed } from "vue";
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
      const reader = resp.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";

        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const d = JSON.parse(line.slice(6));

          if (d.type === "result") {
            done++;
            if (d.added_tags?.length || d.removed_tags?.length) tagged++;
            if (d.error) errors++;

            const pid = String(d.performer_id);
            if (d.error) {
              statuses.value.set(pid, { variant: "error", text: d.error });
            } else if (!d.added_tags?.length && !d.removed_tags?.length) {
              statuses.value.set(pid, { variant: "muted", text: "up to date" });
            } else {
              const parts: string[] = [];
              if (d.added_tags?.length) parts.push(`+${(d.added_tags as string[]).join(", ")}`);
              if (d.removed_tags?.length) parts.push(`−${(d.removed_tags as string[]).join(", ")}`);
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
          } else if (d.type === "done") {
            const verb = dryRun.value ? "would update" : "updated";
            progressText.value =
              `Done — ${d.updated} ${verb}` + (d.errors ? `, ${d.errors} error(s)` : "");
          } else if (d.type === "error") {
            progressText.value = `Error: ${d.error}`;
          }
        }
      }
    } catch (err) {
      progressText.value = `Request failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      tagging.value = false;
    }
  }

  function toggleSelect(id: string) {
    if (selected.value.has(id)) selected.value.delete(id);
    else selected.value.add(id);
  }

  function selectAll(val: boolean) {
    if (val) selected.value = new Set(performers.value.map((p) => p.id));
    else selected.value = new Set();
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
  };
});
