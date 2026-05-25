<script setup lang="ts">
import { ref, computed } from "vue";
import { refDebounced } from "@vueuse/core";
import {
  ComboboxRoot,
  ComboboxAnchor,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxContent,
  ComboboxViewport,
  ComboboxItem,
  ComboboxEmpty,
} from "reka-ui";
import { ChevronDown, X } from "lucide-vue-next";

const props = defineProps<{
  options: string[];
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{ "update:modelValue": [string] }>();

// Raw query tracked via @input; debounced for filtering
const rawQuery = ref("");
const query = refDebounced(rawQuery, 150);

const filtered = computed(() => {
  const q = query.value.toLowerCase().trim();
  if (!q) return props.options.slice(0, 10);
  return props.options.filter((o) => o.toLowerCase().includes(q)).slice(0, 10);
});

function onInput(e: Event) {
  rawQuery.value = (e.target as HTMLInputElement).value;
}

function onSelect(val: string | undefined) {
  emit("update:modelValue", val ?? "");
  rawQuery.value = "";
}

function clear(e: MouseEvent) {
  e.stopPropagation();
  emit("update:modelValue", "");
  rawQuery.value = "";
}
</script>

<template>
  <ComboboxRoot
    :model-value="modelValue || undefined"
    :ignore-filter="true"
    :display-value="(v: unknown) => String(v)"
    @update:model-value="onSelect"
    style="position: relative; min-width: 160px"
  >
    <ComboboxAnchor
      style="
        display: flex;
        align-items: center;
        border: 1px solid var(--color-border-2);
        border-radius: 6px;
        background: var(--color-surface-2);
        height: 30px;
        overflow: hidden;
      "
    >
      <ComboboxInput
        :placeholder="placeholder ?? 'Filter…'"
        @input="onInput"
        style="
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          padding: 0 8px;
          font-size: 12px;
          font-family: var(--font-sans);
          color: var(--color-text);
          min-width: 0;
          height: 100%;
        "
      />
      <!-- Clear button when value is selected -->
      <button
        v-if="modelValue"
        @click="clear"
        tabindex="-1"
        style="
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 4px;
          background: transparent;
          border: none;
          cursor: pointer;
          color: var(--color-muted);
          height: 100%;
          flex-shrink: 0;
        "
      >
        <X :size="11" />
      </button>
      <!-- Chevron trigger -->
      <ComboboxTrigger
        style="
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 7px;
          background: transparent;
          border: none;
          border-left: 1px solid var(--color-border);
          cursor: pointer;
          color: var(--color-muted);
          height: 100%;
          flex-shrink: 0;
        "
      >
        <ChevronDown :size="11" />
      </ComboboxTrigger>
    </ComboboxAnchor>

    <ComboboxContent
      :avoid-collisions="true"
      style="
        position: absolute;
        top: calc(100% + 4px);
        left: 0;
        right: 0;
        z-index: 50;
        border: 1px solid var(--color-border-2);
        border-radius: 6px;
        background: var(--color-surface-2);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        overflow: hidden;
      "
    >
      <ComboboxViewport style="max-height: 220px; overflow-y: auto">
        <ComboboxEmpty
          style="padding: 10px 12px; font-size: 12px; color: var(--color-muted); text-align: center"
        >
          No results
        </ComboboxEmpty>
        <ComboboxItem
          v-for="opt in filtered"
          :key="opt"
          :value="opt"
          style="
            padding: 7px 12px;
            font-size: 12px;
            cursor: pointer;
            color: var(--color-text-2);
            outline: none;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            transition: background 0.08s;
          "
          :data-selected="opt === modelValue"
        >
          <span
            :style="{
              color: opt === modelValue ? 'var(--color-accent)' : 'var(--color-text-2)',
            }"
          >
            {{ opt }}
          </span>
        </ComboboxItem>
      </ComboboxViewport>
    </ComboboxContent>
  </ComboboxRoot>
</template>

<style scoped>
/* highlight on keyboard focus / hover — CSS data attribute approach */
:deep([data-highlighted]) {
  background: var(--color-surface) !important;
}
</style>
