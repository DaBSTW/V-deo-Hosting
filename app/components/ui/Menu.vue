<script setup lang="ts">
/**
 * Menú desplegable (cierra con clic fuera o Escape).
 * `items`: acciones, `"separator"` o `{ heading }`.
 */
import { Check } from "lucide-vue-next";
import type { MenuAction, MenuEntry } from "~/types/ui";

const props = withDefaults(defineProps<{ items: MenuEntry[]; align?: "left" | "right"; label: string; up?: boolean; width?: string }>(), {
  align: "right",
  width: "w-60",
});
const open = ref(false);
const root = ref<HTMLElement>();

useDismiss(root, open);

const select = (item: MenuAction) => {
  open.value = false;
  item.onSelect();
};
const isAction = (e: MenuEntry): e is MenuAction => typeof e === "object" && "label" in e;
defineExpose({ open });
</script>

<template>
  <div ref="root" class="relative" @click.stop>
    <slot name="trigger" :open="open" :toggle="() => (open = !open)" />
    <Transition
      enter-active-class="transition duration-100 ease-out"
      enter-from-class="scale-95 opacity-0"
      leave-active-class="transition duration-75 ease-in"
      leave-to-class="scale-95 opacity-0"
    >
      <div
        v-if="open"
        role="menu"
        :aria-label="label"
        :class="[
          'absolute z-40 max-h-96 overflow-y-auto rounded-2xl border border-divider bg-raised p-1.5 shadow-floating',
          width,
          align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left',
          props.up ? 'bottom-full mb-2' : 'mt-2',
        ]"
      >
        <template v-for="(item, i) in items" :key="i">
          <div v-if="item === 'separator'" class="mx-2 my-1.5 h-px bg-divider" />
          <p v-else-if="!isAction(item)" class="px-3 pb-1 pt-2 text-xs font-bold uppercase tracking-wide text-secondary">{{ item.heading }}</p>
          <button
            v-else
            role="menuitem"
            :disabled="item.disabled"
            :class="[
              'flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold transition disabled:opacity-40 [&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:shrink-0',
              item.danger ? 'text-red hover:bg-red-soft' : 'text-primary hover:bg-button hover:text-contrast',
            ]"
            @click="select(item)"
          >
            <component :is="item.icon" v-if="item.icon" />
            <span class="min-w-0 flex-1 truncate">{{ item.label }}</span>
            <Check v-if="item.checked" class="text-brand" />
          </button>
        </template>
      </div>
    </Transition>
  </div>
</template>
