# Front em Angular (em migração)

Reescrita do PWA de `backend/src/main/resources/static/` em Angular 22 (standalone, zoneless, rotas por hash).
Enquanto migra, o app novo fica em **`/novo/`** e o app atual continua na raiz. O visual é o mesmo: o `style.css` e as fontes
do app atual são reaproveitados (nada de CSS duplicado).

## Rodar em desenvolvimento

```bash
cd frontend
npm install        # uma vez
npm start          # ng serve em http://localhost:4200/novo/
```

O `proxy.conf.json` manda `/api` para `https://localhost:8443` (certificado autoassinado, `secure: false`).
Suba o backend local antes (banco de desenvolvimento, nunca o de produção).

## Build

```bash
npm run build          # dist/frontend/browser
npm run build:backend  # build + cópia para backend/src/main/resources/static/novo/ (ignorada pelo git)
```

O `Dockerfile` faz isso sozinho num estágio Node antes do Maven. `npm start`, `build` e `watch` copiam antes
`fonts/`, ícones e `manifest.json` do app atual para `src/legado/` (ignorada pelo git; o Angular só aceita assets dentro do projeto).

## Testes

```bash
npx ng test --watch=false
```

## Estrutura

- `src/app/core/`: serviços de base (sessão, interceptor HTTP, cache, diálogos, identidade, guarda de saída). Usam as mesmas
  chaves do `localStorage` do app atual (`retifica_auth`, `retifica_logo`, ...), então os dois apps compartilham a sessão.
- `src/app/telas/`: telas. Todas as rotas do app atual ja estao migradas: inicio, catalogo, servicos, pecas, clientes, produtos, encerrados, dashboard, empresa, lista de pedidos, visualizar pedido, formulario do pedido (novo/editar, com rascunhos), "Ditar pedido" (so em pedido novo: `shared/ditado-regra.ts` e a regra pura, `core/ditado.service.ts` e `core/ditado-voz.ts` cuidam do servidor e da voz, `telas/pedido-form/ditado-overlay` e o painel), Alto Medidas (`#/alto-medidas`), trocar senha (`#/trocar-senha`) e login.
- Telas com formulário implementam `ComGuardaSaida` e usam `guardaDeSaida` no `canDeactivate` da rota.

## Login automático

Hoje o app entra sozinho (`/api/auth/auto-login`) e `#/login` redireciona para o Início, como o app atual. O interruptor é uma
constante só: `LOGIN_AUTOMATICO_ATIVO` em `src/app/core/login-automatico.ts`. Em `false`: `#/login` mostra o componente `Login`
(`POST /api/auth/login`), a rota protegida sem sessão manda para ele e um 401 volta para ele em vez de renovar a sessão.
O botão "Trocar senha"/"Sair" do topo segue escondido (ligá-los é com o login).

## Service worker (ngsw)

- `@angular/service-worker` (mesma versão do `@angular/core`), `ngsw-config.json` na raiz do projeto, `"serviceWorker"` na configuração
  `production` do `angular.json`. Registro em `app.config.ts`: `provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode(), registrationStrategy: 'registerWhenStable:30000' })`.
  Em `ng serve`/testes o service worker fica desligado.
- Grupos: `app` (prefetch: index, js, css, manifest, ícones, `fonts/fonts.css`) e `fontes-e-vendor` (lazy: `fonts/**`, `vendor/**`).
  **Sem `dataGroups`**: `/api` nunca passa pelo cache do service worker (igual ao `sw.js` atual); `navigationUrls` exclui `/api/**`.
- Escopo: o `ngsw-worker.js` fica em `/novo/` e controla só `/novo/**`. O `sw.js` antigo (escopo `/`) ignora `/novo/`, então os dois convivem.
  `manifest.json` usa `start_url` e `scope` relativos (`./#/inicio`, `./`), que dentro de `/novo/` resolvem para `/novo/`.
- Aviso "Nova versão disponível — toque para atualizar" (`core/nova-versao.service.ts` + `shared/aviso-nova-versao.ts`): aparece com
  `SwUpdate.versionUpdates` = `VERSION_READY` e fica até o toque; ao tocar faz `activateUpdate()` e recarrega. O ngsw confere versão
  nova ao abrir/recarregar o app (não a cada requisição, como o `sw.js` antigo).
- `npm run build:backend` copia `ngsw-worker.js`, `ngsw.json`, `safety-worker.js` e `worker-basic.min.js` para `static/novo/` e falha se faltar um dos três primeiros.

### Testar o service worker localmente

O service worker só existe em build de produção e só registra em `https` ou `localhost`.

```bash
cd frontend
npm run build
npx http-server dist/frontend/browser -p 4300   # ou qualquer servidor estático que sirva a pasta em /novo/
```

O app espera estar em `/novo/` (`baseHref`). Com o backend local (`https://localhost:8443/novo/`, banco de desenvolvimento) o teste é o real.
Num servidor estático avulso, sirva a pasta `dist/frontend/browser` sob o prefixo `/novo/` (e devolva 503 para `/api`, nunca aponte para produção).
No Chrome: DevTools > Application > Service Workers (registro, "Offline") e Cache Storage (`ngsw:/novo/...`).
Para ver o aviso de versão nova: carregue uma vez, faça outro build (qualquer mudança), recarregue duas vezes: a primeira baixa a versão
nova em segundo plano, o aviso aparece em seguida.

### Offline: o que funciona e o que não

- Funciona: abrir o app sem rede (shell servido pelo ngsw); telas que usam o `CacheService` (Início, Pedidos, Encerrados, Dashboard,
  Alto Medidas, catálogos) mostram o dado em cache e o toast "Sem conexão com o servidor." aparece (mesmo comportamento do app atual).
- Limite igual ao do app atual: o `CacheService` vive só na memória. Depois de recarregar/reabrir o app sem rede o cache está vazio, as
  telas ficam em "Carregando..." e só o shell, a logo e os rascunhos (`localStorage`) aparecem. Persistir respostas da API em disco seria
  mudança de comportamento (e de privacidade) e não foi feito.
- As fontes e o `pdf-lib` são lazy: só ficam disponíveis offline depois de usados uma vez online.
