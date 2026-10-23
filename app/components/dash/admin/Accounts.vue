<script setup lang="ts">
/** Administración → Cuentas: buscar usuarios y suspender o reactivar su monetización. */
import { Ban, CircleCheck, Search } from "lucide-vue-next";
import type { AdminUser } from "#srv/monetization/admin";

const d = useDashboard();
const dialogs = useDialogs();
const { t } = useI18n();
const fmt = useFormat();
const q = ref("");
const suspendedOnly = ref(false);
const users = ref<AdminUser[] | null>(null);
const busyId = ref<string | null>(null);

let timer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  const qs = new URLSearchParams({ q: q.value.trim(), ...(suspendedOnly.value ? { suspended: "1" } : {}) });
  try {
    users.value = (await api<{ users: AdminUser[] }>(`/api/admin/users?${qs}`)).users;
  } catch (err) {
    d.notify(d.errMsg(err));
  }
}
onMounted(load);
watch(q, () => {
  clearTimeout(timer);
  timer = setTimeout(load, 300);
});
watch(suspendedOnly, load);

async function apply(u: AdminUser, enabled: boolean) {
  busyId.value = u.id;
  try {
    const { user } = await api<{ user: AdminUser }>(`/api/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify({ monetizationEnabled: enabled }) });
    users.value = (users.value ?? []).map((x) => (x.id === user.id ? user : x)).filter((x) => !suspendedOnly.value || !x.monetizationEnabled);
    d.notify(enabled ? t("adminAccounts.reactivated", { email: u.email }) : t("adminAccounts.suspended", { email: u.email }));
  } catch (err) {
    d.notify(d.errMsg(err));
  }
  busyId.value = null;
}

const toggle = (u: AdminUser) =>
  u.monetizationEnabled
    ? dialogs.confirm({
        title: t("adminAccounts.suspendTitle"),
        message: t("adminAccounts.suspendMsg", { email: u.email }),
        confirmLabel: t("adminAccounts.suspend"),
        danger: true,
        onConfirm: () => apply(u, false),
      })
    : apply(u, true);
</script>

<template>
  <DashCard :title="t('adminAccounts.title')" :subtitle="t('adminAccounts.subtitle')" :padded="false">
    <div class="flex flex-wrap items-center gap-3 px-5 pb-4">
      <label class="relative min-w-0 flex-1">
        <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-secondary" />
        <input v-model="q" type="search" class="input !pl-9" :placeholder="t('adminAccounts.search')" :aria-label="t('adminAccounts.search')" />
      </label>
      <label class="flex items-center gap-2 text-sm font-semibold text-primary">
        <UiToggle v-model="suspendedOnly" :label="t('adminAccounts.onlySuspended')" />
        {{ t("adminAccounts.onlySuspended") }}
      </label>
    </div>
    <div v-if="users?.length" class="overflow-x-auto">
      <table class="w-full min-w-[620px] text-sm">
        <thead>
          <tr class="border-y border-divider text-left text-xs font-bold uppercase tracking-wide text-secondary">
            <th class="px-5 py-2.5">{{ t("adminAccounts.account") }}</th>
            <th class="px-5 py-2.5 text-right">{{ t("adminAccounts.videos") }}</th>
            <th class="px-5 py-2.5">{{ t("adminAccounts.since") }}</th>
            <th class="px-5 py-2.5">{{ t("adminAccounts.monetization") }}</th>
            <th class="px-5 py-2.5" />
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.id" class="border-b border-divider last:border-0">
            <td class="max-w-[260px] px-5 py-3">
              <p class="truncate font-semibold text-contrast">{{ u.email }}</p>
              <p v-if="u.name" class="truncate text-xs text-secondary">{{ u.name }}</p>
            </td>
            <td class="px-5 py-3 text-right tabular-nums text-primary">{{ fmt.formatCount(u.videos) }}</td>
            <td class="px-5 py-3 text-secondary">{{ fmt.formatDate(u.createdAt) }}</td>
            <td class="px-5 py-3">
              <UiBadge :color="u.monetizationEnabled ? 'brand' : 'red'">{{ u.monetizationEnabled ? t("adminAccounts.active") : t("adminAccounts.suspendedBadge") }}</UiBadge>
            </td>
            <td class="px-5 py-3 text-right">
              <UiButton size="sm" :color="u.monetizationEnabled ? 'outline' : 'brand'" :disabled="busyId === u.id" @click="toggle(u)">
                <component :is="u.monetizationEnabled ? Ban : CircleCheck" />{{ u.monetizationEnabled ? t("adminAccounts.suspend") : t("adminAccounts.reactivate") }}
              </UiButton>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else-if="users" class="px-5 pb-5 text-sm text-secondary">{{ t("adminAccounts.empty") }}</p>
  </DashCard>
</template>
