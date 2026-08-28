#!/usr/bin/env bash
# =============================================================================
# Fase 5 — Backup diario de la base + envío fuera del VPS
# =============================================================================
# Instalar como cron de root:  0 3 * * *  /var/www/indexa/db/vps/backup.sh
#
# Hace:
#   1) pg_dump comprimido (formato custom, restaurable con pg_restore)
#   2) retención local de 7 días
#   3) (opcional) copia a un bucket S3-compatible con `rclone` o `aws s3`
#
# Un backup que nunca restauraste NO es un backup. Ver restore-test más abajo.
# =============================================================================
set -euo pipefail

# El cron corre como `sudo -u postgres` heredando CWD=/root, que el usuario
# postgres no puede leer — `find` falla al restaurar el directorio. Nos
# paramos en un lugar accesible antes de cualquier cosa.
cd /

# El VPS tiene postgresql-client 16 Y 17 instalados; `/usr/bin/pg_dump` es el
# wrapper de Debian y elige el MÁS NUEVO (17) por default, que genera un
# archivo que el pg_restore 16 no puede leer ("unsupported version"). El
# servidor es 16 → forzamos los binarios 16 explícitamente.
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"

DB_NAME="${DB_NAME:-techsearch}"
DB_USER="${DB_USER:-techsearch}"
DB_HOST="${DB_HOST:-127.0.0.1}"
# El Postgres del VPS escucha en 5433 (el 5432 lo ocupa un Postgres en Docker
# de otra app del box). Ver db/vps/README.md.
DB_PORT="${DB_PORT:-5433}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/techsearch}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
# Destino remoto opcional. Ej: "b2:techsearch-backups" (rclone) — vacío = no subir.
REMOTE_DEST="${REMOTE_DEST:-}"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/techsearch-$STAMP.dump"

mkdir -p "$BACKUP_DIR"

echo "[$(date -Is)] dump -> $OUT"
# --no-owner / --no-privileges: portable a cualquier rol al restaurar.
PGPASSWORD="${PGPASSWORD:-}" "$PG_BIN/pg_dump" \
  --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" --dbname="$DB_NAME" \
  --format=custom --compress=9 --no-owner --no-privileges \
  --file="$OUT"

# Checksum para verificar integridad al restaurar
sha256sum "$OUT" > "$OUT.sha256"

echo "[$(date -Is)] retención local: borrando dumps > $RETENTION_DAYS días"
find "$BACKUP_DIR" -name 'techsearch-*.dump*' -mtime +"$RETENTION_DAYS" -delete

if [ -n "$REMOTE_DEST" ]; then
  echo "[$(date -Is)] subiendo a $REMOTE_DEST"
  if command -v rclone >/dev/null; then
    rclone copy "$OUT" "$REMOTE_DEST/" --quiet
    rclone copy "$OUT.sha256" "$REMOTE_DEST/" --quiet
    # retención remota (30 días)
    rclone delete "$REMOTE_DEST/" --min-age 30d --quiet || true
  elif command -v aws >/dev/null; then
    aws s3 cp "$OUT" "s3://$REMOTE_DEST/"
    aws s3 cp "$OUT.sha256" "s3://$REMOTE_DEST/"
  else
    echo "  WARN: ni rclone ni aws instalados — backup quedó SOLO local"
  fi
fi

echo "[$(date -Is)] OK  ($(du -h "$OUT" | cut -f1))"
