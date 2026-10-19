import Link from "next/link";
import { APP_NAME } from "@/lib/brand";
import { getSessionUser } from "@/server/auth/session";

export default async function Home() {
  const user = await getSessionUser();
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
      <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
        {APP_NAME}
      </span>
      <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
        Sube, gestiona e incrusta tus videos.
      </h1>
      <p className="mt-4 max-w-xl text-zinc-600">
        Subida directa y rápida, reproductor ligero y adaptable, y un código de inserción listo para
        pegar en cualquier web.
      </p>
      <div className="mt-8 flex gap-3">
        {user ? (
          <Link href="/dashboard" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
            Ir a mis videos
          </Link>
        ) : (
          <>
            <Link href="/register" className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700">
              Crear cuenta
            </Link>
            <Link href="/login" className="rounded-lg border border-zinc-300 bg-white px-5 py-2.5 text-sm font-medium hover:bg-zinc-100">
              Iniciar sesión
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
