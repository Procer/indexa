#!/usr/bin/env bash
# =============================================================================
# Fase 1 — Instalar PostgreSQL 16 + pgvector + pg_cron en el VPS
# =============================================================================
# Uso (como root en el VPS Ubuntu/Debian):
#   bash install-postgres.sh
#
# Idempotente: se puede correr varias veces. No toca datos existentes.
# Al terminar deja Postgres escuchando SOLO en localhost (127.0.0.1 + socket).
# =============================================================================
set -euo pipefail

PG_VERSION=16
APP_DB=techsearch
APP_USER=techsearch
# El 5432 ya lo ocupa un Postgres en Docker de otra app del VPS — este cluster
# usa el 5433, aislado.
APP_PORT=5433

echo "==> 1/7  Repositorio oficial PGDG (Postgres $PG_VERSION)"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg lsb-release
install -d /usr/share/postgresql-common/pgdg
curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] \
http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" \
  > /etc/apt/sources.list.d/pgdg.list
apt-get update -qq

echo "==> 2/7  Instalando postgresql-$PG_VERSION + extensiones"
apt-get install -y -qq \
  postgresql-$PG_VERSION \
  postgresql-client-$PG_VERSION \
  postgresql-$PG_VERSION-pgvector \
  postgresql-$PG_VERSION-cron \
  postgresql-contrib

PGDATA=/etc/postgresql/$PG_VERSION/main
CONF=$PGDATA/postgresql.conf
HBA=$PGDATA/pg_hba.conf

echo "==> 3/7  shared_preload_libraries (pg_cron, pg_stat_statements)"
# pg_cron necesita cargarse en el arranque y saber sobre qué base corre.
if ! grep -q "cron.database_name" "$CONF"; then
  cat >> "$CONF" <<EOF

# --- añadido por install-postgres.sh ---
shared_preload_libraries = 'pg_cron,pg_stat_statements'
cron.database_name = '$APP_DB'
EOF
fi

echo "==> 4/7  Escuchar SOLO en localhost, puerto $APP_PORT"
sed -i "s/^#\?listen_addresses.*/listen_addresses = 'localhost'/" "$CONF"
sed -i "s/^#\?port\s*=.*/port = $APP_PORT/" "$CONF"

echo "==> 5/7  Tuning (drop-in conf.d) — AJUSTAR según RAM real del VPS"
install -d "$PGDATA/conf.d"
if ! grep -q "include_dir = 'conf.d'" "$CONF"; then
  echo "include_dir = 'conf.d'" >> "$CONF"
fi
# Copiá aquí db/vps/postgresql.tuning.conf y editá los valores.
if [ -f "$(dirname "$0")/postgresql.tuning.conf" ]; then
  cp "$(dirname "$0")/postgresql.tuning.conf" "$PGDATA/conf.d/10-tuning.conf"
  echo "    -> conf.d/10-tuning.conf copiado. REVISAR antes de producción."
fi

echo "==> 6/7  pg_hba: solo conexiones locales con scram-sha-256"
cat > "$HBA" <<'EOF'
# TYPE  DATABASE  USER  ADDRESS       METHOD
local   all       all                 scram-sha-256
host    all       all   127.0.0.1/32  scram-sha-256
host    all       all   ::1/128       scram-sha-256
EOF

echo "==> 7/7  Reiniciar y crear base + rol de la app"
systemctl enable postgresql >/dev/null 2>&1 || true
systemctl restart postgresql

# Password del rol: se toma de $APP_PASSWORD si viene seteada, si no se genera.
APP_PASSWORD="${APP_PASSWORD:-$(openssl rand -hex 24)}"
PSQL=(sudo -u postgres psql -p "$APP_PORT" -v ON_ERROR_STOP=1)

# Rol (crea o resetea la password) + base
"${PSQL[@]}" <<EOF
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$APP_USER') THEN
    CREATE ROLE $APP_USER LOGIN PASSWORD '$APP_PASSWORD';
  ELSE
    ALTER ROLE $APP_USER PASSWORD '$APP_PASSWORD';
  END IF;
END \$\$;
EOF
sudo -u postgres createdb -p "$APP_PORT" -O "$APP_USER" "$APP_DB" 2>/dev/null || true

"${PSQL[@]}" -d "$APP_DB" <<EOF
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
CREATE EXTENSION IF NOT EXISTS pg_cron;
GRANT ALL ON SCHEMA public TO $APP_USER;
EOF

cat <<EOF

=============================================================================
 LISTO. PostgreSQL $PG_VERSION corriendo en 127.0.0.1:$APP_PORT (aislado del
 Postgres en Docker que usa el 5432).

 >>> GUARDÁ ESTA LÍNEA — es la conexión para la app (.env.local del VPS):

 DATABASE_URL=postgres://$APP_USER:$APP_PASSWORD@127.0.0.1:$APP_PORT/$APP_DB

 Próximos pasos (ver db/vps/README.md):
   1) psql "\$DATABASE_URL" -f db/vps/schema.sql      # crear el esquema
   2) traer los datos desde Supabase (Fase 2 del README)
   3) agregar DATABASE_URL al .env.local y reiniciar la app
=============================================================================
EOF
