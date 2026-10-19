export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-black px-6 text-center">
      <p className="text-sm font-medium text-zinc-300">Contenido no encontrado</p>
      <p className="text-sm text-zinc-500">El enlace no existe o el video fue eliminado.</p>
    </main>
  );
}
