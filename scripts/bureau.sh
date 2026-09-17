#!/usr/bin/env bash
# bureau.sh — Bureau virtuel (Xvfb + fluxbox + x11vnc + websockify/noVNC + Chrome)
# Idempotent : installe les paquets si absents, gère start|stop|status.
# Tout écoute UNIQUEMENT sur 127.0.0.1.
set -euo pipefail
ulimit -c 0

PROJ=/home/onyxia/work
LOG=$PROJ/logs/bureau
PID=$LOG/pids
CHROME_PROFILE=$PROJ/chrome/profil-ancre
CHROME_USERDATA="--user-data-dir=$CHROME_PROFILE"
export DISPLAY=:99

# ── prérequis ──────────────────────────────────────────────────────────
install_deps() {
    echo "[bureau] Installation des dépendances…"
    sudo -n apt-get update -qq
    sudo -n apt-get install -y -qq \
        xvfb fluxbox x11vnc novnc websockify \
        wget gnupg2 ca-certificates apt-transport-https

    # Google Chrome stable
    wget -q -O /tmp/chrome.deb \
        https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb
    sudo -n apt-get install -y -qq /tmp/chrome.deb
    rm -f /tmp/chrome.deb
    echo "[bureau] Dépendances installées."
}

ensure_installed() {
    if command -v Xvfb &>/dev/null && command -v fluxbox &>/dev/null \
       && command -v x11vnc &>/dev/null && command -v websockify &>/dev/null \
       && command -v google-chrome &>/dev/null; then
        return 0
    fi
    install_deps
}

# ── PID tracking ───────────────────────────────────────────────────────
PIDS=()

track() {
    PIDS+=("$1")
    echo "$1" > "$PID/$2"
}

# ── attente active (remplace sleep fixes) ─────────────────────────────
wait_for_socket() {
    local socket="/tmp/.X${1}-lock"
    for i in $(seq 1 50); do
        [ -e "$socket" ] && return 0
        sleep 0.2
    done
    echo "[bureau] ERREUR : socket X:${1} n'apparaît pas"
    return 1
}

wait_for_port() {
    local host="${1:-127.0.0.1}" port=$2 desc=$3
    for i in $(seq 1 50); do
        if (echo >/dev/tcp/"$host"/"$port") 2>/dev/null; then
            return 0
        fi
        sleep 0.2
    done
    echo "[bureau] ERREUR : $desc ($host:$port) ne répond pas"
    return 1
}

wait_for_cdp() {
    for i in $(seq 1 50); do
        if curl -sf 127.0.0.1:9222/json/version &>/dev/null; then
            return 0
        fi
        sleep 0.2
    done
    echo "[bureau] ERREUR : CDP (9222/json/version) ne répond pas"
    return 1
}

wait_for_vnc() {
    for i in $(seq 1 50); do
        if curl -sf http://127.0.0.1:6080/vnc.html &>/dev/null; then
            return 0
        fi
        sleep 0.2
    done
    echo "[bureau] ERREUR : noVNC (6080/vnc.html) ne répond pas"
    return 1
}

# ── start ──────────────────────────────────────────────────────────────
do_start() {
    ensure_installed
    mkdir -p "$LOG" "$PID" "$CHROME_PROFILE"

    # Xvfb
    if [ -f "$PID/Xvfb" ] && kill -0 "$(cat "$PID/Xvfb")" 2>/dev/null; then
        echo "[bureau] Xvfb déjà lancé (pid $(cat "$PID/Xvfb"))"
    else
        echo "[bureau] Démarrage Xvfb :99 1920×1080x24"
        Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp &>"$LOG/Xvfb.log" &
        local xvfb_pid=$!
        wait_for_socket 99 || { kill $xvfb_pid 2>/dev/null; return 1; }
        track "$xvfb_pid" Xvfb
        echo "[bureau] Xvfb OK"
    fi

    # fluxbox
    if [ -f "$PID/fluxbox" ] && kill -0 "$(cat "$PID/fluxbox")" 2>/dev/null; then
        echo "[bureau] fluxbox déjà lancé"
    else
        echo "[bureau] Démarrage fluxbox"
        DISPLAY=:99 nohup fluxbox &>"$LOG/fluxbox.log" &
        track "$!" fluxbox
        sleep 0.2
        echo "[bureau] fluxbox OK"
    fi

    # x11vnc — 127.0.0.1:5900 uniquement, sans mot de passe
    # Pas de -bg (fork, perd le PID) ; -localhost ; -rfbport 5900
    if [ -f "$PID/x11vnc" ] && kill -0 "$(cat "$PID/x11vnc")" 2>/dev/null; then
        echo "[bureau] x11vnc déjà lancé"
    else
        echo "[bureau] Démarrage x11vnc 127.0.0.1:5900"
        x11vnc -display :99 -clip 1920x1080 \
               -localhost -rfbport 5900 -nopw \
               &>"$LOG/x11vnc.log" &
        track "$!" x11vnc
        wait_for_port 127.0.0.1 5900 "x11vnc" || { kill "$(cat "$PID/x11vnc")" 2>/dev/null; return 1; }
        echo "[bureau] x11vnc OK"
    fi

    # Chrome — CDP sur 127.0.0.1:9222
    if [ -f "$PID/chrome" ] && kill -0 "$(cat "$PID/chrome")" 2>/dev/null; then
        echo "[bureau] Chrome déjà lancé"
    else
        echo "[bureau] Démarrage Chrome"
        google-chrome \
            --no-first-run \
            --no-default-browser-check \
            --disable-background-timers \
            --disable-translate \
            --remote-debugging-address=127.0.0.1 \
            --remote-debugging-port=9222 \
            $CHROME_USERDATA \
            &>"$LOG/chrome.log" &
        track "$!" chrome
        wait_for_cdp || { kill "$(cat "$PID/chrome")" 2>/dev/null; return 1; }
        echo "[bureau] Chrome OK"
    fi

    # websockify — noVNC sur 127.0.0.1:6080
    # --web pointe vers le dossier statique de noVNC (pas dirname de websockify)
    if [ -f "$PID/websockify" ] && kill -0 "$(cat "$PID/websockify")" 2>/dev/null; then
        echo "[bureau] websockify déjà lancé"
    else
        echo "[bureau] Démarrage websockify 127.0.0.1:6080 → :5900"
        websockify --web=/usr/share/novnc \
                   127.0.0.1:6080 127.0.0.1:5900 \
                   &>"$LOG/websockify.log" &
        track "$!" websockify
        wait_for_vnc || { kill "$(cat "$PID/websockify")" 2>/dev/null; return 1; }
        echo "[bureau] websockify OK"
    fi

    echo "[bureau] OK — tous les services tournent"
    echo "    VNC  → http://127.0.0.1:6080/vnc.html"
    echo "    CDP  → http://127.0.0.1:9222/json"
}

# ── stop — ne tue que nos processus et leurs descendants ────────────────
do_stop() {
    echo "[bureau] Arrêt de tous les processus…"
    # Arrêt dans l'ordre inverse du démarrage
    for pidfile in "$PID"/websockify "$PID"/chrome "$PID"/x11vnc "$PID"/fluxbox "$PID"/Xvfb; do
        [ -f "$pidfile" ] || continue
        pid=$(cat "$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
            sleep 0.5
        fi
        rm -f "$pidfile"
    done
    echo "[bureau] Arrêté."
}

# ── status ─────────────────────────────────────────────────────────────
do_status() {
    echo "[bureau] État des services :"
    for name in Xvfb fluxbox x11vnc websockify chrome; do
        pidfile="$PID/$name"
        if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
            echo "  $name : OK (pid $(cat "$pidfile"))"
        else
            echo "  $name : INACTIF"
        fi
    done
}

# ── routing ────────────────────────────────────────────────────────────
case "${1:-}" in
    start)   do_start   ;;
    stop)    do_stop    ;;
    status)  do_status  ;;
    *)
        echo "Usage: $0 {start|stop|status}"
        exit 1
        ;;
esac
