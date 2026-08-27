-- Fix: migración 006 (brands + weight filter) volvió a comparar price_installment total
-- contra budget_monthly del usuario, lo cual es semánticamente incorrecto.
--
-- Mejora adicional: cuando price_installment o installment_count son NULL (producto sin
-- plan de cuotas cargado), se estima la cuota como price_cash / 12 (plan conservador).
-- Esto evita que productos de $1.000.000 contado aparezcan en búsquedas de $200k/mes
-- porque "no tenían datos de cuotas" y el filtro los dejaba pasar.
--
-- También: el budget mensual que llega ya incluye el 20% de slack aplicado en buildSQLFilters,
-- lo cual permite que el LLM vea productos hasta 20% sobre presupuesto y los grade en consecuencia.

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
    AND (
      max_price_installment IS NULL
      OR (
        -- Tiene datos de cuotas: comparar cuota real
        p.price_installment IS NOT NULL
        AND p.installment_count IS NOT NULL
        AND (p.price_installment / p.installment_count) <= max_price_installment
      )
      OR (
        -- Sin datos de cuotas: estimar cuota como price_cash / 12
        -- Solo incluir si la estimación entra en el presupuesto mensual
        (p.price_installment IS NULL OR p.installment_count IS NULL)
        AND p.price_cash IS NOT NULL
        AND (p.price_cash / 12.0) <= max_price_installment
      )
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
  ORDER BY similarity DESC
  LIMIT limit_results
  OFFSET offset_results;
$$;
