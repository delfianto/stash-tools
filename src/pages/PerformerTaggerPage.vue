<script setup lang="ts">
import { onMounted, computed } from "vue";
import { toast } from "vue-sonner";
import { Users, ChevronLeft, ChevronRight, ExternalLink } from "lucide-vue-next";
import PageHeader from "@/components/PageHeader.vue";
import FilterSelect from "@/components/FilterSelect.vue";
import StatusBadge from "@/components/StatusBadge.vue";
import { usePerformerTaggerStore } from "@/stores/performerTagger";

const store = usePerformerTaggerStore();

onMounted(() => store.loadPerformers(1));

const allChecked = computed(() => {
  const ps = store.performers;
  return ps.length > 0 && ps.every((p) => store.selected.has(p.id));
});

function toggleAll(e: Event) {
  store.selectAll((e.target as HTMLInputElement).checked);
}

async function goPage(p: number) {
  await store.loadPerformers(p);
}

async function doTag() {
  if (!store.selected.size) return toast.warning("No performers selected");
  await store.tagSelected();
}

const CUP_LABEL: Record<string, string> = {
  small: "Small",
  medium: "Medium",
  large: "Large",
};

const CUP_COLOR: Record<string, string> = {
  small: "var(--color-text-2)",
  medium: "var(--color-ok)",
  large: "var(--color-accent)",
};
</script>

<template>
  <div class="p-8 w-full">
    <PageHeader
      title="Performer Tagger"
      description="Auto-tag performers based on measurements, country, and other attributes."
    />

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
        <Users :size="13" />
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
          v-model="store.countryFilter"
          :options="store.uniqueCountries"
          placeholder="Country…"
        />
        <FilterSelect
          v-model="store.ethnicityFilter"
          :options="store.uniqueEthnicities"
          placeholder="Ethnicity…"
        />
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
      v-if="store.loading"
      style="color: var(--color-muted); font-size: 13px; padding: 40px 0; text-align: center"
    >
      Loading performers…
    </div>

    <div v-else>
      <!-- Pagination top -->
      <div
        class="flex items-center justify-between mb-3"
        style="font-size: 12px; color: var(--color-muted)"
      >
        <span>
          {{ store.total }} performers total — page
          <strong style="color: var(--color-text)">{{ store.page }}</strong>
          of {{ store.totalPages }}
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
                  'Name',
                  'Country',
                  'Ethnicity',
                  'Measurements',
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
              v-for="p in store.performers"
              :key="p.id"
              style="border-bottom: 1px solid var(--color-border)"
              :style="{
                background: store.selected.has(p.id)
                  ? 'color-mix(in srgb, var(--color-surface-2) 60%, transparent)'
                  : 'transparent',
              }"
            >
              <td style="padding: 8px 12px">
                <input
                  type="checkbox"
                  :checked="store.selected.has(p.id)"
                  @change="store.toggleSelect(p.id)"
                  style="accent-color: var(--color-accent)"
                />
              </td>

              <!-- Name -->
              <td style="padding: 8px 12px; max-width: 180px">
                <a
                  :href="p.stashUrl"
                  target="_blank"
                  rel="noopener"
                  class="flex items-center gap-1"
                  style="
                    color: var(--color-text);
                    text-decoration: none;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                  "
                >
                  {{ p.name }}
                  <ExternalLink :size="10" style="color: var(--color-muted); flex-shrink: 0" />
                </a>
              </td>

              <!-- Country -->
              <td style="padding: 8px 12px; white-space: nowrap">
                <button
                  v-if="p.country"
                  @click="store.countryFilter = store.countryFilter === p.country ? '' : p.country"
                  style="
                    background: transparent;
                    border: none;
                    padding: 0;
                    cursor: pointer;
                    font-family: var(--font-mono);
                    font-size: 12px;
                  "
                  :style="{
                    color:
                      store.countryFilter === p.country
                        ? 'var(--color-accent)'
                        : 'var(--color-text-2)',
                  }"
                >
                  {{ p.country }}
                </button>
                <span v-else style="color: var(--color-border-2)">—</span>
              </td>

              <!-- Ethnicity -->
              <td style="padding: 8px 12px; white-space: nowrap">
                <button
                  v-if="p.ethnicity"
                  @click="
                    store.ethnicityFilter = store.ethnicityFilter === p.ethnicity ? '' : p.ethnicity
                  "
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
                      store.ethnicityFilter === p.ethnicity
                        ? 'var(--color-accent)'
                        : 'var(--color-text-2)',
                  }"
                >
                  {{ p.ethnicity }}
                </button>
                <span v-else style="color: var(--color-border-2)">—</span>
              </td>

              <!-- Measurements + cup category -->
              <td style="padding: 8px 12px; white-space: nowrap">
                <span
                  v-if="p.measurements"
                  style="font-family: var(--font-mono); font-size: 12px; color: var(--color-text-2)"
                >
                  {{ p.measurements }}
                </span>
                <span v-if="p.cupCategory" style="margin-left: 6px">
                  <span
                    style="
                      font-size: 10px;
                      font-family: var(--font-mono);
                      padding: 1px 5px;
                      border-radius: 3px;
                      background: var(--color-surface-2);
                      border: 1px solid var(--color-border);
                    "
                    :style="{ color: CUP_COLOR[p.cupCategory] ?? 'var(--color-muted)' }"
                  >
                    {{ CUP_LABEL[p.cupCategory] ?? p.cupCategory }}
                  </span>
                </span>
                <span v-if="!p.measurements" style="color: var(--color-border-2)">—</span>
              </td>

              <!-- Current tags -->
              <td
                style="
                  padding: 8px 12px;
                  max-width: 220px;
                  overflow: hidden;
                  text-overflow: ellipsis;
                  white-space: nowrap;
                  color: var(--color-muted);
                  font-size: 12px;
                "
                :title="p.tags.join(', ')"
              >
                {{ p.tags.join(", ") || "—" }}
              </td>

              <!-- Status -->
              <td style="padding: 8px 12px; min-width: 180px">
                <template v-if="store.statuses.has(p.id)">
                  <StatusBadge
                    :variant="store.statuses.get(p.id)!.variant"
                    :text="store.statuses.get(p.id)!.text"
                  />
                </template>
                <span v-else style="color: var(--color-border-2)">—</span>
              </td>
            </tr>

            <tr v-if="store.performers.length === 0">
              <td
                colspan="7"
                style="
                  padding: 32px;
                  text-align: center;
                  color: var(--color-muted);
                  font-size: 13px;
                "
              >
                No performers found.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pagination bottom -->
      <div class="flex items-center justify-end mt-3 gap-2">
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
</template>
