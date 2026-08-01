# Contexto do projeto — retificasDesktop / Retífica (atualizado 2026-07-31)

Sistema de gestão para uma retífica de motores. Nasceu como app desktop JavaFX e virou um projeto multi-módulo com versão mobile/web (PWA) compartilhando o mesmo banco. Em 2026-07-31 também virou candidato a SaaS multiempresa (ver seção própria abaixo) — ainda não implementado, só planejado.

## Arquitetura

Maven multi-módulo, raiz em `C:\Users\Miguel\Downloads\files\retifica-api\retificasDesktop`:

- **core/** — entidades JPA, persistência (Hibernate + Postgres), repositórios, serviço de PDF. Sem dependência de UI. Usado por desktop e backend.
- **desktop/** — app JavaFX original (continua funcionando, quase intocado).
- **backend/** — API REST (Spring Boot) + a página web/mobile (PWA) servida como recurso estático (`backend/src/main/resources/static/`: `index.html`, `style.css`, `app.js`).

**Banco (atualizado em 2026-07-31): Postgres**, não é mais H2. Local: container Docker via `docker-compose.yml` (`docker compose up -d`). Produção: Neon (gerenciado). Ver seção "Produção" abaixo pros detalhes — url/usuário/senha vêm de variáveis de ambiente (`DATABASE_URL`/`DATABASE_USER`/`DATABASE_PASSWORD`), lidas em runtime pelo `JPAUtil`; sem elas, cai nos defaults do `persistence.xml` (Postgres local do Docker). **O antigo arquivo H2** (`~/.retificasDesktop/retificas.mv.db`) e seus backups continuam em `~/.retificasDesktop/` como histórico — não é mais usado pelo app, mas é a fonte pra migração dos dados reais existentes.

**Stack (atualizado em 2026-07-31)**: Spring Boot 4.1.0 (era 2.7.18), Java 21 LTS via `maven.compiler.release` (era 18, non-LTS), Jakarta EE — `core` usa `jakarta.persistence` (era `javax.persistence`), Hibernate ORM 7.4.1.Final via `org.hibernate.orm:hibernate-core` (era `org.hibernate:hibernate-entitymanager` 5.6.11), H2 2.4.240 (era 2.1.214). O BOM `spring-boot-dependencies` fica no `pom.xml` raiz (`dependencyManagement`), não só no `backend`, pra `core` também herdar versões gerenciadas sem depender do Spring em si. Rodando sobre JDK 26.0.1 (única JDK instalada na máquina — `maven.compiler.release=21` faz cross-compilation, não precisa de JDK 21 separada).

**Maven não está no PATH.** Use sempre o Maven embutido do IntelliJ:
```
C:\Program Files\JetBrains\IntelliJ IDEA 2026.1.4\plugins\maven-plugin\lib\maven3\bin\mvn.cmd
```
(o caminho já mudou uma vez entre sessões por atualização da IDE — se der "não encontrado", procurar de novo com `Get-ChildItem -Recurse -Filter mvn.cmd` a partir de `C:\Program Files\JetBrains`).

**GitHub CLI** (`gh`) instalado em `C:\Program Files\GitHub CLI\gh.exe`, não está no PATH das sessões de shell abertas por padrão — usar caminho completo, ou `& "C:\Program Files\GitHub CLI\gh.exe" ...` no PowerShell (o `&` é obrigatório antes de um caminho entre aspas). Autenticado como `dragonger`.

## Repositórios Git

- **`origin`** → `https://github.com/dragonger/retificasDesktop.git` — repositório original.
- **`saas`** → `https://github.com/dragonger/SAS-retifica.git` (público) — criado em 2026-07-31, recebeu o snapshot completo do projeto reestruturado (multi-módulo + dashboard + upgrade). Os dois remotes coexistem no mesmo diretório de trabalho; `git push` sem argumento vai pro `origin` (upstream configurado), pro outro é preciso `git push saas main` explícito.

## Como rodar

**Banco local (obrigatório antes de compilar/rodar o backend ou o desktop):**
```bash
docker compose up -d
```
Sobe um Postgres em `localhost:5432` (usuário/senha/banco `retificas`, ver `docker-compose.yml`) — precisa do Docker Desktop aberto. Docker Desktop foi instalado em 2026-07-31 nesta máquina (exigiu habilitar WSL2 + reiniciar o Windows).

**Compilar tudo:**
```bash
mvn clean compile   # (usando o caminho completo do mvn.cmd acima)
```
Depois de mudar qualquer **flag de compilação** (ex.: `maven.compiler.release`, `maven.compiler.parameters`) no pom, usar `mvn clean package` (não só `package`) — o compiler plugin não recompila arquivos que já estão "atualizados" em relação ao `.java`, mesmo que a flag do compilador tenha mudado.

**Empacotar e rodar o backend (API + PWA):**
```bash
mvn -pl core,backend -am -DskipTests package
java -jar backend/target/retificas-backend.jar
```
Sobe em `https://localhost:8443` (HTTPS com certificado autoassinado — necessário pro Web Share funcionar no celular). Se a porta 8443 já estiver em uso (backend anterior ainda rodando), parar antes: procurar processo com `Get-NetTCPConnection -LocalPort 8443` e `Stop-Process`.

**Acesso de fora da rede local (túnel Cloudflare)** — **por padrão, sempre subir junto com o backend** (preferência confirmada do usuário):
```bash
C:\Users\Miguel\cloudflared\cloudflared.exe tunnel --url https://localhost:8443 --no-tls-verify
```
Gera uma URL pública tipo `https://palavras-aleatorias.trycloudflare.com` — **é temporária, muda toda vez que o processo reinicia** (fica no log de saída, procurar por "Your quick Tunnel"). Pra uma URL fixa, precisa criar uma conta Cloudflare e um túnel nomeado (ainda não configurado).

**Desktop:**
```bash
mvn -pl desktop -am javafx:run
```
Desde a troca pra Postgres, o desktop também precisa do `docker compose up -d` rodando (ou apontar pra um Postgres real via env vars) — não lê mais um arquivo local sozinho.

## Produção (Railway + Neon) — **no ar desde 2026-07-31**

**URL pública**: https://retifica-backend-production.up.railway.app (domínio gerado pelo Railway, HTTPS de verdade — sem certificado autoassinado).

PR #4 (`feature/producao-postgres-hosting`) mergeado no `main`. Escolhas: hospedagem **Railway**, banco **Neon** (Postgres gerenciado). Decisão de projeto: **sem H2 daqui pra frente, nem em dev** — só Postgres (local via Docker, produção via Neon).

**Projeto/serviço no Railway**: projeto `daring-benevolence`, serviço `retifica-backend` (builder = Dockerfile, não o auto-detect do Railway — o Dockerfile já existente na raiz é usado). **Atenção**: já rolou uma vez de existir um serviço duplicado (`SAS-retifica`, criado quando o repo foi conectado direto pelo dashboard, usando auto-detect/Railpack, sem variáveis — ficou crashado) — foi apagado. Se for mexer de novo, confirmar com `railway service list --json` que só existe UM serviço antes de criar outro.

**Variáveis de ambiente configuradas no Railway** (nunca commitar os valores):
- `DATABASE_URL`, `DATABASE_USER`, `DATABASE_PASSWORD` — do Neon.
- `JWT_SECRET` — valor próprio de produção, gerado à parte (não é o mesmo do `~/.retificasDesktop/jwt-secret.key` local).
- `SSL_ENABLED=false` — o Railway termina HTTPS de verdade na borda; o app escuta HTTP puro por dentro.
- `PORT` — o próprio Railway injeta automaticamente.

**Railway CLI**: instalado via `npm install -g @railway/cli` (Node.js instalado em 2026-07-31 pra isso). Não fica no PATH da sessão por padrão — usar `$env:Path = "C:\Program Files\nodejs;$env:APPDATA\npm;" + $env:Path` (PowerShell) antes de rodar `railway`. Login já feito (`railway login`, autenticado como Miguel). Projeto já linkado nesta pasta (`railway link`/`railway service link retifica-backend`).

**Migração dos dados reais**: feita com sucesso — export do H2 antigo via `org.h2.tools.Script`, ajustado (nomes de tabela/coluna em minúsculo pro Postgres, `EMPRESA`/`USUARIO` viraram `UPDATE` em vez de `INSERT` porque o bootstrap já cria a linha 1) e aplicado via `docker run postgres:16-alpine psql "<connection-string-do-neon>" -f script.sql`. **Gotcha**: a tabela `PEDIDO` do H2 tinha uma coluna legada `cabecote_id` que não existe no schema novo do Postgres (Hibernate só cria o que a entidade atual mapeia) — teve que tirar essa coluna do INSERT. Tudo conferido via API depois: login, pedido #129, cliente, catálogo completo, PDF, dashboard — tudo certo, acentuação preservada.

**Bug encontrado na verificação final e corrigido (2026-08-01), PR #5 mergeado e deployado**: a primeira requisição de login após um período ocioso dava **500** (`FATAL: terminating connection due to administrator command`). O Neon suspende o compute quando fica ocioso e derruba as conexões; o pool interno do Hibernate (usado até então, com aviso "not intended for production use" nos logs) não valida conexão antes de reusar. Fix: trocado pelo HikariCP (`hibernate-hikaricp` no `core/pom.xml` + `hibernate.connection.provider_class`/`hibernate.hikari.*` no `persistence.xml`), que valida via `isValid()` antes de entregar a conexão. Testado localmente (build `mvn -pl core,backend -am package` limpo, HikariCP inicializa certo contra o Postgres do `docker-compose.yml`) e confirmado em produção após o deploy: `HikariPool-1 - Start completed` nos logs, login/pedido #129/dashboard voltando 200 normalmente. **Gotcha do deploy**: o merge do PR #5 no `main` não disparou o auto-deploy do Railway sozinho (webhook não reagiu, motivo não investigado) — precisou rodar `railway up --ci` manualmente na raiz do projeto pra forçar um build+deploy novo a partir do `main` local.

## Dados reais no banco (não apagar)
- 1 cliente real: "MIGUEL BELIZARIO SANTOS"
- 1 pedido real (#129) vinculado a esse cliente
- 12 cabeçotes Fiat (catálogo técnico com faixas de medida móvel/fixo)
- 28 serviços + 14 peças cadastrados no catálogo, organizados por categoria (Cabeçote/Bloco/Biela/Virabrequim/Montagem/Outro), a maioria com valor R$ 0,00 (o usuário ainda vai preencher os preços reais)

Sempre que eu (assistente) criar dados de teste durante verificação, tenho o hábito de **deletar depois via API** (`DELETE /api/pedidos/{id}`, `/api/clientes/{id}`, etc.) — manter esse cuidado pra não sujar a base real. **Cuidado extra ao extrair um `id` de uma resposta JSON de `POST /api/pedidos` por regex/grep**: o objeto `cliente` aninhado também tem um campo `"id"`, e ele aparece ANTES do `"id"` do próprio pedido no JSON — um grep ingênuo pega o id errado. Já aconteceu de eu finalizar por engano o pedido real #129 por causa disso (revertido na hora via SQL direto: `UPDATE PEDIDO SET DATENTREGA=NULL WHERE ID=129`, usando `org.h2.tools.Shell` com o driver H2 atual). Preferir extrair o id do topo do objeto (chave `pedidoDescricao`/`totalGeral` por perto) ou parsear com uma ferramenta de JSON de verdade, não regex.

## Modelo de dados (pontos não óbvios)

- **PedidoModel.componentes** — `@ManyToMany` com `CabecoteModel` (tabela `PEDIDO_COMPONENTE`). Um pedido pode ter **vários** componentes (cabeçote, bloco, biela, virabrequim), não é mais um único campo. Isso foi migrado de um `@ManyToOne` antigo — já rodei o backfill, dado antigo preservado.
- **PedidoModel.cliente** — `@ManyToOne(cascade = PERSIST, MERGE)` (sem REMOVE/orphanRemoval). Cliente é cadastro reutilizável entre pedidos, não é mais criado do zero a cada pedido. O cascade PERSIST/MERGE foi escolhido de propósito pra não quebrar o desktop (que ainda cria cliente inline).
- **PedidoModel.categorias** — `@ElementCollection<CategoriaProduto>` (tabela `PEDIDO_CATEGORIA`). Categorias marcadas no formulário ("Categorias envolvidas") — filtram quais serviços/peças/componentes aparecem pra escolher. **Desde 2026-07-31, o seletor de chips só mostra CABECOTE/BLOCO/BIELA/VIRABREQUIM** (constante `CATEGORIAS_COMPONENTE` em `app.js`) — MONTAGEM e OUTRO continuam existindo no enum e nos formulários de catálogo (Cabeçotes/Serviços/Peças), só não aparecem mais como "categoria envolvida" num pedido, por não serem componentes físicos do motor.
- **CabecoteModel** — na real é um catálogo de "componentes técnicos": tem campo `categoria` (CATEGORIA_PRODUTO) e cobre Cabeçote **e também** Bloco/Biela/Virabrequim, não só cabeçotes. Nome da classe/tabela ficou `CABECOTE` por não ter sido pedido rename, mas o escopo é maior. **O rótulo desse menu no PWA foi trocado pra "Produtos"** (era "Cabeçotes") — só o texto visível mudou, a rota (`#/cabecotes`), `data-tab="cabecotes"` e os nomes internos (classe, tabela, endpoint `/api/cabecotes`) continuam iguais.
- **CategoriaProduto** (enum): CABECOTE, BLOCO, BIELA, VIRABREQUIM, MONTAGEM, OUTRO.
- **StatusPedido** (enum): ABERTO, EM_ANDAMENTO, PRONTO — andamento manual enquanto o pedido não é finalizado. "Atrasado" e "Finalizado" são calculados (não armazenados) a partir da data de entrega estimada e de `datEntrega`.
- Ao rodar `hbm2ddl.auto=update` pela primeira vez depois de adicionar uma coluna nova (ex.: `categoria` no CabecoteModel), **linhas antigas ficam com o campo NULL** — já aconteceu um bug de NPE por causa disso (corrigido com getter defensivo + backfill SQL manual). Ter isso em mente se adicionar mais colunas em entidades com dados existentes.
- **ServicoModel/PecaModel** (itens de um pedido) não têm FK pro catálogo — só um campo `descricao` (texto livre, copiado do catálogo na hora de montar o pedido). Agregações "por serviço" (ex.: dashboard de encerrados) agrupam por essa string, não por um id de catálogo — descrições digitadas diferente não se juntam.
- **Preço definido no pedido, não travado no catálogo (desde 2026-08-01)**: o `valor` do catálogo (`ServicoCatalogoModel`/`PecaCatalogoModel`) continua existindo só como sugestão — ao adicionar um item no pedido, o PWA pré-preenche o campo de valor com o preço do catálogo mas deixa editável (`seletorAdicionar` em `app.js`). O backend sempre confiou no `valorUnitario` que vem no request (nunca resolveu pelo catálogo — ver comentário em `ItemRequestDTO`), então nenhuma mudança de contrato foi necessária, só a UI.
- **Desconto por pedido** (`PedidoModel.descontoTipo`/`descontoValor`, enum `TipoDesconto{VALOR,PERCENTUAL}`): fórmula (subtotal, valor do desconto, total) centralizada em `PedidoModel.getSubtotal()`/`getValorDesconto()`/`recalcularTotal()` — usada tanto pelo `PedidoController` quanto pelo `PedidoPdfService`, pra nunca divergir entre o total salvo e o total impresso no PDF. Desconto nunca deixa o total ficar negativo (limitado ao subtotal).

## O que já foi implementado (resumo funcional)

**Desktop (JavaFX):** pedidos, clientes, cabeçotes (catálogo técnico), catálogo de serviços/peças, tela de encerrados por mês, geração de PDF (orçamento). Não recebeu as mudanças de UI feitas no PWA nesta sessão (categorias envolvidas, dashboard, etc.) — só o backend/PWA foram alterados.

**Backend REST** (`/api/*`): pedidos (CRUD, dashboard, encerrados — agora com `porCliente`/`porServico`, finalizar, pdf), cabeçotes/componentes, clientes, serviços-catálogo, peças-catálogo, categorias.

**PWA (mobile/web)**, com o visual "blueprint" baseado num design compartilhado pelo usuário (fontes Barlow/Barlow Condensed, tema claro, cantos em L nos cards):
- **Início**: dashboard com estatísticas (em aberto, entregas hoje, prontos, atrasados) — **desde 2026-08-01, os 4 cards são clicáveis** e levam pra lista de Pedidos já filtrada (`#/pedidos?filtro=abertos|hoje|prontos|atrasados`), com botão "Ver todos os pedidos" pra limpar o filtro.
- **Pedidos**: lista + criar/editar.
  - **Formulário reorganizado (2026-08-01, handoff de design)**: abas **Cliente → Pedido → Componentes → Itens** (cliente escolhido primeiro). Cliente: busca/seleciona existente + cadastro rápido (opção "Novo cliente" escondida quando já há cliente selecionado). Pedido: só situação/descrição/entrega estimada/observação. Componentes: categorias envolvidas (chips) + componentes técnicos, sempre visível nessa aba (mostra mensagem "Marque uma categoria..." quando nenhuma está marcada, em vez do toggle escondido de antes). Itens: sub-alternador Serviços/Peças + **barra de total fixa** (subtotal/desconto/total recalculados ao vivo a cada item adicionado/removido ou mudança no desconto, espelhando a mesma fórmula do backend em `PedidoModel`).
  - **Visualizar pedido (redesenhado 2026-08-01)**: componentes agrupados por categoria (linha por categoria, ex. "Cabeçote — nome do produto"). Selo "Finalizado" preenchido (`tag-finalizado`, com ícone de check); "Atrasado" ganha ícone de alerta pra não confundir com "Pronto". Menu **"⋮"** no topo (novo botão global `btnMenuPedido` + popover `menuPedidoPopover`, só aparece nessa tela) reúne Editar/Excluir, tirando essas ações do fluxo principal. **"Gerar orçamento" agora é a ação primária** (era secundária) — é o uso do dia a dia, o PDF já é pré-buscado assim que a tela abre; "Finalizar" virou secundária. Total + botões ficam fixos embaixo (`position:sticky`).
  - **"Gerar orçamento"** usa a Web Share API nativa do celular (abre o menu de compartilhar do WhatsApp/Mensagens/etc. com o PDF) — só funciona em contexto seguro (HTTPS), por isso o certificado local + túnel Cloudflare. **Bug crítico corrigido em 2026-08-01**: o botão abria uma aba em branco (`window.open`) de forma síncrona ANTES de chamar `navigator.share()` — só que `window.open()` também consome a "ativação transitória" do toque do usuário, sobrando nada pro `navigator.share()` alguns microtasks depois, que rejeitava com `NotAllowedError` (menu de compartilhar nunca aparecia). Fix: como `navigator.canShare()` é síncrono, o clique decide ANTES de abrir qualquer aba — só reserva a aba em branco (evita bloqueio de pop-up) quando o Web Share nem vai ser tentado. Outros dois bugs relacionados corrigidos na mesma leva: `InvalidStateError` por duplo toque (trava `compartilhamentoEmAndamento`) e WhatsApp descartando o PDF e mandando só o texto quando `files`+`text`/`title` iam juntos no `share()` (agora manda só `files`).
  - **"Anexar foto do componente" (2026-08-01)**: botão na tela de Visualizar pedido que abre a câmera/galeria do celular (`capture="environment"`) e manda a foto **junto com o PDF** no mesmo compartilhamento (Web Share API com múltiplos arquivos). A foto nunca é enviada pro servidor nem salva em lugar nenhum — só passa direto no compartilhamento, por pedido explícito do usuário ("não precisa armazenar, ela só precisa chegar ao cliente"). Se o aparelho não suportar compartilhar 2 arquivos de uma vez, cai de volta pra só o PDF.
  - **PDF do orçamento redesenhado (2026-08-01)**: layout "blueprint" do design system Industry (handoff `.html` recebido do usuário), gerado em `PedidoPdfService` com iText/OpenPDF (`Document`/`PdfPTable`/`PdfPCell`, marcas de canto "+" desenhadas via `PdfPCellEvent`). Fontes Barlow/Barlow Condensed (Google Fonts, licença OFL) embutidas em `core/src/main/resources/fonts/*.ttf` e carregadas via `BaseFont.createFont` a partir de bytes do classpath (não de arquivo em disco — necessário pra funcionar dentro do jar/Docker). Mostra Subtotal/Desconto/Total quando há desconto no pedido. **Logo real da empresa** (`core/src/main/resources/images/logo-empresa.png`, fornecida pelo usuário) no cabeçalho, carregada do classpath via `Image.getInstance` (mesmo padrão das fontes) — cai de volta pro placeholder em branco se a imagem não existir.
- **Produtos** (era "Cabeçotes"): catálogo técnico (cobre as 4 categorias de componente).
- **Catálogo** (menu, ícone no topo): Clientes (CRUD completo + busca), Serviços, Peças — todos com categoria.
- **Encerrados**: pedidos finalizados agrupados por mês (lista simples, inalterada).
- **Dashboard** (nova aba, 2026-07-31): pra cada mês (seletor no topo, padrão o mês mais recente) mostra total do mês, lista de pedidos encerrados, e **valor por cliente**/**valor por serviço** com gráfico de barras horizontais (CSS puro, sem lib nova), tabela e subtotal. **Desde 2026-08-01, os dois blocos viraram um alternador** ("Por cliente" / "Por serviço", mesmo padrão visual do `.seg` das abas) em vez de ficarem sempre os dois abertos empilhados. Backend: `GET /api/pedidos/encerrados` retorna `porCliente`/`porServico` em cada grupo de mês (`AgregadoValorDTO { descricao, total }`), calculado no mesmo loop que já monta o total do mês.

## Avaliação de SaaS multiempresa

Em 2026-07-31 o usuário pediu um levantamento pra transformar o sistema num SaaS vendido a outras retíficas (não só uso interno). Resumo do que importa pra próximas sessões:

**Abordagem recomendada**: schema compartilhado com coluna `empresa_id` em cada entidade (não schema-per-tenant nem banco-per-tenant) — dado o volume real por oficina (dezenas/centenas de linhas), é o padrão de mercado pra SaaS B2B pequeno e o mais simples de operar sozinho.

**Roteiro em 3 fases**:
1. **Fundação**: `Usuario`/`Empresa`, Spring Security + JWT, retrofit de `empresa_id` nas 8 entidades, migrar os dados reais existentes pra dentro do sistema, trocar H2 por Postgres + Flyway.
2. **Onboarding de outras oficinas**: cadastro self-serve, administração por empresa, deploy em hospedagem persistente com domínio próprio.
3. **Produto vendável**: cobrança/assinatura (provável mensal), reformular o desktop como ferramenta financeira/relatórios (frontend mais robusto que o JavaFX atual — a operação de pedidos/cadastros fica só no PWA), observabilidade/backup.

**Decisões já confirmadas pelo Miguel** (2026-07-31):
- Os dados reais dele viram a "empresa 1" do sistema.
- O banco continua H2 por enquanto (troca pra Postgres fica pra depois).
- **Cobrança**: ainda não fechado, mas tendência é mensalidade (assinatura por oficina/mês) — não é definitivo, só a direção mais provável até agora.
- **Futuro do desktop JavaFX**: deixa de ser a ferramenta operacional (pedidos, cadastros — isso fica só no PWA daqui pra frente) e vira uma ferramenta focada em **informações financeiras/relatórios**. Precisa de um frontend mais robusto e bem acabado do que o JavaFX atual — não necessariamente um projeto/repo separado, mas outro nível de acabamento. Ainda não tem escopo nem stack definidos, só a direção.

### Fase 1a — Fundação: login (implementado em 2026-07-31)

Feito: `EmpresaModel`/`UsuarioModel` (novas entidades em `core/model`, registradas no `persistence.xml`), `EmpresaRepository`/`UsuarioRepository` (mesmo padrão POJO+`EntityManager` manual dos outros repositórios), Spring Security + JWT no `backend` (pacote `org.example.backend.security`: `JwtUtil`, `RetificaPrincipal`, `JwtAuthFilter`; `org.example.backend.config.SecurityConfig`), `POST /api/auth/login` (`AuthController`), e uma tela de login no PWA (`telaLogin()` em `app.js`, rota `#/login`, botão "Sair" no app-bar).

**Como funciona**: todo `/api/**` exige `Authorization: Bearer <token>` agora, exceto `/api/auth/**` e os arquivos estáticos do PWA (que continuam abertos, senão a tela de login não carregaria). O `app.js` guarda `{token, nome, empresaNome}` em `localStorage` (`retifica_auth`) e anexa o token em toda chamada via `api()`; um 401 limpa o auth e redireciona pra `#/login`. O `rotear()` bloqueia qualquer rota se não tiver auth salvo.

**Bootstrap do primeiro usuário**: no primeiro startup com banco de usuários vazio, `BootstrapUsuario` (`CommandLineRunner`) cria a empresa "Retífica" (empresa 1) e um usuário com o e-mail do Miguel e uma **senha gerada aleatoriamente**, gravada em `~/.retificasDesktop/bootstrap-credentials.txt` (fora do git — o repo é público, nada de segredo commitado). A chave de assinatura JWT também é gerada e guardada em `~/.retificasDesktop/jwt-secret.key` na primeira vez. **Se apagar/perder esses arquivos, tokens antigos ficam inválidos e um novo usuário bootstrap é criado no próximo restart** (só se `UsuarioRepository.contar()==0` — como já existe usuário, isso não vai re-rodar sozinho; pra recriar do zero precisaria apagar a linha de `USUARIO` no banco também).

### Fase 1b — Isolamento de dados por empresa + troca de senha (implementado em 2026-07-31)

Branch `feature/fase1b-tenant-isolation` (a partir de `feature/fase1a-auth-login`, PR próprio com base nessa branch — Fase 1a ainda não mergeada).

**Escopo revisado do "empresa_id nas 8 entidades"**: só 5 ganharam coluna `empresa` de verdade — `PedidoModel`, `ClienteModel`, `CabecoteModel`, `ServicoCatalogoModel`, `PecaCatalogoModel` (as que têm endpoint REST próprio). `ServicoModel`/`PecaModel` (itens de pedido, sempre criados/removidos junto com o pai) são isolados via join no `pedido.empresa`, sem coluna redundante. `VendedorModel` ficou de fora — não tem `VendedorController` nem `VendedorRepository` em lugar nenhum, zero exposição via API, nada pra isolar de verdade.

**Padrão aplicado**: toda entidade com CRUD ganhou `@ManyToOne EmpresaModel empresa`; os repositórios (`listarTodos`, `buscarPorId`, `deletar`) passaram a receber `Long empresaId` e filtrar via `WHERE x.empresa.id = :empresaId`; os controllers usam o novo `org.example.backend.security.SecurityUtils.empresaAtual()` (lê `RetificaPrincipal` do `SecurityContextHolder`) pra passar o filtro e, no `criar`, setar a empresa do novo registro. Isso fecha um IDOR real: antes, um id sequencial de outro tenant seria acessível só adivinhando o número — agora `buscarPorId` com empresa errada devolve `null` (404), igual a "não existe".

**Migração dos dados existentes**: `BootstrapUsuario` foi expandido — além de criar empresa+usuário no primeiro boot, agora **sempre** roda um backfill (`UPDATE ... WHERE empresa IS NULL`) nas 5 tabelas, vinculando qualquer linha órfã à primeira empresa cadastrada. Idempotente, seguro rodar em todo startup.

**Testado**: isolamento verificado criando uma segunda empresa/usuário de teste direto via SQL (senha com hash BCrypt gerado à parte) — confirmado que cada usuário só vê os próprios dados nos dois sentidos, e que acessar um id de outro tenant dá 404. Dados de teste apagados depois.

**Troca de senha** (pedido do usuário, incluído nesta mesma etapa): `PUT /api/usuario/senha` (`UsuarioController`, fora de `/api/auth/**` — exige token; confere a senha atual via `PasswordEncoder.matches` antes de trocar), tela `#/trocar-senha` no PWA (`telaTrocarSenha()`), novo ícone no app-bar (`#btnSenha`).

**Ainda não feito**: cadastro de novos usuários/empresas (self-serve, Fase 2), recuperação de senha esquecida, e o app desktop continua sem login (acessa o banco direto via `JPAUtil`, nunca passa pela API/Spring Security — decisão deliberada, não pendência).

**Cuidado observado nesta sessão**: durante os testes de ponta a ponta (Fase 1a e 1b), o pedido real #129 acabou sendo finalizado por engano mais de uma vez (provavelmente por algum teste de API tocando o id errado) — sempre revertido na hora via SQL direto (`UPDATE PEDIDO SET DATENTREGA=NULL WHERE ID=129`) e conferido no fim de cada rodada de testes. **Ao testar contra este banco (que tem dados reais), sempre usar empresas/usuários/pedidos de teste à parte quando possível, e conferir o estado do pedido #129 no final de qualquer sessão de testes.**

## Pendências / próximos passos possíveis
- **Fases 1a, 1b e a hospedagem em produção estão prontas e no ar** (login + isolamento por empresa + Railway/Neon). Próximo passo natural: Fase 2 (onboarding self-serve de outras oficinas) — mas ainda faltam duas decisões antes: modelo de cobrança e futuro do app desktop (ver seção "Avaliação de SaaS").
- **APK**: usuário quer eventualmente empacotar como APK Android — agora já existe uma URL pública estável (`https://retifica-backend-production.up.railway.app`), então essa pendência do CONTEXTO.md original (precisar de URL estável primeiro) **está resolvida**. Caminho recomendado: Capacitor ou Trusted Web Activity apontando pra essa URL. Ainda não iniciado.
- **Envio automático de orçamento via WhatsApp** (API) pros clientes cadastrados — pesquisa feita em 2026-08-01 (artifact "WhatsApp Business API — Envio automático de orçamento"), recomendação: Cloud API oficial da Meta direto (sem BSP intermediário), custo por mensagem (~US$0,0375/template no Brasil), template com cabeçalho tipo Documento pra mandar o PDF já na primeira mensagem. **Bloqueado até o usuário completar a verificação da empresa no Meta Business Manager e fornecer as credenciais** (token de acesso, ID do número, WABA ID) — sem isso não dá pra escrever nem testar o código de envio de verdade. PR de código ainda não aberto.
- **Túnel Cloudflare**: com a produção no Railway, o túnel local deixa de ser a forma principal de acesso externo — continua útil só pra testar mudanças antes de fazer deploy.
- Desktop não foi atualizado pra multi-componente (ainda seleciona só 1 por vez), pra escolher categoria no cadastro de cabeçote (sempre cria como CABECOTE), nem recebeu nenhuma das mudanças de UI do PWA desta sessão (categorias envolvidas, dashboard, fix do cadastro de cliente). Ninguém pediu essa paridade ainda — e se a Fase 3 do SaaS decidir aposentar o desktop, pode nunca precisar.
- Regra de firewall pro Windows: se algum dia voltar a acessar via IP local (LAN) em vez do túnel, a porta 8443 pode precisar de:
  ```powershell
  New-NetFirewallRule -DisplayName "Retifica Backend 8443" -Direction Inbound -Protocol TCP -LocalPort 8443 -Action Allow
  ```

## Coisas aprendidas na sessão (evitar repetir)
- Service Worker do PWA cacheia agressivamente — ao testar mudanças no navegador, sempre desregistrar o SW e limpar caches antes de recarregar (`navigator.serviceWorker.getRegistrations()` + `caches.delete`), senão o teste roda em cima de JS antigo.
- `window.open()` chamado depois de um `await` pode ser bloqueado como pop-up — abrir a aba de forma síncrona no clique e só navegar ela depois resolve.
- `navigator.share()`/`canShare()` com arquivo no iOS/Safari exige estar bem perto do gesto do usuário — por isso o PDF é pré-buscado assim que a tela de visualização abre, não só quando o botão é clicado.
- Automação de navegador (Claude Browser) às vezes não registra clique por coordenada de forma confiável neste ambiente — quando isso acontecer, disparar o evento via JS diretamente (`elemento.click()`) é mais confiável para testes.
- **Upgrade de Spring Boot major (2.7→4.1) quebrou `@PathVariable Long id` sem nome explícito** em runtime (`IllegalArgumentException: Name for argument... not specified`) — Spring 7 não tem mais o fallback de ler nome de parâmetro via debug do bytecode, exige a flag `-parameters` do javac (`<maven.compiler.parameters>true</maven.compiler.parameters>` no pom). Isso não aparece num `mvn compile` normal, só estourava chamando os endpoints (`/{id}/finalizar`, `PUT/DELETE .../{id}` etc.) — testar esses caminhos depois de qualquer upgrade grande do Spring, não só os `GET` simples.
- **Upgrade de H2 (2.1.214→2.4.240) mudou o formato do arquivo `.mv.db`** (MVStore write format 2→3) — banco antigo não abre direto no driver novo (`MVStoreException: write format 2 is smaller than supported format 3`). Migração: `org.h2.tools.Script` (driver antigo) exporta pra `.sql`, `org.h2.tools.RunScript` (driver novo) recria o arquivo. Arquivo original preservado em `~/.retificasDesktop/backups/`.
- Vários arquivos de `core/` (models, repositories, JPAUtil) tinham mojibake pré-existente (UTF-8 lido como Windows-1252 e re-salvo) nos comentários e num regex de parsing — corrigido revertendo o round-trip (reencodar como cp1252, decodificar como UTF-8). Não era causado por mim nem pelo upgrade; provavelmente um editor salvou errado em algum momento anterior.
- PowerShell 5.1 com `Set-Content -Encoding utf8` grava BOM por padrão — se for reescrever arquivo `.java` via PowerShell, usar `New-Object System.Text.UTF8Encoding $false` + `[System.IO.File]::WriteAllText`, senão o `javac` quebra com `illegal character: '\ufeff'`.
- O prefixo `!` pra rodar comando no chat é só uma instrução do Claude Code — se o usuário for colar o comando direto num terminal PowerShell separado, não incluir o `!` nem o `& ` antes de um caminho (no PowerShell, `&` só é necessário se o comando começar com uma string entre aspas).
