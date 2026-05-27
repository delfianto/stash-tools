<script setup lang="ts">
import { onUnmounted, onMounted, ref } from "vue";
import { Play, Square, Tag, ChevronDown } from "lucide-vue-next";
import PageHeader from "@/components/PageHeader.vue";
import FilterSelect from "@/components/FilterSelect.vue";
import BatchProgress from "@/components/BatchProgress.vue";
import { useBulkTaggerStore } from "@/stores/bulkTagger";
import { useTaggerStore } from "@/stores/tagger";

const store = useBulkTaggerStore();
const taggerStore = useTaggerStore();
const tagsOpen = ref(false);

onMounted(() => {
  taggerStore.loadTags();
  taggerStore.loadScenes(1);
});

onUnmounted(() => {
  if (store.running) store.stop();
});
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
      <button
        v-if="!store.running"
        @click="store.start()"
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

    <BatchProgress
      v-if="store.currentPage > 0 || store.running"
      :running="store.running"
      :stopping="store.stopping"
      :current-page="store.currentPage"
      :total-pages="store.totalPages"
      :progress-pct="store.progressPct"
      :processed="store.processedScenes"
      :updated="store.taggedScenes"
      :errors="store.errorCount"
      :dry-run="store.dryRun"
      :log="store.log"
    />

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
