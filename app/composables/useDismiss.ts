import type { Ref } from "vue";

/** Cierra `open` con un clic fuera de `root` o con Escape (menús, desplegables). */
export function useDismiss(root: Ref<HTMLElement | undefined>, open: Ref<boolean>) {
  const onDown = (e: MouseEvent) => {
    if (!root.value?.contains(e.target as Node)) open.value = false;
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") open.value = false;
  };
  const stop = () => {
    document.removeEventListener("mousedown", onDown);
    document.removeEventListener("keydown", onKey);
  };
  watch(open, (o) => {
    if (o) {
      document.addEventListener("mousedown", onDown);
      document.addEventListener("keydown", onKey);
    } else stop();
  });
  onBeforeUnmount(stop);
}
