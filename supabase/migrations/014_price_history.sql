-- =============================================================
-- TABLA: price_history
-- Un snapshot por cada vez que el precio de un producto cambia
-- (no uno por sync — evita filas repetidas cuando no cambió nada).
-- Alimenta el gráfico de tendencia en la ficha de producto.
-- =============================================================

CREATE TABLE price_history (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id         UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  price_cash         NUMERIC(12,2),
  price_installment  NUMERIC(12,2),
  recorded_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_history_product ON price_history(product_id, recorded_at DESC);
