-- Búsqueda híbrida con keywords (RRF) sobre hybrid_search.
--
-- Hoy el ranking es 100% similitud vectorial (cosine). Funciona bien para
-- intención de uso ("notebook rápida para trabajar"), pero es débil cuando
-- el usuario escribe un nombre de modelo exacto o una spec puntual
-- ("Lenovo IdeaPad 3", "Ryzen 5 5500U", "i5 16GB") — dos productos con specs
-- parecidas pueden tener cosine similarity casi idéntica, así que el que
-- matchea el término exacto no necesariamente sale primero.
--
-- Fix: se agrega full-text search nativo de Postgres (tsvector/GIN) y se
-- combina con el ranking vectorial vía Reciprocal Rank Fusion (RRF):
-- cada producto obtiene 1/(k + rank_vector) + 1/(k + rank_keyword), k=60
-- (valor estándar de la literatura de RRF). Si no hay match de keyword
-- (típico: el input es una oración larga conversacional donde
-- plainto_tsquery no arma un match exacto), el término de keyword aporta 0
-- para todos y el resultado es idéntico al ranking actual — degradación
-- segura, no rompe el comportamiento existente para búsquedas
-- conversacionales.
--
-- IMPORTANTE: el campo `similarity` que devuelve la función sigue siendo
-- cosine puro (no RRF) — se usa río abajo para comparar contra
-- min_relevance de patrocinados (lib/search/scorer.ts), así que no se toca.
-- RRF se usa SOLO para decidir el ORDER BY/LIMIT interno (qué candidatos
-- entran al pool de 200), no para el valor que se expone hacia afuera.

-- ─── 1. Columna generada + índice ──────────────────────────────────────────

ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('spanish',
      coalesce(title, '') || ' ' || coalesce(brand, '') || ' ' || coalesce(model, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS products_search_vector_idx ON products USING GIN(search_vector);

-- ─── 2. hybrid_search con RRF ──────────────────────────────────────────────

DROP FUNCTION IF EXISTS hybrid_search(vector,text,numeric,numeric,boolean,integer,boolean,text[],numeric,integer,integer,uuid[]);

CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding       vector(1536),
  category_filter       TEXT      DEFAULT NULL,
  max_price_cash        NUMERIC   DEFAULT NULL,
  max_price_installment NUMERIC   DEFAULT NULL,
  require_gpu           BOOLEAN   DEFAULT FALSE,
  min_ram_gb            INT       DEFAULT NULL,
  require_ssd           BOOLEAN   DEFAULT FALSE,
  brands_excluded        TEXT[]   DEFAULT NULL,
  max_weight_kg          NUMERIC  DEFAULT NULL,
  limit_results           INT      DEFAULT 10,
  offset_results          INT      DEFAULT 0,
  candidate_ids           UUID[]   DEFAULT NULL,
  query_text              TEXT     DEFAULT NULL
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
  ranked AS (
    SELECT
      id, similarity, is_sponsored, click_count,
      RANK() OVER (ORDER BY similarity DESC) AS vec_rank,
      CASE
        WHEN query_text IS NOT NULL
         AND search_vector @@ plainto_tsquery('spanish', query_text)
        THEN RANK() OVER (
          ORDER BY ts_rank_cd(search_vector, plainto_tsquery('spanish', query_text)) DESC
        )
        ELSE NULL
      END AS kw_rank
    FROM filtered
  )
  SELECT id, similarity, is_sponsored, click_count
  FROM ranked
  ORDER BY
    (1.0 / (60 + vec_rank)) + COALESCE(1.0 / (60 + kw_rank), 0) DESC,
    id
  LIMIT limit_results
  OFFSET offset_results;
$$;
