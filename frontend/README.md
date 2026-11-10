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
- `src/app/telas/`: telas. Só `inicio` está pronta; as demais rotas apontam para `em-migracao`, que leva ao app atual.
- Telas com formulário implementam `ComGuardaSaida` e usam `guardaDeSaida` no `canDeactivate` da rota.
