-- =============================================================================
-- db/vps/schema.sql — Esquema completo de TechSearch AR para Postgres self-hosted
-- =============================================================================
-- Consolidado de supabase/migrations/001..022, SIN las piezas de Supabase:
--   · sin RLS (el server se conecta como dueño; el browser ya no toca la DB)
--   · sin schema auth / auth.uid() / trigger on_auth_user_created
--   · las FK a auth.users pasan a ser UUID planos (la identidad la maneja
--     el sistema de login externo; `profiles` es ahora la tabla de usuarios).
--
-- Correr UNA vez sobre la base vacía `techsearch`:
--   psql "postgres://techsearch@127.0.0.1:5432/techsearch" -f db/vps/schema.sql
-- Después restaurar SOLO los datos desde Supabase (ver README.md, Fase 2).
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================================================================
-- products
-- =============================================================================
CREATE TABLE products (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id            TEXT NOT NULL,
  source                 TEXT NOT NULL,
  url                    TEXT NOT NULL,
  category               TEXT NOT NULL,
  brand                  TEXT,
  model                  TEXT,
  title                  TEXT NOT NULL,
  specs                  JSONB NOT NULL DEFAULT '{}',
  upgradeable            JSONB NOT NULL DEFAULT '{}',
  price_cash             NUMERIC(12,2),
  price_installment      NUMERIC(12,2),
  installment_count      INT,
  installment_info       TEXT,
  currency               TEXT DEFAULT 'ARS',
  image_url              TEXT,
  images                 TEXT[] DEFAULT '{}',
  quality_price_score    TEXT,
  quality_price_analysis TEXT,
  analysis_generated_at  TIMESTAMPTZ,
  available              BOOLEAN DEFAULT true,
  stock                  INT,
  click_count            INT DEFAULT 0,
  is_sponsored           BOOLEAN DEFAULT false,
  sponsor_score_boost    NUMERIC(4,3) DEFAULT 0,
  embedding              vector(1536),
  affiliate_url          TEXT,
  scraped_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  search_vector          tsvector GENERATED ALWAYS AS (
    to_tsvector('spanish',
      coalesce(title, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(model, '')
    )
  ) STORED
);

-- Índice vectorial principal (ef_construction subido de 64 → 200 vs. Supabase)
CREATE INDEX idx_products_embedding
  ON products USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);

-- Índices HNSW PARCIALES por categoría: permiten que hybrid_search, que
-- filtra por category + available ANTES del ORDER BY <=>, use índice en vez
-- de scan exacto. (Complemento de hnsw.iterative_scan del tuning.conf.)
CREATE INDEX idx_products_emb_notebook ON products USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200) WHERE available AND category = 'notebook';
CREATE INDEX idx_products_emb_desktop  ON products USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200) WHERE available AND category = 'desktop';
CREATE INDEX idx_products_emb_tablet   ON products USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200) WHERE available AND category = 'tablet';
CREATE INDEX idx_products_emb_phone    ON products USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200) WHERE available AND category = 'phone';
CREATE INDEX idx_products_emb_tv       ON products USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200) WHERE available AND category = 'tv';

CREATE INDEX products_search_vector_idx     ON products USING GIN (search_vector);
CREATE INDEX idx_products_category          ON products(category);
CREATE INDEX idx_products_available         ON products(available);
CREATE INDEX idx_products_price_cash        ON products(price_cash);
CREATE INDEX idx_products_price_installment ON products(price_installment);
CREATE INDEX idx_products_source            ON products(source);
CREATE INDEX idx_products_sponsored         ON products(is_sponsored) WHERE is_sponsored = true;

-- =============================================================================
-- searches
-- =============================================================================
CREATE TABLE searches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_input       TEXT NOT NULL,
  slots           JSONB NOT NULL DEFAULT '{}',
  expanded_query  TEXT,
  query_embedding vector(1536),
  result_ids      UUID[] DEFAULT '{}',
  share_token     TEXT UNIQUE DEFAULT encode(gen_random_bytes(6), 'base64'),
  user_id         UUID,          -- antes REFERENCES auth.users; ahora plano
  session_id      TEXT,
  -- Id persistente de visita (localStorage, ver lib/analytics/visit.ts) — a
  -- diferencia de session_id (efímero, solo cachea UNA búsqueda), permite
  -- unir todas las búsquedas + clicks (product_clicks) + mensajes de chat
  -- (chat_messages) de la misma persona. Sumado 2026-09-11 para poder
  -- analizar una prueba con varias personas después. Nullable: las búsquedas
  -- viejas no lo tienen.
  visit_id        TEXT,
  result_count    INT DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_searches_embedding
  ON searches USING hnsw (query_embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);
CREATE INDEX idx_searches_share_token ON searches(share_token);
CREATE INDEX idx_searches_created_at  ON searches(created_at DESC);
CREATE INDEX idx_searches_visit       ON searches(visit_id);

-- =============================================================================
-- profiles  → tabla de usuarios del SITIO PÚBLICO (reemplaza el espejo de
-- auth.users). La llena el login externo (Supabase Auth). Sin trigger, sin RLS.
-- El panel /admin NO usa esta tabla — ver admin_users más abajo.
-- =============================================================================
CREATE TABLE profiles (
  id         UUID PRIMARY KEY,
  email      TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_profiles_email ON profiles(lower(email));

-- =============================================================================
-- admin_auth  → login propio del panel /admin (email + contraseña, sesión por
-- cookie, alta por link de invitación). Ver lib/auth/adminSession.ts y
-- db/vps/admin_auth.sql (mismo contenido, para aplicar sobre una base ya viva).
-- =============================================================================
CREATE TABLE admin_users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL,
  password_hash  TEXT,
  role           TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  last_login_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX idx_admin_users_email ON admin_users (lower(email));

CREATE TABLE admin_sessions (
  token          TEXT PRIMARY KEY,
  admin_user_id  UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  user_agent     TEXT
);
CREATE INDEX idx_admin_sessions_user    ON admin_sessions (admin_user_id);
CREATE INDEX idx_admin_sessions_expires ON admin_sessions (expires_at);

CREATE TABLE admin_invites (
  token          TEXT PRIMARY KEY,
  admin_user_id  UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  purpose        TEXT NOT NULL DEFAULT 'set_password'
                 CHECK (purpose IN ('set_password', 'reset_password')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ
);
CREATE INDEX idx_admin_invites_user ON admin_invites (admin_user_id);

-- =============================================================================
-- saved_products
-- =============================================================================
CREATE TABLE saved_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID,          -- antes REFERENCES auth.users
  product_id    UUID REFERENCES products(id) ON DELETE CASCADE,
  price_at_save NUMERIC(12,2),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- =============================================================================
-- price_history
-- =============================================================================
CREATE TABLE price_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_cash        NUMERIC(12,2),
  price_installment NUMERIC(12,2),
  recorded_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_price_history_product ON price_history(product_id, recorded_at DESC);

-- =============================================================================
-- sponsored_placements
-- =============================================================================
-- Patrocinados por tienda + rubro (ver migración 023). Una colocación apunta
-- a target_source (tienda) + categories (rubros, >=1). product_ids queda por
-- compatibilidad con datos viejos pero ya no se usa.
CREATE TABLE sponsored_placements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser    TEXT NOT NULL,
  target_source TEXT,
  product_ids   UUID[] DEFAULT '{}',
  categories    TEXT[] DEFAULT '{}',
  score_boost   NUMERIC(4,3) DEFAULT 0.05,
  min_relevance NUMERIC(4,3) DEFAULT 0.65,
  show_on_home  BOOLEAN NOT NULL DEFAULT false,
  active        BOOLEAN DEFAULT true,
  starts_at     TIMESTAMPTZ,
  ends_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sponsored_placements_active
  ON sponsored_placements (active) WHERE active = true;

-- =============================================================================
-- price_alerts  (con soporte anónimo por email + manage_token)
-- =============================================================================
CREATE TABLE price_alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID,          -- antes NOT NULL REFERENCES auth.users
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  target_price     NUMERIC(12,2) NOT NULL,
  is_active        BOOLEAN DEFAULT true,
  last_notified_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  email            TEXT,
  manage_token     UUID NOT NULL DEFAULT gen_random_uuid(),
  CONSTRAINT price_alerts_owner_check       CHECK (user_id IS NOT NULL OR email IS NOT NULL),
  CONSTRAINT price_alerts_user_product_key  UNIQUE (user_id, product_id),
  CONSTRAINT price_alerts_email_product_key UNIQUE (email, product_id)
);
CREATE INDEX idx_price_alerts_active       ON price_alerts(is_active) WHERE is_active = true;
CREATE INDEX idx_price_alerts_product      ON price_alerts(product_id);
CREATE INDEX idx_price_alerts_user         ON price_alerts(user_id);
CREATE INDEX idx_price_alerts_manage_token ON price_alerts(manage_token);

-- =============================================================================
-- product_clicks
-- =============================================================================
CREATE TABLE product_clicks (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  search_share_token TEXT REFERENCES searches(share_token) ON DELETE SET NULL,
  session_id         TEXT,
  visit_id           TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_product_clicks_product ON product_clicks(product_id);
CREATE INDEX idx_product_clicks_search  ON product_clicks(search_share_token);
CREATE INDEX idx_product_clicks_created ON product_clicks(created_at);
CREATE INDEX idx_product_clicks_visit   ON product_clicks(visit_id);

-- =============================================================================
-- site_events
-- =============================================================================
-- event_type incluye 'product_ask_about'/'product_buy_click' (el código ya
-- los emitía desde antes, pero el CHECK original no los tenía — se perdían
-- en silencio, el fetch del cliente traga el error 500) y 'client_error'
-- (reporte de fallos del lado del cliente, ver lib/analytics/reportError.ts
-- — sumado 2026-09-11 para poder ver errores de una prueba con varias
-- personas sin depender de que cada una lo reporte a mano).
CREATE TABLE site_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'session_start', 'product_view_details', 'product_compare_add', 'product_ask_about',
    'product_buy_click', 'time_on_page', 'client_error', 'visitor_label'
  )),
  visit_id    TEXT NOT NULL,
  product_id  UUID REFERENCES products(id) ON DELETE SET NULL,
  path        TEXT,
  duration_ms INTEGER,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_site_events_visit        ON site_events(visit_id);
CREATE INDEX idx_site_events_type_created ON site_events(event_type, created_at);

-- =============================================================================
-- chat_messages
-- =============================================================================
-- Los turnos de chat (GuidedSearchChat sobre resultados, y el chat del
-- comparador) antes solo se logueaban a stdout truncados a 200 caracteres —
-- para analizar una prueba con varias personas hacía falta poder reconstruir
-- la conversación completa desde la DB. Un row por TURNO (no por rol:
-- user_message + assistant_reply juntos), igual que el log [CHAT] turn que
-- reemplaza/complementa.
CREATE TABLE chat_messages (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token           TEXT,
  visit_id              TEXT,
  session_id            TEXT,
  -- 'results' (GuidedSearchChat sobre una búsqueda) | 'compare' (chat del comparador)
  context               TEXT NOT NULL DEFAULT 'results',
  user_message          TEXT,
  assistant_reply       TEXT,
  greeting              BOOLEAN NOT NULL DEFAULT false,
  factual_answer        BOOLEAN NOT NULL DEFAULT false,
  recommended_count     INT,
  spotlight_product_id  UUID,
  suggested_refinement  TEXT,
  duration_ms           INT,
  error                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_messages_visit       ON chat_messages(visit_id);
CREATE INDEX idx_chat_messages_share_token ON chat_messages(share_token);
CREATE INDEX idx_chat_messages_created     ON chat_messages(created_at);

-- =============================================================================
-- saved_search_contacts
-- =============================================================================
CREATE TABLE saved_search_contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL UNIQUE,
  manage_token UUID NOT NULL DEFAULT gen_random_uuid(),
  share_tokens TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_saved_search_contacts_manage_token ON saved_search_contacts(manage_token);

-- =============================================================================
-- cache_kv  (reemplazo de Upstash Redis — key/value con expiración)
-- =============================================================================
CREATE TABLE cache_kv (
  key        TEXT PRIMARY KEY,
  value      JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cache_kv_expires_at ON cache_kv (expires_at);

-- =============================================================================
-- FUNCIONES
-- =============================================================================

-- hybrid_search: filtros SQL duros + similitud coseno + full-text (RRF).
-- Idéntica a supabase/migrations/019_hybrid_rrf_search.sql.
CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding       vector(1536),
  category_filter       TEXT      DEFAULT NULL,
  max_price_cash        NUMERIC   DEFAULT NULL,
  max_price_installment NUMERIC   DEFAULT NULL,
  require_gpu           BOOLEAN   DEFAULT FALSE,
  min_ram_gb            INT       DEFAULT NULL,
  require_ssd           BOOLEAN   DEFAULT FALSE,
  brands_excluded       TEXT[]    DEFAULT NULL,
  max_weight_kg         NUMERIC   DEFAULT NULL,
  limit_results         INT       DEFAULT 10,
  offset_results        INT       DEFAULT 0,
  candidate_ids         UUID[]    DEFAULT NULL,
  query_text            TEXT      DEFAULT NULL
)
RETURNS TABLE (
  id           UUID,
  similarity   NUMERIC,
  is_sponsored BOOLEAN,
  click_count  INT
)
LANGUAGE SQL
STABLE
AS $$
  WITH filtered AS (
    SELECT
      p.id,
      (1 - (p.embedding <=> query_embedding))::NUMERIC AS similarity,
      p.is_sponsored,
      p.click_count,
      p.search_vector
    FROM products p
    WHERE
      p.available = true
      AND p.embedding IS NOT NULL
      AND (candidate_ids IS NULL OR p.id = ANY(candidate_ids))
      AND (category_filter IS NULL OR p.category = category_filter)
      AND (max_price_cash IS NULL OR p.price_cash <= max_price_cash)
      AND (
        max_price_installment IS NULL
        OR p.price_installment <= max_price_installment
        OR (p.price_installment IS NULL AND p.price_cash IS NOT NULL AND (p.price_cash / 12.0) <= max_price_installment)
      )
      AND (require_gpu = false OR (p.specs->>'gpu') = 'dedicated')
      AND (min_ram_gb IS NULL OR (p.specs->>'ram_gb')::INT >= min_ram_gb)
      AND (require_ssd = false OR (p.specs->>'storage_type') LIKE 'SSD%')
      AND (brands_excluded IS NULL OR NOT (
            LOWER(COALESCE(p.brand, '')) = ANY(
              SELECT LOWER(b) FROM UNNEST(brands_excluded) AS b
            )
          ))
      AND (max_weight_kg IS NULL OR (p.specs->>'weight_kg') IS NULL OR
           (p.specs->>'weight_kg')::NUMERIC <= max_weight_kg)
  ),
  -- El lado keyword del híbrido: query_text es el input CRUDO de la
  -- conversación (ej. "quiero comprar algo de tecnología... tablet xiaomi...
  -- hasta 210 mil pesos por mes en cuotas"), no un término de búsqueda corto.
  -- plainto_tsquery/websearch_to_tsquery combinan las palabras con AND, así
  -- que ningún título de producto matchea nunca (ninguno tiene a la vez
  -- "tecnología" Y "cuotas" Y "xiaomi") — el kw_rank daba siempre NULL y el
  -- híbrido quedaba en la práctica 100% vectorial (bug real: pedir una marca
  -- explícita como Xiaomi, que sí está en catálogo, no aparecía porque el
  -- embedding de todo el mensaje no la priorizaba). Se arma un tsquery con OR
  -- entre los lexemas ya normalizados/sin stopwords (mismo tokenizador que
  -- plainto_tsquery vía to_tsvector), así con que UNA palabra matchee ya
  -- entra al ranking por keyword, y ts_rank_cd sigue premiando más matches.
  keyword_query AS (
    SELECT to_tsquery('spanish',
      array_to_string(tsvector_to_array(to_tsvector('spanish', query_text)), ' | ')
    ) AS tq
    WHERE query_text IS NOT NULL AND btrim(query_text) <> ''
  ),
  ranked AS (
    SELECT
      f.id, f.similarity, f.is_sponsored, f.click_count,
      RANK() OVER (ORDER BY f.similarity DESC) AS vec_rank,
      CASE
        WHEN kq.tq IS NOT NULL AND f.search_vector @@ kq.tq
        THEN RANK() OVER (
          ORDER BY ts_rank_cd(f.search_vector, kq.tq) DESC
        )
        ELSE NULL
      END AS kw_rank
    FROM filtered f
    LEFT JOIN keyword_query kq ON true
  )
  SELECT id, similarity, is_sponsored, click_count
  FROM ranked
  ORDER BY
    (1.0 / (60 + vec_rank)) + COALESCE(1.0 / (60 + kw_rank), 0) DESC,
    id
  LIMIT limit_results
  OFFSET offset_results;
$$;

-- find_similar_search: caché semántico de búsquedas anteriores.
CREATE OR REPLACE FUNCTION find_similar_search(
  query_embedding      vector(1536),
  similarity_threshold NUMERIC DEFAULT 0.95,
  max_age_hours        INT     DEFAULT 6
)
RETURNS TABLE (
  id         UUID,
  result_ids UUID[],
  similarity NUMERIC
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    s.id,
    s.result_ids,
    (1 - (s.query_embedding <=> query_embedding))::NUMERIC AS similarity
  FROM searches s
  WHERE
    s.query_embedding IS NOT NULL
    AND array_length(s.result_ids, 1) > 0
    AND s.created_at >= NOW() - (max_age_hours || ' hours')::INTERVAL
    AND (1 - (s.query_embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY similarity DESC
  LIMIT 1;
$$;

-- increment_click_count: bump atómico de popularidad.
CREATE OR REPLACE FUNCTION increment_click_count(product_id UUID)
RETURNS VOID
LANGUAGE SQL
AS $$
  UPDATE products SET click_count = click_count + 1 WHERE id = product_id;
$$;

-- =============================================================================
-- pg_cron: limpieza nocturna de cache_kv vencido (04:00 server time)
-- =============================================================================
-- Requiere que pg_cron esté en shared_preload_libraries (install-postgres.sh lo hace).
SELECT cron.schedule(
  'purge-cache-kv',
  '0 4 * * *',
  $$DELETE FROM cache_kv WHERE expires_at < now()$$
);

-- Fin del schema.
