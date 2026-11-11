# Testes do backend

Testes automatizados do backend (187 de Java + 15 de JavaScript hoje): isolamento entre empresas, regras de dinheiro, sessao,
integracoes, PDF, contratos da API e o ditado do pedido. Eles rodam contra um **Postgres descartavel local**, nunca contra o banco de producao.

## Como rodar

```bash
docker compose -f docker-compose.test.yml up -d --wait   # Postgres em localhost:5544, banco retificas_test, sem volume
mvn -pl core,backend -am test
docker compose -f docker-compose.test.yml down
```

Cada `up` comeca de um banco vazio. O Maven do IntelliJ serve (ver CONTEXTO.md).
O build da imagem Docker continua com `-DskipTests`.

## O que protege o banco de producao

- O `maven-surefire-plugin` (backend/pom.xml) define `DATABASE_URL`, `JWT_SECRET` etc. **sinteticos** para o
  processo de teste, sobrescrevendo o ambiente da sua maquina, e zera `WHATSAPP_*` e `ALTO_MEDIDAS_PAGAMENTO_URL`.
- `GuardaBancoLocal` aborta **antes de abrir qualquer conexao** se `DATABASE_URL` nao for
  `jdbc:postgresql://localhost|127.0.0.1:PORTA/retificas_test`, ou se alguma integracao externa estiver ligada.
  Ele proprio e testado em `GuardaBancoLocalTest`.
- `user.home` dos testes aponta para `backend/target/test-home` (o bootstrap nao escreve credenciais no seu home).
- Os testes usam e-mails `@example.test` e dados com sufixo aleatorio; nao usam ids reais (nada de pedido #129).

## Os testes

| Classe | O que garante |
|---|---|
| `IsolamentoEntreEmpresasTest` | Duas empresas (A = empresa 1, dona da integracao Alto Medidas; B = outra). O token de B nao le, altera, finaliza, apaga nem gera PDF de nada de A, e as listas e agregados (pedidos, encerrados, dashboard, clientes, cabecotes, catalogos, logo, Alto Medidas) nao misturam empresas. O recurso de A continua intacto depois de cada ataque. |
| `MatrizDeEndpointsTest` | Todo endpoint `/api/**` e `/health` esta classificado como `PUBLICO` ou `ISOLADO_POR_EMPRESA`; **endpoint novo sem classificacao quebra o teste**. Todo `/api/**` nao publico responde 401 sem token (ou com token malformado). Integracao do Alto Medidas recusa chave errada/vazia. |
| `GuardaBancoLocalTest` | A trava anti-producao recusa banco remoto, outro nome de banco e integracoes ligadas. |
| `PedidoTotaisTest` | Total do pedido: soma por categoria, desconto em valor (limitado ao subtotal) e percentual (arredonda meio para cima, limita em 100%), total nunca negativo. Unitario puro. |
| `JwtUtilTest` | Token preserva usuario e empresa; adulterado, de outra chave, expirado, `alg:none` e corpo trocado nao validam; renova so quando faltam menos de 7 dias e mantem a empresa. |
| `MesDeReferenciaTest` | Mes do filtro "Virabrequins do Daniel" pelo relogio de Brasilia (virada do mes e do ano), formatos de data e fallbacks. |
| `AltoMedidasRegrasTest` | Entrada idempotente que nunca desmarca o pago da DIH; validacoes (400); total devido (polimento, abatimento, nao pago, repassado); total geral igual em qualquer filtro de mes; pagamento (400/404/409, idempotente, pendente de sincronia). Totais conferidos por diferenca. |
| `SessaoEIntegracoesDesligadasTest` | Header `X-Auth-Refresh` (renova perto de expirar, mantem a empresa); com Alto Medidas sem chave a entrada da 503; WhatsApp sem token fica desligado e o envio da 503 sem tentar a rede. |
| `PedidoRegrasTest` | Pedido pela API: sincronizacao de itens (repetidos, prefixo estavel, troca no meio, descricao vazia, peca sem quantidade, categoria), totais gravados e recalculados, tipo de desconto/categoria/status desconhecidos, limites de texto (255/2000) e valores negativos, finalizar idempotente (carimbo exato no banco), encerrados por mes, dashboard, situacao atrasado/finalizado, cascade e orphanRemoval, tabela legada `pedido_categoria`, 409 ao apagar cliente/componente em uso, validacao dos cadastros e catalogos, PDF e `/health`. Cada teste usa uma empresa propria. |
| `AutenticacaoEEmpresaTest` | Login (e-mail normalizado, 401/400), troca de senha, dados da empresa (limites, `@` do Instagram, vazio de proposito) e logo (rejeita texto/GIF/vazio/8001 px/acima de 5 MB; reduz a 400 px; nova versao; remocao). |
| `LogoNormalizadorTest` | Normalizacao da logo sem subir o servidor: nao amplia, limita a 400 px mantendo a proporcao, JPEG vira PNG, rejeicoes. |
| `WhatsAppServiceTest` | Telefone brasileiro (DDI, DDD), parametro do modelo (quebra de linha, tab, espacos) e mensagem de erro da Meta. |
| `WhatsAppEnvioTest` | Envio com a API ligada contra um servidor falso no lugar da Meta: sobe o PDF e manda o modelo com 3 parametros; usa o PDF do aparelho; 429 para o mesmo pedido em menos de 60 s; 502 libera a reserva; 400/413/422/404 sem chamar a Meta. |
| `AltoMedidasSaidaTest` | Volta do pagamento contra um servidor falso: chave e corpo da chamada (`osId`, `pago`, `em` com -03:00), 2xx sincroniza, 500 deixa pendente com o motivo e o sincronizador repete, 404/409 encerram, servidor fora do ar nao derruba a marcacao, estado mudado durante o envio nao marca, erro truncado em 300, uma execucao por vez. |
| `PdfOrcamentoTest` | PDF do orcamento gerado em memoria: numero, cliente, itens, totais e desconto em reais, acentos, logo invalida ou ausente, contatos da empresa, varias paginas; `chaveItem` e `precisaCatalogoParaAgrupar`. |
| `CabecoteFaixaTest` | Faixas de medida: valor unico, faixa com hifen/travessao (sai com travessao), vazio limpa, texto nao numerico lanca. |
| `ContratoDeApiTest` | Conjunto exato de campos das respostas que o PWA consome (pedido, resumo, dashboard, encerrados, cliente, componente, catalogos, login, empresa, lista do Alto Medidas); payload no formato da Cloud Function (tipos do Firestore); envio simultaneo da mesma OS nunca duplica a linha; o schema criado pelo `update` passa no `validate` do Hibernate. |

Verificado por mutacao (isolamento): remover o filtro de empresa de `Cliente` (buscar, listar, deletar), `Cabecote.deletar`,
`ServicoCatalogo.deletar`, `PecaCatalogo.deletar`, `Pedido` (carregar com itens, deletar) e `OsAltoMedidas.listar`
deixa pelo menos um teste vermelho. `PedidoRepository.buscarPorId(id, empresaId)` nao e chamado por nenhum
controller do backend (so pelo desktop), por isso nenhum teste o exercita.

Verificado por mutacao (regras): tirar o limite do desconto, trocar o arredondamento, somar polimento sempre, incluir
repassadas no devido, deixar o reenvio desmarcar o pago, permitir pagamento apos repasse, mudar a janela de renovacao do
JWT e calcular o mes pelo UTC derrubam pelo menos um teste cada.

Verificado por mutacao (matriz completa): prefixo de itens sem conferir a descricao, 502 sem liberar a reserva, sem trava de
60 s por pedido, telefone fixo de 10 digitos, logo ate 800 px, finalizar mudando a data, 409 sem encerrar a repeticao e
sincronia marcando com o estado mudado.

### Ditado do pedido (ver [DITADO.md](DITADO.md))

| Classe | O que garante |
|---|---|
| `NormalizadorDitadoTest` | A barreira de seguranca: id inventado, de outra empresa ou do tipo errado e descartado (cliente, modelo, servico, peca e opcoes de pergunta); nome e categoria vem do catalogo; duvida com 1 candidato vira OK; limites de candidatos, itens, perguntas, opcoes; valores (negativo, NaN, acima do limite, soma por categoria); datas (passado, distante, mal formada); desconto, status e textos; ultima rodada sem perguntas; respostas nulas. Puro. |
| `PromptDitadoTest` | Prompt de sistema deterministico e ordenado por id (cache); sem telefone nem endereco; nomes com barra, tags ou quebras de linha nao quebram o formato nem fingem blocos; pre-filtro de clientes em catalogo grande; texto do usuario nao fecha as tags; mensagem de respostas montada pelas perguntas guardadas no servidor. Puro. |
| `LimiteESessoesDitadoTest` | Limite por empresa e global, devolver uso, virada do dia em Brasilia (nao em UTC); sessao so para a mesma empresa e usuario, validade renovada pelo uso, teto de 200 (nunca descarta uma em andamento), tranca de chamada em andamento. Relogio controlado. |
| `DitadoServiceTest` | O servico sem rede nem banco, com modelo falso roteirizado: desligado = 503, validacoes, ciclo pergunta e resposta, perguntas nao gastam uso, 4 chamadas no maximo, falha devolve o uso e nao avanca a rodada, 404 para sessao alheia, 429 no limite, 409 em chamada simultanea na mesma sessao, no maximo 4 chamadas simultaneas a IA. |
| `DitadoIntegracaoTest` | O SDK REAL da Anthropic contra um servidor falso no localhost, com banco real: o que sai (chave, modelo, saida estruturada, effort, cache, catalogo da empresa, sem telefone), o catalogo da outra empresa nunca vai, id de outra empresa na resposta e descartado, historico reenviado sem alteracao, 404 e 401, recusa/max_tokens/JSON invalido/HTTP 500/429 viram 502 sem gastar uso, 401 da Anthropic vira 503, limite diario, textos invalidos. |
| `SessaoEIntegracoesDesligadasTest` | (acrescimo) sem a chave da IA o status mostra desligado e as duas rotas respondem 503. |
| `static/ditado.js` (`node --test`) | A regra pura do front: preenche o pedido completo, o que falta vira pendencia com a aba certa, **nunca troca o que ja estava preenchido (vira conflito)**, nao duplica itens, escolher uma duvida resolve, respostas montadas, deteccao do reconhecimento de voz. |

Os testes de JavaScript rodam com `node --test backend/src/test/js/ditado.test.js` (precisa so do Node; nao ha `package.json`). No Bash do Windows
passe o caminho do arquivo: pasta e glob nao rodam nada.

O `GuardaBancoLocal` agora tambem aborta se `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN` ou `ANTHROPIC_BASE_URL` estiverem definidas no ambiente, e o
surefire as zera: uma chave real do seu computador nunca chega aos testes (a IA e ligada nos testes por propriedade do Spring, com chave falsa).

Verificado por mutacao (ditado): aceitar qualquer id sem validar no catalogo, aceitar candidatos sem validar, entregar a sessao a qualquer
empresa ou usuario, folga de 1 no limite por empresa, falha sem devolver o uso, texto do usuario fechando a tag, ultima rodada aceitando
perguntas, aceitar data no passado e carregar clientes de outra empresa derrubam pelo menos um teste cada. A tela foi percorrida no Chrome
contra um servidor falso: perguntas, escolha, resposta aberta, conferencia, preenchimento, rascunho e conflito com o formulario.

### Front em Angular (`frontend/`)

249 testes (vitest): pedidos (lista, filtros, busca sem acento, visualizar, finalizar, excluir, cache do orcamento em PDF, compartilhar com `navigator.share` simulado, foto com pdf-lib simulado, WhatsApp manual e pela API) e as demais telas ja migradas (lista vinda da API, corpo do POST/PUT igual ao do app atual, validacoes, confirmacao e 409 ao remover, invalidacao de cache, alternancia do dashboard, envio e remocao da logo) e os servicos de base: sessao compativel com o `localStorage` do app atual, interceptor (token, `X-Auth-Refresh`, 401 com nova tentativa unica, avisos), cache (mostra o guardado e revalida, descarta resposta atrasada), dialogos e guarda de saida, e a tela Inicio. Rodar com `npm test -- --watch=false` dentro de `frontend/`. Ainda nao ha ponta a ponta (Playwright entra nas proximas fases).

## Comportamento atual registrado (nao e aprovacao)

- `autoLoginPublicoEstaAtivoHoje`: `POST /api/auth/auto-login` responde 200 sem senha. Foi um risco aceito pelo dono
  em 12/09; quando for desligado, o teste deve passar a esperar 404.
- `pedidoNovoNaoVinculaClienteNemComponenteDeOutraEmpresa` aceita 200 (pedido criado **sem** o cliente de A)
  ou 400/404. Hoje a API responde 200 e ignora o cliente de outra empresa; se o comportamento passar a ser 400,
  o teste continua valendo.

- `textoComPontoESemVirgulaEhLidoComoDecimalNaoComoMilhar`: o texto `"1.250"` (sem virgula) vira 1,25, nao 1.250.
  Hoje o Alto Medidas manda o valor como numero, entao nao ha efeito; confirmar com quem cuida da Cloud Function.

- Entradas ruins que **hoje respondem 500** em vez de 400 (os testes aceitam 400 ou 500, nunca 2xx): item nulo na lista de
  servicos/pecas, `datEntregaEstimada` fora de `yyyy-MM-dd`, nome de cliente ou de componente acima de 255 caracteres.
- Envio simultaneo da mesma OS do Alto Medidas: o indice unico impede duplicar, mas alguns envios responderem 500 (a violacao
  nao e tratada). O teste aceita 200 ou 500 e exige uma unica linha.
- `DELETE` de recurso de outra empresa ou inexistente responde 204 e nao apaga nada (nos catalogos, pedidos e na rota geral).

## Como os servidores falsos funcionam

`ServidorFalso` sobe um servidor HTTP em `127.0.0.1` numa porta livre e faz o papel da Meta (`WHATSAPP_GRAPH_URL`) e da funcao
`dihPagamento` (`ALTO_MEDIDAS_PAGAMENTO_URL`). Nenhum teste sai da maquina. Abrir a lista de OS do Alto Medidas reenvia as OS
pendentes de forma assincrona; por isso esses testes filtram as chamadas pela OS do proprio teste e leem o estado pelo
repositorio quando precisam de uma foto exata.

## Fora desta etapa

- Desempenho (contagem de consultas / N+1) em `listar` e `encerrados`.
- A whitelist de `HIBERNATE_HBM2DDL` no `JPAUtil` (le `System.getenv` direto; testar exigiria uma pequena refatoracao).
- Ponta a ponta automatizado do PWA no navegador (a tela do ditado foi percorrida a mao; nao ha Playwright) e o desktop, que continua fora do build.
- **O plugin nativo de voz** (`android-app/`, `DitadoVozPlugin.java`): sem testes automatizados e sem celular nesta máquina. A lógica do lado do app (`ditadoVozNativa`) foi simulada em node com um plugin falso; o plugin Java só compila e foi conferido no APK (permissão do microfone, assinatura igual à do APK antigo). Precisa de teste nos aparelhos (S22 Ultra e S26).
- **O reconhecimento de voz em si** (microfone, permissao, Android e o APK) e a qualidade real da IA com a chave verdadeira: so testaveis em aparelho e com a chave.
