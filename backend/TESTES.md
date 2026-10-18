# Testes do backend

Primeiros testes automatizados do projeto: auditoria do isolamento entre empresas.
Eles rodam contra um **Postgres descartavel local**, nunca contra o banco de producao.

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

Verificado por mutacao (isolamento): remover o filtro de empresa de `Cliente` (buscar, listar, deletar), `Cabecote.deletar`,
`ServicoCatalogo.deletar`, `PecaCatalogo.deletar`, `Pedido` (carregar com itens, deletar) e `OsAltoMedidas.listar`
deixa pelo menos um teste vermelho. `PedidoRepository.buscarPorId(id, empresaId)` nao e chamado por nenhum
controller do backend (so pelo desktop), por isso nenhum teste o exercita.

Verificado por mutacao (regras): tirar o limite do desconto, trocar o arredondamento, somar polimento sempre, incluir
repassadas no devido, deixar o reenvio desmarcar o pago, permitir pagamento apos repasse, mudar a janela de renovacao do
JWT e calcular o mes pelo UTC derrubam pelo menos um teste cada.

## Comportamento atual registrado (nao e aprovacao)

- `autoLoginPublicoEstaAtivoHoje`: `POST /api/auth/auto-login` responde 200 sem senha. Foi um risco aceito pelo dono
  em 12/09; quando for desligado, o teste deve passar a esperar 404.
- `pedidoNovoNaoVinculaClienteNemComponenteDeOutraEmpresa` aceita 200 (pedido criado **sem** o cliente de A)
  ou 400/404. Hoje a API responde 200 e ignora o cliente de outra empresa; se o comportamento passar a ser 400,
  o teste continua valendo.

- `textoComPontoESemVirgulaEhLidoComoDecimalNaoComoMilhar`: o texto `"1.250"` (sem virgula) vira 1,25, nao 1.250.
  Hoje o Alto Medidas manda o valor como numero, entao nao ha efeito; confirmar com quem cuida da Cloud Function.

## Fora desta etapa

Itens P1/P2 da matriz de testes do relatorio de analise: sincronizacao de itens do pedido, cascade/orphanRemoval, validacoes
de texto, PDF, WhatsApp habilitado (contra WireMock), sincronizador do Alto Medidas, contratos de DTO e build do desktop.
O desktop continua fora do build.
