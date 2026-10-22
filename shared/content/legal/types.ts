/** Estructura de un documento legal (texto plano: se renderiza de forma segura). */
export type LegalBlock = string | { list: string[] };

export interface LegalSection {
  title: string;
  blocks: LegalBlock[];
}

export interface LegalDoc {
  title: string;
  summary: string;
  sections: LegalSection[];
}

/** Datos del operador que se insertan en los textos (desde variables de entorno). */
export interface OperatorInfo {
  app: string;
  entity: string;
  url: string;
  email: string;
  dmcaEmail: string;
  address: string;
  jurisdiction: string;
  kycRetentionDays: number;
  minPayoutUsd: number;
  /** Porcentaje del RPM real que se acredita a los creadores. */
  revenueSharePct: number;
}
