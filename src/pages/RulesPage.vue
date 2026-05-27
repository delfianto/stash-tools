<script setup lang="ts">
import { ref, onMounted } from "vue";
import { BookOpen, ChevronDown, Save, CheckCircle, AlertCircle, Edit2 } from "lucide-vue-next";
import PageHeader from "@/components/PageHeader.vue";

interface RuleHealth {
  count: number;
  error: string;
}

interface RulePanel {
  key: "tag-rules" | "performer-rules";
  label: string;
  health: RuleHealth;
  content: string;
  editing: boolean;
  draft: string;
  saving: boolean;
  saveError: string;
  open: boolean;
  descriptions: string[];
}

const panels = ref<RulePanel[]>([
  {
    key: "tag-rules",
    label: "Tag Rules",
    health: { count: 0, error: "" },
    content: "",
    editing: false,
    draft: "",
    saving: false,
    saveError: "",
    open: false,
    descriptions: [],
  },
  {
    key: "performer-rules",
    label: "Performer Rules",
    health: { count: 0, error: "" },
    content: "",
    editing: false,
    draft: "",
    saving: false,
    saveError: "",
    open: false,
    descriptions: [],
  },
]);

const healthLoading = ref(true);

function extractDescriptions(raw: string): string[] {
  try {
    const arr = JSON.parse(raw) as Array<{ description?: string }>;
    if (!Array.isArray(arr)) return [];
    return arr.map((r, i) => r.description ?? `Rule ${i + 1}`);
  } catch {
    return [];
  }
}

async function loadHealth() {
  healthLoading.value = true;
  try {
    const resp = await fetch("/api/rules");
    const data = await resp.json();
    panels.value[0].health = data.tagRules ?? { count: 0, error: "Failed to load" };
    panels.value[1].health = data.performerRules ?? { count: 0, error: "Failed to load" };
  } finally {
    healthLoading.value = false;
  }
}

async function loadContent(panel: RulePanel) {
  const resp = await fetch(`/api/rules/${panel.key}`);
  const data = await resp.json();
  panel.content = data.content ?? "[]";
  panel.descriptions = extractDescriptions(panel.content);
}

async function toggleOpen(panel: RulePanel) {
  panel.open = !panel.open;
  if (panel.open && !panel.content) await loadContent(panel);
}

async function startEdit(panel: RulePanel) {
  if (!panel.content) await loadContent(panel);
  panel.draft = panel.content;
  panel.editing = true;
  panel.saveError = "";
}

function validateDraft(panel: RulePanel): string {
  try {
    const parsed = JSON.parse(panel.draft);
    if (!Array.isArray(parsed)) return "Must be a JSON array";
    return "";
  } catch (e) {
    return String(e);
  }
}

async function save(panel: RulePanel) {
  const clientError = validateDraft(panel);
  if (clientError) {
    panel.saveError = clientError;
    return;
  }

  panel.saving = true;
  panel.saveError = "";
  try {
    const resp = await fetch(`/api/rules/${panel.key}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: panel.draft }),
    });
    const data = await resp.json();
    if (data.error) {
      panel.saveError = data.error;
    } else {
      panel.content = panel.draft;
      panel.health = { count: data.count, error: "" };
      panel.descriptions = extractDescriptions(panel.content);
      panel.editing = false;
    }
  } catch (e) {
    panel.saveError = String(e);
  } finally {
    panel.saving = false;
  }
}

function cancelEdit(panel: RulePanel) {
  panel.editing = false;
  panel.saveError = "";
  panel.draft = "";
}

onMounted(loadHealth);
</script>

<template>
  <div class="p-8 w-full">
    <PageHeader
      title="Rules Editor"
      description="View, validate, and edit tag rules and performer rules in-app."
    />

    <div
      v-if="healthLoading"
      style="color: var(--color-muted); font-size: 13px; padding: 40px 0; text-align: center"
    >
      Loading rules…
    </div>

    <div v-else class="space-y-4">
      <div
        v-for="panel in panels"
        :key="panel.key"
        class="rounded-lg overflow-hidden"
        style="border: 1px solid var(--color-border); background: var(--color-surface)"
      >
        <!-- Header row -->
        <div
          class="flex items-center gap-3 px-4 py-3"
          style="border-bottom: 1px solid var(--color-border)"
        >
          <!-- Expand toggle -->
          <button
            @click="toggleOpen(panel)"
            class="flex items-center gap-2 flex-1 text-left"
            style="
              background: transparent;
              border: none;
              cursor: pointer;
              font-family: var(--font-sans);
            "
          >
            <ChevronDown
              :size="14"
              style="color: var(--color-muted); transition: transform 0.2s; flex-shrink: 0"
              :style="{ transform: panel.open ? 'rotate(180deg)' : 'rotate(0deg)' }"
            />
            <BookOpen :size="13" style="color: var(--color-accent); flex-shrink: 0" />
            <span style="font-size: 13px; font-weight: 500; color: var(--color-text)">
              {{ panel.label }}
            </span>
            <!-- count badge -->
            <span
              v-if="!panel.health.error"
              style="
                font-size: 11px;
                color: var(--color-muted);
                font-family: var(--font-mono);
                background: var(--color-surface-2);
                padding: 1px 6px;
                border-radius: 4px;
              "
            >
              {{ panel.health.count }} rules
            </span>
            <!-- error badge -->
            <span
              v-else
              class="flex items-center gap-1"
              style="
                font-size: 11px;
                color: var(--color-err);
                font-family: var(--font-mono);
                background: color-mix(in srgb, var(--color-err) 12%, transparent);
                padding: 1px 6px;
                border-radius: 4px;
              "
            >
              <AlertCircle :size="10" />
              Error
            </span>
          </button>

          <!-- Edit button -->
          <button
            @click="startEdit(panel)"
            :disabled="panel.editing"
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
              white-space: nowrap;
            "
            :style="{ opacity: panel.editing ? '0.4' : '1' }"
          >
            <Edit2 :size="11" />
            Edit
          </button>
        </div>

        <!-- Error message -->
        <div
          v-if="panel.health.error"
          style="
            padding: 10px 16px;
            font-size: 12px;
            font-family: var(--font-mono);
            color: var(--color-err);
            background: color-mix(in srgb, var(--color-err) 6%, transparent);
            border-bottom: 1px solid var(--color-border);
          "
        >
          {{ panel.health.error }}
        </div>

        <!-- Rule list (collapsed view) -->
        <div v-if="panel.open && !panel.editing" style="padding: 8px 0">
          <div
            v-if="!panel.descriptions.length"
            style="padding: 16px; color: var(--color-muted); font-size: 13px; text-align: center"
          >
            No rules defined.
          </div>
          <div
            v-for="(desc, i) in panel.descriptions"
            :key="i"
            class="flex items-center gap-3 px-4 py-2"
            style="border-bottom: 1px solid var(--color-border); font-size: 12px"
          >
            <span
              style="
                font-family: var(--font-mono);
                font-size: 10px;
                color: var(--color-muted);
                width: 24px;
                flex-shrink: 0;
                text-align: right;
              "
            >
              {{ i + 1 }}
            </span>
            <span style="color: var(--color-text-2)">{{ desc }}</span>
          </div>
        </div>

        <!-- Editor -->
        <div v-if="panel.editing" style="padding: 12px 16px">
          <textarea
            v-model="panel.draft"
            rows="20"
            style="
              width: 100%;
              box-sizing: border-box;
              font-family: var(--font-mono);
              font-size: 12px;
              background: var(--color-surface-2);
              color: var(--color-text);
              border: 1px solid var(--color-border);
              border-radius: 6px;
              padding: 10px 12px;
              resize: vertical;
              outline: none;
            "
          />

          <!-- Save error -->
          <div
            v-if="panel.saveError"
            class="flex items-center gap-2 mt-2"
            style="font-size: 12px; color: var(--color-err); font-family: var(--font-mono)"
          >
            <AlertCircle :size="12" />
            {{ panel.saveError }}
          </div>

          <div class="flex items-center gap-3 mt-3">
            <button
              @click="save(panel)"
              :disabled="panel.saving"
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
              :style="{ opacity: panel.saving ? '0.6' : '1' }"
            >
              <Save :size="13" />
              {{ panel.saving ? "Saving…" : "Save" }}
            </button>
            <button
              @click="cancelEdit(panel)"
              :disabled="panel.saving"
              style="
                padding: 6px 12px;
                border-radius: 6px;
                border: 1px solid var(--color-border-2);
                background: transparent;
                color: var(--color-text-2);
                font-size: 13px;
                cursor: pointer;
                font-family: var(--font-sans);
              "
            >
              Cancel
            </button>
            <span
              v-if="!panel.saveError && !panel.saving"
              style="font-size: 11px; color: var(--color-muted)"
            >
              <CheckCircle
                v-if="!validateDraft(panel)"
                :size="11"
                style="display: inline; color: var(--color-ok); vertical-align: middle"
              />
              {{ validateDraft(panel) ? validateDraft(panel) : "Valid JSON array" }}
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
