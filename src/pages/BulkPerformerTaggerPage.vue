<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { Play, Square, Wand2 } from "lucide-vue-next";
import PageHeader from "@/components/PageHeader.vue";
import FilterSelect from "@/components/FilterSelect.vue";
import BatchProgress from "@/components/BatchProgress.vue";
import { useBulkPerformerTaggerStore } from "@/stores/bulkPerformerTagger";
import { usePerformerTaggerStore } from "@/stores/performerTagger";

const store = useBulkPerformerTaggerStore();
const performerStore = usePerformerTaggerStore();

// Load page 1 so filter dropdowns have options populated
onMounted(() => performerStore.loadPerformers(1));
onUnmounted(() => {
  if (store.running) store.stop();
});
</script>

<template>
  <div class="p-8 w-full">
    <PageHeader
      title="Bulk Performer Tagger"
      description="Automatically tag every performer in your library — measurements, country, ethnicity, and more."
    />

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
          v-model="store.countryFilter"
          :options="performerStore.uniqueCountries"
          placeholder="Country…"
        />
        <FilterSelect
          v-model="store.ethnicityFilter"
          :options="performerStore.uniqueEthnicities"
          placeholder="Ethnicity…"
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
      :processed="store.processedCount"
      :updated="store.updatedCount"
      :errors="store.errorCount"
      :dry-run="store.dryRun"
      :log="store.log"
    />

    <!-- Idle state -->
    <div
      v-else
      style="padding: 64px 0; text-align: center; color: var(--color-muted); font-size: 13px"
    >
      <Wand2 :size="32" style="margin: 0 auto 12px; opacity: 0.3" />
      <div>
        Set your filters (optional) and click
        <strong style="color: var(--color-text)">Start Auto-Tag</strong> to process all performers
        automatically.
      </div>
      <div style="margin-top: 6px; font-size: 12px">
        Tags are applied based on
        <strong style="color: var(--color-text-2)">performer-rules.json</strong>
        — measurements, country, ethnicity rules — no StashDB connection needed.
      </div>
    </div>
  </div>
</template>
