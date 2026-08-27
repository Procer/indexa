#!/usr/bin/env bash
# =============================================================================
# Fase 5 — Backup diario de la base + envío fuera del VPS
# =============================================================================
# Instalar como cron de root:  0 3 * * *  /root/techsearch/db/vps/backup.sh
#
# Hace:
#   1) pg_dump comprimido (formato custom, restaurable con pg_restore)
#   2) retención local de 7 días
#   3) (opcional) copia a un bucket S3-compatible con `rclone` o `aws s3`
#
# Un backup que nunca restauraste NO es un backup. Ver restore-test más abajo.
# =============================================================================
set -euo pipefail

DB_NAME="${DB_NAME:-techsearch}"
DB_USER="${DB_USER:-techsearch}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/techsearch}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"
# Destino remoto opcional. Ej: "b2:techsearch-backups" (rclone) — vacío = no subir.
REMOTE_DEST="${REMOTE_DEST:-}"

STAMP="$(date +%Y%m%d-%H%M%S)"
OUT="$BACKUP_DIR/techsearch-$STAMP.dump"

mkdir -p "$BACKUP_DIR"

echo "[$(date -Is)] dump -> $OUT"
# --no-owner / --no-privileges: portable a cualquier rol al restaurar.
PGPASSWORD="${PGPASSWORD:-}" pg_dump \
  --host=127.0.0.1 --username="$DB_USER" --dbname="$DB_NAME" \
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
