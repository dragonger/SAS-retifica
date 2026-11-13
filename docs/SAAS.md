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

## Login e demonstração

**Login.** Desde 2026-11-12 o app pede e-mail e senha (`POST /api/auth/login`). O antigo login automático (`POST /api/auth/auto-login`, que de 2026-09-12 a 2026-11-12 entregava sem senha o token do usuário 1, da empresa real) foi **removido**: o endpoint responde 404 e o front não tem mais esse modo. Os tokens emitidos por ele valem até expirar (30 dias, renovados enquanto o app é usado) ou até o `JWT_SECRET` ser trocado; trocar o segredo derruba todas as sessões e quem usa o app entra de novo com a senha. **Esqueceu a senha?** Defina `REDEFINIR_SENHA_EMAIL` e `REDEFINIR_SENHA` no Railway: na subida o servidor grava essa senha para o usuário (só quem tem acesso às variáveis do servidor consegue). Depois de entrar, apague as duas (`docs/PRODUCAO.md`).

**Demonstração.** Na tela de login, "Abrir demonstração" (`POST /api/auth/demo`, público) cria para o visitante uma **empresa nova e isolada** (`EMPRESA.demo = true`), com dados fictícios (5 clientes, 5 componentes, catálogo, 5 pedidos em aberto e 3 encerrados), e devolve um token de **2 horas que não se renova**. A limpeza (`DemoService.limparVencidas`, a cada 10 minutos) apaga a empresa inteira quando o prazo vence. Os dados entram pelos mesmos controllers do app, então passam pelas mesmas validações e cálculos.

- **Isolamento:** é o mesmo de qualquer empresa (tudo filtrado pela empresa do token). A limpeza só apaga empresa com `demo = true`, conferido com a linha travada na mesma transação; empresa real nunca, nem com prazo preenchido (`DemoTest`).
- **Bloqueado na demonstração:** ditado (custa IA), envio pelo WhatsApp e troca de senha (o usuário da demonstração não tem senha conhecida).
- **Fora da demonstração por natureza:** a integração com o Alto Medidas é exclusiva da retífica original (`ALTO_MEDIDAS_EMPRESA_ID`); nenhuma outra empresa a vê.
- **Reserva:** montar os dados leva centenas de acessos ao banco, então ficam 2 demonstrações já montadas esperando visitante (`DEMO_RESERVA`). O clique pega uma, traz as datas dos pedidos para hoje e marca o prazo; a reposição roda em segundo plano, inclusive quando o servidor acorda. Reserva não vence nem é apagada pela limpeza (`DemoReservaTest`).
- **Limites:** até 30 demonstrações ao mesmo tempo, 5 por endereço por hora e 200 por dia. `DEMO_HABILITADA=false` no Railway desliga.
- **No app:** uma faixa no topo avisa "Demonstração com dados fictícios · apagada às HH:MM", com Sair. Entrar e sair recarregam a página, para nada de uma sessão ficar na memória da outra.
