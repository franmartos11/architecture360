#!/usr/bin/env bash
# Deja un servidor Debian/Ubuntu listo para correr el puente de WhatsApp (pnpm bot):
# usuario p360, Node 22, pnpm 11 (corepack), dependencias de Chromium, deploy key
# de GitHub (solo lectura), repo, dependencias, .env.bot y servicio systemd.
# Se puede correr de nuevo: lo que ya está hecho lo saltea. Ver ops/bot/README.md.
#
#   sudo bash instalar-bot-linux.sh [--usuario p360] [--dir /home/p360/architecture360]
#
# Si la deploy key todavía no está cargada en GitHub, el script muestra la clave
# pública y se corta: pegala en GitHub y volvé a correrlo.
set -euo pipefail

REPO_URL="git@github.com:franmartos11/architecture360.git"
RAMA="main"
NODE_MAYOR=22
USUARIO="p360"
DIR=""

while [ $# -gt 0 ]; do
  case "$1" in
    --usuario) USUARIO="$2"; shift 2 ;;
    --dir) DIR="$2"; shift 2 ;;
    *) echo "Opción desconocida: $1" >&2; exit 2 ;;
  esac
done

paso() { echo; echo "==> $*"; }
como() { runuser -u "$USUARIO" -- bash -lc "$1"; }

[ "$(id -u)" -eq 0 ] || { echo "Correlo con sudo." >&2; exit 1; }
command -v apt-get >/dev/null || { echo "Este script es para Debian/Ubuntu (apt)." >&2; exit 1; }

paso "Usuario $USUARIO"
if id "$USUARIO" >/dev/null 2>&1; then
  echo "Ya existe."
else
  adduser --disabled-password --gecos "" "$USUARIO"
fi
HOME_USUARIO="$(getent passwd "$USUARIO" | cut -d: -f6)"
DIR="${DIR:-$HOME_USUARIO/architecture360}"

paso "Paquetes base"
apt-get update -qq
apt-get install -y -qq git curl ca-certificates openssh-client >/dev/null

paso "Node $NODE_MAYOR"
if command -v node >/dev/null && [ "$(node -p 'process.versions.node.split(".")[0]')" -ge "$NODE_MAYOR" ]; then
  echo "Ya está: $(node -v)"
else
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAYOR}.x" | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
  echo "Instalado: $(node -v)"
fi

paso "Dependencias de Chromium (puppeteer)"
# libasound2 pasó a libasound2t64 en Ubuntu 24.04 / Debian 13.
ASOUND=libasound2
if apt-cache show libasound2t64 >/dev/null 2>&1; then ASOUND=libasound2t64; fi
apt-get install -y -qq \
  ca-certificates fonts-liberation xdg-utils wget \
  libatk-bridge2.0-0 libatk1.0-0 libcairo2 libcups2 libdbus-1-3 libdrm2 \
  libexpat1 libgbm1 libglib2.0-0 libnspr4 libnss3 libpango-1.0-0 \
  libx11-6 libxcb1 libxcomposite1 libxdamage1 libxext6 libxfixes3 \
  libxkbcommon0 libxrandr2 "$ASOUND" >/dev/null
echo "Listo."

paso "pnpm 11 (corepack)"
corepack enable
como "COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack prepare pnpm@11 --activate"
PNPM_BIN="$(command -v pnpm)"
echo "pnpm: $PNPM_BIN ($(como 'pnpm -v'))"

paso "Deploy key de GitHub"
CLAVE="$HOME_USUARIO/.ssh/id_ed25519_p360_deploy"
if [ ! -f "$CLAVE" ]; then
  install -d -m 700 -o "$USUARIO" -g "$USUARIO" "$HOME_USUARIO/.ssh"
  runuser -u "$USUARIO" -- ssh-keygen -t ed25519 -N "" -C "p360-bot@$(hostname)" -f "$CLAVE" >/dev/null
fi
CONFIG_SSH="$HOME_USUARIO/.ssh/config"
if ! grep -q "id_ed25519_p360_deploy" "$CONFIG_SSH" 2>/dev/null; then
  cat >> "$CONFIG_SSH" <<CFG
Host github.com
  IdentityFile $CLAVE
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
CFG
  chown "$USUARIO:$USUARIO" "$CONFIG_SSH"
  chmod 600 "$CONFIG_SSH"
fi

paso "Repo ($RAMA)"
if [ -d "$DIR/.git" ]; then
  echo "Ya está clonado en $DIR."
else
  if ! como "git clone --branch '$RAMA' '$REPO_URL' '$DIR'"; then
    echo
    echo "No pude clonar. Cargá esta clave pública como Deploy key (solo lectura) en"
    echo "GitHub: franmartos11/architecture360 -> Settings -> Deploy keys -> Add deploy key."
    echo "Después volvé a correr este script."
    echo
    cat "$CLAVE.pub"
    exit 1
  fi
fi

paso "Dependencias (pnpm install)"
como "cd '$DIR' && pnpm install --frozen-lockfile"

paso ".env.bot"
if [ -f "$DIR/.env.bot" ]; then
  echo "Ya existe; no lo toco."
else
  install -m 600 -o "$USUARIO" -g "$USUARIO" "$DIR/.env.bot.example" "$DIR/.env.bot"
  echo "Creado desde .env.bot.example. Completalo: sudo -u $USUARIO nano $DIR/.env.bot"
fi

paso "Servicio systemd"
UNIDAD=/etc/systemd/system/p360-whatsapp-bot.service
sed -e "s|^User=.*|User=$USUARIO|" \
    -e "s|^WorkingDirectory=.*|WorkingDirectory=$DIR|" \
    -e "s|^ExecStart=.*|ExecStart=$PNPM_BIN bot|" \
    "$DIR/ops/bot/p360-whatsapp-bot.service" > "$UNIDAD"
systemctl daemon-reload
systemctl enable p360-whatsapp-bot >/dev/null

echo
echo "Listo. Falta completar $DIR/.env.bot y arrancar:"
echo "  sudo systemctl start p360-whatsapp-bot"
echo "  journalctl -u p360-whatsapp-bot -f"
echo "(No lo arranco solo: sin .env.bot completo el puente sale con error.)"
