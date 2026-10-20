import type { AppLocale } from "./config";
import type es from "./messages/es";

// Claves de traducción tipadas: un `t("clave.inexistente")` falla al compilar.
declare module "next-intl" {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof es;
  }
}
