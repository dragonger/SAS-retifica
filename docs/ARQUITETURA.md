# Arquitetura

Estado em 2026-11-12, conferido contra o código da `main`.

## Módulos

```
retificas-parent (pom raiz, BOM do Spring Boot 4.1.0)
├── core      entidades JPA, repositórios, persistência, PDF (sem UI)
├── backend   API REST (Spring Boot) + PWA estático   ← roda em produção
└── desktop   app JavaFX original                     ← fora do build de produção
```

- O `core` não depende de Spring: os repositórios são classes comuns que abrem um `EntityManager` por operação (`JPAUtil`). Por isso o backend **não usa Spring Data**.
- O BOM do Spring Boot fica no `pom.xml` raiz para que o `core` herde versões consistentes (Hibernate, driver do Postgres) sem depender do Spring.
- O `Dockerfile` compila só `core` e `backend` (`-pl core,backend`). O `desktop` não entra na imagem.

### Desktop (JavaFX)

**Não compila.** Desde a Fase 1b (isolamento por empresa), os repositórios do `core` exigem `empresaId` (`listarTodos(empresaId)`, `buscarComItens(id, empresaId)`, `deletar(id, empresaId)`…), e o desktop ainda chama as versões antigas; ele também usa campos de preço por item que saíram de `ServicoModel`/`PecaModel`. Conferido em 2026-10-17: `mvn -pl core,desktop -am compile` falha. A produção não é afetada, e `mvn clean compile` na raiz falha por causa dele (use `-pl core,backend -am`).

O desktop acessava o banco direto, sem login. O futuro dele ainda não foi decidido (ver [SAAS.md](SAAS.md)): a direção registrada é virar uma ferramenta de relatórios financeiros, com o PWA cuidando da operação.

## Stack

| Item | Versão / escolha |
|---|---|
| Java | 21 (`maven.compiler.release=21`; a imagem Docker usa Temurin 21) |
| Spring Boot | 4.1.0 (Spring Framework 7, Jakarta EE, Jackson 3 em `tools.jackson`) |
| Hibernate ORM | 7.x, versão definida pelo BOM do Spring Boot |
| Banco | PostgreSQL. Local: Docker (`postgres:16-alpine`). Produção: Neon. **Não há H2.** |
| Pool | HikariCP via `hibernate-hikaricp` (máximo 5 conexões, ver `persistence.xml`) |
| Autenticação | Spring Security + JWT (`jjwt` 0.13.0) |
| PDF | OpenPDF, com fontes Barlow embutidas em `core/src/main/resources/fonts` |
| Desktop | JavaFX 19 |
| Front-end | PWA em Angular 22 (`frontend/`), servido pelo backend na raiz |

O compilador usa `-parameters` (`maven.compiler.parameters=true`): sem isso, o Spring 7 não resolve `@PathVariable Long id` sem nome explícito.

## Persistência

- `core/src/main/resources/META-INF/persistence.xml` define a unidade `retificasPU` com 13 entidades e `hibernate.hbm2ddl.auto=update`. **Não há Flyway nem Liquibase**: o schema evolui sozinho no boot (ver [backend/SCHEMA-STARTUP.md](../backend/SCHEMA-STARTUP.md)).
- URL, usuário e senha do banco vêm de `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD` (lidas pelo `JPAUtil`). Sem elas valem os defaults do `persistence.xml`, que batem com o `docker-compose.yml`.
- `HIBERNATE_HBM2DDL` (opcional) troca o `hbm2ddl.auto`; só aceita `update`, `validate` e `none`.
- O `hbm2ddl=update` nunca remove colunas, então colunas antigas ficam no banco (ex.: preço por item, `cabecote_id` em `PEDIDO`). Coluna nova em tabela com dados deixa as linhas antigas com `NULL`; já houve NPE por isso, então use getters defensivos e backfill ao adicionar colunas.
- A tabela legada `pedido_categoria` (sem entidade, com FK para `pedido`) é limpa à mão por `PedidoRepository.apagarCategoriasLegadas` ao excluir um pedido.

## Modelo de dados

| Entidade (tabela) | Notas |
|---|---|
| `EmpresaModel` (`EMPRESA`) | O tenant. Nome, telefone, instagram, slogan. |
| `UsuarioModel` (`USUARIO`) | E-mail único global, hash BCrypt, pertence a uma empresa. Não há papéis. |
| `EmpresaLogoModel` (`EMPRESA_LOGO`) | Logo em PNG (`bytea`), separada da empresa para não vir junto a cada carga. |
| `ClienteModel` | Cadastro reutilizável entre pedidos. |
| `CabecoteModel` (`CABECOTE`) | Na prática é o catálogo de **componentes técnicos**: cobre cabeçote, bloco, biela e virabrequim (campo `categoria`). O nome ficou por histórico; no PWA o menu se chama "Produtos". |
| `ServicoCatalogoModel`, `PecaCatalogoModel` | Catálogos de sugestão. O `valor` é só sugestão. |
| `PedidoModel` (`PEDIDO`) | Ver abaixo. |
| `ServicoModel`, `PecaModel` | Itens do pedido: só `descricao`, `categoria` e (peças) `quantidade`. **Não têm preço nem FK para o catálogo.** |
| `PedidoCategoriaModel` (`PEDIDO_CATEGORIA_VALOR`) | Valor de serviços e de peças **por categoria** dentro do pedido. |
| `OsAltoMedidasModel` (`OS_ALTO_MEDIDAS`) | Cópia das OS do Alto Medidas (ver [ALTO-MEDIDAS.md](../backend/ALTO-MEDIDAS.md)). Guarda `empresa_id` como número, sem FK. |
| `VendedorModel` | Mapeada, mas **sem uso**: não há controller nem repositório. Ainda é referenciada por `PedidoModel.vendedor` (sempre nula), então existe a coluna `vendedor_id` em `PEDIDO`. |

### Pedido

- `componentes`: `@ManyToMany` com `CabecoteModel` (tabela `PEDIDO_COMPONENTE`); um pedido pode ter vários componentes.
- `cliente`: `@ManyToOne` com cascade `PERSIST`/`MERGE` (sem remoção).
- `servicoList`, `pecaList` e `categoriaValores`: `@OneToMany` com `cascade=ALL` e `orphanRemoval`.
- `status`: `ABERTO`, `EM_ANDAMENTO`, `PRONTO` (manual). **"Atrasado" e "Finalizado" são calculados**: atrasado vem da data de entrega estimada; finalizado, de `datEntrega` preenchida.
- **O preço é definido por categoria**, não por item: cada `PedidoCategoriaModel` tem `valorServicos` e `valorPecas`.
- **Total e desconto** ficam em `PedidoModel`: `getSubtotal()` (soma das categorias), `getValorDesconto()` e `recalcularTotal()`, que grava `totalGeral`. O desconto é `VALOR` ou `PERCENTUAL` (arredondado a 2 casas, meio para cima, máximo 100%) e nunca passa do subtotal; o total nunca fica negativo. O `PedidoController` e o `PedidoPdfService` usam a mesma fórmula, para o total salvo nunca divergir do impresso.
- `CategoriaProduto`: `CABECOTE`, `BLOCO`, `BIELA`, `VIRABREQUIM`, `MONTAGEM`, `OUTRO`. No pedido, só as quatro primeiras aparecem como "categoria envolvida".

## API REST

Todas exigem `Authorization: Bearer <token>`, exceto as marcadas como públicas.

| Recurso | Rotas |
|---|---|
| Autenticação (**pública**) | `POST /api/auth/login`, `POST /api/auth/demo` |
| Pedidos | `GET/POST /api/pedidos`, `GET/PUT/DELETE /api/pedidos/{id}`, `GET /api/pedidos/dashboard`, `GET /api/pedidos/encerrados`, `POST /api/pedidos/{id}/finalizar`, `GET /api/pedidos/{id}/pdf`, `POST /api/pedidos/{id}/whatsapp` |
| Clientes | `GET/POST /api/clientes`, `GET/PUT/DELETE /api/clientes/{id}` |
| Componentes técnicos | `GET/POST /api/cabecotes`, `PUT/DELETE /api/cabecotes/{id}` |
| Catálogos | `/api/servicos-catalogo` e `/api/pecas-catalogo` (`GET`, `POST`, `PUT/DELETE /{id}`), `GET /api/categorias` |
| Empresa | `GET/PUT /api/empresa`, `GET/PUT/DELETE /api/empresa/logo` |
| Usuário | `PUT /api/usuario/senha` |
| WhatsApp | `GET /api/whatsapp/status` |
| Ditado do pedido (IA) | `GET /api/ditado/status`, `POST /api/ditado`, `POST /api/ditado/{id}/respostas` |
| Alto Medidas | `GET /api/alto-medidas/status`, `/os?mes=`, `/resumo`; `PUT /api/alto-medidas/os/{id}/pagamento` |
| Alto Medidas, entrada (**pública**, protegida por chave) | `POST /api/integracoes/alto-medidas/os` |
| Saúde (**pública**) | `GET /health` |

Uma matriz equivalente a esta, dentro do `MatrizDeEndpointsTest`, é conferida contra os endpoints reais: endpoint novo sem classificação quebra os testes. Esta tabela, porém, é escrita à mão e precisa ser atualizada junto.

`/health` só responde depois que o `EntityManagerFactory` existe, então o Railway e o proxy só consideram o backend pronto quando o banco já inicializou. Ele não faz consulta, para não acordar o Neon à toa.

## Autenticação e isolamento por empresa

- `POST /api/auth/login` devolve um **JWT de 30 dias** com `usuarioId` e `empresaId`. A chave de assinatura vem de `JWT_SECRET` (Base64); sem ela é gerada na primeira execução em `~/.retificasDesktop/jwt-secret.key`.
- Quando faltam menos de 7 dias para expirar, o `JwtAuthFilter` devolve um token novo no header `X-Auth-Refresh`, e o PWA o guarda. O token é validado pela assinatura e pela expiração, sem consultar o usuário a cada requisição.
- `SecurityConfig`: `/api/auth/**` e `/api/integracoes/**` são públicos; o resto de `/api/**` exige token (sem token ou com token inválido, **401**); todo o resto (PWA estático, `/health`) é aberto.
- **Isolamento**: as entidades `Pedido`, `Cliente`, `Cabecote`, `ServicoCatalogo` e `PecaCatalogo` têm `@ManyToOne EmpresaModel empresa`. Os repositórios recebem `empresaId` e filtram por ele em `listar`, `buscar` e `deletar`; os controllers obtêm a empresa do token com `SecurityUtils.empresaAtual()`. Itens do pedido são isolados pelo pedido pai. Buscar ou alterar (`GET`, `PUT`) um id de outra empresa devolve 404, como se não existisse; um `DELETE` de id alheio responde 204 e não apaga nada. Ver [backend/TESTES.md](../backend/TESTES.md) para o que é testado.
- **Bootstrap** (`BootstrapUsuario`, a cada subida): se não há usuários ou não há empresa, cria a empresa e um usuário (em banco novo, a empresa 1) com **senha aleatória**, gravada em `~/.retificasDesktop/bootstrap-credentials.txt` (fora do git) e também escrita no log de inicialização. Sempre vincula à primeira empresa qualquer linha das cinco tabelas com `empresa IS NULL`.

### Riscos conhecidos (auditoria de 2026-10-17)

| Risco | Detalhe |
|---|---|
| Demonstração pública | `POST /api/auth/demo` cria empresas sem senha para visitantes. Mitigado: empresa isolada, sem IA nem WhatsApp, token de 2 horas que não renova, apagada no fim do prazo, limites por endereço e por dia. Ver [SAAS.md](SAAS.md#login-e-demonstração). |
| Sessão não revogável | Trocar a senha não invalida tokens já emitidos, e a renovação os mantém vivos. Só trocar o `JWT_SECRET` derruba todos. |
| `salvar(entity)` não confere a empresa | Os controllers atuais buscam por `id + empresa` antes de salvar, mas um controller novo que não faça isso abriria uma brecha. |
| Backfill para a primeira empresa | Com várias empresas, uma linha criada sem empresa (por um bug ou pelo desktop) vira dado da empresa 1 no próximo boot. |
| Integrações globais | WhatsApp (token e número), Alto Medidas (`ALTO_MEDIDAS_EMPRESA_ID`), a chave da IA do ditado (gasto não medido por empresa) e as condições do PDF são da plataforma, não por empresa. |
| Numeração do orçamento | O número é o id do pedido (`%04d`), uma sequência única para todas as empresas. |

## PDF do orçamento

`PedidoPdfService` (OpenPDF) gera o layout "blueprint": cabeçalho com logo e contatos da empresa do pedido, itens agrupados por categoria, e subtotal, desconto e total quando há desconto. Sem logo, o nome da empresa ocupa o espaço; sem telefone e Instagram, a coluna de contatos some. No `OrcamentoPdfGerador`, a logo é buscada em paralelo com o pedido; o catálogo só é consultado (peças e serviços em paralelo) para itens antigos sem categoria. As condições (pagamento, prazo, garantia) são constantes do código, iguais para todas as empresas. Ver também a identidade da empresa em [PWA.md](PWA.md#identidade-da-empresa).

## Tarefas agendadas

`@EnableScheduling` está ligado. Hoje há uma tarefa: o `AltoMedidasSincronizador` repete, a cada 10 minutos (`ALTO_MEDIDAS_RETRY_MS`; a primeira rodada vem 2 minutos depois da subida), o aviso de pagamento que não chegou ao Alto Medidas, tanto "cliente pagou" quanto "desfeito". Como o backend é desligado à noite (ver [PRODUCAO.md](PRODUCAO.md)), a repetição só roda com ele ligado.

## Integrações

| Integração | Estado | Documento |
|---|---|---|
| Alto Medidas (virabrequins do parceiro) | Ligada em produção | [backend/ALTO-MEDIDAS.md](../backend/ALTO-MEDIDAS.md) |
| WhatsApp Business (envio do orçamento) | Código pronto, **desligado** (faltam as credenciais da Meta) | [backend/WHATSAPP-API.md](../backend/WHATSAPP-API.md) |
| App Android (Capacitor, voz nativa) | Pronto para teste; instalação direta do APK | [android-app/LEIA-ME.md](../android-app/LEIA-ME.md) |
| Anthropic (ditar o pedido por voz) | **Ligada** em produção (`ANTHROPIC_API_KEY` configurada) | [backend/DITADO.md](../backend/DITADO.md) |

O **ditado** (`org.example.backend.ditado`) manda o texto transcrito pelo navegador ao Claude (SDK oficial `anthropic-java`, saída estruturada) junto com o catálogo da empresa do token. Tudo que a IA devolve passa pelo `NormalizadorDitado`, que descarta ids que não existam no catálogo **da empresa** e limita valores, datas e tamanhos. A conversa (perguntas de esclarecimento, até 4 chamadas por ditado) fica numa sessão **em memória** no servidor (20 minutos, no máximo 200), e o limite diário (100 por empresa, 300 no total) também é em memória e zera no reinício. Até 4 chamadas simultâneas à IA, para não ocupar as 20 threads do Tomcat.
