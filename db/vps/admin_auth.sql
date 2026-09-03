-- =============================================================================
-- admin_auth — login propio del panel /admin sobre la Postgres del VPS.
-- Reemplaza la autenticación por Supabase Auth + profiles.role (ver
-- lib/auth/adminSession.ts). El login del sitio público NO usa estas tablas.
--
-- Correr una vez en el VPS:
--   sudo -u postgres psql -p 5433 -d techsearch -f /var/www/indexa/db/vps/admin_auth.sql
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin_users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL,
  password_hash  TEXT,                      -- NULL hasta que define su clave por el link de invitación
  role           TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by     UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  last_login_at  TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users (lower(email));

CREATE TABLE IF NOT EXISTS admin_sessions (
  token          TEXT PRIMARY KEY,          -- crypto.randomBytes(32).toString('hex')
  admin_user_id  UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  user_agent     TEXT
);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_user    ON admin_sessions (admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires ON admin_sessions (expires_at);

CREATE TABLE IF NOT EXISTS admin_invites (
  token          TEXT PRIMARY KEY,          -- crypto.randomBytes(32).toString('hex')
  admin_user_id  UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  purpose        TEXT NOT NULL DEFAULT 'set_password'
                 CHECK (purpose IN ('set_password', 'reset_password')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at     TIMESTAMPTZ NOT NULL,
  used_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_admin_invites_user ON admin_invites (admin_user_id);
