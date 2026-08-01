// Service worker mínimo: cacheia o "shell" do app para abrir rápido/offline;
// nunca cacheia /api/* — os dados sempre vêm frescos do servidor.
const CACHE = 'retifica-shell-v2';
const SHELL = ['./', 'index.html', 'style.css', 'app.js', 'manifest.json', 'icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((chaves) =>
      Promise.all(chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/')) {
    return; // deixa passar direto para a rede
  }
  // Network-first: sempre busca a versão mais nova quando online (e atualiza o
  // cache com ela); só usa o cache se a rede falhar (modo offline). Evita o
  // app ficar preso numa versão antiga do shell (app.js/index.html) — antes
  // era cache-first, e como o cache não tinha versão que mudasse a cada
  // deploy, uma vez cacheado só atualizava se o sw.js em si mudasse de bytes.
  event.respondWith(
    fetch(event.request)
      .then((resp) => {
        const copia = resp.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copia));
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
