# Multiempresa (SaaS)

Em 2026-07-31 o projeto virou candidato a SaaS vendido a outras retíficas. **A fundação já está implementada e em produção**; o que falta é o onboarding e o produto vendável.

## Abordagem

Schema compartilhado com coluna `empresa_id` em cada entidade (não schema por tenant nem banco por tenant): dado o volume por oficina (dezenas ou centenas de linhas), é o padrão para SaaS B2B pequeno e o mais simples de operar sozinho.

## O que já existe

| Fase | Estado | O que entregou |
|---|---|---|
| 1a Fundação: login | pronto, no ar | `EmpresaModel`, `UsuarioModel`, Spring Security + JWT, `POST /api/auth/login`, tela de login no PWA |
| 1b Isolamento por empresa | pronto, no ar | `empresa` em Pedido, Cliente, Cabecote e nos dois catálogos; repositórios filtram por `empresaId`; `PUT /api/usuario/senha` |
| Hospedagem | pronto, no ar | Railway + Neon (ver [PRODUCAO.md](PRODUCAO.md)) |
| Identidade da empresa | pronto, no ar | Logo, telefone, Instagram e slogan por empresa (ver [PWA.md](PWA.md#identidade-da-empresa)) |
| Testes automatizados | pronto | Isolamento com duas empresas, total e desconto do pedido, JWT e Alto Medidas |

Como o isolamento funciona e onde ele é frágil: [ARQUITETURA.md](ARQUITETURA.md#autenticação-e-isolamento-por-empresa). `VendedorModel` ficou de fora do isolamento porque não tem controller nem repositório (zero exposição pela API).

## O que falta

**Fase 2 — onboarding de outras oficinas**
- Cadastro self-serve de empresas e usuários (hoje só por SQL).
- Recuperação de senha esquecida.
- Administração por empresa e papéis de usuário (hoje não há papéis).
- Revogação de sessão (ver o risco em [ARQUITETURA.md](ARQUITETURA.md#riscos-conhecidos-auditoria-de-2026-10-17)).
- Numeração do orçamento por empresa (hoje o número é o id global do pedido).
- Decidir se WhatsApp, Alto Medidas, a chave da IA do ditado (hoje uma só, com limite por empresa mas sem medir o gasto de cada uma) e as condições do PDF continuam exclusivos da Dih ou passam a ser configuráveis por empresa.
- Migrações de schema versionadas (Flyway ou equivalente) em vez do `hbm2ddl=update`.

**Fase 3 — produto vendável**
- Cobrança e assinatura.
- Reformular o desktop como ferramenta de relatórios financeiros.
- Observabilidade e backup.

## Decisões já tomadas pelo dono

- Os dados reais da Dih são a "empresa 1".
- **Cobrança**: ainda não fechada; a direção mais provável é mensalidade por oficina. Não é definitivo.
- **Desktop JavaFX**: deixa de ser a ferramenta operacional (pedidos e cadastros ficam só no PWA) e passa a focar em informações financeiras e relatórios, com um acabamento mais robusto que o JavaFX atual. Ainda sem escopo nem stack definidos, e hoje o módulo nem compila; em 2026-10-17 o dono decidiu que ele será remodelado depois, sem consertar o atual.
- **Banco**: só Postgres, também em desenvolvimento (a decisão antiga de "continuar com H2 por enquanto" foi superada pela migração de 2026-07-31).

## Login automático

Em 2026-09-12 o dono pediu para desativar a tela de login: `POST /api/auth/auto-login` (público, `AuthController`) devolve um token do **usuário 1 (da empresa 1, a Dih)** sem senha, e o PWA o chama sozinho. O risco foi aceito explicitamente, e em 2026-10-17 o dono confirmou que o login automático continua.

O que isso significa na prática:
- Quem conhecer uma das URLs públicas obtém um token de 30 dias, renovável, com acesso total aos dados da empresa 1: clientes, pedidos, catálogo, logo, Alto Medidas e, com o WhatsApp ligado, envio de mensagens.
- O isolamento por empresa continua valendo **para quem tem token de outra empresa**, mas não protege a empresa 1.
- Mesmo removendo o endpoint, os tokens já emitidos valem até expirar (30 dias, e são renovados enquanto o app for usado) ou até o `JWT_SECRET` ser trocado.

Para voltar ao login normal: trocar `LOGIN_AUTOMATICO_ATIVO` para `false` em `frontend/src/app/core/login-automatico.ts` (isso faz `#/login` mostrar o formulário), remover o endpoint no `AuthController`, reexibir Sair e Trocar senha, **garantir que a Dih sabe a senha do usuário 1** (ela só apareceu no log do primeiro boot e não há "esqueci minha senha"), decidir se troca o `JWT_SECRET` e avisar quem usa o app e o APK. Quando o login normal voltar, cada usuário cai na logo da própria empresa (tudo é resolvido pela empresa do token). O teste `autoLoginPublicoEstaAtivoHoje` registra o comportamento atual e deve passar a esperar 404.
