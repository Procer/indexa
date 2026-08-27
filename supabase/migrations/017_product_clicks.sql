-- Registro de eventos de click en "Ver en tienda", vinculado a la búsqueda
-- que lo originó (por share_token, ya disponible en el cliente sin fetch
-- extra) para poder medir conversión búsqueda → click en el dashboard admin.
CREATE TABLE product_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  search_share_token TEXT REFERENCES searches(share_token) ON DELETE SET NULL,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_product_clicks_product ON product_clicks(product_id);
CREATE INDEX idx_product_clicks_search ON product_clicks(search_share_token);
CREATE INDEX idx_product_clicks_created ON product_clicks(created_at);
