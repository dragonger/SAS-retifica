// Service worker de TRANSIÇÃO (fase 6 do front em Angular).
//
// Até a fase 5 o app antigo (vanilla JS) registrava /sw.js, que respondia tudo do
// cache "retifica-shell-vN" (stale-while-revalidate). Um aparelho com esse worker
// instalado continuaria abrindo o app antigo do cache mesmo com o Angular na raiz.
// O navegador confere /sw.js a cada abertura do app; ao achar este arquivo novo:
//   1. instala e assume na hora (skipWaiting + clients.claim);
//   2. apaga os caches "retifica-*" do app antigo;
//   3. se desregistra e recarrega as abas abertas (sem esperar a recarga).
// Ele NÃO tem handler de fetch: a recarga vai direto ao servidor, recebe o
// index.html do Angular, e o Angular registra o próprio worker (ngsw-worker.js).
//
// Manter este arquivo publicado por bastante tempo: quem não abre o app há semanas
// ainda tem o worker antigo e só se resgata quando o navegador baixar este aqui.
// Nunca toca nos caches "ngsw:*" (são do Angular).

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const chaves = await caches.keys();
    await Promise.all(chaves.filter((k) => k.startsWith('retifica-')).map((k) => caches.delete(k)));
    await self.clients.claim();
    await self.registration.unregister();
    // Recarrega as abas SEM esperar: a navegação só anda depois que este worker termina de
    // ativar, então esperar por ela dentro do waitUntil trava a aba (testado no Chrome).
    const abas = await self.clients.matchAll({ type: 'window' });
    abas.forEach((aba) => { aba.navigate(aba.url).catch(() => {}); });
  })());
});
