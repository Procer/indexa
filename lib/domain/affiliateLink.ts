/**
 * Conversión de URLs de MercadoLibre a links de afiliado.
 *
 * Mecanismo: el Programa de Afiliados de MercadoLibre trackea comisiones vía
 * dos query params (`matt_word` y `matt_tool`) inyectados en la URL original
 * del producto — no requiere una API/SDK separado para generarlos.
 *
 * IMPORTANTE — verificar antes de confiar en esto en producción: el formato
 * exacto (nombres de parámetro, query string vs. fragment) puede variar según
 * el tipo de cuenta de afiliado. Antes de depender de esto para cobrar
 * comisiones, generá un link de prueba desde tu panel de afiliados
 * (afiliados.mercadolibre.com.ar) para un producto real y compará el patrón
 * contra lo que arma `generateAffiliateUrl` — si no coincide, ajustar acá.
 */

const ML_HOSTNAME_PATTERN = /(^|\.)mercadolibre\.com(\.[a-z]{2})?$/i;

export interface AffiliateLinkConfig {
  mattWord: string;
  mattTool: string;
}

export function isMercadoLibreUrl(url: string): boolean {
  try {
    return ML_HOSTNAME_PATTERN.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * Toma una URL de producto de MercadoLibre y le agrega el tracking de afiliado.
 * Devuelve null si la URL no es de MercadoLibre o falta config — así el caller
 * puede caer de vuelta a la URL original sin lógica condicional propia.
 */
export function generateAffiliateUrl(
  originalUrl: string,
  config: AffiliateLinkConfig
): string | null {
  if (!config.mattWord || !config.mattTool) return null;
  if (!isMercadoLibreUrl(originalUrl)) return null;

  try {
    const url = new URL(originalUrl);
    url.searchParams.set("matt_word", config.mattWord);
    url.searchParams.set("matt_tool", config.mattTool);
    return url.toString();
  } catch {
    return null;
  }
}

export function getAffiliateConfigFromEnv(): AffiliateLinkConfig | null {
  const mattWord = process.env.ML_AFFILIATE_MATT_WORD;
  const mattTool = process.env.ML_AFFILIATE_MATT_TOOL;
  if (!mattWord || !mattTool) return null;
  return { mattWord, mattTool };
}
