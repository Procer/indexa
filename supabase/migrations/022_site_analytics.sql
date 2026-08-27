-- Tracking de sesión/visita real, independiente del sessionId efímero que ya
-- usa app/api/search/route.ts para cachear resultados intermedios de una
-- búsqueda puntual (ese flujo no se toca). visit_id se genera en el cliente
-- (lib/analytics/visit.ts), persiste en localStorage con ventana de
-- inactividad de 30min, y es lo que permite agrupar clicks/eventos de una
-- misma visita real entre páginas.

ALTER TABLE product_clicks ADD COLUMN visit_id TEXT;
CREATE INDEX idx_product_clicks_visit ON product_clicks(visit_id);

-- Eventos genéricos de sitio: entrada (session_start), ver detalles, agregar
-- a comparar, y tiempo en página (duration_ms medido en el cliente vía
-- visibilitychange/pagehide). product_clicks sigue siendo la fuente para
-- "ver en tienda" (ya alimenta el ranking vía increment_click_count) — no se
-- duplica acá.
CREATE TABLE site_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('session_start', 'product_view_details', 'product_compare_add', 'time_on_page')),
  visit_id TEXT NOT NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  path TEXT,
  duration_ms INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_site_events_visit ON site_events(visit_id);
CREATE INDEX idx_site_events_type_created ON site_events(event_type, created_at);
