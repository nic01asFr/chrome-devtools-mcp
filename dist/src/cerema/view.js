/**
 * Page noVNC — Affichage du bureau Chrome via WebSocket → VNC
 *
 * Génère la page HTML qui charge noVNC et le connecte à
 * websockify (port 6080 par défaut). websockiny est démarré
 * dans l'entrypoint.sh et traduit WebSocket → VNC sur le
 * framebuffer Xvfb.
 *
 * Accessible sur /view (authentifié via middleware authMiddleware).
 */
// Port websockify (doit correspondre à CDM_WEBSOCKIFY_PORT dans entrypoint.sh)
const WEBSOCKIFY_PORT = process.env['CDM_WEBSOCKIFY_PORT'] || '6080';
/**
 * Retourne le HTML de la page noVNC.
 */
export function viewHtml() {
    return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bureau Chrome — MCP CEREMA</title>
  <style>
    html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #1a1a2e; }
    #vnc_container { display: flex; justify-content: center; align-items: center; height: 100%; }
    #noVNC_canvas { border: none; }
    #noVNC_control_bar { background: rgba(0,0,0,0.7) !important; }
    #noVNC_text_message { color: #e0e0e0 !important; }
  </style>
</head>
<body>
  <div id="vnc_container">
    <div id="noVNC_canvas"></div>
  </div>

  <!-- noVNC charge depuis /usr/lib/node_modules/novnc/app (copié par entrypoint) -->
  <script src="/usr/lib/node_modules/novnc/app/novnc.min.js"></script>
  <script>
    (function() {
      var webSocket = new WebSocket(
        'ws://localhost:${WEBSOCKIFY_PORT}'
      );

      var canvas = document.getElementById('noVNC_canvas');

      var rfb = new noVNC.RFB(webSocket, '', {
        clipboard: false,
        resize: 'scale',
        view_only: true,
      });

      rfb.addEventListener('connect', function() {
        console.log('[noVNC] Connecté');
      });

      rfb.addEventListener('disconnect', function(e) {
        console.log('[noVNC] Déconnecté:', e.detail);
      });

      rfb.addEventListener('error', function(e) {
        console.error('[noVNC] Erreur:', e.detail);
      });

      rfb.attachToCanvas(canvas);
    })();
  </script>
</body>
</html>`;
}
//# sourceMappingURL=view.js.map