-- Corrige el filtro max_price_installment para no descartar productos que
-- simplemente no tienen dato de cuotas cargado (price_installment IS NULL).
--
-- Problema real detectado en producción: al buscar "notebook para oficina
-- hasta $210.000 por mes en 12 cuotas" solo aparecían 3 resultados, cuando
-- había ~40 notebooks con precio contado perfectamente accesible. Causa:
-- "NULL <= max_price_installment" evalúa a NULL (no true) en SQL, así que
-- CUALQUIER producto sin price_installment cargado quedaba afuera del todo,
-- sin importar si su precio contado era accesible.
--
-- Fix: si el producto no tiene price_installment cargado, se acepta si su
-- precio contado dividido 12 entra en el presupuesto mensual. A diferencia
-- del intento de la migración 010 (revertido en 011 por falsos positivos),
-- este fallback SOLO aplica cuando no hay price_installment real — si el
-- producto sí tiene un plan de cuotas cargado (aunque sea caro), se sigue
-- comparando ese valor real y no el estimado por 12, así que no puede
-- reproducirse el bug que motivó la 011 (un plan real de 3 cuotas caras
-- colándose por la vía del cash/12).

DROP FUNCTION IF EXISTS hybrid_search(vector,text,numeric,numeric,boolean,integer,boolean,text[],numeric,integer,integer,uuid[]);

CREATE OR REPLACE FUNCTION hybrid_search(
  query_embedding       vector(1536),
  category_filter       TEXT      DEFAULT NULL,
  max_price_cash        NUMERIC   DEFAULT NULL,
  max_price_installment NUMERIC   DEFAULT NULL,
  require_gpu           BOOLEAN   DEFAULT FALSE,
  min_ram_gb            INT       DEFAULT NULL,
  require_ssd            BOOLEAN  DEFAULT FALSE,
  brands_excluded        TEXT[]   DEFAULT NULL,
  max_weight_kg          NUMERIC  DEFAULT NULL,
  limit_results           INT      DEFAULT 10,
  offset_results          INT      DEFAULT 0,
  candidate_ids           UUID[]   DEFAULT NULL
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
    AND (candidate_ids IS NULL OR p.id = ANY(candidate_ids))
    AND (category_filter IS NULL OR p.category = category_filter)
    AND (max_price_cash IS NULL OR p.price_cash <= max_price_cash)
    AND (
      max_price_installment IS NULL
      -- El plan de cuotas real cargado está dentro del presupuesto mensual
      OR p.price_installment <= max_price_installment
      -- No hay plan de cuotas cargado: se estima con el precio contado / 12
      -- en vez de excluir el producto directo (solo cuando no hay dato real)
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
  ORDER BY similarity DESC
  LIMIT limit_results
  OFFSET offset_results;
$$;
