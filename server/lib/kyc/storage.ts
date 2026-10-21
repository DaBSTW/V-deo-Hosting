/**
 * Almacenamiento de documentos de identidad (ya cifrados) en el disco del VPS.
 * Deliberadamente NO se usa el bucket de videos: ese bucket puede estar
 * expuesto por un dominio público. Monta KYC_STORAGE_DIR en un volumen
 * persistente e inclúyelo en tus copias de seguridad.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getCoreEnv } from "#srv/env";
import { randomToken } from "#shared/lib/ids";

const KEY_RE = /^[0-9A-Za-z]{32}\.bin$/;
const dir = () => path.resolve(getCoreEnv().KYC_STORAGE_DIR);

function fullPath(key: string): string {
  if (!KEY_RE.test(key)) throw new Error("Clave de documento inválida");
  return path.join(dir(), key);
}

export async function putDocument(sealed: Buffer): Promise<string> {
  await mkdir(dir(), { recursive: true, mode: 0o700 });
  const key = `${randomToken(32)}.bin`;
  await writeFile(fullPath(key), sealed, { mode: 0o600 });
  return key;
}

export const getDocument = (key: string) => readFile(fullPath(key));

export async function deleteDocument(key: string) {
  await rm(fullPath(key), { force: true });
}
