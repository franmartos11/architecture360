#!/usr/bin/env bash
# Actualiza el puente de WhatsApp en el servidor: trae main, instala dependencias
# y reinicia el servicio. Correlo con sudo desde un usuario administrador:
#   sudo bash /home/p360/architecture360/ops/bot/actualizar-bot.sh
# git y pnpm corren como el dueño del repo (p360), no como root.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SERVICIO=p360-whatsapp-bot
DUENO="$(stat -c %U "$DIR")"

como() {
  if [ "$(id -u)" -eq 0 ] && [ "$DUENO" != "root" ]; then
    runuser -u "$DUENO" -- bash -lc "cd '$DIR' && $1"
  else
    bash -lc "cd '$DIR' && $1"
  fi
}

echo "==> git pull"
como "git pull --ff-only"

echo "==> pnpm install"
como "pnpm install --frozen-lockfile"

echo "==> reiniciando $SERVICIO"
if [ "$(id -u)" -eq 0 ]; then
  systemctl restart "$SERVICIO"
else
  sudo systemctl restart "$SERVICIO"
fi
systemctl --no-pager status "$SERVICIO" | head -n 5 || true
