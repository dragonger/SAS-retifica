# Retífica — gestão de retífica de motores

Sistema para uma retífica de motores (hoje usado pela **Retífica Dih Soluções**), pensado para virar um SaaS multiempresa. Cada empresa tem os próprios clientes, pedidos, catálogos, logo e dados de contato; os dados ficam isolados por empresa.

O uso do dia a dia é pelo **PWA** (a página web/mobile instalável no celular): pedidos, clientes, catálogo, orçamento em PDF, encerrados e dashboard. A mesma API também integra com o app **Alto Medidas** (virabrequins do Daniel) e, quando ligado, com o **WhatsApp Business**.

## Como o projeto é organizado

Maven multi-módulo, Java 21:

| Pasta | O que é |
|---|---|
| `core/` | Entidades JPA, repositórios, persistência (Hibernate + Postgres) e geração de PDF. Sem interface. |
| `backend/` | API REST (Spring Boot 4.1). Serve também o PWA (build do `frontend/` copiado para `backend/src/main/resources/static/`). É o que roda em produção. |
| `frontend/` | O PWA, em Angular 22. |
| `desktop/` | App JavaFX original. **Hoje não compila** (ver [docs/ARQUITETURA.md](docs/ARQUITETURA.md#desktop-javafx)). |
| `railway-wake-proxy/` | Proxy que acorda o backend sob demanda fora do horário. |
| `railway-cron/` | Liga e desliga o backend no horário de funcionamento. |

Produção: **Railway** (backend, proxy e cron) + **Neon** (Postgres gerenciado). Local: Postgres em Docker.

## Começando

Requisitos: JDK 21 ou mais novo, Maven, Docker.

```bash
docker compose up -d                      # Postgres local (porta 5432)
mvn -pl core,backend -am -DskipTests package
SSL_ENABLED=false java -jar backend/target/retificas-backend.jar
```

O app sobe em `http://localhost:8443`. Sem `SSL_ENABLED=false` ele exige um certificado local. O passo a passo completo, com o certificado, o túnel para testar no celular e os erros comuns, está em [docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md).

## Testes

```bash
docker compose -f docker-compose.test.yml up -d --wait   # Postgres descartável em localhost:5544
mvn -pl core,backend -am test
docker compose -f docker-compose.test.yml down
```

Os testes rodam só contra esse banco descartável e abortam se o ambiente apontar para outro lugar. Os do front rodam com `npm test -- --watch=false` dentro de `frontend/`. Detalhes em [backend/TESTES.md](backend/TESTES.md).

## Documentação

| Documento | Para quê |
|---|---|
| [docs/ARQUITETURA.md](docs/ARQUITETURA.md) | Módulos, stack, modelo de dados, API, autenticação, isolamento entre empresas e riscos conhecidos. |
| [docs/DESENVOLVIMENTO.md](docs/DESENVOLVIMENTO.md) | Rodar, compilar, testar e depurar localmente. |
| [docs/PRODUCAO.md](docs/PRODUCAO.md) | Railway, Neon, variáveis de ambiente, como publicar, proxy e cron. |
| [docs/PWA.md](docs/PWA.md) | O que o app mobile/web faz e como o front funciona. |
| [docs/SAAS.md](docs/SAAS.md) | Estado do multiempresa, decisões já tomadas e o que falta. |
| [docs/LICOES.md](docs/LICOES.md) | Armadilhas já encontradas e cuidados com os dados reais. |
| [backend/ALTO-MEDIDAS.md](backend/ALTO-MEDIDAS.md) | Integração com o Alto Medidas: configuração e operação. |
| [android-app/LEIA-ME.md](android-app/LEIA-ME.md) | App Android (Capacitor) com voz nativa para o ditado: como gerar o APK, assinar e instalar. |
| [frontend/README.md](frontend/README.md) | O front em Angular: como rodar, compilar, testar e o service worker. |
| [backend/DITADO.md](backend/DITADO.md) | Ditar o pedido por voz, com IA que faz perguntas de esclarecimento (pronto e desligado). |
| [backend/WHATSAPP-API.md](backend/WHATSAPP-API.md) | Envio do orçamento pela API do WhatsApp (pronto e desligado). |
| [backend/SCHEMA-STARTUP.md](backend/SCHEMA-STARTUP.md) | Custo do `hbm2ddl=update` na subida e alternativas. |
| [backend/TESTES.md](backend/TESTES.md) | Como rodar os testes e o que cada um garante. |
| [railway-wake-proxy/LEIA-ME.txt](railway-wake-proxy/LEIA-ME.txt) | O proxy que acorda o backend. |
| [CONTEXTO.md](CONTEXTO.md) | Ponto de partida para quem (ou o assistente) retoma o projeto. |

## Cuidados importantes

- **Há dados reais em produção.** Nunca rode testes nem scripts contra o banco de produção. Use o Postgres local ou o descartável de teste.
- **Nunca coloque segredos no repositório** (ele é público): tokens, senhas, chaves e URLs de banco ficam só nas variáveis de ambiente do Railway.
- **O login automático está ativo** e entrega um token do usuário 1 (hoje, da empresa 1) a quem tiver a URL. É uma decisão consciente, registrada em [docs/SAAS.md](docs/SAAS.md#login-automático).
