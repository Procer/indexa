import { sql } from "@/lib/db/sql";
import type { AlternativeProduct, ProductStoreVariant, Slots } from "@/types";

// Caché en Supabase (tabla cache_kv, ver supabase/migrations/021_cache_kv.sql)
// — reemplaza al Upstash Redis original, que nunca quedó provisionado en
// producción (credenciales vacías, confirmado en vivo el 2026-08-20: dos
// búsquedas estructuralmente idénticas seguidas nunca daban from_cache=true).
// Decisión explícita del usuario: todo en Supabase, sin sumar un servicio
// externo más. Postgres no expira filas solo como Redis, así que cada
// lectura borra la fila si ya venció (limpieza perezosa) en vez de
// devolverla vencida.

async function getCache<T>(key: string): Promise<T | null> {
  const [row] = await sql<{ value: T; expires_at: string }[]>`
    SELECT value, expires_at FROM cache_kv WHERE key = ${key}
  `;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await sql`DELETE FROM cache_kv WHERE key = ${key}`;
    return null;
  }
  return row.value;
}

async function setCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
  await sql`
    INSERT INTO cache_kv (key, value, expires_at)
    VALUES (${key}, ${sql.json(value as never)}, ${expiresAt})
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value, expires_at = EXCLUDED.expires_at
  `;
}

async function deleteCache(key: string): Promise<void> {
  await sql`DELETE FROM cache_kv WHERE key = ${key}`;
}

const REDIS_TTL_SECONDS = 3600;

// ─── Caché estructurado por clave (category, use_cases, budget_tier) ──────────
//
// El caché semántico por embedding fue deshabilitado porque text-embedding-3-small
// produce similitudes >99% para cualquier query de la misma categoría, lo que
// hacía que todas las búsquedas de notebooks devolvieran el mismo resultado.
// La solución es usar una clave determinista derivada de los slots estructurados.

function budgetTier(slots: Slots): string {
  const budget =
    slots.budget_cash_ars ??
    (slots.budget_monthly_ars ? slots.budget_monthly_ars * 12 : null);
  if (!budget) return "any";
  if (budget < 300_000) return "micro";
  if (budget < 600_000) return "entrada";
  if (budget < 1_000_000) return "media";
  if (budget < 2_000_000) return "alta";
  return "premium";
}

export function buildStructuredCacheKey(slots: Slots): string {
  const cat = slots.category ?? "any";
  const uses = [...slots.use_cases].sort().join(",") || "none";
  const tier = budgetTier(slots);
  return `search:v1:${cat}:${uses}:${tier}`;
}

// La clave de arriba deliberadamente NO incluye marca/exclusiones/filtros
// técnicos (por diseño, para que compartan caché búsquedas equivalentes en
// texto pero redactadas distinto) — pero eso significa que un refinamiento
// por marca/spec puntual después de una búsqueda ya cacheada del mismo
// category+use_cases+budget_tier puede devolver el pool VIEJO, armado sin
// esa preferencia (bug real encontrado en vivo: pedir "marca Samsung" tras
// una búsqueda de tablets ya cacheada devolvió 0 recomendaciones, pese a
// haber tablets Samsung reales dentro de presupuesto — el hit de caché se
// salteó por completo el mecanismo de `buildRankedPool` que inyecta/prioriza
// la marca pedida). Fix: cuando hay CUALQUIER preferencia/filtro más
// específico que category+use_cases+budget, se saltea el caché estructurado
// entero (lectura y escritura) y siempre se arma el pool fresco — más lento
// para esos casos puntuales, pero correcto. El caso común (sin filtros
// extra) sigue cacheado igual que antes.
function hasExtraPreferences(slots: Slots): boolean {
  const p = slots.preferences;
  const tf = slots.technical_filters;
  const pf = slots.phone_filters;
  return (
    p.os !== "any" ||
    p.brands_preferred.length > 0 ||
    p.brands_excluded.length > 0 ||
    p.portability !== "any" ||
    p.screen_size !== "any" ||
    p.processor_model_preferred !== null ||
    tf.min_ram_gb !== null ||
    tf.storage_type !== null ||
    tf.gpu_required ||
    pf.min_ram_gb !== null ||
    pf.min_storage_gb !== null ||
    pf.min_camera_mp !== null ||
    pf.require_5g ||
    pf.require_nfc ||
    pf.os !== null
  );
}

export async function getStructuredCache(slots: Slots): Promise<string[] | null> {
  if (hasExtraPreferences(slots)) return null;
  const key = buildStructuredCacheKey(slots);
  return getCache<string[]>(key);
}

export async function setStructuredCache(
  slots: Slots,
  resultIds: string[]
): Promise<void> {
  if (hasExtraPreferences(slots)) return;
  const key = buildStructuredCacheKey(slots);
  await setCache(key, resultIds, REDIS_TTL_SECONDS);
}

// Pool completo (hasta RANKED_POOL_SIZE) guardado bajo la misma clave
// estructurada que arriba — a diferencia de setStructuredCache (que solo
// guarda los 6 ids ya enriquecidos), esto permite que un hit del caché
// estructurado conozca el tamaño real del pool y tenga pool cacheado para
// paginar, sin recalcular buildRankedPool en cada hit.
export async function getStructuredPoolCache(slots: Slots): Promise<string[] | null> {
  if (hasExtraPreferences(slots)) return null;
  const key = `poolset:${buildStructuredCacheKey(slots)}`;
  return getCache<string[]>(key);
}

export async function setStructuredPoolCache(
  slots: Slots,
  poolIds: string[]
): Promise<void> {
  if (hasExtraPreferences(slots)) return;
  const key = `poolset:${buildStructuredCacheKey(slots)}`;
  await setCache(key, poolIds, REDIS_TTL_SECONDS);
}

// ─── Caché preliminar para búsquedas de seguimiento ──────────────────────────
//
// Cuando la búsqueda inicial es ambigua (needs_info), se hace un prefetch de
// IDs de productos para esa categoría. Si el usuario responde antes de que
// expire el TTL, la búsqueda de seguimiento usa esos candidatos en lugar de
// escanear toda la tabla (mucho más rápido).

const PRELIM_TTL_SECONDS = 180; // 3 min — tiempo razonable para que el usuario responda

export async function getPrelimCache(sessionId: string): Promise<string[] | null> {
  return getCache<string[]>(`prelim:${sessionId}`);
}

export async function setPrelimCache(sessionId: string, ids: string[]): Promise<void> {
  await setCache(`prelim:${sessionId}`, ids, PRELIM_TTL_SECONDS);
}

export async function deletePrelimCache(sessionId: string): Promise<void> {
  await deleteCache(`prelim:${sessionId}`);
}

// ─── Caché de búsqueda en background ─────────────────────────────────────────
//
// Cuando el usuario tiene use_cases pero no budget (needs_info), el sistema corre
// una búsqueda interna con los slots parciales y guarda los IDs de candidatos aquí.
// Cuando el usuario elige presupuesto, la búsqueda final usa esos candidatos → mucho más rápida.
// Cada nueva búsqueda parcial sobreescribe la anterior (siempre usamos la más reciente).

const BACKGROUND_TTL_SECONDS = 300; // 5 min

export async function getBackgroundCache(sessionId: string): Promise<string[] | null> {
  return getCache<string[]>(`bg:${sessionId}`);
}

export async function setBackgroundCache(sessionId: string, ids: string[]): Promise<void> {
  await setCache(`bg:${sessionId}`, ids, BACKGROUND_TTL_SECONDS);
}

export async function deleteBackgroundCache(sessionId: string): Promise<void> {
  await deleteCache(`bg:${sessionId}`);
}

// ─── Caché de "también en otras tiendas" (also_at) ────────────────────────────
//
// Se calcula agrupando por buildDedupeKey durante la búsqueda en vivo (ver
// app/api/search/route.ts), pero esa info no vive en la tabla products — solo
// en memoria durante ese request. Se cachea acá por product ID (no por
// search/share_token) para que sobreviva tanto a un reload directo de
// /search/[token] (GET /api/search/[token]) como a un hit del caché
// estructurado de arriba, que reconstruyen los productos desde la DB sin
// volver a correr el pipeline de scoring/dedupe.

const ALSO_AT_TTL_SECONDS = 24 * 60 * 60; // 24h — mismo criterio que el análisis de precio/calidad

export async function getAlsoAtCache(productId: string): Promise<ProductStoreVariant[] | null> {
  return getCache<ProductStoreVariant[]>(`also_at:${productId}`);
}

export async function setAlsoAtCache(productId: string, variants: ProductStoreVariant[]): Promise<void> {
  if (variants.length === 0) return;
  await setCache(`also_at:${productId}`, variants, ALSO_AT_TTL_SECONDS);
}

// ─── Caché del pool completo (para paginación de "cargar más") ───────────────
//
// Guarda los IDs de TODO el pool rankeado de una búsqueda (no solo los
// primeros 6 que se muestran de entrada), para que
// GET /api/search/[token]/more pueda servir la página 2+ sin rehacer
// hybridSearch/scoreResults/dedupe/re-rank. Mismo TTL que la caché
// estructurada — pasado ese tiempo, /more re-deriva el pool desde cero
// usando slots/query_embedding ya guardados en la búsqueda.

export async function getPoolCache(shareToken: string): Promise<string[] | null> {
  return getFromRedis<string[]>(`pool:${shareToken}`);
}

export async function setPoolCache(shareToken: string, ids: string[]): Promise<void> {
  await setToRedis(`pool:${shareToken}`, ids, REDIS_TTL_SECONDS);
}

// ─── Caché del saludo proactivo del chat de afinar búsqueda ──────────────────
//
// El saludo (ver app/api/search/refine-chat/route.ts, greeting: true) es
// determinístico para un share_token dado — mismo pool, mismo presupuesto,
// mismo uso declarado. Se cachea para no volver a llamar al LLM en un
// reload o al reabrir un link compartido (regla de CLAUDE.md: nunca llamar
// al LLM si el resultado ya está en caché). Los mensajes libres del chat NO
// se cachean acá — son conversación real, no repetible.
//
// Se guarda la respuesta ya resuelta (reply + producto recomendado, si lo
// hay, ya con sus datos completos) en vez del JSON crudo del LLM — así un
// hit de caché no depende de que loadedProducts llegue en el mismo orden
// que cuando se generó el saludo original.
export interface ChatGreetingPayload {
  reply: string;
  recommendedProducts?: AlternativeProduct[];
  topPickIds?: string[];
  suggestedRefinement?: string;
  // El chat pide resaltar un filtro de la grilla (ej. "store" cuando el usuario
  // preguntó por una tienda puntual).
  highlightFilter?: "store";
  // Id del producto que responde una pregunta puntual sobre los resultados
  // (ej. "¿cuál tiene más RAM?" → detectFactualQuery) — el cliente hace
  // scroll hasta esa tarjeta y la resalta con una animación.
  spotlightProductId?: string;
  // Cuando detectFactualQuery encuentra un empate (varios productos con el
  // mismo valor máximo/mínimo), todos los ids empatados — el cliente ofrece
  // un link "Ver los N empatados" en el mensaje para mostrarlos temporalmente
  // en la grilla (con spotlightProductId ya destacado entre ellos).
  tiedProductIds?: string[];
}

export async function getChatGreetingCache(shareToken: string): Promise<ChatGreetingPayload | null> {
  return getFromRedis<ChatGreetingPayload>(`chat_greeting:${shareToken}`);
}

export async function setChatGreetingCache(shareToken: string, payload: ChatGreetingPayload): Promise<void> {
  await setToRedis(`chat_greeting:${shareToken}`, payload, REDIS_TTL_SECONDS);
}

// ─── Medianas de precio por config (jugada #15) ──────────────────────────────
// La consulta agregada (getConfigPriceMedians) barre todo el catálogo — barata
// pero no gratis. Se cachea 6h: el catálogo y sus precios se mueven en escala
// de horas (sync 06:00), no de minutos.
const CONFIG_MEDIANS_TTL_SECONDS = 6 * 60 * 60;
const CONFIG_MEDIANS_KEY = "config_price_medians:v1";

export async function getCachedConfigPriceMedians(): Promise<Record<string, number>> {
  const cached = await getCache<Record<string, number>>(CONFIG_MEDIANS_KEY);
  if (cached) return cached;
  const { getConfigPriceMedians } = await import("@/lib/db/queries");
  const fresh = await getConfigPriceMedians();
  await setCache(CONFIG_MEDIANS_KEY, fresh, CONFIG_MEDIANS_TTL_SECONDS);
  return fresh;
}

// Helpers genéricos para otras partes del sistema (alertas de precio, etc.)
// El nombre "Redis" queda por compatibilidad con el resto del código que ya
// los importa así — la implementación real es la tabla cache_kv de arriba.
export async function getFromRedis<T>(key: string): Promise<T | null> {
  return getCache<T>(key);
}

export async function setToRedis<T>(
  key: string,
  value: T,
  ttlSeconds = REDIS_TTL_SECONDS
): Promise<void> {
  await setCache(key, value, ttlSeconds);
}
