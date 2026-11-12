// Worker de LIMPEZA de /novo/ (fase 6 do front em Angular).
//
// Durante a migração o Angular rodou em /novo/ e registrou /novo/ngsw-worker.js com
// escopo /novo/. Agora o Angular está na raiz e /novo/ redireciona para /. O navegador
// confere este arquivo ao abrir /novo/; ao achar esta versão ele assume, apaga SÓ os
// caches do escopo /novo/ ("ngsw:/novo/..."), se desregistra e recarrega a aba, que
// então cai no redirecionamento para /. Os caches do Angular da raiz ("ngsw:/:...")
// ficam intactos (o safety-worker.js do Angular apagaria todos os "ngsw:*").

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const chaves = await caches.keys();
    await Promise.all(chaves.filter((k) => k.startsWith('ngsw:/novo/')).map((k) => caches.delete(k)));
    await self.clients.claim();
    await self.registration.unregister();
    // Recarrega as abas SEM esperar: a navegação só anda depois que este worker termina de
    // ativar, então esperar por ela dentro do waitUntil trava a aba (testado no Chrome).
    const abas = await self.clients.matchAll({ type: 'window' });
    abas.forEach((aba) => { aba.navigate(aba.url).catch(() => {}); });
  })());
});
