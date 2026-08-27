-- =============================================================
-- Alertas de precio sin cuenta: email + link de gestión (manage_token)
-- en vez de requerir login. user_id se mantiene para alertas viejas,
-- pero deja de ser obligatorio.
-- =============================================================

ALTER TABLE price_alerts ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE price_alerts ADD COLUMN email TEXT;
ALTER TABLE price_alerts ADD COLUMN manage_token UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE price_alerts
  ADD CONSTRAINT price_alerts_owner_check
  CHECK (user_id IS NOT NULL OR email IS NOT NULL);

-- Una alerta por email+producto (permite upsert desde /api/alerts).
-- NULL nunca colisiona con NULL, así que no afecta las filas viejas sin email.
ALTER TABLE price_alerts
  ADD CONSTRAINT price_alerts_email_product_key UNIQUE (email, product_id);

CREATE INDEX idx_price_alerts_manage_token ON price_alerts(manage_token);
