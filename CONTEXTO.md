# Contexto do projeto — leia primeiro

Ponto de partida para quem retoma o projeto (pessoa ou assistente). Este arquivo é curto de propósito: o conteúdo detalhado está em `docs/`. Atualizado em 2026-11-12, conferido contra o código da `main`.

**Retífica** é um sistema de gestão para uma retífica de motores (hoje a Retífica Dih Soluções), já com isolamento por empresa e em produção no Railway + Neon. O uso diário é pelo PWA; a API também integra com o app Alto Medidas.

## Mapa da documentação

| Quero saber… | Leia |
|---|---|
| O que é e como começar | [README.md](README.md) |
| Módulos, stack, modelo de dados, API, autenticação, riscos | [docs/ARQUITETURA.md](docs/ARQUITETURA.md) |
| Rodar, compilar e testar localmente | [docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md) |
| Railway, Neon, variáveis, como publicar | [docs/PRODUCAO.md](docs/PRODUCAO.md) |
| O que o app faz e como o front funciona | [docs/PWA.md](docs/PWA.md) |
| Multiempresa: estado, decisões, o que falta, login automático | [docs/SAAS.md](docs/SAAS.md) |
| Armadilhas já encontradas e cuidados com os dados reais | [docs/LICOES.md](docs/LICOES.md) |
| App Android, Alto Medidas, WhatsApp, ditado, `hbm2ddl`, testes | [backend/ALTO-MEDIDAS.md](backend/ALTO-MEDIDAS.md), [backend/WHATSAPP-API.md](backend/WHATSAPP-API.md), [backend/DITADO.md](backend/DITADO.md), [android-app/LEIA-ME.md](android-app/LEIA-ME.md), [backend/SCHEMA-STARTUP.md](backend/SCHEMA-STARTUP.md), [backend/TESTES.md](backend/TESTES.md) |

## Estado em uma olhada

- **Em produção**: backend + PWA no Railway (`retifica-backend`), proxy que acorda o backend fora do horário, cron que o liga e desliga, banco no Neon. Fases 1a e 1b do SaaS (login e isolamento por empresa) prontas.
- **Integração com o Alto Medidas**: ligada. O lado do Firebase (PR #2 do repositório do app Alto Medidas, de terceiro) ainda espera aprovação e publicação; enquanto isso nenhuma OS chega.
- **WhatsApp**: código pronto, desligado (faltam as credenciais da Meta).
- **App Android (APK)**: `android-app/` (Capacitor), abre o site de produção e usa o reconhecimento de voz nativo do Android para o ditado (evita o corte de palavras do Chrome). Mesmo identificador e mesma chave do APK TWA antigo, então instala por cima. Instalação direta, sem Play Store. Ver [android-app/LEIA-ME.md](android-app/LEIA-ME.md). **Falta testar nos celulares** (dois celulares Samsung com Android 14 ou mais novo).
- **Front em Angular**: `frontend/` (Angular 22), servido na raiz desde a fase 6 (2026-11-12); o `app.js` antigo foi removido. O build vai para `backend/src/main/resources/static/` (gerado; só `.well-known/` é versionado ali). `/sw.js` é um worker de transição que resgata aparelhos com o worker antigo e precisa continuar publicado; `/novo/` redireciona para `/`. Volta: tag `antes-fase6`. Ver [frontend/README.md](frontend/README.md).
- **Ditar o pedido por voz** (IA com perguntas de esclarecimento): **ligado** em produção (`ANTHROPIC_API_KEY` configurada no Railway). Haiku 5.5, 100 ditados por empresa por dia e 300 no total, só em pedido novo. Ver [backend/DITADO.md](backend/DITADO.md).
- **Login automático**: ativo e mantido (decisão do dono em 2026-10-17). Ver [docs/SAAS.md](docs/SAAS.md#login-automático).
- **Desktop JavaFX**: não compila desde a Fase 1b; será remodelado depois (decisão do dono em 2026-10-17), então não é prioridade agora.
- **Testes**: 190 testes no backend (JUnit) e 621 no front (vitest), cobrindo isolamento, dinheiro, sessão, pedidos, PDF, WhatsApp, Alto Medidas, contratos da API e ditado; ver [backend/TESTES.md](backend/TESTES.md). Falta só desempenho (N+1), a lista de valores aceitos do `HIBERNATE_HBM2DDL` e o ponta a ponta do PWA.

## Regras de trabalho

1. **Dados reais em produção**: nunca testar contra o banco de produção; conferir um pedido real de produção no fim de qualquer sessão de testes. Detalhes em [docs/LICOES.md](docs/LICOES.md).
2. **Nenhum segredo no repositório** (ele é público). Chaves, tokens e senhas só nas variáveis do Railway ou do Firebase.
3. **Publicar**: `git push origin main` **e** `git push saas main`, conferir as refs e só então `railway up --ci --service retifica-backend`. O Railway constrói do `saas`. Ver [docs/PRODUCAO.md](docs/PRODUCAO.md#como-publicar).
4. **Compilar sem o desktop**: `mvn -pl core,backend -am ...`.
5. **Commits e PRs sem linha de co-autoria nem "gerado por"** de ferramentas.
6. **Documentação em dia**: mudou comportamento, variável, rota ou fluxo de publicação? Atualize o documento correspondente na mesma mudança.

## Pendências conhecidas

- Aprovar e publicar o PR do Alto Medidas (segredos do Firebase `DIH_ENTRADA_KEY` e `DIH_SAIDA_KEY`, `firebase deploy --only functions`, nova versão do app do parceiro) e testar com uma OS de teste.
- Decidir as integrações por empresa (ver [docs/SAAS.md](docs/SAAS.md)). O login automático e o desktop já têm decisão (mantido e remodelado depois).
- Testar o APK novo nos dois celulares e registrar o resultado (se ainda cortar palavras, o plano B é transcrever o áudio no servidor, com custo e com o áudio saindo do celular).
- Ditado: já está ligado; falta avaliar o acerto da IA com algumas frases reais, testar no celular (microfone no Chrome e no APK) e manter um limite de gasto mensal no Console da Anthropic.
- Fase 2 do SaaS: onboarding de outras oficinas.
- Entradas ruins que hoje respondem 500 em vez de 400 (item nulo, data inválida, nome longo) e o upsert simultâneo do Alto Medidas: ver [backend/TESTES.md](backend/TESTES.md).
- Conferir no celular real: fontes, busca, logo, rascunhos e a tela do parceiro (Alto Medidas).
