# Contexto do projeto — retificasDesktop / Retífica (2026-07-31)

Sistema de gestão para uma retífica de motores. Nasceu como app desktop JavaFX e virou um projeto multi-módulo com versão mobile/web (PWA) compartilhando o mesmo banco.

## Arquitetura

Maven multi-módulo, raiz em `C:\Users\Miguel\Downloads\files\retifica-api\retificasDesktop`:

- **core/** — entidades JPA, persistência (Hibernate + H2), repositórios, serviço de PDF. Sem dependência de UI. Usado por desktop e backend.
- **desktop/** — app JavaFX original (continua funcionando, quase intocado).
- **backend/** — API REST (Spring Boot 2.7.18) + a página web/mobile (PWA) servida como recurso estático (`backend/src/main/resources/static/`: `index.html`, `style.css`, `app.js`).

**Banco**: H2 em arquivo único, `~/.retificasDesktop/retificas.mv.db`, modo `AUTO_SERVER=TRUE` — desktop e backend podem rodar ao mesmo tempo na mesma máquina e enxergam os mesmos dados automaticamente (não precisa de sincronização manual).

**Maven não está no PATH.** Use sempre o Maven embutido do IntelliJ:
```
C:\Program Files\JetBrains\IntelliJ IDEA 2026.1.4\plugins\maven-plugin\lib\maven3\bin\mvn.cmd
```
(o caminho já mudou uma vez entre sessões por atualização da IDE — se der "não encontrado", procurar de novo com `Get-ChildItem -Recurse -Filter mvn.cmd` a partir de `C:\Program Files\JetBrains`).

## Como rodar

**Compilar tudo:**
```bash
mvn clean compile   # (usando o caminho completo do mvn.cmd acima)
```

**Empacotar e rodar o backend (API + PWA):**
```bash
mvn -pl core,backend -am -DskipTests package
java -jar backend/target/retificas-backend.jar
```
Sobe em `https://localhost:8443` (HTTPS com certificado autoassinado — necessário pro Web Share funcionar no celular). Se a porta 8443 já estiver em uso (backend anterior ainda rodando), parar antes: procurar processo com `Get-NetTCPConnection -LocalPort 8443` e `Stop-Process`.

**Acesso de fora da rede local (túnel Cloudflare):**
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

Sempre que eu (assistente) criar dados de teste durante verificação, tenho o hábito de **deletar depois via API** (`DELETE /api/pedidos/{id}`, `/api/clientes/{id}`, etc.) — manter esse cuidado pra não sujar a base real.

## Modelo de dados (pontos não óbvios)

- **PedidoModel.componentes** — `@ManyToMany` com `CabecoteModel` (tabela `PEDIDO_COMPONENTE`). Um pedido pode ter **vários** componentes (cabeçote, bloco, biela, virabrequim), não é mais um único campo. Isso foi migrado de um `@ManyToOne` antigo — já rodei o backfill, dado antigo preservado.
- **PedidoModel.cliente** — `@ManyToOne(cascade = PERSIST, MERGE)` (sem REMOVE/orphanRemoval). Cliente é cadastro reutilizável entre pedidos, não é mais criado do zero a cada pedido. O cascade PERSIST/MERGE foi escolhido de propósito pra não quebrar o desktop (que ainda cria cliente inline).
- **PedidoModel.categorias** — `@ElementCollection<CategoriaProduto>` (tabela `PEDIDO_CATEGORIA`). Categorias marcadas no formulário ("Categorias envolvidas") — filtram quais serviços/peças/componentes aparecem pra escolher.
- **CabecoteModel** — na real é um catálogo de "componentes técnicos": tem campo `categoria` (CATEGORIA_PRODUTO) e cobre Cabeçote **e também** Bloco/Biela/Virabrequim, não só cabeçotes. Nome da classe/tabela ficou `CABECOTE` por não ter sido pedido rename, mas o escopo é maior.
- **CategoriaProduto** (enum): CABECOTE, BLOCO, BIELA, VIRABREQUIM, MONTAGEM, OUTRO.
- **StatusPedido** (enum): ABERTO, EM_ANDAMENTO, PRONTO — andamento manual enquanto o pedido não é finalizado. "Atrasado" e "Finalizado" são calculados (não armazenados) a partir da data de entrega estimada e de `datEntrega`.
- Ao rodar `hbm2ddl.auto=update` pela primeira vez depois de adicionar uma coluna nova (ex.: `categoria` no CabecoteModel), **linhas antigas ficam com o campo NULL** — já aconteceu um bug de NPE por causa disso (corrigido com getter defensivo + backfill SQL manual). Ter isso em mente se adicionar mais colunas em entidades com dados existentes.

## O que já foi implementado (resumo funcional)

**Desktop (JavaFX):** pedidos, clientes, cabeçotes (catálogo técnico), catálogo de serviços/peças, tela de encerrados por mês, geração de PDF (orçamento).

**Backend REST** (`/api/*`): pedidos (CRUD, dashboard, encerrados, finalizar, pdf), cabeçotes/componentes, clientes, serviços-catálogo, peças-catálogo, categorias.

**PWA (mobile/web)**, com o visual "blueprint" baseado num design compartilhado pelo usuário (fontes Barlow/Barlow Condensed, tema claro, cantos em L nos cards):
- **Início**: dashboard com estatísticas (em aberto, entregas hoje, prontos, atrasados).
- **Pedidos**: lista + criar/editar.
  - Formulário com abas: Pedido (categorias envolvidas via chips multi-select, componentes técnicos múltiplos — só aparecem se a categoria correspondente estiver marcada —, situação, descrição, entrega estimada, observação), Cliente (busca/seleciona cliente existente + cadastro rápido inline), Serviço e Peça (adicionar itens do catálogo, filtrados pelas categorias marcadas).
  - Visualizar pedido: dados, itens, total, botões Finalizar/Editar/Gerar orçamento/Excluir.
  - **"Gerar orçamento"** usa a Web Share API nativa do celular (abre o menu de compartilhar do WhatsApp/Mensagens/etc. com o PDF) — só funciona em contexto seguro (HTTPS), por isso o certificado local + túnel Cloudflare.
- **Cabeçotes**: catálogo técnico (agora cobre as 4 categorias de componente).
- **Catálogo** (menu, ícone no topo): Clientes (CRUD completo + busca), Serviços, Peças — todos com categoria.
- **Encerrados**: pedidos finalizados agrupados por mês.

## Pendências / próximos passos possíveis
- **APK**: usuário quer eventualmente empacotar como APK Android, acessado de **fora da rede local** — caminho recomendado: Capacitor ou Trusted Web Activity apontando pra uma URL pública estável (não a do túnel temporário). Ainda não iniciado, aguardando o usuário pedir.
- **Envio automático de orçamento via WhatsApp** (API) pros clientes cadastrados — mencionado como objetivo futuro, é por isso que o cadastro de cliente foi refeito pra ser reutilizável com telefone. Não implementado ainda.
- **Túnel permanente**: hoje é um "quick tunnel" do Cloudflare (sem conta, URL aleatória e temporária). Pra produção de verdade, criar um túnel nomeado com conta Cloudflare (grátis) ou domínio próprio + certificado real.
- Desktop não foi atualizado pra multi-componente (ainda seleciona só 1 por vez) nem pra escolher categoria no cadastro de cabeçote (sempre cria como CABECOTE) — funciona, só não tem a mesma flexibilidade do mobile. Ninguém pediu isso ainda.
- Regra de firewall pro Windows: se algum dia voltar a acessar via IP local (LAN) em vez do túnel, a porta 8443 pode precisar de:
  ```powershell
  New-NetFirewallRule -DisplayName "Retifica Backend 8443" -Direction Inbound -Protocol TCP -LocalPort 8443 -Action Allow
  ```

## Coisas aprendidas na sessão (evitar repetir)
- Service Worker do PWA cacheia agressivamente — ao testar mudanças no navegador, sempre desregistrar o SW e limpar caches antes de recarregar (`navigator.serviceWorker.getRegistrations()` + `caches.delete`), senão o teste roda em cima de JS antigo.
- `window.open()` chamado depois de um `await` pode ser bloqueado como pop-up — abrir a aba de forma síncrona no clique e só navegar ela depois resolve.
- `navigator.share()`/`canShare()` com arquivo no iOS/Safari exige estar bem perto do gesto do usuário — por isso o PDF é pré-buscado assim que a tela de visualização abre, não só quando o botão é clicado.
- Automação de navegador (Claude Browser) às vezes não registra clique por coordenada de forma confiável neste ambiente — quando isso acontecer, disparar o evento via JS diretamente (`elemento.click()`) é mais confiável para testes.
