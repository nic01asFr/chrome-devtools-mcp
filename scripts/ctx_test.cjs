// Prouve que deux contextes CDP ne partagent pas leurs cookies.
//
// C'est la mesure qui fonde le dessin du service : un seul Chrome, un contexte
// par conversation. Ni un navigateur par session, ni un navigateur partage sans
// cloison. Ecrite le 1er septembre sur le pod du bureau, effacee par megarde le
// 7 par un agent qui nettoyait ce dossier, remise ici sans dependance — node 22
// apporte WebSocket — et versee au depot pour ne plus dependre d'un pod.
//
// Usage : node scripts/ctx_test.js   (Chrome doit ecouter sur 9222)

const http = require('http');

function lire(chemin) {
  return new Promise((r) => http.get('http://localhost:9222' + chemin, (s) => {
    let d = '';
    s.on('data', (c) => (d += c));
    s.on('end', () => r(JSON.parse(d)));
  }));
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.id = 0;
    this.attentes = {};
    this.pret = new Promise((r) => this.ws.addEventListener('open', r));
    this.ws.addEventListener('message', (m) => {
      const o = JSON.parse(m.data);
      if (o.id && this.attentes[o.id]) {
        this.attentes[o.id](o);
        delete this.attentes[o.id];
      }
    });
  }
  envoyer(methode, params = {}, sessionId) {
    return new Promise((r) => {
      const id = ++this.id;
      this.attentes[id] = r;
      this.ws.send(JSON.stringify({ id, method: methode, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
}

(async () => {
  const v = await lire('/json/version');
  const c = new CDP(v.webSocketDebuggerUrl);
  await c.pret;

  const ouverts = {};
  for (const nom of ['A', 'B']) {
    const ctx = (await c.envoyer('Target.createBrowserContext', {})).result.browserContextId;
    const cible = (await c.envoyer('Target.createTarget', { url: 'https://example.com', browserContextId: ctx })).result.targetId;
    const s = (await c.envoyer('Target.attachToTarget', { targetId: cible, flatten: true })).result.sessionId;
    await new Promise((r) => setTimeout(r, 2500));
    await c.envoyer('Runtime.evaluate', { expression: 'document.cookie="marqueur=' + nom + ';path=/"' }, s);
    ouverts[nom] = { ctx, cible, session: s };
  }

  let etanche = true;
  for (const nom of ['A', 'B']) {
    const r = await c.envoyer('Runtime.evaluate', { expression: 'document.cookie', returnByValue: true }, ouverts[nom].session);
    const vu = r.result.result.value;
    console.log('contexte ' + nom + ' (' + ouverts[nom].ctx.slice(0, 8) + ') -> cookie vu : "' + vu + '"');
    if (vu !== 'marqueur=' + nom) etanche = false;
  }

  const cibles = await lire('/json/list');
  console.log('cibles page ouvertes :', cibles.filter((t) => t.type === 'page').length);
  console.log(etanche ? 'ISOLATION TENUE' : 'ISOLATION ROMPUE');
  process.exit(etanche ? 0 : 1);
})();
