import Link from "next/link";
import { SiteFooter } from "@/components/legal/SiteFooter";
import { APP_NAME } from "@/lib/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-8 block text-center text-lg font-semibold tracking-tight">
            {APP_NAME}
          </Link>
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">{children}</div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
