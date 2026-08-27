-- Función atómica para incrementar click_count sin race conditions
CREATE OR REPLACE FUNCTION increment_click_count(product_id UUID)
RETURNS VOID
LANGUAGE SQL
AS $$
  UPDATE products SET click_count = click_count + 1 WHERE id = product_id;
$$;

-- Recrear hybrid_search con nuevo tipo de retorno (click_count)
DROP FUNCTION IF EXISTS hybrid_search(vector,text,numeric,numeric,boolean,integer,boolean,integer,integer);

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
  ORDER BY similarity DESC
  LIMIT limit_results
  OFFSET offset_results;
$$;
