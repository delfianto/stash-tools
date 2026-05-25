import { defineStore } from "pinia";
import { ref } from "vue";
import type { Candidate, MoveResult } from "@shared/types";

export type { Candidate, MoveResult };

export const useRenamerStore = defineStore("renamer", () => {
  const candidates = ref<Candidate[]>([]);
  const results = ref<Map<string, MoveResult>>(new Map());
  const scanning = ref(false);
  const executing = ref(false);
  const mode = ref<"organize" | "rename">("organize");
  const dryRun = ref(false);

  async function scan() {
    scanning.value = true;
    results.value = new Map();
    const form = new FormData();
    form.append("mode", mode.value);
    try {
      const resp = await fetch("/api/scan", { method: "POST", body: form });
      const data = await resp.json();
      candidates.value = data.candidates ?? [];
    } finally {
      scanning.value = false;
    }
  }

  async function execute(selected: Candidate[]) {
    executing.value = true;
    const form = new FormData();
    form.append("mode", mode.value);
    form.append("dry_run", dryRun.value ? "1" : "0");
    selected.forEach((c) => form.append("paths", c.currentPath));

    try {
      const resp = await fetch("/api/execute", { method: "POST", body: form });
      const data = await resp.json();
      const map = new Map<string, MoveResult>();
      for (const r of data.results ?? []) {
        map.set(r.src, r);
      }
      results.value = map;
      if (!dryRun.value) {
        const movedSrcs = new Set([...map.values()].filter((r) => r.ok).map((r) => r.src));
        candidates.value = candidates.value.filter((c) => !movedSrcs.has(c.currentPath));
      }
    } finally {
      executing.value = false;
    }
  }

  return { candidates, results, scanning, executing, mode, dryRun, scan, execute };
});
