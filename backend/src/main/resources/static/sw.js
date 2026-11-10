// Service worker do shell (index.html, app.js, style.css, ícones).
// Estratégia: stale-while-revalidate. Responde do cache na hora (abre sem
// pagar ~250ms de rede por arquivo) e busca a versão nova em segundo plano;
// se o texto de index.html/app.js/style.css mudou, atualiza o cache e avisa
// as abas abertas com postMessage({ type: 'retifica:nova-versao' }) — o
// app.js mostra o aviso pra recarregar. Antes era network-first justamente
// pra nunca prender o app numa versão velha; o aviso resolve isso sem pôr a
// rede no caminho crítico da abertura.
// Nunca cacheia /api/* (dados sempre frescos) nem requisições de outras
// origens (Google Fonts etc. ficam com o cache HTTP do próprio navegador).
// v8: a logo vem da empresa logada (/api/empresa/logo), nao mais de um arquivo fixo.
// v10: o front novo (Angular) fica em /novo/; este SW não responde nada ali.
// v9: ditado.js (ditar o pedido por voz) entra no shell.
// v7: fontes Barlow passam a ser servidas pelo app (fonts/), sem Google Fonts.
// v6: a v5 tinha o bug de nunca atualizar o cache (ver comentário no fetch);
// trocar o nome força instalar do zero e resgata quem ficou preso nela.
const CACHE = 'retifica-shell-v10';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'ditado.js', 'manifest.json', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'fonts/fonts.css', 'fonts/barlow-latin-400-normal.woff2', 'fonts/barlow-latin-ext-400-normal.woff2', 'fonts/barlow-latin-500-normal.woff2', 'fonts/barlow-latin-ext-500-normal.woff2', 'fonts/barlow-latin-700-normal.woff2', 'fonts/barlow-latin-ext-700-normal.woff2', 'fonts/barlow-condensed-latin-400-normal.woff2', 'fonts/barlow-condensed-latin-ext-400-normal.woff2', 'fonts/barlow-condensed-latin-600-normal.woff2', 'fonts/barlow-condensed-latin-ext-600-normal.woff2'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(async (chaves) => {
        const antigos = chaves.filter((k) => k !== CACHE);
        await Promise.all(antigos.map((k) => caches.delete(k)));
        await self.clients.claim();
        // substituiu uma versão anterior: a aba aberta ainda roda o app.js
        // antigo, então oferece recarregar.
        if (antigos.length) await avisarNovaVersao();
      })
  );
});

function ehTextoDoShell(resp) {
  const tipo = resp.headers.get('content-type') || '';
  return tipo.includes('text/html') || tipo.includes('javascript') || tipo.includes('text/css');
}

async function avisarNovaVersao() {
  const clientes = await self.clients.matchAll({ includeUncontrolled: true });
  clientes.forEach((c) => c.postMessage({ type: 'retifica:nova-versao' }));
}

async function revalidar(request, emCache) {
  const resp = await fetch(request);
  if (!resp.ok || resp.type !== 'basic') return resp;
  const cache = await caches.open(CACHE);
  if (emCache && ehTextoDoShell(resp)) {
    const [novo, antigo] = await Promise.all([resp.clone().text(), emCache.text()]);
    await cache.put(request, resp.clone());
    if (novo !== antigo) await avisarNovaVersao();
  } else {
    await cache.put(request, resp.clone());
  }
  return resp;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  // front novo (Angular) em /novo/: nunca responder com o index.html antigo
  if (url.pathname === '/novo' || url.pathname.startsWith('/novo/')) return;

  event.respondWith((async () => {
    let emCache = await caches.match(request, { ignoreSearch: true });
    if (!emCache && request.mode === 'navigate') {
      emCache = await caches.match('index.html');
    }
    // Clona ANTES de devolver: a página consome o corpo de emCache, e ler
    // esse mesmo objeto depois (na comparação) falhava em silêncio — o cache
    // nunca atualizava e o app ficava preso na versão antiga.
    const daRede = revalidar(request, emCache ? emCache.clone() : null);
    if (emCache) {
      // devolve o cache na hora; a revalidação continua viva via waitUntil
      event.waitUntil(daRede.catch(() => {}));
      return emCache;
    }
    // primeira visita (ou arquivo fora do SHELL): rede normal
    return daRede;
  })());
});
