import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { requirePageUser } from "@/server/auth/session";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-zinc-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/dashboard" className="font-semibold tracking-tight">{APP_NAME}</Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-zinc-500 sm:inline">{user.name ?? user.email}</span>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
