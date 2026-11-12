# Produção (Railway + Neon)

No ar desde 2026-07-31. Estado conferido em 2026-11-12.

## Visão geral

```
celular / navegador
        │  HTTPS
        ▼
retifica-backend-production.up.railway.app ──► retifica-wake-proxy (Node, sempre ligado)
                                                     │  rede privada do Railway (porta 8080)
                                                     ▼
retifica-backend-app.up.railway.app ─────────► retifica-backend (Spring Boot, Dockerfile)
                                                     │
                                                     ▼
                                               Neon (Postgres gerenciado)

Railway Service Cron ──► liga/desliga o retifica-backend pela API do Railway, no horário da oficina
```

O projeto no Railway tem o ambiente `production`, com três serviços:

| Serviço | O que faz |
|---|---|
| `retifica-backend` | A API e o PWA. Build pelo `Dockerfile` da raiz (não pelo auto-detect do Railway). |
| `retifica-wake-proxy` | Responde pelo domínio público. Dentro do horário, só repassa; fora dele, acorda o backend sob demanda. |
| `Railway Service Cron` | Liga e desliga o backend nos horários da oficina. |

Há dois domínios: `retifica-backend-production.up.railway.app` é o **público** (e o que está gravado no APK Android) e passa pelo proxy; `retifica-backend-app.up.railway.app` vai **direto ao backend**, útil para depurar sem a camada de wake.

## Horário de funcionamento

O backend fica ligado só quando a oficina funciona (fuso America/Sao_Paulo), para economizar:

| Dia | Liga | Desliga |
|---|---|---|
| Segunda a sexta | 06h | 20h |
| Sábado | 06h | 14h |
| Domingo | fechado | — |

Fora do horário, o **wake-proxy** liga o backend na hora quando alguém acessa (leva cerca de 8 a 10 s) e o desliga de novo após 30 minutos sem acesso. Consequências:

- A primeira requisição fora do horário é lenta.
- O proxy só repete requisições `GET` e `HEAD`; um `POST` feito enquanto o backend dorme espera ele acordar, recebe 503, ou recebe 502 se o proxy ainda achava o backend no ar (o status fica em cache por 60 s).
- O `@Scheduled` do Alto Medidas (repetição do aviso de pagamento) só roda com o backend ligado.

Detalhes do proxy: [railway-wake-proxy/LEIA-ME.txt](../railway-wake-proxy/LEIA-ME.txt). O cron usa `supercronic` e o script `railway-cron/railway.sh` (baseado no template `smolpaw/railway-service-cron`, MIT); as variáveis dele são `SERVICES_ID`, `RAILWAY_ACCOUNT_TOKEN`, `RAILWAY_PROJECT_ID`, `RAILWAY_ENVIRONMENT_ID` e `TZ`.

## Variáveis de ambiente do `retifica-backend`

**Nunca coloque os valores no repositório nem em chats.** Configure pelo painel do Railway (aba Variables).

| Variável | Obrigatória | Padrão | O que é |
|---|---|---|---|
| `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD` | sim | Postgres local do `docker-compose.yml` | Conexão com o Neon. |
| `JWT_SECRET` | sim | gera um arquivo local | Chave de assinatura dos tokens (Base64, 32 bytes ou mais). Trocar derruba todas as sessões. |
| `REDEFINIR_SENHA_EMAIL` + `REDEFINIR_SENHA` | não | vazias | Recuperação de acesso: na subida, grava essa senha para o usuário desse e-mail (mínimo 6 caracteres; recusa usuário de demonstração; a senha não vai para o log). **Apague as duas depois de entrar**, senão toda subida volta a gravar a mesma senha. |
| `DEMO_HABILITADA` | não | ligada | `false` desliga o botão "Abrir demonstração" (o servidor responde 503). |
| `DEMO_RESERVA` | não | `2` | Demonstrações já montadas esperando visitante. O clique entrega uma na hora e a reposição roda em segundo plano; `0` desliga a reserva (monta na hora, uns 30 s com o banco em outra região). |
| `DEMO_LIMPEZA_MS` | não | `600000` | Intervalo da limpeza das demonstrações vencidas. |
| `SSL_ENABLED` | sim (`false`) | `true` | O Railway termina o HTTPS na borda; o app escuta HTTP por dentro. |
| `PORT` | automática | `8443` | Injetada pelo Railway (`8080`). |
| `HIBERNATE_HBM2DDL` | não | `update` | Aceita `update`, `validate`, `none`. Ver [SCHEMA-STARTUP.md](../backend/SCHEMA-STARTUP.md). |
| `ALTO_MEDIDAS_ENTRADA_KEY`, `ALTO_MEDIDAS_SAIDA_KEY`, `ALTO_MEDIDAS_PAGAMENTO_URL` | para ligar a integração | — | Ver [ALTO-MEDIDAS.md](../backend/ALTO-MEDIDAS.md). **Hoje ligada.** |
| `ALTO_MEDIDAS_EMPRESA_ID` | não | `1` | Empresa que recebe as OS. |
| `ALTO_MEDIDAS_RETRY_MS` | não | `600000` | Intervalo da repetição do aviso de pagamento. |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | para ligar | — | Ver [WHATSAPP-API.md](../backend/WHATSAPP-API.md). **Hoje desligado.** |
| `WHATSAPP_TEMPLATE_NAME`, `WHATSAPP_TEMPLATE_LANG`, `WHATSAPP_API_VERSION`, `WHATSAPP_GRAPH_URL` | não | `orcamento`, `pt_BR`, `v23.0`, `https://graph.facebook.com` | Ajustes do WhatsApp. |
| `ANTHROPIC_API_KEY` | para ligar o ditado | — | Chave da API da Anthropic para ditar o pedido por voz. Ver [DITADO.md](../backend/DITADO.md). **Hoje ligado.** Mantenha também um limite de gasto no Console da Anthropic. |
| `DITADO_MODELO`, `DITADO_EFFORT`, `DITADO_LIMITE_DIA`, `DITADO_LIMITE_GLOBAL_DIA`, `DITADO_TIMEOUT_S`, `DITADO_MAX_RETRIES` | não | `claude-haiku-5-5`, `low`, `100`, `300`, `30`, `1` | Ajustes do ditado (modelo, limites por dia, tempo e novas tentativas). |
| `ANTHROPIC_BASE_URL` | não | — | **Só testes**: aponta o ditado para um servidor falso. Não defina em produção. |

As variáveis do cron estão listadas acima; as do proxy, no [LEIA-ME.txt](../railway-wake-proxy/LEIA-ME.txt).

Healthchecks (configurados no ambiente do Railway, não em arquivo): backend em `/health` (120 s) e proxy em `/__proxy_health` (60 s). Não existe `railway.json` no repositório.

## Como publicar

O Railway constrói a imagem do `retifica-backend` a partir do repositório **`SAS-retifica`** (remoto `saas`), branch `main`. O push no `saas` **não dispara deploy sozinho** (observado em 2026-10-16/17); o deploy acontece ao rodar `railway up` ou quando o Railway refaz o build (por exemplo, ao mudar uma variável).

Fluxo seguro, na ordem:

1. Mesclar o trabalho na `main`.
2. `git push origin main` **e** `git push saas main`.
3. Conferir que as três refs são iguais: `git rev-parse main origin/main saas/main`.
4. Publicar: `railway up --ci --service retifica-backend` (a pasta pode estar ligada a outro serviço por padrão, então sempre informe `--service`).
5. Conferir: `/health` responde 200, o `index.html` servido aponta para o `main-<hash>.js` do build novo e uma rota protegida responde 401 sem login.

**Por que enviar para os dois remotos:** mudar uma variável (ou pedir "redeploy" no painel) refaz o build a partir do Git, **não** do último `railway up`. Se o `saas/main` estiver atrás, a produção volta por minutos a uma versão antiga. Isso já aconteceu (2026-10-16): os dados ficaram intactos, mas o app voltou a uma versão 34 commits atrás até ser corrigido. Evite encadear comandos com `&&` sem conferir cada passo.

CLI do Railway: `npm install -g @railway/cli`; no PowerShell, se o `railway` não estiver no PATH, use `$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;" + $env:Path`. A pasta já foi ligada ao projeto (`railway link`).

## Banco (Neon)

- Postgres gerenciado. O Neon **suspende o compute** quando fica ocioso e derruba as conexões; por isso o pool é o HikariCP, que valida a conexão antes de entregá-la (a primeira requisição após um período ocioso chegou a dar 500 antes dessa troca, em 2026-08-01). `idleTimeout` e `maxLifetime` ficam abaixo do tempo de suspensão do Neon.
- O schema evolui sozinho pelo `hbm2ddl=update` a cada subida. Como o backend liga e desliga todo dia, isso acontece a cada despertar (ver [SCHEMA-STARTUP.md](../backend/SCHEMA-STARTUP.md)).
- **Não há rotina de backup documentada.** Hoje a proteção é a do próprio Neon.

## Histórico da migração (2026-07-31)

Os dados reais saíram de um arquivo H2 local e foram levados ao Neon exportando com `org.h2.tools.Script`, ajustando o SQL (nomes em minúsculo; `EMPRESA`/`USUARIO` como `UPDATE`, porque o bootstrap já cria a linha 1; sem a coluna legada `cabecote_id` de `PEDIDO`) e aplicando com `psql`. O arquivo H2 antigo e seus backups continuam em `~/.retificasDesktop/` como histórico; **o app não os usa mais e não há H2 no projeto**.

## Aplicativo Android

O app Android atual é feito com Capacitor: uma casca do site de produção (o domínio público) com um plugin nativo de voz para o ditado. Os arquivos de assinatura ficam fora do git. Perder a chave de assinatura obriga a reinstalar o app em todos os aparelhos para publicar qualquer atualização; mantenha um backup fora do repositório.

Compilação, assinatura e instalação: [android-app/LEIA-ME.md](../android-app/LEIA-ME.md).
