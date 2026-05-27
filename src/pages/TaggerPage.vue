<script setup lang="ts">
import { onMounted, computed, ref } from "vue";
import { toast } from "vue-sonner";
import { Tag, ChevronLeft, ChevronRight, ExternalLink, ChevronDown } from "lucide-vue-next";
import PageHeader from "@/components/PageHeader.vue";
import FilterSelect from "@/components/FilterSelect.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import { useTaggerStore } from "@/stores/tagger";

const store = useTaggerStore();
const tagsOpen = ref(false);

onMounted(() => {
  store.loadTags();
  store.loadScenes(1);
});

const allChecked = computed(() => {
  const eligible = store.filteredScenes.filter((s) => s.stashdbId);
  return eligible.length > 0 && eligible.every((s) => store.selected.has(s.id));
});

function toggleAll(e: Event) {
  store.selectAll((e.target as HTMLInputElement).checked);
}

async function goPage(p: number) {
  await store.loadScenes(p);
}

async function doTag() {
  if (!store.selected.size) return toast.warning("No scenes selected");
  await store.tagSelected();
}

function truncate(s: string, n = 8) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

const filterActive = computed(() => store.studioFilter || store.performerFilter);
</script>

<template>
  <div class="p-8 w-full">
    <PageHeader
      title="Auto Tagger"
      description="Browse your library, select scenes, and apply curated tags from StashDB."
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
            {{ store.tagCount }}
          </span>
        </span>
        <ChevronDown
          :size="14"
          style="color: var(--color-muted); transition: transform 0.2s"
          :style="{ transform: tagsOpen ? 'rotate(180deg)' : 'rotate(0deg)' }"
        />
      </button>

      <div v-if="tagsOpen" style="padding: 0 16px 16px">
        <div v-if="store.loadingTags" style="color: var(--color-muted); font-size: 12px">
          Loading tags…
        </div>
        <div
          v-else
          style="display: flex; flex-wrap: wrap; gap: 6px; max-height: 200px; overflow-y: auto"
        >
          <span
            v-for="tag in store.tags"
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
          >
            {{ tag }}
          </span>
        </div>
      </div>
    </div>

    <!-- Sticky controls -->
    <div
      class="flex items-center gap-4 flex-wrap mb-4 py-3 px-4 rounded-lg"
      style="
        position: sticky;
        top: 16px;
        z-index: 10;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
      "
    >
      <button
        @click="doTag"
        :disabled="store.tagging || !store.selected.size"
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
        :style="{ opacity: store.tagging || !store.selected.size ? '0.5' : '1' }"
      >
        <Tag :size="13" />
        {{ store.tagging ? "Tagging…" : `Tag Selected (${store.selected.size})` }}
      </button>

      <label
        class="flex items-center gap-2"
        style="cursor: pointer; font-size: 13px; color: var(--color-text-2); white-space: nowrap"
      >
        <input
          type="checkbox"
          v-model="store.dryRun"
          style="accent-color: var(--color-accent); width: 14px; height: 14px"
        />
        Dry run
      </label>

      <div style="width: 1px; height: 20px; background: var(--color-border); flex-shrink: 0" />

      <div class="flex items-center gap-2 flex-wrap">
        <span style="font-size: 11px; color: var(--color-muted); white-space: nowrap">Filter:</span>
        <FilterSelect
          v-model="store.studioFilter"
          :options="store.uniqueStudios"
          placeholder="Studio…"
        />
        <FilterSelect
          v-model="store.performerFilter"
          :options="store.uniquePerformers"
          placeholder="Performer…"
        />
        <span
          v-if="filterActive"
          style="
            font-size: 11px;
            color: var(--color-muted);
            font-family: var(--font-mono);
            white-space: nowrap;
          "
        >
          {{ store.filteredScenes.length }} shown
        </span>
      </div>

      <div class="flex-1" />

      <span
        v-if="store.progressText"
        style="
          font-size: 12px;
          color: var(--color-muted);
          font-family: var(--font-mono);
          white-space: nowrap;
        "
      >
        {{ store.progressText }}
      </span>
    </div>

    <div
      v-if="store.loadingScenes"
      style="color: var(--color-muted); font-size: 13px; padding: 40px 0; text-align: center"
    >
      Loading scenes…
    </div>

    <div v-else>
      <!-- Pagination top -->
      <div
        class="flex items-center justify-between mb-3"
        style="font-size: 12px; color: var(--color-muted)"
      >
        <span>
          {{ store.total }} scenes total — page
          <strong style="color: var(--color-text)">{{ store.page }}</strong>
          of {{ store.totalPages }}
          <span v-if="filterActive" style="color: var(--color-accent)">
            · {{ store.filteredScenes.length }} matching filter
          </span>
        </span>
        <div class="flex items-center gap-2">
          <button
            @click="goPage(store.page - 1)"
            :disabled="store.page <= 1"
            class="flex items-center gap-1"
            style="
              padding: 4px 10px;
              border-radius: 5px;
              border: 1px solid var(--color-border-2);
              background: var(--color-surface);
              color: var(--color-text-2);
              font-size: 12px;
              cursor: pointer;
              font-family: var(--font-sans);
            "
            :style="{ opacity: store.page <= 1 ? '0.4' : '1' }"
          >
            <ChevronLeft :size="12" /> Prev
          </button>
          <button
            @click="goPage(store.page + 1)"
            :disabled="store.page >= store.totalPages"
            class="flex items-center gap-1"
            style="
              padding: 4px 10px;
              border-radius: 5px;
              border: 1px solid var(--color-border-2);
              background: var(--color-surface);
              color: var(--color-text-2);
              font-size: 12px;
              cursor: pointer;
              font-family: var(--font-sans);
            "
            :style="{ opacity: store.page >= store.totalPages ? '0.4' : '1' }"
          >
            Next <ChevronRight :size="12" />
          </button>
        </div>
      </div>

      <!-- Table -->
      <div class="overflow-x-auto rounded-lg" style="border: 1px solid var(--color-border)">
        <table style="width: 100%; border-collapse: collapse; font-size: 13px">
          <thead>
            <tr style="border-bottom: 1px solid var(--color-border)">
              <th style="width: 36px; padding: 10px 12px; text-align: left">
                <input
                  type="checkbox"
                  :checked="allChecked"
                  @change="toggleAll"
                  style="accent-color: var(--color-accent)"
                />
              </th>
              <th
                v-for="col in [
                  'Title',
                  'Studio',
                  'Performers',
                  'StashDB',
                  'Current Tags',
                  'Status',
                ]"
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
              v-for="scene in store.filteredScenes"
              :key="scene.id"
              style="border-bottom: 1px solid var(--color-border)"
              :style="{
                background: store.selected.has(scene.id)
                  ? 'color-mix(in srgb, var(--color-surface-2) 60%, transparent)'
                  : 'transparent',
              }"
            >
              <td style="padding: 8px 12px">
                <input
                  type="checkbox"
                  :checked="store.selected.has(scene.id)"
                  :disabled="!scene.stashdbId"
                  @change="store.toggleSelect(scene.id)"
                  style="accent-color: var(--color-accent)"
                />
              </td>

              <td style="padding: 8px 12px; max-width: 220px">
                <a
                  :href="scene.stashUrl"
                  target="_blank"
                  rel="noopener"
                  :title="scene.title"
                  style="
                    color: var(--color-text);
                    text-decoration: none;
                    display: block;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                  "
                >
                  {{ scene.title }}
                </a>
              </td>

              <td
                style="
                  padding: 8px 12px;
                  white-space: nowrap;
                  max-width: 140px;
                  overflow: hidden;
                  text-overflow: ellipsis;
                "
              >
                <button
                  v-if="scene.studio"
                  @click="
                    store.studioFilter = store.studioFilter === scene.studio ? '' : scene.studio
                  "
                  :title="`Filter by ${scene.studio}`"
                  style="
                    background: transparent;
                    border: none;
                    padding: 0;
                    cursor: pointer;
                    font-family: var(--font-sans);
                    font-size: 13px;
                    text-align: left;
                  "
                  :style="{
                    color:
                      store.studioFilter === scene.studio
                        ? 'var(--color-accent)'
                        : 'var(--color-text-2)',
                  }"
                >
                  {{ scene.studio }}
                </button>
                <span v-else style="color: var(--color-border-2)">—</span>
              </td>

              <td
                style="
                  padding: 8px 12px;
                  max-width: 200px;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  white-space: nowrap;
                "
                :title="scene.performers.join(', ')"
              >
                <template v-if="scene.performers.length">
                  <template v-for="(p, i) in scene.performers" :key="p">
                    <button
                      @click="store.performerFilter = store.performerFilter === p ? '' : p"
                      :title="`Filter by ${p}`"
                      style="
                        background: transparent;
                        border: none;
                        padding: 0;
                        cursor: pointer;
                        font-family: var(--font-sans);
                        font-size: 13px;
                      "
                      :style="{
                        color:
                          store.performerFilter === p
                            ? 'var(--color-accent)'
                            : 'var(--color-muted)',
                      }"
                    >
                      {{ p }}</button
                    ><span
                      v-if="i < scene.performers.length - 1"
                      style="color: var(--color-border-2)"
                      >,
                    </span>
                  </template>
                </template>
                <span v-else style="color: var(--color-border-2)">—</span>
              </td>

              <td style="padding: 8px 12px">
                <a
                  v-if="scene.stashdbId"
                  :href="scene.stashdbUrl"
                  target="_blank"
                  rel="noopener"
                  :title="scene.stashdbId"
                  class="flex items-center gap-1"
                  style="
                    font-family: var(--font-mono);
                    font-size: 11px;
                    color: var(--color-text-2);
                    text-decoration: none;
                    white-space: nowrap;
                  "
                >
                  {{ truncate(scene.stashdbId) }}
                  <ExternalLink :size="10" style="color: var(--color-muted)" />
                </a>
                <span v-else style="color: var(--color-border-2)">—</span>
              </td>

              <td
                style="
                  padding: 8px 12px;
                  max-width: 200px;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  white-space: nowrap;
                  color: var(--color-muted);
                  font-size: 12px;
                "
                :title="scene.tags.slice().sort().join(', ')"
              >
                {{ scene.tags.slice().sort().join(", ") || "—" }}
              </td>

              <td style="padding: 8px 12px; min-width: 160px">
                <template v-if="store.statuses.has(scene.id)">
                  <StatusBadge
                    :variant="store.statuses.get(scene.id)!.variant"
                    :text="store.statuses.get(scene.id)!.text"
                  />
                  <span
                    v-if="store.statuses.get(scene.id)!.filtered?.length"
                    :title="`Filtered (parent tags): ${store.statuses.get(scene.id)!.filtered!.join(', ')}`"
                    style="
                      margin-left: 6px;
                      font-size: 10px;
                      color: var(--color-muted);
                      font-family: var(--font-mono);
                      cursor: help;
                    "
                  >
                    ({{ store.statuses.get(scene.id)!.filtered!.join(", ") }} filtered)
                  </span>
                </template>
                <span v-else style="color: var(--color-border-2)">—</span>
              </td>
            </tr>

            <tr v-if="store.filteredScenes.length === 0">
              <td
                colspan="7"
                style="
                  padding: 32px;
                  text-align: center;
                  color: var(--color-muted);
                  font-size: 13px;
                "
              >
                No scenes match the current filter.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination bottom -->
      <div class="flex items-center justify-between mt-3">
        <small style="color: var(--color-muted); font-size: 11px">
          Scenes without a StashDB ID are shown unchecked and will be skipped.
        </small>
        <div class="flex items-center gap-2">
          <button
            @click="goPage(store.page - 1)"
            :disabled="store.page <= 1"
            class="flex items-center gap-1"
            style="
              padding: 4px 10px;
              border-radius: 5px;
              border: 1px solid var(--color-border-2);
              background: var(--color-surface);
              color: var(--color-text-2);
              font-size: 12px;
              cursor: pointer;
              font-family: var(--font-sans);
            "
            :style="{ opacity: store.page <= 1 ? '0.4' : '1' }"
          >
            <ChevronLeft :size="12" /> Prev
          </button>
          <button
            @click="goPage(store.page + 1)"
            :disabled="store.page >= store.totalPages"
            class="flex items-center gap-1"
            style="
              padding: 4px 10px;
              border-radius: 5px;
              border: 1px solid var(--color-border-2);
              background: var(--color-surface);
              color: var(--color-text-2);
              font-size: 12px;
              cursor: pointer;
              font-family: var(--font-sans);
            "
            :style="{ opacity: store.page >= store.totalPages ? '0.4' : '1' }"
          >
            Next <ChevronRight :size="12" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
