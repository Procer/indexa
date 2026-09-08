-- Patrocinados: de "lista de productos puntuales" a "tienda + rubro".
-- Una colocación ahora apunta a un source (tienda) y a uno o más rubros
-- (categories). El match en el ranking es: producto.source = target_source
-- AND producto.category = ANY(categories) AND similarity >= min_relevance.
-- product_ids queda por compatibilidad pero deja de usarse.

ALTER TABLE sponsored_placements
  ADD COLUMN IF NOT EXISTS target_source TEXT,
  ADD COLUMN IF NOT EXISTS show_on_home  BOOLEAN NOT NULL DEFAULT false;

-- product_ids pasa a opcional (las colocaciones nuevas no lo llenan).
ALTER TABLE sponsored_placements ALTER COLUMN product_ids DROP NOT NULL;
ALTER TABLE sponsored_placements ALTER COLUMN product_ids SET DEFAULT '{}';

-- Las colocaciones viejas basadas en product_ids quedan sin target_source;
-- se pausan para que no queden a medias con el modelo nuevo.
UPDATE sponsored_placements
SET active = false
WHERE target_source IS NULL AND active = true;

CREATE INDEX IF NOT EXISTS idx_sponsored_placements_active
  ON sponsored_placements (active) WHERE active = true;
