<script setup lang="ts">
import { onUnmounted } from "vue";
import { Play, Square, Tag, ChevronDown, AlertCircle } from "lucide-vue-next";
import PageHeader from "@/components/PageHeader.vue";
import FilterSelect from "@/components/FilterSelect.vue";
import { useBulkTaggerStore } from "@/stores/bulkTagger";
import { useTaggerStore } from "@/stores/tagger";
import { onMounted, ref } from "vue";

const store = useBulkTaggerStore();
const taggerStore = useTaggerStore();
const tagsOpen = ref(false);

onMounted(() => {
  taggerStore.loadTags();
  // Load scene list once to populate studio/performer filter options
  taggerStore.loadScenes(1);
});

onUnmounted(() => {
  if (store.running) store.stop();
});

async function startRun() {
  await store.start();
}
</script>

<template>
  <div class="p-8 w-full">
    <PageHeader
      title="Bulk Auto-Tagger"
      description="Automatically tag every page of your library in one shot — no clicking required."
    />

    <!-- Tag list panel -->
    <div
      class="mb-5 rounded-lg overflow-hidden"
      style="border: 1px solid var(--color-border); background: var(--color-surface)"
    >
      <button
        @click="tagsOpen = !tagsOpen"
        class="flex items-center justify-between w-full px-4 py-3"
        style="
          background: transparent;
          border: none;
          cursor: pointer;
          font-size: 13px;
          font-family: var(--font-sans);
          text-align: left;
        "
      >
        <span class="flex items-center gap-2">
          <Tag :size="13" style="color: var(--color-accent)" />
          <span style="font-weight: 500; color: var(--color-text)">Curated Tags</span>
          <span
            style="
              font-size: 11px;
              color: var(--color-muted);
              font-family: var(--font-mono);
              background: var(--color-surface-2);
              padding: 1px 6px;
              border-radius: 4px;
            "
          >
            {{ taggerStore.tagCount }}
          </span>
        </span>
        <ChevronDown
          :size="14"
          style="color: var(--color-muted); transition: transform 0.2s"
          :style="{ transform: tagsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }"
        />
      </button>
      <div v-if="tagsOpen" style="padding: 0 16px 16px">
        <div v-if="taggerStore.loadingTags" style="color: var(--color-muted); font-size: 12px">
          Loading tags…
        </div>
        <div
          v-else
          style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 180px; overflow-y: auto"
        >
          <span
            v-for="tag in taggerStore.tags"
            :key="tag"
            style="
              font-size: 11px;
              font-family: var(--font-mono);
              padding: 2px 8px;
              border-radius: 4px;
              background: var(--color-surface-2);
              color: var(--color-text-2);
              border: 1px solid var(--color-border);
              white-space: nowrap;
            "
            >{{ tag }}</span
          >
        </div>
      </div>
    </div>

    <!-- Controls -->
    <div
      class="flex items-center gap-4 flex-wrap mb-6 py-3 px-4 rounded-lg"
      style="
        position: sticky;
        top: 16px;
        z-index: 10;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
      "
    >
      <!-- Start / Stop -->
      <button
        v-if="!store.running"
        @click="startRun"
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
          white-space: nowrap;
        "
      >
        <Play :size="13" />
        Start Auto-Tag
      </button>
      <button
        v-else
        @click="store.stop()"
        :disabled="store.stopping"
        class="flex items-center gap-2"
        style="
          padding: 6px 16px;
          border-radius: 6px;
          border: none;
          background: #ef4444;
          color: #fff;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          font-family: var(--font-sans);
          white-space: nowrap;
        "
        :style="{ opacity: store.stopping ? '0.6' : '1' }"
      >
        <Square :size="13" />
        {{ store.stopping ? "Stopping…" : "Stop" }}
      </button>

      <label
        class="flex items-center gap-2"
        style="cursor: pointer; font-size: 13px; color: var(--color-text-2); white-space: nowrap"
      >
        <input
          type="checkbox"
          v-model="store.dryRun"
          :disabled="store.running"
          style="accent-color: var(--color-accent); width: 14px; height: 14px"
        />
        Dry run
      </label>

      <div style="width: 1px; height: 20px; background: var(--color-border); flex-shrink: 0" />

      <div
        class="flex items-center gap-2 flex-wrap"
        :style="{
          opacity: store.running ? '0.5' : '1',
          pointerEvents: store.running ? 'none' : 'auto',
        }"
      >
        <span style="font-size: 11px; color: var(--color-muted); white-space: nowrap">Filter:</span>
        <FilterSelect
          v-model="store.studioFilter"
          :options="taggerStore.uniqueStudios"
          placeholder="Studio…"
        />
        <FilterSelect
          v-model="store.performerFilter"
          :options="taggerStore.uniquePerformers"
          placeholder="Performer…"
        />
      </div>
    </div>

    <!-- Progress panel (shown once a run has started) -->
    <div v-if="store.currentPage > 0 || store.running" class="mb-6 space-y-4">
      <!-- Progress bar -->
      <div
        class="rounded-lg p-4"
        style="background: var(--color-surface); border: 1px solid var(--color-border)"
      >
        <div class="flex items-center justify-between mb-2">
          <span style="font-size: 13px; font-weight: 500; color: var(--color-text)">
            <template v-if="store.running && !store.stopping">
              Processing page {{ store.currentPage }} of {{ store.totalPages || "…" }}
            </template>
            <template v-else-if="store.stopping">Stopping…</template>
            <template v-else>
              Done — {{ store.currentPage }} of {{ store.totalPages }} pages processed
            </template>
          </span>
          <span style="font-size: 12px; font-family: var(--font-mono); color: var(--color-muted)">
            {{ store.progressPct }}%
          </span>
        </div>
        <div
          style="
            height: 6px;
            border-radius: 3px;
            background: var(--color-surface-2);
            overflow: hidden;
          "
        >
          <div
            style="
              height: 100%;
              border-radius: 3px;
              background: var(--color-accent);
              transition: width 0.3s;
            "
            :style="{ width: store.progressPct + '%' }"
          />
        </div>
      </div>

      <!-- Stats row -->
      <div class="grid gap-3" style="grid-template-columns: repeat(4, 1fr)">
        <div
          v-for="stat in [
            { label: 'Processed', value: store.processedScenes, color: 'var(--color-text)' },
            {
              label: store.dryRun ? 'Would Tag' : 'Tagged',
              value: store.taggedScenes,
              color: 'var(--color-ok)',
            },
            {
              label: 'Up to Date',
              value: store.processedScenes - store.taggedScenes - store.errorCount,
              color: 'var(--color-muted)',
            },
            { label: 'Errors', value: store.errorCount, color: 'var(--color-err)' },
          ]"
          :key="stat.label"
          class="rounded-lg p-3 text-center"
          style="background: var(--color-surface); border: 1px solid var(--color-border)"
        >
          <div
            style="font-size: 22px; font-weight: 700; font-family: var(--font-mono)"
            :style="{ color: stat.color }"
          >
            {{ stat.value }}
          </div>
          <div
            style="
              font-size: 11px;
              color: var(--color-muted);
              margin-top: 2px;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            "
          >
            {{ stat.label }}
          </div>
        </div>
      </div>

      <!-- Live log -->
      <div
        class="rounded-lg overflow-hidden"
        style="background: var(--color-surface); border: 1px solid var(--color-border)"
      >
        <div
          class="px-4 py-2 flex items-center justify-between"
          style="
            border-bottom: 1px solid var(--color-border);
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--color-muted);
          "
        >
          <span>Activity Log</span>
          <span style="font-family: var(--font-mono)">{{ store.log.length }} entries</span>
        </div>
        <div style="max-height: 420px; overflow-y: auto">
          <div
            v-if="store.log.length === 0"
            style="padding: 24px; text-align: center; color: var(--color-muted); font-size: 13px"
          >
            Waiting for results…
          </div>
          <table v-else style="width: 100%; border-collapse: collapse; font-size: 12px">
            <tbody>
              <tr
                v-for="(entry, i) in store.log"
                :key="i"
                style="border-bottom: 1px solid var(--color-border)"
              >
                <td
                  style="
                    padding: 6px 12px;
                    white-space: nowrap;
                    color: var(--color-muted);
                    font-family: var(--font-mono);
                    width: 60px;
                  "
                >
                  p{{ entry.page }}
                </td>
                <td
                  style="
                    padding: 6px 12px;
                    max-width: 240px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    color: var(--color-text-2);
                  "
                >
                  {{ entry.title }}
                </td>
                <td style="padding: 6px 12px; white-space: nowrap">
                  <span
                    style="font-family: var(--font-mono)"
                    :style="{
                      color:
                        entry.variant === 'ok'
                          ? 'var(--color-ok)'
                          : entry.variant === 'error'
                            ? 'var(--color-err)'
                            : entry.variant === 'dry'
                              ? 'var(--color-accent)'
                              : 'var(--color-muted)',
                    }"
                  >
                    <template v-if="entry.variant === 'ok'">✓ </template>
                    <template v-else-if="entry.variant === 'error'">
                      <AlertCircle :size="11" style="display: inline; vertical-align: middle" />
                    </template>
                    <template v-else-if="entry.variant === 'dry'">→ </template>
                    {{ entry.text }}
                  </span>
                  <span
                    v-if="entry.filtered?.length"
                    :title="`Filtered (parent tags): ${entry.filtered.join(', ')}`"
                    style="
                      margin-left: 6px;
                      font-size: 10px;
                      color: var(--color-muted);
                      font-family: var(--font-mono);
                      cursor: help;
                    "
                  >
                    ({{ entry.filtered.join(", ") }} filtered)
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Idle state -->
    <div
      v-else
      style="padding: 64px 0; text-align: center; color: var(--color-muted); font-size: 13px"
    >
      <Play :size="32" style="margin: 0 auto 12px; opacity: 0.3" />
      <div>
        Set your filters (optional) and click
        <strong style="color: var(--color-text)">Start Auto-Tag</strong> to process all pages
        automatically.
      </div>
      <div style="margin-top: 6px; font-size: 12px">
        Each page is loaded, all eligible scenes are tagged, then it advances to the next page.
      </div>
    </div>
  </div>
</template>
