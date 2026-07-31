// Service worker mínimo: cacheia o "shell" do app para abrir rápido/offline;
// nunca cacheia /api/* — os dados sempre vêm frescos do servidor.
const CACHE = 'retifica-shell-v1';
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
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
