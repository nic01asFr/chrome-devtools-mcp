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
/**
 * Retourne le HTML de la page noVNC.
 */
export declare function viewHtml(): string;
//# sourceMappingURL=view.d.ts.map