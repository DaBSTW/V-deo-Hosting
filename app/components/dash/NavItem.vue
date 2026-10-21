<script setup lang="ts">
import type { Component } from "vue";
import { DRAG_MIME } from "~/composables/useDashboard";

const props = defineProps<{ icon: Component; label: string; count?: number; active: boolean; droppable?: boolean }>();
const emit = defineEmits<{ select: []; dropVideos: [ids: string[]] }>();
const over = ref(false);
const accepts = (e: DragEvent) => !!props.droppable && !!e.dataTransfer?.types.includes(DRAG_MIME);

function onDrop(e: DragEvent) {
  over.value = false;
  if (!accepts(e)) return;
  e.preventDefault();
  e.stopPropagation();
  emit("dropVideos", JSON.parse(e.dataTransfer!.getData(DRAG_MIME)));
}
function onOver(e: DragEvent) {
  if (!accepts(e)) return;
  e.preventDefault();
  e.dataTransfer!.dropEffect = "move";
  over.value = true;
}
</script>

<template>
  <div
    :class="[
      'group/nav flex items-center rounded-xl pr-1 transition',
      over ? 'bg-brand-highlight ring-2 ring-brand' : active ? 'bg-brand-highlight' : 'hover:bg-button',
    ]"
    @dragover="onOver"
    @dragleave="over = false"
    @drop="onDrop"
  >
    <button
      type="button"
      :aria-current="active ? 'page' : undefined"
      class="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2 text-left text-[15px] font-semibold"
      @click="emit('select')"
    >
      <component :is="icon" :class="['h-5 w-5 shrink-0', active ? 'text-brand' : 'text-secondary']" />
      <span :class="['min-w-0 flex-1 truncate', active ? 'text-brand' : 'text-primary group-hover/nav:text-contrast']">{{ label }}</span>
      <span
        v-if="count !== undefined"
        :class="['text-xs font-bold tabular-nums', active ? 'text-brand' : 'text-secondary', $slots.menu ? 'group-focus-within/nav:hidden group-hover/nav:hidden' : '']"
        >{{ count }}</span
      >
    </button>
    <div v-if="$slots.menu" class="hidden group-focus-within/nav:block group-hover/nav:block group-has-[[role=menu]]/nav:block"><slot name="menu" /></div>
  </div>
</template>
