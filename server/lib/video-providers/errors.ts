/**
 * Errores del dominio de proveedores. El mensaje técnico va a los logs;
 * la capa HTTP los traduce a mensajes genéricos sin nombres de infraestructura.
 */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly options: { cause?: unknown; retryable?: boolean } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = "ProviderError";
  }
}

export class WebhookAuthError extends Error {
  constructor(message = "Firma de webhook inválida") {
    super(message);
    this.name = "WebhookAuthError";
  }
}
