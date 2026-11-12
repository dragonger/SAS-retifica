# Lições e cuidados

Armadilhas já encontradas, para não repetir.

## Dados reais em produção

O banco de produção tem dados reais: um cliente real (o próprio dono), o **pedido #129**, 12 componentes técnicos Fiat (com faixas de medida móvel e fixo), cerca de 28 serviços e 14 peças de catálogo (a maioria com valor R$ 0,00 até o dono preencher), além das OS do Alto Medidas.

- **Nunca rode testes, scripts nem experimentos contra a produção.** Use o Postgres local ou o descartável de teste (`docker-compose.test.yml`); os testes automatizados têm uma trava que aborta se o banco não for local.
- O pedido #129 já foi finalizado por engano mais de uma vez por testes que tocaram o id errado. Se algo desse tipo acontecer, desfaça pelo banco: `UPDATE PEDIDO SET DATENTREGA = NULL WHERE ID = 129` (usando `psql`, não mais o H2).
- **Ao extrair o `id` de uma resposta JSON de `POST /api/pedidos`**, lembre que o objeto `cliente` aninhado também tem `"id"`, e ele aparece **antes** do `id` do pedido. Um `grep` ingênuo pega o id errado; parseie o JSON e confira a identidade antes de qualquer `PUT` ou `DELETE`.
- Dados de teste criados à mão devem ser apagados pela API logo depois.

## Spring Boot e Hibernate

- **`@PathVariable Long id` sem nome** quebra em runtime no Spring 7 (`Name for argument ... not specified`): é preciso `-parameters` (`maven.compiler.parameters=true`). Isso não aparece em `mvn compile`; só chamando `PUT`/`DELETE .../{id}`. Teste esses caminhos depois de qualquer upgrade grande.
- **Coluna nova com `hbm2ddl=update`** deixa as linhas antigas com `NULL`. Use getters defensivos e backfill ao adicionar colunas.
- **Pool de conexões do Hibernate** (o interno) não valida conexões e deu 500 depois que o Neon suspendeu o compute; por isso o HikariCP.
- Arquivos de `core/` tiveram caracteres corrompidos (UTF-8 lido como Windows-1252 e salvo de novo). Já foi corrigido; ao editar arquivos `.java` no Windows, mantenha UTF-8 sem BOM.

## PWA e navegador

- O service worker cacheia agressivamente; ao testar, desregistre-o e limpe os caches.
- **`window.open()` depois de um `await`** é bloqueado como pop-up. Mais grave: `window.open()` consome a "ativação transitória" do toque, e o `navigator.share()` chamado em seguida rejeita com `NotAllowedError`. Como `navigator.canShare()` é síncrono, decida **antes** de abrir qualquer aba; só reserve a aba em branco quando o compartilhamento nativo nem vai ser tentado.
- `navigator.share()` com arquivo no iOS/Safari exige estar bem perto do gesto do usuário (por isso o PDF é pré-buscado).
- Compartilhar com `files` junto de `text` ou `title` faz o WhatsApp descartar o PDF e mandar só o texto; mande apenas `files`.
- Duplo toque no compartilhar dá `InvalidStateError`; há uma trava (`compartilhamentoEmAndamento`).
- Na automação de navegador, o clique por coordenada às vezes não registra; disparar `elemento.click()` por JS é mais confiável.

## Railway

- **Mudar variável ou "redeploy" refaz o build a partir do Git** (remoto `SAS-retifica`), não do último `railway up`. Envie para os dois remotos antes (ver [PRODUCAO.md](PRODUCAO.md#como-publicar)).
- A porta em produção é a `8080` (variável `PORT` injetada pelo Railway), não a `8443`. Perdeu-se muito tempo "depurando a rede privada" quando era só a porta errada.
- Já existiu um serviço duplicado (`SAS-retifica`, criado ao conectar o repositório direto pelo painel, sem variáveis, que ficou crashado). Antes de criar outro serviço, confirme com `railway service list` que só existe um.
- O `railway` CLI não vem no PATH da sessão de shell.

## Integração com o Alto Medidas

O gatilho `enviarOsParaDih` do Alto Medidas roda também quando a própria função grava `dihEnviadaEm` e quando `dihPagamento` grava. Ele sai cedo porque nenhum dos dois altera `finalizado` nem `pagtoValidadoPor`: **não mude isso sem reavaliar o laço**.

## Processo

- Comandos encadeados com `&&` escondem erros: já aconteceu de um `git fetch` com argumento errado interromper a cadeia enquanto o `railway up` seguinte publicou código antigo.
- No PowerShell 5.1, `Set-Content -Encoding utf8` grava BOM, e o `javac` quebra com `illegal character: '﻿'`.
- O prefixo `!` para rodar comando no chat é uma instrução do Claude Code; ao colar um comando em um terminal PowerShell separado, não inclua o `!`.

- **Reconhecimento de voz repete o texto no Android.** No Chrome do Android o `SpeechRecognition` contínuo reenvia resultados finais e o `resultIndex` não é confiável; acumular por evento duplicava a fala. O `ditadoVoz` (app.js) monta o texto da sessão do zero a cada evento (e, como o Android entrega cada hipótese parcial como um resultado novo, um resultado que continua o anterior o substitui em vez de somar), fixa a base só em edição de teclado ou reinício da escuta e ignora o `input` que ele mesmo gera. Só dá para ver o defeito num aparelho real.
- **O Chrome do Android encerra a escuta sozinho e o que se fala no reinício se perde.** Não dá para manter o microfone aberto para sempre nem abrir um segundo reconhecedor em paralelo (o Android só libera o microfone para um por vez). O `ditadoVoz` religa na hora e avisa a tela (`aoPronto`): "Ligando o microfone… espere a vibração" em destaque enquanto o microfone volta, e uma vibração curta quando ele de fato voltou a ouvir (`onaudiostart`). Quem dita deve esperar o sinal depois de uma pausa longa.
- **O APK TWA não resolvia o corte de palavras.** Um TWA roda o Chrome por dentro, então o reconhecimento de voz era o mesmo. O app Capacitor (`android-app/`) troca só a voz por código nativo. Cuidados que custaram descobrir: o Gradle do Android 8.11 não roda com o Java 25 do IntelliJ nem com o 26 (usar o JDK 17 de `.jdks`); `EXTRA_SEGMENTED_SESSION` é um booleano; no Android 11+ o manifest precisa de `<queries>` para `android.speech.RecognitionService`, senão o app não enxerga o serviço de voz; o `sdkmanager` não lê o `y` das licenças pela entrada padrão neste terminal.
- **`railway up` envia a pasta raiz do projeto, não a pasta em que você está.** Para publicar o proxy, rode da raiz: `railway up --ci --service retifica-wake-proxy --path-as-root railway-wake-proxy`. Sem isso o Dockerfile do backend vai para o serviço do proxy e o deploy falha (o log mostra o Spring Boot pedindo `keystore.p12`). Os redeploys seguintes reaproveitam a imagem errada e falham igual. O `railway redeploy` também não corrige: o que corrige é um `up` certo. O proxy escuta `PORT` (8080 no Railway, `PORT=8080` definida no serviço) e o healthcheck é `/__proxy_health`.
- **Trocar o `RAILWAY_ACCOUNT_TOKEN` do proxy e do cron só é provado depois das 20h**: a checagem de inatividade do proxy só chama a API do Railway no horário fechado, e o cron só liga às 6h. Confira os logs do proxy depois das 20h30 (sem "Not Authorized") e o do cron às 6h (backend ligou sozinho).
- **Service worker antigo instalado prende o app antigo.** Num Chrome que ja tinha o PWA instalado, o `sw.js` antigo continuou respondendo `/novo/` com o `index.html` antigo a partir do Cache Storage, mesmo com a v10 (que ignora `/novo/`) publicada; recarregar nao resolveu. Com o worker removido e a v10 instalada do zero, `/novo/` veio do servidor e o service worker do Angular registrou-se em `/novo/` normalmente. Consequencia para a troca da raiz: publicar antes um `sw.js` de transicao que apaga os caches `retifica-*`, desregistra e recarrega as abas, servido com `Cache-Control: no-cache`, e testar num celular com o app antigo instalado antes de remover o app antigo.
