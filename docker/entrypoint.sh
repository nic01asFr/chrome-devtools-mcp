#!/bin/bash
# ###################################################################
# Entrypoint — Initialise l'environnement X11 et lance le serveur
# ###################################################################
set -e

# ------------------------------------------------------------------
# 1. Xvfb — Écran virtuel (1280×720, profondeur 24)
# ------------------------------------------------------------------
echo "[entrypoint] Démarrage Xvfb sur :99"
# Nettoyage des verrous stale laissés par un arrêt brutal précédent
pkill -f "Xvfb :99" 2>/dev/null || true
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99 2>/dev/null || true
Xvfb :99 -screen 0 1280x720x24 -ac +extension GLX +render -noreset &
XVFB_PID=$!

# Attendre que Xvfb soit prêt
for i in $(seq 1 30); do
    if xdpyinfo -display :99 >/dev/null 2>&1; then
        echo "[entrypoint] Xvfb prêt"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "[entrypoint] Xvfb ne s'est pas initialisé dans les 30s"
        exit 1
    fi
    sleep 0.5
done

export DISPLAY=:99

# ------------------------------------------------------------------
# 2. Mot de passe VNC (fichier ou variable d'environnement)
# ------------------------------------------------------------------
VNC_PASS="${CDM_VNC_PASSWORD:-novnc}"
PASSWD_FILE="/data/vncpasswd"

mkdir -p /data

if [ ! -f "$PASSWD_FILE" ]; then
    echo "[entrypoint] Création mot de passe VNC"
    x11vnc -storepasswd "$VNC_PASS" "$PASSWD_FILE"
fi

# ------------------------------------------------------------------
# 3. x11vnc — Serveur VNC sur le framebuffer
#    -rfbport 5900  → port VNC standard
#    -rfbauth       → authentification depuis fichier
#    -bg            → détache dans le fond
#    -forever       → ne quitte pas après 1 connexion
#    -shared        → autorise connexions multiples
# ------------------------------------------------------------------
echo "[entrypoint] Démarrage x11vnc"
x11vnc \
    -display "$DISPLAY" \
    -rfbport 5900 \
    -rfbauth "$PASSWD_FILE" \
    -bg \
    -forever \
    -shared \
    -nocursor \
    -noxdamage

# ------------------------------------------------------------------
# 4. websockify — Passerelle WebSocket (VNC → WS)
#    Connecte le port VNC (5900) au port WebSocket (6080).
#    noVNC se connecte au WebSocket ; websockify traduit en VNC.
# ------------------------------------------------------------------
WEBSOCKIFY_PORT="${CDM_WEBSOCKIFY_PORT:-6080}"
NOVNC_WEB="/usr/lib/node_modules/@novnc/novnc/app"
echo "[entrypoint] Démarrage websockify (:${WEBSOCKIFY_PORT} → localhost:5900)"
websockify \
    --web "$NOVNC_WEB" \
    --cert /dev/null \
    --key /dev/null \
    --listen-port "$WEBSOCKIFY_PORT" \
    localhost:5900 &

# ------------------------------------------------------------------
# 5. Nettoyage au shutdown
# ------------------------------------------------------------------
cleanup() {
    echo "[entrypoint] Arrêt en cours..."
    kill "$XVFB_PID" 2>/dev/null || true
    wait "$XVFB_PID" 2>/dev/null || true
    exit 0
}
trap cleanup SIGTERM SIGINT

# ------------------------------------------------------------------
# 6. Lancer le processus principal
# ------------------------------------------------------------------
echo "[entrypoint] Lance CMD"
exec "$@"
