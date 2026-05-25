<script setup lang="ts">
import { ref, computed } from "vue";
import { toast } from "vue-sonner";
import { ScanLine, Play } from "lucide-vue-next";
import PageHeader from "@/components/PageHeader.vue";
import { useRenamerStore, type Candidate } from "@/stores/renamer";

const store = useRenamerStore();
const selected = ref<Set<string>>(new Set());
const allSelected = computed(
  () => store.candidates.length > 0 && selected.value.size === store.candidates.length,
);

function toggleAll(e: Event) {
  const checked = (e.target as HTMLInputElement).checked;
  if (checked) {
    selected.value = new Set(store.candidates.map((c) => c.currentPath));
  } else {
    selected.value = new Set();
  }
}

function toggleOne(path: string) {
  if (selected.value.has(path)) selected.value.delete(path);
  else selected.value.add(path);
}

async function doScan() {
  selected.value = new Set();
  await store.scan();
  if (store.candidates.length) {
    selected.value = new Set(store.candidates.map((c) => c.currentPath));
    toast.success(`Found ${store.candidates.length} candidates`);
  } else {
    toast.info("No candidates found");
  }
}

async function doExecute() {
  const sel = store.candidates.filter((c) => selected.value.has(c.currentPath));
  if (!sel.length) return toast.warning("No scenes selected");
  await store.execute(sel);
  const results = [...store.results.values()];
  const ok = results.filter((r) => r.ok).length;
  const err = results.filter((r) => !r.ok).length;
  if (store.dryRun) {
    toast.info(`Dry run: ${ok} would move`);
  } else {
    if (err) toast.error(`${ok} moved, ${err} failed`);
    else toast.success(`${ok} moved successfully`);
  }
}

function getTarget(c: Candidate) {
  return store.mode === "rename" ? c.renameTarget : c.organizeTarget;
}

function basename(path: string) {
  return path.split("/").pop() ?? path;
}
</script>

<template>
  <div class="p-8 w-full">
    <PageHeader
      title="Renamer"
      description="Scan your library for rename candidates and apply changes."
    />

    <!-- Controls -->
    <div
      class="flex items-center gap-4 flex-wrap mb-6 p-4 rounded-lg"
      style="background: var(--color-surface); border: 1px solid var(--color-border)"
    >
      <!-- Mode -->
      <div class="flex items-center gap-2">
        <span style="color: var(--color-muted); font-size: 12px; white-space: nowrap">Mode</span>
        <div class="flex rounded overflow-hidden" style="border: 1px solid var(--color-border-2)">
          <button
            v-for="m in ['organize', 'rename'] as const"
            :key="m"
            @click="store.mode = m"
            :style="{
              padding: '4px 12px',
              fontSize: '12px',
              fontWeight: '500',
              cursor: 'pointer',
              border: 'none',
              background: store.mode === m ? 'var(--color-border-2)' : 'transparent',
              color: store.mode === m ? 'var(--color-text)' : 'var(--color-muted)',
              transition: 'all 0.1s',
            }"
          >
            {{ m }}
          </button>
        </div>
      </div>

      <!-- Dry run -->
      <label
        class="flex items-center gap-2"
        style="cursor: pointer; font-size: 13px; color: var(--color-text-2)"
      >
        <input
          type="checkbox"
          v-model="store.dryRun"
          style="accent-color: var(--color-accent); width: 14px; height: 14px"
        />
        Dry run
      </label>

      <div class="flex-1" />

      <!-- Scan -->
      <button
        @click="doScan"
        :disabled="store.scanning"
        class="flex items-center gap-2"
        style="
          padding: 6px 16px;
          border-radius: 6px;
          border: 1px solid var(--color-border-2);
          background: var(--color-surface-2);
          color: var(--color-text);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          font-family: var(--font-sans);
        "
        :style="{ opacity: store.scanning ? '0.5' : '1' }"
      >
        <ScanLine :size="14" />
        {{ store.scanning ? "Scanning…" : "Scan" }}
      </button>

      <!-- Execute -->
      <button
        v-if="store.candidates.length"
        @click="doExecute"
        :disabled="store.executing || !selected.size"
        class="flex items-center gap-2"
        style="
          padding: 6px 16px;
          border-radius: 6px;
          border: none;
          background: var(--color-accent);
          color: #000;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: var(--font-sans);
        "
        :style="{ opacity: store.executing || !selected.size ? '0.5' : '1' }"
      >
        <Play :size="13" />
        {{ store.executing ? "Moving…" : `Execute (${selected.size})` }}
      </button>
    </div>

    <!-- States -->
    <div
      v-if="store.scanning"
      style="color: var(--color-muted); font-size: 13px; padding: 40px 0; text-align: center"
    >
      Scanning library…
    </div>

    <div
      v-else-if="!store.candidates.length"
      style="color: var(--color-muted); font-size: 13px; padding: 40px 0; text-align: center"
    >
      Click "Scan" to find rename candidates.
    </div>

    <!-- Candidate table -->
    <div v-else class="overflow-x-auto rounded-lg" style="border: 1px solid var(--color-border)">
      <table style="width: 100%; border-collapse: collapse; font-size: 13px">
        <thead>
          <tr style="border-bottom: 1px solid var(--color-border)">
            <th style="width: 36px; padding: 10px 12px; text-align: left">
              <input
                type="checkbox"
                :checked="allSelected"
                @change="toggleAll"
                style="accent-color: var(--color-accent)"
              />
            </th>
            <th
              v-for="col in ['Current File', 'New Name', 'Studio', 'Performers', 'Date', 'Status']"
              :key="col"
              style="
                padding: 10px 12px;
                text-align: left;
                font-weight: 500;
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: var(--color-muted);
                white-space: nowrap;
              "
            >
              {{ col }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="c in store.candidates"
            :key="c.currentPath"
            style="border-bottom: 1px solid var(--color-border)"
            :style="{
              background: selected.has(c.currentPath)
                ? 'color-mix(in srgb, var(--color-surface-2) 60%, transparent)'
                : 'transparent',
            }"
          >
            <td style="padding: 8px 12px">
              <input
                type="checkbox"
                :checked="selected.has(c.currentPath)"
                @change="toggleOne(c.currentPath)"
                style="accent-color: var(--color-accent)"
              />
            </td>
            <td
              style="
                padding: 8px 12px;
                max-width: 260px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-family: var(--font-mono);
                font-size: 12px;
                color: var(--color-text-2);
              "
              :title="c.currentPath"
            >
              {{ basename(c.currentPath) }}
            </td>
            <td
              style="
                padding: 8px 12px;
                max-width: 300px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                font-family: var(--font-mono);
                font-size: 12px;
                color: var(--color-text);
              "
              :title="getTarget(c)"
            >
              {{ basename(getTarget(c)) }}
            </td>
            <td style="padding: 8px 12px; color: var(--color-text-2); white-space: nowrap">
              {{ c.studio || "—" }}
            </td>
            <td
              style="
                padding: 8px 12px;
                color: var(--color-muted);
                max-width: 200px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
              "
              :title="c.performers.join(', ')"
            >
              {{ c.performers.join(", ") || "—" }}
            </td>
            <td
              style="
                padding: 8px 12px;
                color: var(--color-muted);
                font-family: var(--font-mono);
                font-size: 12px;
                white-space: nowrap;
              "
            >
              {{ c.date || "—" }}
            </td>
            <td style="padding: 8px 12px; white-space: nowrap">
              <template v-if="store.results.has(c.currentPath)">
                <span
                  :style="{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: store.results.get(c.currentPath)!.ok
                      ? 'var(--color-ok)'
                      : 'var(--color-err)',
                  }"
                >
                  <template v-if="store.results.get(c.currentPath)!.dryRun">→ dry run</template>
                  <template v-else-if="store.results.get(c.currentPath)!.ok">✓ moved</template>
                  <template v-else>✗ {{ store.results.get(c.currentPath)!.error }}</template>
                </span>
              </template>
              <span v-else style="color: var(--color-border-2)">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
