#!/usr/bin/env bash
# Deploy de TechSearch AR (indexa) al VPS de producción.
# Correr desde la raíz del repo, DESPUÉS de confirmar que GitHub ya tiene los
# cambios (ver SKILL.md — el push a GitHub es manual por el clasificador de
# Claude Code, así que este script asume que ya se hizo).
#
# El VPS NO tiene .git — es tarball puro en /var/www/indexa, así que cada
# deploy manda el árbol de trabajo completo (menos lo pesado/local) y
# reconstruye ahí.
set -euo pipefail

SSH_KEY="$HOME/.ssh/id_ed25519_anka"
VPS_HOST="root@anka.ar"
REMOTE_DIR="/var/www/indexa"
PM2_APP="indexa"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARBALL="/tmp/indexa-deploy-${STAMP}.tar.gz"

if [ ! -f "$SSH_KEY" ]; then
  echo "No encuentro la key SSH en $SSH_KEY — ajustá SSH_KEY en este script." >&2
  exit 1
fi

echo "==> Empaquetando árbol de trabajo..."
tar --exclude=node_modules --exclude=.next --exclude=.git --exclude=.env.local --exclude=.gstack \
  --exclude='public/muestra-*.html' \
  -czf "$TARBALL" .

echo "==> Copiando al VPS..."
scp -i "$SSH_KEY" "$TARBALL" "${VPS_HOST}:/tmp/"

REMOTE_TARBALL="/tmp/$(basename "$TARBALL")"

echo "==> Instalando dependencias + build + restart en el VPS..."
ssh -i "$SSH_KEY" "$VPS_HOST" bash -s -- "$REMOTE_DIR" "$REMOTE_TARBALL" "$PM2_APP" <<'REMOTE'
set -euo pipefail
REMOTE_DIR="$1"
REMOTE_TARBALL="$2"
PM2_APP="$3"
cd "$REMOTE_DIR"
tar xzf "$REMOTE_TARBALL"
npm install
npm run build
pm2 restart "$PM2_APP" --update-env
rm -f "$REMOTE_TARBALL"
REMOTE

echo "==> Verificando..."
ssh -i "$SSH_KEY" "$VPS_HOST" "pm2 list | grep -w $PM2_APP || pm2 list"
curl -sL -o /dev/null -w "curl https://anka.ar/indexa/ -> %{http_code}\n" "https://anka.ar/indexa/" || true
ssh -i "$SSH_KEY" "$VPS_HOST" "tail -n 30 ~/.pm2/logs/${PM2_APP}-error.log 2>/dev/null || echo '(sin log de error accesible en esa ruta — revisar a mano si hace falta)'"

rm -f "$TARBALL"
echo "==> Deploy terminado. Revisá arriba: pm2 online + restart count subió, curl 200, log de error limpio (o solo warnings viejos)."
