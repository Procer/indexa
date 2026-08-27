-- =============================================================
-- Columna affiliate_url en products
-- Guarda la URL con tag de afiliado (hoy solo aplica a source='mercadolibre').
-- Para otras fuentes queda NULL y el frontend cae al `url` original.
-- =============================================================

ALTER TABLE products ADD COLUMN IF NOT EXISTS affiliate_url TEXT;
