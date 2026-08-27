-- Mejora el filtro max_price_installment para usar el "mejor plan disponible".
--
-- Problema: cada producto en la DB tiene UN plan de cuotas asignado (3, 6, 12 ó 18).
-- Si un notebook de $700k tiene plan de 3 cuotas → $233k/mes (excluido para budget $80k/mes).
-- Pero ese mismo notebook en 12 cuotas sería $58k/mes (asequible).
--
-- Solución: mostrar el producto si su plan asignado O su equivalente en 12 cuotas
-- entra en el presupuesto mensual. El ProductCard sigue mostrando el plan real de la DB.

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
      -- El plan asignado en la DB está dentro del presupuesto mensual
      OR p.price_installment <= max_price_installment
      -- O bien el precio contado es asequible en 12 cuotas (mejor plan estimado)
      OR (p.price_cash IS NOT NULL AND (p.price_cash / 12.0) <= max_price_installment)
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
