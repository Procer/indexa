-- Sync de búsquedas guardadas entre dispositivos, sin cuenta — mismo espíritu
-- que price_alerts (013_anonymous_alerts.sql): una fila por email, sin
-- user_id, sin relación con Supabase Auth. El manage_token es la única
-- "llave" para ver la lista desde cualquier dispositivo (mismo patrón que
-- /alertas/[token]).

CREATE TABLE saved_search_contacts (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT NOT NULL UNIQUE,
  manage_token UUID NOT NULL DEFAULT gen_random_uuid(),
  share_tokens TEXT[] NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_saved_search_contacts_manage_token ON saved_search_contacts(manage_token);
