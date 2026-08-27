-- =============================================================
-- 1. EXTENSIONES
-- =============================================================

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- =============================================================
-- 2. TABLA: products
-- =============================================================

CREATE TABLE products (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identificación
  external_id     TEXT NOT NULL,
  source          TEXT NOT NULL,          -- 'mercadolibre' | 'fravega' | 'garbarino'
  url             TEXT NOT NULL,

  -- Clasificación
  category        TEXT NOT NULL,          -- 'notebook' | 'desktop' | 'tablet' | 'tv'
  brand           TEXT,
  model           TEXT,
  title           TEXT NOT NULL,

  -- Specs normalizadas
  specs           JSONB NOT NULL DEFAULT '{}',

  -- Componentes mejorables
  upgradeable     JSONB NOT NULL DEFAULT '{}',
  -- { "ram": true, "storage": true, "processor": false, "screen": false }

  -- Precios
  price_cash        NUMERIC(12,2),
  price_installment NUMERIC(12,2),
  installment_count INT,
  installment_info  TEXT,
  currency          TEXT DEFAULT 'ARS',

  -- Imágenes
  image_url   TEXT,
  images      TEXT[] DEFAULT '{}',

  -- Análisis LLM cacheado
  quality_price_score    TEXT,             -- 'EXCELENTE' | 'MUY BUENO' | 'BUENO' | 'REGULAR'
  quality_price_analysis TEXT,
  analysis_generated_at  TIMESTAMPTZ,

  -- Disponibilidad
  available   BOOLEAN DEFAULT true,
  stock       INT,

  -- Popularidad
  click_count INT DEFAULT 0,

  -- Patrocinado
  is_sponsored        BOOLEAN DEFAULT false,
  sponsor_score_boost NUMERIC(4,3) DEFAULT 0,  -- máximo 0.1

  -- Vector para búsqueda semántica (text-embedding-3-small = 1536 dims)
  embedding vector(1536),

  -- Metadata
  scraped_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================
-- 3. TABLA: searches
-- =============================================================

CREATE TABLE searches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Input del usuario
  raw_input       TEXT NOT NULL,

  -- Slots extraídos por LLM
  slots           JSONB NOT NULL DEFAULT '{}',

  -- Query expandida para embedding
  expanded_query  TEXT,

  -- Embedding de la query (para caché semántico)
  query_embedding vector(1536),

  -- IDs de productos resultantes en orden
  result_ids      UUID[] DEFAULT '{}',

  -- URL única para compartir
  share_token     TEXT UNIQUE DEFAULT encode(gen_random_bytes(6), 'base64'),

  -- Usuario (opcional — anónimo en MVP)
  user_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id TEXT,

  -- Metadata
  result_count INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================
-- 4. TABLAS: saved_products y price_history
-- =============================================================

CREATE TABLE saved_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id    UUID REFERENCES products(id) ON DELETE CASCADE,
  price_at_save NUMERIC(12,2),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

CREATE TABLE price_history (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id        UUID REFERENCES products(id) ON DELETE CASCADE,
  price_cash        NUMERIC(12,2),
  price_installment NUMERIC(12,2),
  recorded_at       TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================
-- 5. TABLA: sponsored_placements
-- =============================================================

CREATE TABLE sponsored_placements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser    TEXT NOT NULL,
  product_ids   UUID[] NOT NULL,
  categories    TEXT[] DEFAULT '{}',
  score_boost   NUMERIC(4,3) DEFAULT 0.05,  -- boost al score (máx 0.10)
  min_relevance NUMERIC(4,3) DEFAULT 0.65,  -- score mínimo para aparecer
  active        BOOLEAN DEFAULT true,
  starts_at     TIMESTAMPTZ,
  ends_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================
-- 6. ÍNDICES
-- =============================================================

-- Búsqueda vectorial HNSW (el índice más crítico del sistema)
CREATE INDEX idx_products_embedding
ON products USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Caché semántico de búsquedas anteriores
CREATE INDEX idx_searches_embedding
ON searches USING hnsw (query_embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Filtros SQL frecuentes en hybrid_search
CREATE INDEX idx_products_category          ON products(category);
CREATE INDEX idx_products_available         ON products(available);
CREATE INDEX idx_products_price_cash        ON products(price_cash);
CREATE INDEX idx_products_price_installment ON products(price_installment);
CREATE INDEX idx_products_source            ON products(source);
CREATE INDEX idx_products_sponsored         ON products(is_sponsored) WHERE is_sponsored = true;

-- Lookup por share token
CREATE INDEX idx_searches_share_token ON searches(share_token);

-- Historial de precios por producto
CREATE INDEX idx_price_history_product ON price_history(product_id, recorded_at DESC);


-- =============================================================
-- 7. FUNCIONES
-- =============================================================

-- Búsqueda híbrida: filtros SQL duros + similitud coseno por embedding
CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding       vector(1536),
  category_filter       TEXT      DEFAULT NULL,
  max_price_cash        NUMERIC   DEFAULT NULL,
  max_price_installment NUMERIC   DEFAULT NULL,
  require_gpu           BOOLEAN   DEFAULT FALSE,
  min_ram_gb            INT       DEFAULT NULL,
  require_ssd           BOOLEAN   DEFAULT FALSE,
  limit_results         INT       DEFAULT 10,
  offset_results        INT       DEFAULT 0
)
RETURNS TABLE (
  id           UUID,
  similarity   NUMERIC,
  is_sponsored BOOLEAN
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    p.id,
    (1 - (p.embedding <=> query_embedding))::NUMERIC AS similarity,
    p.is_sponsored
  FROM products p
  WHERE
    p.available = true
    AND p.embedding IS NOT NULL
    AND (category_filter IS NULL OR p.category = category_filter)
    AND (max_price_cash IS NULL OR p.price_cash <= max_price_cash)
    AND (max_price_installment IS NULL OR p.price_installment <= max_price_installment)
    AND (require_gpu = false OR (p.specs->>'gpu') = 'dedicated')
    AND (min_ram_gb IS NULL OR (p.specs->>'ram_gb')::INT >= min_ram_gb)
    AND (require_ssd = false OR (p.specs->>'storage_type') LIKE 'SSD%')
  ORDER BY similarity DESC
  LIMIT limit_results
  OFFSET offset_results;
$$;

-- Caché semántico: buscar búsquedas anteriores similares
CREATE OR REPLACE FUNCTION find_similar_search(
  query_embedding      vector(1536),
  similarity_threshold NUMERIC  DEFAULT 0.95,
  max_age_hours        INT      DEFAULT 6
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
