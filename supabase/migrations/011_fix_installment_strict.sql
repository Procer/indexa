-- Corrige el filtro max_price_installment eliminando la condición /12.0.
--
-- Problema con migración 010: incluía productos donde price_cash / 12 <= budget,
-- aunque su plan real (ej: 3 cuotas a $800k/cuota) excedía el presupuesto.
-- El usuario veía "$800k x 3 cuotas" cuando buscó "hasta $200k/mes en cuotas".
--
-- Fix: solo incluir productos cuyo price_installment real esté dentro del budget.
-- La lógica de "qué pasaría en 12 cuotas" se maneja cuando haya planes múltiples
-- reales en la DB (Fase 2 — scraping con todos los planes de financiación).

DROP FUNCTION IF EXISTS hybrid_search(vector,text,numeric,numeric,boolean,integer,boolean,text[],numeric,integer,integer);

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
  offset_results        INT       DEFAULT 0
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
  SELECT
    p.id,
    (1 - (p.embedding <=> query_embedding))::NUMERIC AS similarity,
    p.is_sponsored,
    p.click_count
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
    AND (brands_excluded IS NULL OR NOT (
          LOWER(COALESCE(p.brand, '')) = ANY(
            SELECT LOWER(b) FROM UNNEST(brands_excluded) AS b
          )
        ))
    AND (max_weight_kg IS NULL OR (p.specs->>'weight_kg') IS NULL OR
         (p.specs->>'weight_kg')::NUMERIC <= max_weight_kg)
  ORDER BY similarity DESC
  LIMIT limit_results
  OFFSET offset_results;
$$;
