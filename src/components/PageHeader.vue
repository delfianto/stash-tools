<script setup lang="ts">
defineProps<{
  title: string;
  description?: string;
}>();
</script>

<template>
  <div class="mb-6">
    <h1
      style="
        font-size: 18px;
        font-weight: 600;
        letter-spacing: -0.02em;
        color: var(--color-text);
        margin: 0 0 4px;
      "
    >
      {{ title }}
    </h1>
    <p v-if="description" style="margin: 0; color: var(--color-muted); font-size: 13px">
      {{ description }}
    </p>
    <slot />
  </div>
</template>
