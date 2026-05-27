<script setup lang="ts">
import { useRoute } from "vue-router";
import { FolderSync, Tag, Layers, Zap, Users, Wand2 } from "lucide-vue-next";

const route = useRoute();

const nav = [
  { path: "/renamer", label: "Renamer", icon: FolderSync },
  { path: "/tagger", label: "Auto Tagger", icon: Tag },
  { path: "/bulk-tagger", label: "Bulk Tagger", icon: Zap },
  { path: "/performer-tagger", label: "Performer Tagger", icon: Users },
  { path: "/bulk-performer-tagger", label: "Bulk Performers", icon: Wand2 },
];
</script>

<template>
  <aside
    class="flex h-screen w-52 shrink-0 flex-col border-r"
    style="
      background: var(--color-surface);
      border-color: var(--color-border);
      position: sticky;
      top: 0;
    "
  >
    <!-- Logo -->
    <div
      class="flex items-center gap-2 px-4 py-5"
      style="border-bottom: 1px solid var(--color-border)"
    >
      <Layers :size="16" style="color: var(--color-accent)" />
      <span style="font-weight: 600; letter-spacing: -0.01em; color: var(--color-text)">
        stash-tools
      </span>
    </div>

    <!-- Nav -->
    <nav class="flex-1 px-2 py-3 space-y-0.5">
      <router-link
        v-for="item in nav"
        :key="item.path"
        :to="item.path"
        class="flex items-center gap-2.5 rounded px-3 py-2 transition-colors"
        :style="{
          color: route.path === item.path ? 'var(--color-text)' : 'var(--color-muted)',
          background: route.path === item.path ? 'var(--color-surface-2)' : 'transparent',
          fontSize: '13px',
          fontWeight: route.path === item.path ? '500' : '400',
          textDecoration: 'none',
        }"
      >
        <component :is="item.icon" :size="14" />
        {{ item.label }}
      </router-link>
    </nav>

    <!-- Footer -->
    <div class="px-4 py-3" style="border-top: 1px solid var(--color-border)">
      <span style="font-size: 11px; color: var(--color-muted); font-family: var(--font-mono)">
        v0.1.0
      </span>
    </div>
  </aside>
</template>
