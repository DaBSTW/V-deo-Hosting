export function PlayerMessage({ title, message }: { title?: string; message: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-black px-6 text-center">
      {title && <p className="max-w-md truncate text-sm font-medium text-zinc-300">{title}</p>}
      <p className="text-sm text-zinc-400">{message}</p>
    </div>
  );
}
