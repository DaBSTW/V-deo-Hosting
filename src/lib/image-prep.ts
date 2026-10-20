/**
 * Prepara una foto de documento en el navegador antes de subirla:
 *  - la redimensiona (lado mayor ≤ 2000 px) y la recomprime a JPEG;
 *  - al redibujarla en un <canvas> se descartan TODOS los metadatos EXIF
 *    (ubicación GPS, modelo de cámara…), que no deben salir del dispositivo.
 */
const MAX_SIDE = 2000;

export async function prepareIdPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("El archivo debe ser una imagen");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("No se pudo leer la imagen. Prueba con una foto JPG o PNG.");
  });
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("No se pudo procesar la imagen");
  return new File([blob], "foto.jpg", { type: "image/jpeg" });
}
