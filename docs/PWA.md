# PWA (app mobile/web)

O front-end é uma página única em JavaScript puro, sem framework nem etapa de build, servida pelo próprio backend:

```
backend/src/main/resources/static/
├── index.html, style.css, app.js      a aplicação (app.js concentra as telas e o roteador)
├── ditado.js                          regra pura de "ditar o pedido" (carregado antes do app.js)
├── sw.js, manifest.json               service worker e manifesto (instalável no celular)
├── fonts/, vendor/, icon-*.png, icon.svg   fontes Barlow, bibliotecas de terceiros, ícones
├── .well-known/assetlinks.json        liga o APK (TWA) ao domínio
```

O visual é o "blueprint" do design compartilhado pelo dono (fontes Barlow e Barlow Condensed, tema claro, cantos em L nos cards). O ícone do PWA/APK é fixo, da plataforma, e não muda por empresa.

## Navegação

Roteamento por hash (`#/...`) em `rotear()`. Abas da barra inferior: **Início**, **Pedidos**, **Produtos** (`#/cabecotes`, o catálogo de componentes técnicos), **Encerrados**, **Dashboard**. O ícone do catálogo no topo leva a `#/catalogo`, com Clientes, Serviços, Peças, **Minha empresa** (`#/empresa`) e, para a empresa da integração, **Virabrequins do Daniel** (`#/alto-medidas`). Existem ainda `#/trocar-senha`, que só se alcança digitando o hash porque o botão está escondido, e `#/login`, que hoje redireciona para `#/inicio` por causa do login automático. O logo da barra superior funciona como botão "início".

## Telas

- **Início**: quatro cards clicáveis (em aberto, entregas hoje, prontos, atrasados) que levam a Pedidos já filtrados (`#/pedidos?filtro=abertos|hoje|prontos|atrasados`); o cartão "Você deve ao Daniel" (só para a empresa da integração; some quando não há virabrequim a repassar); e os pedidos incompletos (rascunhos).
- **Pedidos**: lista com busca e filtro por cliente, e o formulário de criar/editar em abas **Cliente → Pedido → Componentes → Itens**. Em *Itens*, uma barra de total fixa recalcula subtotal, desconto e total a cada mudança, com a mesma fórmula do backend (`PedidoModel`). O preço é informado **por categoria** (serviços e peças), não por item.
- **Ditar pedido** (só em pedido novo, e só quando `ANTHROPIC_API_KEY` está configurada no servidor; ver [DITADO.md](../backend/DITADO.md)): o botão no topo do formulário abre um painel em quatro fases. (1) **Gravar**: o navegador ouve em pt-BR (Web Speech API, com reinício automático por silêncio) e a transcrição vai para uma caixa de texto editável; sem reconhecimento de voz, só a caixa de texto. (2) **Entendendo**: o servidor chama a IA. (3) **Perguntas**: quando a IA tem dúvida ou falta algo, as perguntas de escolha viram botões e as abertas aceitam voz ou texto, em até 3 rodadas ("Pular e conferir" encerra). (4) **Conferência**: o que foi entendido, as dúvidas, os conflitos com o que já estava no formulário e as pendências; valores e data são editáveis. "Preencher formulário" chama `aplicarRascunho` + `guardarRascunhoAgora` (por isso o resultado também vira rascunho), leva à primeira etapa com pendência e, se o cliente não existe, abre o cadastro rápido com o nome. **Nunca salva o pedido** e nunca sobrescreve o que já estava preenchido. A regra pura fica em `static/ditado.js` (testada com `node --test`); a tela, em `abrirDitado` no `app.js`. O aviso de privacidade aparece na primeira vez (`localStorage['retifica_ditado_aviso']`).
- **Visualizar pedido**: componentes agrupados por categoria; selos "Finalizado" e "Atrasado"; menu "⋮" com Editar e Excluir; **Gerar orçamento** (ação principal) e **Finalizar** (secundária); total e botões fixos embaixo.
- **Orçamento em PDF**: usa a Web Share API do celular para abrir o menu de compartilhar. O PDF é pré-buscado assim que a tela abre, porque o `navigator.share()` exige estar muito perto do gesto do usuário. Dá para anexar a **foto do componente** (câmera ou galeria): ela é reduzida e entra como **a última página do próprio PDF**, montada no aparelho (pdf-lib), então sai um arquivo só (mandar PDF e imagem juntos faz o WhatsApp descartar tudo). Se isso não for possível, o app oferece um segundo compartilhamento pelo botão "Enviar a foto também". A foto **nunca é guardada no servidor**; no envio automático pelo WhatsApp, o PDF já com a foto passa pelo servidor até a Meta.
- **Envio pelo WhatsApp**: sem a API configurada, o botão salva o PDF e abre a conversa por link `wa.me` (modo manual). Com `WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`, o servidor manda o PDF direto (ver [WHATSAPP-API.md](../backend/WHATSAPP-API.md)).
- **Encerrados**: pedidos finalizados agrupados por mês.
- **Dashboard**: seletor de mês (padrão: o mais recente); total do mês, lista de pedidos encerrados e um alternador **Por cliente / Por categoria** com barras horizontais, tabela e subtotal. O backend devolve `porCliente` e `porCategoria` em cada mês de `GET /api/pedidos/encerrados`.
- **Catálogo**: Clientes (CRUD e busca), Serviços e Peças, todos com categoria.
- **Virabrequins do Daniel**: cartão grande com o total devido, seletor de **mês de finalização** e três listas, nesta ordem na tela: pago pelo cliente (a repassar), aguardando o cliente pagar e já repassado. Ver [ALTO-MEDIDAS.md](../backend/ALTO-MEDIDAS.md).

## App Android (APK)

O PWA pode ser instalado como app de verdade pelo APK em `android-app/` (Capacitor): uma casca que abre o site de produção. A única parte nativa é a **voz do ditado**: dentro do APK, `ditadoNativo()` (app.js) detecta o plugin `DitadoVoz` e `ditadoVozNativa()` usa o `SpeechRecognizer` do Android, com sessão segmentada no Android 13+. Fora do APK nada muda (Web Speech API). Como o app carrega o site do servidor, **mudanças no `app.js` valem para o APK sem gerar APK novo**; só mudança no código Java pede APK novo. Detalhes, assinatura e instalação em [android-app/LEIA-ME.md](../android-app/LEIA-ME.md).

## Identidade da empresa

Cada empresa tem logo e dados de cabeçalho próprios, editados em **Catálogo → Minha empresa** (`#/empresa`).

- **Logo**: `PUT /api/empresa/logo` (multipart `logo`) aceita só PNG ou JPEG de verdade (conferido pelo conteúdo), até 5 MB e 8000 px de lado, e regrava como PNG de no máximo 400 px (`LogoNormalizador`). `DELETE` deixa a empresa "sem logo de propósito" (linha com `imagem = null`), o que impede a semeadura de devolver a logo removida.
- **Semeadura**: na primeira subida com o recurso, a primeira empresa (a Dih) recebe a logo embutida em `core/.../images/logo-empresa.png` e os contatos que o PDF já mostrava; só roda com a tabela vazia ou campos nulos.
- **Dados**: `EMPRESA.telefone`, `instagram` e `slogan` (nulo = nunca preenchido; vazio = em branco de propósito, e o PDF omite). `GET/PUT /api/empresa`.
- **No app**: a barra do topo mostra a logo da empresa logada, guardada no `localStorage` com a versão do servidor (a cada abertura só confere a versão); o título do Início é o nome da empresa. Trocar logo ou dados invalida o cache de orçamentos preparados. O service worker está na versão `retifica-shell-v10`.
- **Continuam da plataforma**: o ícone do PWA/APK e as condições do orçamento (pagamento, prazo, garantia), constantes em `PedidoPdfService`.

## Aviso de dados não salvos e rascunho do pedido

Tudo em `app.js` (sem mudança de API nem de banco).

- **Guarda de saída**: cada tela com formulário chama `definirGuarda({ tipo, sujo, ... })`; `rotear()` limpa a guarda a cada rota. O `aoMudarHash` intercepta qualquer mudança de hash (abas, logo, voltar, Cancelar, voltar do aparelho): com a guarda suja, desfaz a mudança de histórico (entradas numeradas em `history.state.i` e `history.go`) e abre `escolher(...)`. Navegações que não são do usuário (401) usam `navegarSemGuarda`.
- **Diálogo**: `escolher(mensagem, opcoes, { foco, linha })`; Esc ou toque fora escolhe a primeira opção (a segura). `confirmar` é um caso dela.
- **Rascunho do pedido** (`telaFormPedido`): autosave em `localStorage['retifica_rascunhos']`, separado por `usuarioId|empresaId` do JWT, com chave `novo` ou `pedido:<id>`; máximo de 5, vencem em 14 dias; sem sessão legível (`anonimo`) não grava. "Sujo" é o estado diferente da linha de base (voltar ao original apaga o rascunho). O cartão "Pedido incompleto" aparece no Início e em Pedidos (`secaoRascunhos`); abrir Novo pedido ou editar com rascunho pergunta se continua. Um 401 grava o rascunho **antes** de `limparAuth`.
- **Só aviso, sem rascunho**: cadastros (`formularioRecolhivel`), Trocar senha, Minha empresa (dados) e a foto escolhida na visualização do pedido. Usa o `beforeunload` nativo; no pedido, o rascunho é gravado em `beforeunload` e `pagehide`.
- **Armadilhas**: salvar com sucesso precisa chamar `encerrarRascunho()` ou `limparGuarda()` **antes** de navegar, senão a guarda pergunta; `comBotaoOcupado` engole erros; a primeira entrada do histórico do documento não é interceptável (a página sai), mas o rascunho já está gravado.

## Sessão e cache

- O token e o nome ficam em `localStorage` (`retifica_auth`) e vão em toda chamada por `api()`. Um 401 limpa a sessão. A renovação chega no header `X-Auth-Refresh`.
- **Login automático**: hoje `garantirAutoLogin()` obtém o token sozinho em `POST /api/auth/auto-login`, e a tela de login e os botões Sair e Trocar senha ficam escondidos (ver [SAAS.md](SAAS.md#login-automático)).
- O service worker cacheia o shell do app; ao testar mudanças no navegador, desregistre-o e limpe os caches (`navigator.serviceWorker.getRegistrations()` e `caches.delete`), senão o teste roda em cima de JS antigo. O `sw.js` usa *stale-while-revalidate*: compara o texto novo com o do cache, atualiza sozinho e avisa as abas com o evento `retifica:nova-versao`. Subir a versão do cache (`retifica-shell-v10`) só é preciso para forçar uma reinstalação do zero, por exemplo ao mudar a lista de arquivos do shell.
- Leituras usam `comCache`/`carregarComCache`, e `cacheInvalidar` limpa as chaves afetadas depois de uma escrita.

- **Front novo em `/novo/`** (Angular, em migração; ver `frontend/README.md`): o `sw.js` ignora qualquer requisição sob `/novo/`, para nunca responder com o `index.html` antigo.
