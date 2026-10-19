// Carga `.env` si existe (en Docker las variables ya vienen del entorno).
try {
  process.loadEnvFile?.(".env");
} catch {
  /* sin .env: se usan las variables del proceso */
}
