-- Reemplaza el caché de Upstash Redis (nunca quedó provisionado en
-- producción — confirmado en vivo que UPSTASH_REDIS_REST_URL/TOKEN
-- estaban vacíos en el .env del VPS, así que todo lo que dependía de
-- caché venía siendo un no-op silencioso) por una tabla simple de
-- key-value con expiración en la misma Supabase que ya se usa para todo
-- lo demás. Decisión explícita del usuario: no sumar un servicio externo
-- más, mantener todo en un solo lugar.

create table if not exists cache_kv (
  key text primary key,
  value jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Postgres no expira filas solo (a diferencia de Redis) — lib/search/cache.ts
-- borra la fila al toparse con una expirada en una lectura (limpieza
-- perezosa). Este índice acelera ese chequeo y una eventual limpieza manual
-- de filas viejas nunca releídas.
create index if not exists idx_cache_kv_expires_at on cache_kv (expires_at);
