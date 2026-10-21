<script setup lang="ts">
import { Clock, VideoOff } from "lucide-vue-next";
defineProps<{ title?: string; message: string; kind?: "processing" | "error" }>();
</script>

<template>
  <div class="flex h-full w-full flex-col items-center justify-center gap-3 bg-black px-6 text-center">
    <span class="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-white/70">
      <Clock v-if="kind === 'processing'" class="h-6 w-6" />
      <VideoOff v-else class="h-6 w-6" />
    </span>
    <p v-if="title" class="max-w-md truncate text-base font-bold text-white">{{ title }}</p>
    <p class="max-w-sm text-sm text-white/60">{{ message }}</p>
  </div>
</template>
