/** Utilidades de descarga compartidas por los adaptadores. */

/** Nombre de archivo seguro a partir del título (sin rutas ni caracteres raros). */
export function safeFileName(title: string, ext: string): string {
  const base =
    title
      .normalize("NFC")
      .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "video";
  return `${base}.${ext}`;
}

/** `Content-Disposition: attachment` con fallback ASCII y nombre UTF-8 (RFC 6266). */
export function attachmentDisposition(fileName: string): string {
  const ascii = fileName.normalize("NFD").replace(/[^\x20-\x7e]/g, "").replace(/"/g, "") || "video";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}
