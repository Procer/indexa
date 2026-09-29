#!/usr/bin/env bash
# Chequeo de salud de indexa para correr por cron cada 5 minutos en el VPS.
# Avisa por Telegram (mismas variables que lib/notify/telegram.ts) cuando el sitio
# deja de responder y cuando se recupera — sin repetir el aviso en cada corrida.
#
#   */5 * * * * cd /var/www/indexa && bash scripts/healthcheck.sh >> /var/log/indexa-health.log 2>&1
#
# Variables (se leen de .env si existen): HEALTH_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
set -u
cd "$(dirname "$0")/.." || exit 1
[ -f .env ] && set -a && . ./.env && set +a

URL="${HEALTH_URL:-https://anka.ar/indexa/api/health}"
STATE_FILE="/tmp/indexa-health.state"

notify() {
  [ -z "${TELEGRAM_BOT_TOKEN:-}" ] || [ -z "${TELEGRAM_CHAT_ID:-}" ] && return 0
  curl -s -m 15 "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
    --data-urlencode "chat_id=${TELEGRAM_CHAT_ID}" --data-urlencode "text=$1" >/dev/null || true
}

code=$(curl -s -m 20 -o /dev/null -w '%{http_code}' "$URL" || echo 000)
prev=$(cat "$STATE_FILE" 2>/dev/null || echo up)

if [ "$code" = "200" ]; then
  if [ "$prev" = "down" ]; then
    notify "✅ indexa se recuperó ($URL → 200)"
  fi
  echo up > "$STATE_FILE"
else
  echo "$(date -Is) health FAIL http=$code"
  if [ "$prev" != "down" ]; then
    notify "🚨 indexa no responde: $URL → HTTP $code"
  fi
  echo down > "$STATE_FILE"
fi
