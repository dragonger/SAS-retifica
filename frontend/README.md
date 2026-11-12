# Front em Angular

O PWA da retífica em Angular 22 (standalone, zoneless, rotas por hash), servido pelo Spring Boot **na raiz**.
Substituiu o `app.js` em JavaScript puro em 2026-11-12 (fase 6), com o mesmo visual (`src/base.css` é o antigo `style.css`),
as mesmas rotas e as mesmas chaves do `localStorage`. Estado anterior à troca: tag `antes-fase6`.

## Rodar em desenvolvimento

```bash
cd frontend
npm install        # uma vez
npm start          # ng serve em http://localhost:4200/
```

O `proxy.conf.json` manda `/api` para `https://localhost:8443` (certificado autoassinado, `secure: false`).
Suba o backend local antes (banco de desenvolvimento, nunca o de produção).

## Build

```bash
npm run build          # dist/frontend/browser
npm run build:backend  # build + cópia para backend/src/main/resources/static/ (gerada, ignorada pelo git; preserva .well-known/)
```

O `Dockerfile` faz isso sozinho num estágio Node antes do Maven. Fontes, ícones, `manifest.json` e `vendor/` (pdf-lib) ficam em `public/`.

## Testes

```bash
npm test -- --watch=false   # vitest, 623 testes
```

## Estrutura

- `src/app/core/`: serviços de base (sessão, interceptor HTTP, cache, diálogos, identidade, guarda de saída). Usam as mesmas
  chaves do `localStorage` do app antigo (`retifica_auth`, `retifica_logo`, `retifica_rascunhos`, ...): quem atualizou não perdeu sessão nem rascunhos.
- `src/app/telas/`: telas: inicio, catalogo, servicos, pecas, clientes, produtos, encerrados, dashboard, empresa, lista de pedidos, visualizar pedido, formulario do pedido (novo/editar, com rascunhos), "Ditar pedido" (so em pedido novo: `shared/ditado-regra.ts` e a regra pura, `core/ditado.service.ts` e `core/ditado-voz.ts` cuidam do servidor e da voz, `telas/pedido-form/ditado-overlay` e o painel), Alto Medidas (`#/alto-medidas`), trocar senha (`#/trocar-senha`) e login.
- Telas com formulário implementam `ComGuardaSaida` e usam `guardaDeSaida` no `canDeactivate` da rota.

## Login e demonstração

`#/login` pede e-mail e senha; sem sessão, toda rota leva para lá (`core/sessao.guard.ts`) e um 401 também (`core/auth.interceptor.ts`).
Embaixo do formulário, "Abrir demonstração" (`POST /api/auth/demo`) entra numa empresa isolada com dados fictícios, apagada em 2 horas;
o token da demonstração tem a claim `demo` e o `exp`, que o `AuthService.demoExpiraEm()` lê para a faixa do topo. Entrar, abrir a
demonstração e sair passam pelo `SessaoService`, que recarrega a página (`RECARREGAR`) para zerar os caches em memória.
"Trocar senha" e "Sair" ficam no Catálogo (na demonstração, só "Sair"). Detalhes do lado do servidor em `docs/SAAS.md`.

## Service worker (ngsw)

- `@angular/service-worker` (mesma versão do `@angular/core`), `ngsw-config.json` na raiz do projeto, `"serviceWorker"` na configuração
  `production` do `angular.json`. Registro em `app.config.ts`: `provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' })`.
  Em `ng serve`/testes o service worker fica desligado.
- Grupos: `app` (prefetch: index, js, css, manifest, ícones, `fonts/fonts.css`) e `fontes-e-vendor` (lazy: `fonts/**`, `vendor/**`).
  **Sem `dataGroups`**: `/api` nunca passa pelo cache do service worker; `navigationUrls` assume `/**` menos `/api/**` (o PDF abre por navegação),
  `/health` e `/novo/**`. O `/sw.js` fica fora do grupo `app` (`!/sw.js`).
- Escopo `/`. `manifest.json` igual ao do app antigo (mesmo nome, ícones, `start_url` `./#/inicio` e `scope` `./`), então o PWA instalado e o APK continuam sendo o mesmo app.
- **Workers de transição (não apagar):** `public/sw.js` é servido em `/sw.js`, o endereço do worker do app antigo. Um aparelho com o worker antigo
  baixa este arquivo ao abrir o app; ele apaga os caches `retifica-*`, se desregistra e recarrega a aba, que recebe o Angular. `public/novo/ngsw-worker.js`
  faz o mesmo com o worker que o Angular registrou em `/novo/` durante a migração (apaga só `ngsw:/novo/...`). Os dois recarregam a aba **sem esperar**
  a navegação dentro do `waitUntil` (esperar trava a aba). O Spring (`FrontConfig`) redireciona `/novo/` para `/` e manda `no-cache` em index, manifest e workers.
- **Voltar ao app antigo** (só em emergência): publicar a tag `antes-fase6`. O ngsw se desregistra sozinho quando `/ngsw.json` responde 404, e o app antigo
  volta a registrar o `sw.js` dele. Conferir num aparelho antes de dar por resolvido.
- Aviso "Nova versão disponível — toque para atualizar" (`core/nova-versao.service.ts` + `shared/aviso-nova-versao.ts`): aparece com
  `SwUpdate.versionUpdates` = `VERSION_READY` e fica até o toque; ao tocar faz `activateUpdate()` e recarrega. O ngsw confere versão
  nova ao abrir/recarregar o app (não a cada requisição, como o `sw.js` antigo).
- `npm run build:backend` falha se o build não tiver `index.html`, `ngsw-worker.js`, `ngsw.json`, `sw.js`, `manifest.json` ou `novo/ngsw-worker.js`.

### Testar o service worker localmente

O service worker só existe em build de produção e só registra em `https` ou `localhost`.

```bash
cd frontend
npm run build
npx http-server dist/frontend/browser -p 4300   # ou qualquer servidor estático que sirva a pasta na raiz
```

Com o backend local (`npm run build:backend`, depois `mvn clean package` e o jar, banco de teste) o teste é o real.
Num servidor estático avulso, devolva 503 para `/api` (nunca aponte para produção).
No Chrome: DevTools > Application > Service Workers (registro, "Offline") e Cache Storage (`ngsw:/:...`).
Para ver o aviso de versão nova: carregue uma vez, faça outro build (qualquer mudança), recarregue duas vezes: a primeira baixa a versão
nova em segundo plano, o aviso aparece em seguida.

### Offline: o que funciona e o que não

- Funciona: abrir o app sem rede (shell servido pelo ngsw); telas que usam o `CacheService` (Início, Pedidos, Encerrados, Dashboard,
  Alto Medidas, catálogos) mostram o dado em cache e o toast "Sem conexão com o servidor." aparece (mesmo comportamento do app antigo).
- Limite igual ao do app antigo: o `CacheService` vive só na memória. Depois de recarregar/reabrir o app sem rede o cache está vazio, as
  telas ficam em "Carregando..." e só o shell, a logo e os rascunhos (`localStorage`) aparecem. Persistir respostas da API em disco seria
  mudança de comportamento (e de privacidade) e não foi feito.
- As fontes e o `pdf-lib` são lazy: só ficam disponíveis offline depois de usados uma vez online.
