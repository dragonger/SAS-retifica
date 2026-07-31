# Contexto do projeto — retificasDesktop / Retífica (atualizado 2026-07-31)

Sistema de gestão para uma retífica de motores. Nasceu como app desktop JavaFX e virou um projeto multi-módulo com versão mobile/web (PWA) compartilhando o mesmo banco. Em 2026-07-31 também virou candidato a SaaS multiempresa (ver seção própria abaixo) — ainda não implementado, só planejado.

## Arquitetura

Maven multi-módulo, raiz em `C:\Users\Miguel\Downloads\files\retifica-api\retificasDesktop`:

- **core/** — entidades JPA, persistência (Hibernate + H2), repositórios, serviço de PDF. Sem dependência de UI. Usado por desktop e backend.
- **desktop/** — app JavaFX original (continua funcionando, quase intocado).
- **backend/** — API REST (Spring Boot) + a página web/mobile (PWA) servida como recurso estático (`backend/src/main/resources/static/`: `index.html`, `style.css`, `app.js`).

**Banco**: H2 em arquivo único, `~/.retificasDesktop/retificas.mv.db`, modo `AUTO_SERVER=TRUE` — desktop e backend podem rodar ao mesmo tempo na mesma máquina e enxergam os mesmos dados automaticamente (não precisa de sincronização manual).

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

## O que já foi implementado (resumo funcional)

**Desktop (JavaFX):** pedidos, clientes, cabeçotes (catálogo técnico), catálogo de serviços/peças, tela de encerrados por mês, geração de PDF (orçamento). Não recebeu as mudanças de UI feitas no PWA nesta sessão (categorias envolvidas, dashboard, etc.) — só o backend/PWA foram alterados.

**Backend REST** (`/api/*`): pedidos (CRUD, dashboard, encerrados — agora com `porCliente`/`porServico`, finalizar, pdf), cabeçotes/componentes, clientes, serviços-catálogo, peças-catálogo, categorias.

**PWA (mobile/web)**, com o visual "blueprint" baseado num design compartilhado pelo usuário (fontes Barlow/Barlow Condensed, tema claro, cantos em L nos cards):
- **Início**: dashboard com estatísticas (em aberto, entregas hoje, prontos, atrasados).
- **Pedidos**: lista + criar/editar.
  - Formulário com abas: Pedido (categorias envolvidas via chips multi-select — só Cabeçote/Bloco/Biela/Virabrequim —, componentes técnicos múltiplos, situação, descrição, entrega estimada, observação), **Cliente** (busca/seleciona cliente existente + cadastro rápido inline; desde 2026-07-31 a opção "Novo cliente" fica escondida quando já há um cliente selecionado — pra trocar, usa o botão "Trocar"), Serviço e Peça (adicionar itens do catálogo, filtrados pelas categorias marcadas).
  - Visualizar pedido: dados, itens, total, botões Finalizar/Editar/Gerar orçamento/Excluir.
  - **"Gerar orçamento"** usa a Web Share API nativa do celular (abre o menu de compartilhar do WhatsApp/Mensagens/etc. com o PDF) — só funciona em contexto seguro (HTTPS), por isso o certificado local + túnel Cloudflare.
- **Produtos** (era "Cabeçotes"): catálogo técnico (cobre as 4 categorias de componente).
- **Catálogo** (menu, ícone no topo): Clientes (CRUD completo + busca), Serviços, Peças — todos com categoria.
- **Encerrados**: pedidos finalizados agrupados por mês (lista simples, inalterada).
- **Dashboard** (nova aba, 2026-07-31): pra cada mês (seletor no topo, padrão o mês mais recente) mostra total do mês, lista de pedidos encerrados, e dois blocos com a mesma lógica — **valor por cliente** e **valor por serviço** — cada um com gráfico de barras horizontais (CSS puro, sem lib nova), tabela e subtotal. Backend: `GET /api/pedidos/encerrados` agora retorna `porCliente`/`porServico` em cada grupo de mês (`AgregadoValorDTO { descricao, total }`), calculado no mesmo loop que já monta o total do mês.

## Avaliação de SaaS multiempresa

Em 2026-07-31 o usuário pediu um levantamento pra transformar o sistema num SaaS vendido a outras retíficas (não só uso interno). Resumo do que importa pra próximas sessões:

**Abordagem recomendada**: schema compartilhado com coluna `empresa_id` em cada entidade (não schema-per-tenant nem banco-per-tenant) — dado o volume real por oficina (dezenas/centenas de linhas), é o padrão de mercado pra SaaS B2B pequeno e o mais simples de operar sozinho.

**Roteiro em 3 fases**:
1. **Fundação**: `Usuario`/`Empresa`, Spring Security + JWT, retrofit de `empresa_id` nas 8 entidades, migrar os dados reais existentes pra dentro do sistema, trocar H2 por Postgres + Flyway.
2. **Onboarding de outras oficinas**: cadastro self-serve, administração por empresa, deploy em hospedagem persistente com domínio próprio.
3. **Produto vendável**: cobrança/assinatura, decisão final sobre o desktop JavaFX (migrar pra API autenticada ou aposentar), observabilidade/backup.

**Decisões já confirmadas pelo Miguel** (2026-07-31): os dados reais dele viram a "empresa 1" do sistema; o banco continua H2 por enquanto (troca pra Postgres fica pra depois, dentro da própria Fase 1). Ainda em aberto: modelo de cobrança, e futuro do app desktop JavaFX (mantém só pra ele, reescreve pra falar com API autenticada, ou aposenta em favor só do PWA) — perguntar antes de decidir isso.

### Fase 1a — Fundação: login (implementado em 2026-07-31)

Feito: `EmpresaModel`/`UsuarioModel` (novas entidades em `core/model`, registradas no `persistence.xml`), `EmpresaRepository`/`UsuarioRepository` (mesmo padrão POJO+`EntityManager` manual dos outros repositórios), Spring Security + JWT no `backend` (pacote `org.example.backend.security`: `JwtUtil`, `RetificaPrincipal`, `JwtAuthFilter`; `org.example.backend.config.SecurityConfig`), `POST /api/auth/login` (`AuthController`), e uma tela de login no PWA (`telaLogin()` em `app.js`, rota `#/login`, botão "Sair" no app-bar).

**Como funciona**: todo `/api/**` exige `Authorization: Bearer <token>` agora, exceto `/api/auth/**` e os arquivos estáticos do PWA (que continuam abertos, senão a tela de login não carregaria). O `app.js` guarda `{token, nome, empresaNome}` em `localStorage` (`retifica_auth`) e anexa o token em toda chamada via `api()`; um 401 limpa o auth e redireciona pra `#/login`. O `rotear()` bloqueia qualquer rota se não tiver auth salvo.

**Bootstrap do primeiro usuário**: no primeiro startup com banco de usuários vazio, `BootstrapUsuario` (`CommandLineRunner`) cria a empresa "Retífica" (empresa 1) e um usuário com o e-mail do Miguel e uma **senha gerada aleatoriamente**, gravada em `~/.retificasDesktop/bootstrap-credentials.txt` (fora do git — o repo é público, nada de segredo commitado). A chave de assinatura JWT também é gerada e guardada em `~/.retificasDesktop/jwt-secret.key` na primeira vez. **Se apagar/perder esses arquivos, tokens antigos ficam inválidos e um novo usuário bootstrap é criado no próximo restart** (só se `UsuarioRepository.contar()==0` — como já existe usuário, isso não vai re-rodar sozinho; pra recriar do zero precisaria apagar a linha de `USUARIO` no banco também).

**Ainda não feito (Fase 1b, próximo passo)**: nenhuma das 8 entidades de negócio (Pedido, Cliente, etc.) tem `empresa_id` ainda — um usuário autenticado vê todos os dados, não há isolamento por empresa de verdade. Também não tem: troca de senha, cadastro de novos usuários (self-serve fica pra Fase 2), e o app desktop continua sem login (acessa o banco direto via `JPAUtil`, nunca passa pela API/Spring Security — decisão deliberada, não pendência).

## Pendências / próximos passos possíveis
- **A avaliação de SaaS acima** é a maior pendência em aberto — aguardando as 3 decisões do usuário pra detalhar a Fase 1.
- **APK**: usuário quer eventualmente empacotar como APK Android, acessado de **fora da rede local** — caminho recomendado: Capacitor ou Trusted Web Activity apontando pra uma URL pública estável (não a do túnel temporário). Ainda não iniciado.
- **Envio automático de orçamento via WhatsApp** (API) pros clientes cadastrados — mencionado como objetivo futuro, é por isso que o cadastro de cliente foi refeito pra ser reutilizável com telefone. Não implementado ainda.
- **Túnel permanente**: hoje é um "quick tunnel" do Cloudflare (sem conta, URL aleatória e temporária). Pra produção de verdade, criar um túnel nomeado com conta Cloudflare (grátis) ou domínio próprio + certificado real — isso também vira obrigatório se a Fase 2 do SaaS avançar (deploy hospedado).
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
