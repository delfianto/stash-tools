<script lang="ts">
export interface BatchLogEntry {
  id: string;
  title: string;
  variant: "ok" | "error" | "dry" | "muted";
  text: string;
  filtered?: string[];
  page?: number;
}
</script>

<script setup lang="ts">
import { computed } from "vue";
import { AlertCircle } from "lucide-vue-next";

const props = defineProps<{
  running: boolean;
  stopping: boolean;
  currentPage: number;
  totalPages: number;
  progressPct: number;
  processed: number;
  updated: number;
  errors: number;
  dryRun: boolean;
  log: BatchLogEntry[];
}>();

const showPageCol = computed(() => props.log.some((e) => e.page !== undefined));
</script>

<template>
  <div class="space-y-4">
    <!-- Progress bar -->
    <div
      class="rounded-lg p-4"
      style="background: var(--color-surface); border: 1px solid var(--color-border)"
    >
      <div class="flex items-center justify-between mb-2">
        <span style="font-size: 13px; font-weight: 500; color: var(--color-text)">
          <template v-if="running && !stopping">
            Processing page {{ currentPage }} of {{ totalPages || "…" }}
          </template>
          <template v-else-if="stopping">Stopping…</template>
          <template v-else> Done — {{ currentPage }} of {{ totalPages }} pages processed </template>
        </span>
        <span style="font-size: 12px; font-family: var(--font-mono); color: var(--color-muted)">
          {{ progressPct }}%
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
          :style="{ width: progressPct + '%' }"
        />
      </div>
    </div>

    <!-- Stats grid -->
    <div class="grid gap-3" style="grid-template-columns: repeat(4, 1fr)">
      <div
        v-for="stat in [
          { label: 'Processed', value: processed, color: 'var(--color-text)' },
          {
            label: dryRun ? 'Would Update' : 'Updated',
            value: updated,
            color: 'var(--color-ok)',
          },
          {
            label: 'Up to Date',
            value: Math.max(0, processed - updated - errors),
            color: 'var(--color-muted)',
          },
          { label: 'Errors', value: errors, color: 'var(--color-err)' },
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
        <span style="font-family: var(--font-mono)">{{ log.length }} entries</span>
      </div>
      <div style="max-height: 420px; overflow-y: auto">
        <div
          v-if="log.length === 0"
          style="padding: 24px; text-align: center; color: var(--color-muted); font-size: 13px"
        >
          Waiting for results…
        </div>
        <table v-else style="width: 100%; border-collapse: collapse; font-size: 12px">
          <tbody>
            <tr
              v-for="(entry, i) in log"
              :key="i"
              style="border-bottom: 1px solid var(--color-border)"
            >
              <td
                v-if="showPageCol"
                style="
                  padding: 6px 12px;
                  white-space: nowrap;
                  color: var(--color-muted);
                  font-family: var(--font-mono);
                  width: 60px;
                "
              >
                {{ entry.page !== undefined ? "p" + entry.page : "" }}
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
</template>
