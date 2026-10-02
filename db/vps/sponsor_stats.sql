-- =============================================================================
-- sponsor_stats — medición de patrocinados + visibilidad garantizada.
--
-- · product_impressions: cada vez que una tarjeta de producto SE VE en pantalla
--   (≥50% visible ~1s, lo reporta el navegador). Base de CTR por tienda y por
--   campaña. Una fila por (búsqueda, visita, producto).
-- · search_sponsorships: qué productos de cada búsqueda quedaron patrocinados
--   (y por qué campaña / en qué posición del ranking). Sirve para etiquetar al
--   recargar o paginar y para atribuir impresiones y clicks a una campaña.
-- · sponsored_placements: monto pagado, posición garantizada y tope por búsqueda.
-- · site_events: tipos nuevos para el slot de la pantalla de inicio.
--
-- Correr una vez en el VPS (idempotente):
--   sudo -u postgres psql -p 5433 -d techsearch -f /var/www/indexa/db/vps/sponsor_stats.sql
-- =============================================================================

ALTER TABLE sponsored_placements
  ADD COLUMN IF NOT EXISTS amount_paid_ars NUMERIC(12,2),
  -- NULL = solo empuja por score. 1..6 = además garantiza que el mejor producto
  -- elegible de la tienda quede como máximo en esa posición del ranking.
  ADD COLUMN IF NOT EXISTS slot_position   INT,
  -- Tope de productos de la campaña que se favorecen en UNA búsqueda (evita
  -- que una tienda llene toda la grilla).
  ADD COLUMN IF NOT EXISTS max_per_search  INT NOT NULL DEFAULT 2;

ALTER TABLE sponsored_placements DROP CONSTRAINT IF EXISTS sponsored_placements_slot_position_check;
ALTER TABLE sponsored_placements
  ADD CONSTRAINT sponsored_placements_slot_position_check
  CHECK (slot_position IS NULL OR slot_position BETWEEN 1 AND 6);
ALTER TABLE sponsored_placements DROP CONSTRAINT IF EXISTS sponsored_placements_max_per_search_check;
ALTER TABLE sponsored_placements
  ADD CONSTRAINT sponsored_placements_max_per_search_check
  CHECK (max_per_search BETWEEN 1 AND 10);

CREATE TABLE IF NOT EXISTS search_sponsorships (
  share_token  TEXT NOT NULL,
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  placement_id UUID NOT NULL REFERENCES sponsored_placements(id) ON DELETE CASCADE,
  -- posición (1 = primero) en el pool rankeado de la búsqueda
  position     INT,
  -- 'boost' = subió por score; 'slot' = se la puso en la posición garantizada
  via          TEXT NOT NULL DEFAULT 'boost' CHECK (via IN ('boost', 'slot')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (share_token, product_id)
);
CREATE INDEX IF NOT EXISTS idx_search_sponsorships_placement ON search_sponsorships (placement_id, created_at);

CREATE TABLE IF NOT EXISTS product_impressions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_token  TEXT NOT NULL,
  visit_id     TEXT NOT NULL,
  product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  -- desnormalizados para agrupar por tienda/rubro sin join pesado
  source       TEXT,
  category     TEXT,
  -- campaña a la que se atribuye (NULL = orgánico)
  placement_id UUID REFERENCES sponsored_placements(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (share_token, visit_id, product_id)
);
CREATE INDEX IF NOT EXISTS idx_impressions_created   ON product_impressions (created_at);
CREATE INDEX IF NOT EXISTS idx_impressions_product   ON product_impressions (product_id);
CREATE INDEX IF NOT EXISTS idx_impressions_source    ON product_impressions (source, created_at);
CREATE INDEX IF NOT EXISTS idx_impressions_placement ON product_impressions (placement_id, created_at)
  WHERE placement_id IS NOT NULL;

-- site_events: sumar los tipos del slot de inicio. El CHECK original puede
-- tener cualquier nombre según cómo se creó la base, así que se borran todos
-- los CHECK que mencionan event_type y se crea uno solo conocido.
DO $$
DECLARE c TEXT;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'site_events'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%event_type%'
  LOOP
    EXECUTE format('ALTER TABLE site_events DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE site_events
  ADD CONSTRAINT site_events_event_type_check CHECK (event_type IN (
    'session_start', 'product_view_details', 'product_compare_add', 'product_ask_about',
    'product_buy_click', 'time_on_page', 'client_error', 'visitor_label',
    'sponsor_home_view', 'sponsor_home_click'
  ));

-- Si se corre como `postgres`, la app (rol `techsearch`) necesita ser dueña.
ALTER TABLE search_sponsorships OWNER TO techsearch;
ALTER TABLE product_impressions OWNER TO techsearch;
