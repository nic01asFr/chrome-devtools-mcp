# #####################################################################
# Image Chrome MCP CEREMA — Chrome + Xvfb + x11vnc + noVNC
# #####################################################################
# Construction :
#   1. node:22-bookworm  → compilation + node_modules
#   2. ubuntu:24.04      → runtime avec Chrome + Xvfb + x11vnc + noVNC
# #####################################################################

# -------------------------------------------------------------------
# ÉTAPE 0 — Installer Chrome stable (Ubuntu) + dépendances X11
# -------------------------------------------------------------------
FROM ubuntu:24.04 AS chrome-base

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=fr_FR.UTF-8 \
    LANGUAGE=fr_FR:fr

# Dépendances X11 / Chrome + utilitaires (xdotool pour L5)
RUN apt-get update && apt-get install -y --no-install-recommends \
        wget gnupg2 ca-certificates apt-transport-https \
        fonts-liberation fonts-noto-cjk \
        xvfb x11vnc xdotool x11-utils xclip \
        python3 python3-pip \
        tini \
    && apt-get clean && rm -rf /var/lib/apt/lists/* \
    && wget -q https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb \
    && apt-get install -y ./google-chrome-stable_current_amd64.deb \
    && rm google-chrome-stable_current_amd64.deb \
    && rm -rf /var/lib/apt/lists/*

# -------------------------------------------------------------------
# ÉTAPE 1 — Build Node.js
# -------------------------------------------------------------------
FROM node:22-bookworm AS build

WORKDIR /build

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# -------------------------------------------------------------------
# ÉTAPE 2 — Image finale
# -------------------------------------------------------------------
FROM chrome-base

# Environnement
ENV PATH="/usr/local/bin:$PATH" \
    DISPLAY=:99 \
    CDM_PORT=3000 \
    CDM_WEBSOCKIFY_PORT=6080 \
    CDM_PROFILE_DIR=/data/profiles \
    CDM_DATA_DIR=/data \
    CDM_HEADLESS=false \
    LANG=fr_FR.UTF-8

# Copier les artefacts Node
COPY --from=build /build/node_modules /app/node_modules
COPY --from=build /build/dist /app/dist
COPY --from=build /build/package.json /app/package.json

# Installer noVNC + websockify (Python)
RUN npm install -g @novnc/novnc@1.3.0 \
 && pip install --no-cache-dir websockify

# Copier le script d'entrée
COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod 755 /usr/local/bin/entrypoint.sh

# Ports exposés
#   3000 = Express (MCP + /view)
#   6080 = websockify (WebSocket → VNC)
EXPOSE 3000 6080

WORKDIR /app

ENTRYPOINT ["tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "dist/cerema/index.js"]
