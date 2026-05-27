<script setup lang="ts">
defineProps<{
  variant: "ok" | "error" | "dry" | "muted" | "pending" | "loading";
  text: string;
}>();
</script>

<template>
  <span
    :style="{
      fontFamily: 'var(--font-mono)',
      fontSize: '12px',
      color:
        variant === 'ok'
          ? 'var(--color-ok)'
          : variant === 'error'
            ? 'var(--color-err)'
            : variant === 'dry'
              ? 'var(--color-accent)'
              : 'var(--color-muted)',
    }"
  >
    <template v-if="variant === 'ok'">✓ </template>
    <template v-else-if="variant === 'error'">✗ </template>
    <template v-else-if="variant === 'dry'">→ </template>
    {{ text || (variant === "loading" ? "…" : "") }}
  </span>
</template>
