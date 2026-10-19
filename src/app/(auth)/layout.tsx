import Link from "next/link";
import { APP_NAME } from "@/lib/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-8 block text-center text-lg font-semibold tracking-tight">
          {APP_NAME}
        </Link>
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
