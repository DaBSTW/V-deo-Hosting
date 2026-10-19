"use client";

import { useRouter } from "next/navigation";

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.replace("/login");
        router.refresh();
      }}
      className="rounded-lg px-3 py-1.5 font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
    >
      Salir
    </button>
  );
}
