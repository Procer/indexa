-- =============================================================
-- TABLA: price_alerts
-- =============================================================

CREATE TABLE price_alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id       UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  target_price     NUMERIC(12,2) NOT NULL,
  is_active        BOOLEAN DEFAULT true,
  last_notified_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

CREATE INDEX idx_price_alerts_active  ON price_alerts(is_active) WHERE is_active = true;
CREATE INDEX idx_price_alerts_product ON price_alerts(product_id);
CREATE INDEX idx_price_alerts_user    ON price_alerts(user_id);

-- RLS: cada usuario solo ve sus propias alertas
ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "price_alerts_select_own"
  ON price_alerts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "price_alerts_insert_own"
  ON price_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "price_alerts_update_own"
  ON price_alerts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "price_alerts_delete_own"
  ON price_alerts FOR DELETE
  USING (auth.uid() = user_id);
