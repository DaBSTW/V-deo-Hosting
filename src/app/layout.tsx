import type { Metadata, Viewport } from "next";
import { APP_NAME } from "@/lib/brand";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: APP_NAME, template: `%s · ${APP_NAME}` },
  description: "Aloja, gestiona e incrusta tus videos.",
};

export const viewport: Viewport = { themeColor: "#0b0d12" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-full bg-zinc-50 font-sans text-zinc-900 antialiased">{children}</body>
    </html>
  );
}
