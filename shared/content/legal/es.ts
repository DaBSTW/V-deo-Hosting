import type { LegalSlug } from "#shared/content/legal/links";
import type { LegalDoc, OperatorInfo } from "./types";

/**
 * Textos legales en español. Son una base razonable para una plataforma de
 * alojamiento de video con publicidad y pagos a creadores, pero DEBEN ser
 * revisados por un abogado de tu jurisdicción antes de publicarse.
 */
export function legalDocsEs(o: OperatorInfo): Record<LegalSlug, LegalDoc> {
  /** Evita el doble punto si el nombre termina en «.» (p. ej. «S.L.»). */
  const end = (s: string) => (s.endsWith(".") ? s : `${s}.`);
  const where = o.jurisdiction ? ` de ${o.jurisdiction}` : " del país donde está establecido el operador";
  return {
    terms: {
      title: "Términos de servicio",
      summary: `Las condiciones que rigen el uso de ${o.app}. Al crear una cuenta o usar el servicio aceptas estos términos.`,
      sections: [
        {
          title: "1. Quiénes somos y aceptación",
          blocks: [
            `${o.app} (en adelante, «el servicio») es operado por ${end(`${o.entity}${o.address ? `, con domicilio en ${o.address}` : ""}`)} Al registrarte, subir contenido o usar el servicio de cualquier forma, aceptas estos Términos, la Política de privacidad, la Política de cookies, la Política de uso aceptable y la Política de derechos de autor, que forman parte de este acuerdo.`,
            "Si no estás de acuerdo con alguna de estas condiciones, no uses el servicio.",
          ],
        },
        {
          title: "2. El servicio",
          blocks: [
            "El servicio permite alojar videos, gestionarlos y compartirlos mediante enlaces directos y códigos de inserción (iframe) en otros sitios web. El contenido se almacena y distribuye a través de proveedores de infraestructura de terceros.",
            "Podemos modificar, ampliar o retirar funciones en cualquier momento. Procuraremos avisar con antelación de los cambios relevantes.",
          ],
        },
        {
          title: "3. Cuentas",
          blocks: [
            {
              list: [
                "Debes tener al menos 18 años o la mayoría de edad legal de tu país.",
                "Debes proporcionar información veraz y mantener tu contraseña en secreto. Eres responsable de toda la actividad realizada desde tu cuenta.",
                "No puedes crear cuentas de forma automatizada, ni tener varias cuentas para eludir límites, sanciones o las reglas de monetización.",
              ],
            },
          ],
        },
        {
          title: "4. Tu contenido",
          blocks: [
            "Conservas todos los derechos sobre los videos y materiales que subes. Para poder prestar el servicio, nos concedes una licencia mundial, no exclusiva, gratuita y transferible a nuestros proveedores, para alojar, copiar, transcodificar, generar miniaturas, almacenar, mostrar y distribuir tu contenido a través de los enlaces y reproductores que tú compartas, así como para mostrar publicidad junto a él cuando la monetización esté activa.",
            "Esta licencia termina cuando eliminas el contenido, salvo copias de seguridad residuales durante un tiempo limitado, y salvo lo necesario para cumplir obligaciones legales o resolver disputas.",
            "Declaras que tienes todos los derechos y permisos necesarios sobre el contenido que subes, incluidos los de las personas que aparecen en él, y que el contenido no infringe la ley ni estos Términos.",
          ],
        },
        {
          title: "5. Normas de uso",
          blocks: [
            "Debes cumplir la Política de uso aceptable. Podemos retirar contenido, limitar funciones o suspender cuentas que la incumplan, con o sin aviso previo, especialmente si existe riesgo para terceros o una obligación legal.",
          ],
        },
        {
          title: "6. Derechos de autor",
          blocks: [
            "Respetamos la propiedad intelectual y respondemos a las notificaciones de infracción conforme a nuestra Política de derechos de autor. Cerraremos las cuentas de los infractores reincidentes.",
          ],
        },
        {
          title: "7. Publicidad y monetización",
          blocks: [
            "Las páginas públicas de reproducción y los reproductores insertados pueden mostrar publicidad de terceros. Los creadores pueden participar en el programa de monetización, que se rige por los Términos del programa de monetización.",
          ],
        },
        {
          title: "8. Suscripción Premium",
          blocks: [
            `Premium es una suscripción opcional de pago para espectadores: reproducción sin anuncios en ${o.app}, descargas sin la espera de ${o.freeDownloadWaitSec} segundos y sin límite de velocidad. Precios: ${o.premiumMonthlyUsd.toFixed(2)} USD al mes o ${o.premiumYearlyUsd.toFixed(2)} USD al año, impuestos incluidos si corresponden, salvo que la página de pago indique otra cosa.`,
            {
              list: [
                "El pago se procesa con PayPal. No almacenamos los datos de tu tarjeta ni de tu cuenta de PayPal; solo el identificador de la suscripción y de cada cobro.",
                "La suscripción se renueva automáticamente al final de cada periodo hasta que la canceles. Puedes cancelarla en cualquier momento desde tu panel o desde PayPal; conservarás las ventajas hasta el final del periodo ya pagado.",
                "Salvo que la ley de tu país disponga otra cosa, los periodos ya iniciados no se reembolsan. Si un cobro se reembolsa o se revierte, las ventajas asociadas terminan.",
                "Podemos cambiar el precio avisándote con antelación; el nuevo precio solo se aplica a las suscripciones nuevas o a partir de la siguiente renovación tras el aviso.",
                "En los reproductores insertados en otros sitios, las ventajas dependen de que tu navegador permita la cookie de Premium; si la bloquea, el reproductor se comporta como para un usuario gratuito.",
                `El ${o.premiumSharePct} % de los ingresos netos de Premium se reparte entre los creadores según las vistas de suscriptores que reciben sus videos, conforme a los Términos del programa de monetización.`,
              ],
            },
          ],
        },
        {
          title: "9. Suspensión y cancelación",
          blocks: [
            "Puedes dejar de usar el servicio y eliminar tu contenido en cualquier momento. Podemos suspender o cancelar tu cuenta si incumples estos Términos, si lo exige la ley o si tu uso pone en riesgo el servicio o a terceros. En caso de fraude, las ganancias pendientes podrán ser retenidas conforme a los Términos del programa de monetización.",
          ],
        },
        {
          title: "10. Exención de garantías",
          blocks: [
            "El servicio se ofrece «tal cual» y «según disponibilidad». En la medida permitida por la ley, no garantizamos que funcione sin interrupciones o errores, ni que el contenido almacenado no pueda perderse. Te recomendamos conservar copias de tus archivos originales.",
          ],
        },
        {
          title: "11. Limitación de responsabilidad",
          blocks: [
            "En la medida permitida por la ley, no seremos responsables de daños indirectos, lucro cesante, pérdida de datos o daños derivados del contenido de los usuarios. Nuestra responsabilidad total frente a ti no superará la mayor de estas cantidades: lo que nos hayas pagado en los últimos 12 meses, o 100 USD. Nada de lo anterior limita la responsabilidad que la ley no permita limitar.",
          ],
        },
        {
          title: "12. Indemnización",
          blocks: [
            "Te comprometes a mantenernos indemnes frente a reclamaciones de terceros derivadas del contenido que subas o del incumplimiento de estos Términos.",
          ],
        },
        {
          title: "13. Ley aplicable",
          blocks: [
            `Estos Términos se rigen por las leyes${where}. Cualquier controversia se someterá a los tribunales competentes de esa jurisdicción, sin perjuicio de los derechos que te reconozca la normativa de protección de consumidores de tu país de residencia.`,
          ],
        },
        {
          title: "14. Cambios",
          blocks: [
            "Podemos actualizar estos Términos. Si los cambios son importantes, te avisaremos por el servicio o por email antes de que entren en vigor. Si sigues usando el servicio después, aceptas la nueva versión.",
          ],
        },
        { title: "15. Contacto", blocks: [`Para cualquier consulta sobre estos Términos: ${o.email}.`] },
      ],
    },

    privacy: {
      title: "Política de privacidad",
      summary: "Qué datos personales tratamos, para qué, con quién los compartimos, cuánto tiempo los conservamos y cómo ejercer tus derechos.",
      sections: [
        {
          title: "1. Responsable del tratamiento",
          blocks: [`${end(`${o.entity}${o.address ? `, ${o.address}` : ""}`)} Contacto para privacidad: ${o.email}.`],
        },
        {
          title: "2. Datos que tratamos",
          blocks: [
            {
              list: [
                "Datos de cuenta: email, nombre (opcional) y contraseña (guardada solo como hash bcrypt, nunca en texto plano). También guardamos la fecha en que aceptaste estos documentos.",
                "Contenido: los videos que subes, sus títulos, miniaturas, carpetas y metadatos técnicos (duración, tamaño).",
                "Estadísticas de uso: reproducciones y descargas agregadas por video y día, y el país del espectador (aportado por nuestra red de distribución). Las direcciones IP se usan solo en memoria, de forma temporal, para evitar el recuento duplicado y el fraude; no se guardan en nuestra base de datos.",
                "Monetización: método y destino de cobro (por ejemplo, email de PayPal o dirección de wallet), historial de ganancias y pagos.",
                "Verificación de identidad (solo si solicitas un pago): nombre legal, fecha de nacimiento, país, tipo y número de documento, fotos del documento y una selfie con él.",
                "Cookies y almacenamiento local: ver la Política de cookies.",
              ],
            },
          ],
        },
        {
          title: "3. Finalidades y bases legales",
          blocks: [
            {
              list: [
                "Prestar el servicio (alojar, reproducir, compartir y gestionar tu contenido y tu cuenta): ejecución del contrato.",
                "Calcular y pagar las ganancias de monetización: ejecución del contrato.",
                "Verificar tu identidad antes de pagarte, prevenir el fraude y el blanqueo de capitales y cumplir obligaciones fiscales: obligación legal e interés legítimo.",
                "Proteger el servicio frente a abusos y tráfico fraudulento: interés legítimo.",
                "Mostrar publicidad en las páginas públicas de reproducción: interés legítimo y, cuando la ley lo exija, tu consentimiento.",
                "Atender solicitudes legales, como notificaciones de derechos de autor o requerimientos de autoridades: obligación legal.",
              ],
            },
          ],
        },
        {
          title: "4. Con quién compartimos los datos",
          blocks: [
            "No vendemos tus datos personales. Los compartimos solo con proveedores que nos ayudan a prestar el servicio y que actúan siguiendo nuestras instrucciones:",
            {
              list: [
                "Proveedores de almacenamiento y distribución de video (red de distribución de contenidos).",
                "Proveedor del servidor donde se aloja la plataforma y su base de datos.",
                "Redes publicitarias (como Monetag), que pueden tratar datos de los espectadores de las páginas públicas según sus propias políticas de privacidad.",
                "Proveedores de pago (como PayPal, Payoneer, redes de criptomonedas o tu banco) para enviarte tus ganancias.",
                "PayPal, para cobrar la suscripción Premium. PayPal trata tus datos de pago como responsable independiente según su propia política de privacidad; nosotros solo recibimos el estado de la suscripción y el importe de cada cobro.",
                "Autoridades, cuando lo exija la ley.",
              ],
            },
          ],
        },
        {
          title: "5. Transferencias internacionales",
          blocks: [
            "Algunos proveedores pueden tratar datos fuera de tu país. En esos casos aplicamos las garantías exigidas por la normativa aplicable, como las cláusulas contractuales tipo.",
          ],
        },
        {
          title: "6. Cuánto tiempo conservamos los datos",
          blocks: [
            {
              list: [
                "Cuenta y contenido: mientras tu cuenta esté activa. Al eliminar un video se borran sus archivos y estadísticas.",
                `Imágenes de verificación de identidad: se eliminan automáticamente ${o.kycRetentionDays} días después de aprobar o rechazar la verificación. Conservamos un registro mínimo: nombre, país, tipo de documento, sus últimos 4 caracteres y la decisión.`,
                "Registros de pagos: durante el plazo que exija la normativa fiscal y contable.",
              ],
            },
          ],
        },
        {
          title: "7. Seguridad",
          blocks: [
            "Usamos conexiones cifradas (HTTPS) y contraseñas con hash. Los documentos y números de identidad se cifran con AES-256-GCM antes de guardarse, y solo los pueden consultar las personas autorizadas del equipo de pagos. Ningún sistema es infalible: si detectamos una brecha que afecte a tus datos, te lo notificaremos conforme a la ley.",
          ],
        },
        {
          title: "8. Tus derechos",
          blocks: [
            `Puedes solicitar el acceso, la rectificación, la supresión, la portabilidad, la limitación del tratamiento o la oposición escribiendo a ${o.email}. También puedes retirar tu consentimiento cuando sea la base legal, y presentar una reclamación ante la autoridad de protección de datos de tu país.`,
          ],
        },
        {
          title: "9. Menores",
          blocks: ["El servicio no está dirigido a menores de 18 años. Si detectamos una cuenta de un menor, la cerraremos."],
        },
        {
          title: "10. Cambios",
          blocks: ["Si modificamos esta política de forma relevante, te lo comunicaremos antes de que el cambio entre en vigor."],
        },
      ],
    },

    cookies: {
      title: "Política de cookies",
      summary: "Qué cookies y tecnologías de almacenamiento usamos y cómo puedes gestionarlas.",
      sections: [
        {
          title: "1. Qué son",
          blocks: ["Las cookies son pequeños archivos que el navegador guarda al visitar un sitio. El almacenamiento local (localStorage) cumple una función parecida."],
        },
        {
          title: "2. Cookies propias (necesarias)",
          blocks: [
            {
              list: [
                "vh_session: mantiene tu sesión iniciada. Es estrictamente necesaria y dura 7 días.",
                "dp: pase firmado que indica si tu cuenta es Premium, para no mostrarte anuncios ni esperas (también en los reproductores insertados). Dura como máximo 3 días y se renueva sola.",
                "NEXT_LOCALE: recuerda el idioma que elegiste. Dura 1 año.",
              ],
            },
          ],
        },
        {
          title: "3. Almacenamiento local",
          blocks: [
            {
              list: [
                "dash:view: recuerda si prefieres ver tus videos en cuadrícula o en lista.",
                "player: preferencias del reproductor, como el volumen o la calidad.",
              ],
            },
            "Estos datos se quedan en tu navegador y no se envían a nuestros servidores.",
          ],
        },
        {
          title: "4. Cookies de terceros (publicidad)",
          blocks: [
            "Las páginas públicas de reproducción y los reproductores insertados de videos monetizados pueden cargar código de redes publicitarias, como Monetag. Estas redes pueden usar sus propias cookies o identificadores para mostrar anuncios, limitar su frecuencia y medir resultados. Su uso se rige por las políticas de privacidad de cada red. El panel de usuario no carga publicidad.",
          ],
        },
        {
          title: "5. Cómo gestionarlas",
          blocks: [
            "Puedes bloquear o borrar cookies desde la configuración de tu navegador. Si bloqueas las cookies necesarias, no podrás iniciar sesión. Bloquear las cookies publicitarias no impide ver los videos.",
          ],
        },
      ],
    },

    copyright: {
      title: "Política de derechos de autor (DMCA)",
      summary: "Cómo notificar contenido que infringe tus derechos y cómo responder a una notificación.",
      sections: [
        {
          title: "1. Nuestro compromiso",
          blocks: [
            "No permitimos contenido que infrinja derechos de propiedad intelectual. Respondemos a las notificaciones válidas siguiendo un procedimiento inspirado en la Digital Millennium Copyright Act (DMCA) de EE. UU. y en normas equivalentes.",
          ],
        },
        {
          title: "2. Cómo enviar una notificación",
          blocks: [
            `Envía tu notificación a ${o.dmcaEmail} incluyendo:`,
            {
              list: [
                "La identificación de la obra protegida que consideras infringida.",
                "El enlace o enlaces exactos del contenido infractor en nuestro servicio (por ejemplo, la URL /v/… o /embed/…).",
                "Tu nombre, dirección postal, teléfono y email.",
                "Una declaración de que crees de buena fe que el uso no está autorizado por el titular, su representante o la ley.",
                "Una declaración de que la información es exacta y de que eres el titular de los derechos o estás autorizado a actuar en su nombre.",
                "Tu firma física o electrónica.",
              ],
            },
          ],
        },
        {
          title: "3. Qué hacemos",
          blocks: [
            "Si la notificación es válida, retiraremos o bloquearemos el acceso al contenido con prontitud y avisaremos al usuario que lo subió, enviándole una copia de la notificación sin datos personales innecesarios.",
          ],
        },
        {
          title: "4. Contranotificación",
          blocks: [
            `Si crees que el contenido se retiró por error, puedes enviar una contranotificación a ${o.dmcaEmail} con: identificación del contenido retirado y su ubicación anterior; una declaración, bajo pena de perjurio, de que crees de buena fe que se retiró por error o identificación equivocada; tu nombre, dirección y teléfono; tu aceptación de la jurisdicción competente; y tu firma. Si el reclamante no inicia acciones legales en un plazo de 10 a 14 días hábiles, podremos restaurar el contenido.`,
          ],
        },
        {
          title: "5. Infractores reincidentes",
          blocks: ["Cerraremos las cuentas de los usuarios que infrinjan derechos de forma reiterada. Sus ganancias pendientes podrán ser retenidas."],
        },
        {
          title: "6. Notificaciones falsas",
          blocks: ["Enviar notificaciones o contranotificaciones falsas o de mala fe puede dar lugar a responsabilidad legal."],
        },
      ],
    },

    "acceptable-use": {
      title: "Política de uso aceptable",
      summary: "Qué contenido y qué conductas no están permitidos en el servicio.",
      sections: [
        {
          title: "1. Contenido prohibido",
          blocks: [
            {
              list: [
                "Cualquier material de abuso o explotación sexual infantil. Tolerancia cero: lo eliminaremos y lo denunciaremos a las autoridades competentes.",
                "Contenido sexual explícito o pornográfico, y contenido íntimo compartido sin el consentimiento de las personas que aparecen.",
                "Contenido que infrinja derechos de autor, marcas u otros derechos de terceros.",
                "Contenido que promueva el terrorismo o la violencia grave, o que incite al odio o a la discriminación por cualquier motivo.",
                "Acoso, amenazas o publicación de datos personales de terceros sin su consentimiento (doxing).",
                "Malware, phishing, estafas o contenido diseñado para engañar a los espectadores.",
                "Cualquier contenido ilegal en tu país o en el del operador.",
              ],
            },
          ],
        },
        {
          title: "2. Conductas prohibidas",
          blocks: [
            {
              list: [
                "Generar tráfico artificial: bots, granjas de clics, reproducciones incentivadas, recargas automáticas o cualquier método para inflar las vistas o las ganancias.",
                "Ver o descargar tus propios videos de forma repetida para generar ingresos.",
                "Eludir las medidas de seguridad, los límites o los controles antifraude del servicio.",
                "Hacer scraping, cargas masivas abusivas o cualquier uso que degrade el servicio para los demás.",
                "Usar el servicio como almacenamiento genérico de archivos que no sean videos, o para distribuir spam.",
              ],
            },
          ],
        },
        {
          title: "3. Consecuencias",
          blocks: [
            "Según la gravedad, podemos retirar el contenido, desactivar la monetización, retener o anular ganancias obtenidas de forma irregular, suspender o cerrar la cuenta y, cuando proceda, informar a las autoridades.",
          ],
        },
        {
          title: "4. Denuncias",
          blocks: [`Si ves contenido que incumple esta política, escríbenos a ${o.email} con el enlace del video y el motivo. Para reclamaciones de derechos de autor, usa el procedimiento de la Política de derechos de autor.`],
        },
      ],
    },

    monetization: {
      title: "Términos del programa de monetización",
      summary: "Cómo se calculan, revisan y pagan las ganancias de los creadores.",
      sections: [
        {
          title: "1. Requisitos",
          blocks: [
            {
              list: [
                "Tener 18 años o más y una cuenta en regla.",
                "Tener activada la monetización en tus videos.",
                "Verificar tu identidad antes de cobrar por primera vez.",
                "No residir en países o territorios sujetos a sanciones que nos impidan pagarte.",
              ],
            },
          ],
        },
        {
          title: "2. Cómo se calculan las ganancias",
          blocks: [
            `No pagamos una tarifa fija. El programa es un reparto de ingresos: al final de cada mes natural (UTC) tomamos el RPM real que nuestra red publicitaria nos reporta para cada país (los ingresos por cada 1.000 impresiones) y te acreditamos el ${o.revenueSharePct} % de ese valor por cada 1.000 vistas monetizadas que tus videos recibieron desde ese país.`,
            `El total repartido a los creadores en un mes nunca supera el ${o.revenueSharePct} % de los ingresos que efectivamente recibimos de la red publicitaria por ese mes; si lo superara, todos los créditos del mes se reducen en la misma proporción. Las estimaciones que veas en tu panel durante el mes son orientativas y no son un importe garantizado.`,
            "Podemos cambiar el porcentaje de reparto avisándote con antelación; el cambio solo se aplica a los meses que se cierren después.",
            "Una vista es monetizada cuando el espectador reproduce el video el tiempo mínimo indicado en tu panel, sin bloqueador de anuncios. Solo cuenta una vista por persona y video cada 24 horas, hay un límite diario por persona, y se excluyen los bots y tus propias reproducciones.",
            `Suscriptores Premium: no ven anuncios, así que sus vistas no generan ingresos por RPM. A cambio, al cerrar cada mes repartimos el ${o.premiumSharePct} % de los ingresos netos de Premium imputables a ese mes (después de las comisiones de PayPal; el plan anual se reparte a partes iguales entre sus 12 meses) en proporción a las vistas completas de suscriptores que recibió cada creador, con las mismas reglas de duración mínima y antifraude.`,
          ],
        },
        {
          title: "3. Tráfico no válido",
          blocks: [
            "No pagamos el tráfico generado de forma artificial o incentivada, ni el que incumpla la Política de uso aceptable. Las ganancias de cada mes se acreditan al cerrarlo, después de revisar el tráfico. Si detectamos tráfico no válido, podemos descontar las ganancias afectadas, incluso después de haberlas mostrado en tu panel.",
          ],
        },
        {
          title: "4. Pagos",
          blocks: [
            {
              list: [
                `El importe mínimo para solicitar un pago es de ${o.minPayoutUsd} USD. Algunos métodos pueden tener un mínimo mayor.`,
                "Los pagos se solicitan desde tu panel, por el saldo disponible completo, y se procesan después de revisarlos, normalmente en un plazo de 7 días hábiles.",
                "Eres responsable de que tus datos de cobro sean correctos. El titular de la cuenta de destino debe coincidir con tu identidad verificada. No responderemos por pagos enviados a datos erróneos que tú hayas proporcionado.",
                "Las comisiones de tu proveedor de pago o de la red de criptomonedas pueden reducir el importe recibido.",
              ],
            },
          ],
        },
        {
          title: "5. Verificación de identidad",
          blocks: [
            "Antes de tu primer pago debes enviar un documento de identidad válido y una selfie con él. Tratamos estos datos cifrados y solo para verificar tu identidad, prevenir el fraude y cumplir la ley, según la Política de privacidad. Podemos rechazar la verificación si los datos no son legibles o no coinciden.",
          ],
        },
        {
          title: "6. Impuestos",
          blocks: ["Eres responsable de declarar y pagar los impuestos que correspondan por tus ganancias en tu país. Podemos pedirte información fiscal cuando la ley lo exija."],
        },
        {
          title: "7. Suspensión y cambios del programa",
          blocks: [
            "Podemos suspender tu participación y retener las ganancias pendientes en caso de fraude o de incumplimiento grave de nuestras políticas. Podemos modificar o finalizar el programa avisando con antelación. En ese caso, pagaremos el saldo válido que supere el mínimo.",
          ],
        },
        {
          title: "8. Relación entre las partes",
          blocks: ["Participar en el programa no crea ninguna relación laboral, sociedad ni agencia entre tú y el operador."],
        },
      ],
    },
  };
}
