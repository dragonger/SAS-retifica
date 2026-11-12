# Ditar o pedido por voz (com perguntas de esclarecimento)

Na tela de **novo pedido** há um botão **"Ditar pedido"**. A pessoa fala (ou escreve) o pedido, uma IA (Claude Haiku 5.5) lê o texto junto com o catálogo da empresa e devolve o que entendeu. Quando algo fica ambíguo ou falta, a IA **pergunta**. Depois vem uma tela de conferência; ao confirmar, o formulário é preenchido. **Nada é salvo sozinho**, e o que a pessoa já tinha preenchido **nunca é trocado**: a diferença aparece como conflito na conferência.

**Ligado em produção** (a `ANTHROPIC_API_KEY` está configurada no serviço `retifica-backend` do Railway). O recurso só existe quando essa variável está presente: sem a chave, o botão não aparece e as rotas respondem 503.

## Como funciona

```
celular / computador                       backend (Railway)                    Anthropic
  fala  ──(navegador transcreve)──▶ texto
  POST /api/ditado {texto} ─────────────▶ monta o prompt com o catálogo DA EMPRESA ──▶ Claude Haiku 5.5
                                          valida tudo que a IA devolver           ◀── entendimento + perguntas
  ◀── entendimento + perguntas (já validados)
  pessoa responde (toque, voz ou texto)
  POST /api/ditado/{id}/respostas ──────▶ reenvia o histórico + as respostas ───▶ ...   (até 3 rodadas de perguntas)
  conferência ──▶ "Preencher formulário"  (rascunho do pedido; a pessoa confere e salva como sempre)
```

- **Perguntas:** a IA pergunta quando algo dito ficou ambíguo (por exemplo, dois clientes "João") e também quando falta algo que o pedido precisa: cliente, modelo, ao menos um serviço ou peça, o valor de serviços/peças de cada categoria e a data de entrega. Não pergunta por descrição, observação, desconto nem situação. No máximo 3 perguntas por rodada e 3 rodadas por ditado (4 chamadas à IA no total). Perguntas de escolha viram botões; as abertas aceitam resposta falada ou digitada.
- **Conferência:** mostra ✔ entendido, dúvida (com opções para tocar), não achei, o que já estava no formulário e conflita, e o que ficou pendente. Valores e data são editáveis; cada linha pode ser removida.
- **Cliente não cadastrado:** o ditado não cria cadastros. Abre o cadastro rápido de cliente, com o nome já preenchido.
- **Só em pedido novo.** Ditar para acrescentar itens a um pedido existente fica para uma próxima versão.

## Como ligar

1. Crie uma chave de API no Console da Anthropic (console.anthropic.com). **Defina lá um limite de gasto mensal**: é a rede de segurança de verdade (ver "Limites").
2. No painel do Railway, serviço `retifica-backend`, aba Variables, crie `ANTHROPIC_API_KEY` com a chave. **Pelo painel**, nunca em arquivo do repositório nem em chat.
3. Salvar a variável reinicia o serviço. No app, recarregue a página: o botão "Ditar pedido" aparece no novo pedido.
4. Teste com um pedido de mentira (por exemplo, falando o nome de um cliente de teste) antes de usar com os reais.

**Para desligar:** apague a variável `ANTHROPIC_API_KEY`.

## Variáveis (todas opcionais, menos a chave)

| Variável | Padrão | O que é |
|---|---|---|
| `ANTHROPIC_API_KEY` | — (sem a chave, o recurso fica desligado) | Chave da API. Em produção ela está configurada; sem ela o ditado fica desligado. |
| `DITADO_MODELO` | `claude-haiku-5-5` | Modelo usado. Subir para um mais capaz (por exemplo `claude-sonnet-5-5`) custa mais por ditado. |
| `DITADO_EFFORT` | `low` | Quanto a IA "pensa": `low`, `medium`, `high`, `xhigh` ou `max`. |
| `DITADO_LIMITE_DIA` | `100` | Ditados por empresa por dia. |
| `DITADO_LIMITE_GLOBAL_DIA` | `300` | Ditados por dia no total (todas as empresas). |
| `DITADO_TIMEOUT_S` | `30` | Tempo máximo de cada chamada à IA, em segundos. |
| `DITADO_MAX_RETRIES` | `1` | Novas tentativas do SDK quando a chamada falha por rede ou 5xx. |
| `ANTHROPIC_BASE_URL` | — | **Só nos testes**: aponta para um servidor falso. Não defina em produção. |

## Custo e limites

- **Custo estimado** (Haiku 5.5, US$ 0,10 por milhão de tokens de entrada e US$ 0,50 por milhão de saída): cerca de **US$ 0,002 por chamada** com um catálogo de uns 8 mil tokens (menos de 1 centavo de real). O prompt do sistema (regras + catálogo) vai com cache de prompt, então as rodadas seguintes do mesmo ditado, e ditados seguidos da mesma empresa em 5 minutos, saem mais baratos. Os números reais aparecem no log (`Ditado: modelo=... entrada=... saida=... cache_lido=...`).
- **Limites do app:** 100 ditados por empresa por dia e 300 no total. **Um ditado conta 1 uso**, reservado ao começar e devolvido se a primeira chamada à IA falhar. As perguntas de esclarecimento não contam. No pior caso, são 4 chamadas por uso (menos de US$ 1 por dia por empresa).
- Os contadores ficam **em memória** e zeram quando o backend reinicia (deploy ou desligamento da noite). Servem como trava de custo, não como contabilidade. **O limite de gasto do Console da Anthropic é a proteção que vale**, e é por isso que ele é o passo 1 de "Como ligar".
- **Por que existe um teto global:** o login automático deixa qualquer pessoa com a URL obter um token; sem teto, alguém poderia gastar a sua cota.
- Texto de no máximo 2000 caracteres; respostas de no máximo 300; até 4 ditados ao mesmo tempo (os demais recebem 429 "tente de novo em instantes").

## O que é enviado, e para quem

- **Áudio:** é transcrito pelo **navegador**. No Chrome, o reconhecimento de voz envia o áudio aos servidores do Google; no Safari, à Apple. O backend nunca recebe áudio.
- **Texto:** vai para a **Anthropic**, junto com o catálogo **da empresa do usuário**: nomes e municípios dos clientes, nomes e categorias dos componentes, serviços e peças. **Não vão** telefone, endereço, valores, pedidos nem dados de outras empresas.
- O app mostra um aviso na primeira vez que o recurso é usado. Para LGPD, o dono deve avaliar o contrato com a Anthropic e a necessidade de informar os clientes finais; este documento descreve os fatos, não é parecer jurídico.
- O texto ditado e as respostas não são gravados no banco. As sessões de ditado ficam só em memória, por até 20 minutos.

## Segurança

- **A IA não é confiável por definição.** Tudo que ela devolve passa pelo `NormalizadorDitado` (puro, sem Spring nem banco), que:
  - descarta qualquer id que não exista no catálogo **da empresa do token** (id inventado, de outra empresa ou do tipo errado) e usa nome e categoria **do catálogo**, nunca o texto da IA;
  - limita datas (não no passado, até 1 ano à frente), valores (0 a 1.000.000), quantidades (1 a 999), tamanhos de texto e número de itens, perguntas e opções;
  - na última chamada, não aceita perguntas.
- **Injeção de prompt:** o texto ditado vai entre `<ditado>` e as respostas entre `<resposta>`, e as regras dizem que ali é dado, nunca instrução. Mesmo que a IA obedecesse um texto malicioso, ela só consegue preencher campos que o normalizador valida, e nada é salvo sozinho. O texto do usuário não consegue fechar essas tags.
- **A conversa fica no servidor**, não no app: o histórico enviado à IA nunca passa pelo cliente, e a mensagem com as respostas é montada pelo servidor a partir das perguntas que ele mesmo guardou (o app só diz qual opção ou escreve um texto). Cada sessão só existe para a empresa e o usuário que a criaram (outro recebe 404).
- A chave fica só na variável de ambiente; o cliente da API é criado só com ela (não lê tokens nem perfis do ambiente).

## API

| Rota | Corpo | Respostas |
|---|---|---|
| `GET /api/ditado/status` | — | `{habilitado, usosRestantesHoje}` |
| `POST /api/ditado` | `{texto}` | 200 resultado; 400 texto vazio ou grande; 429 limite diário, limite global ou ocupado; 502 falha da IA; 503 desligado ou chave recusada |
| `POST /api/ditado/{id}/respostas` | `{respostas:[{perguntaId, opcaoIndice? \| texto?}]}` | 200; 400 resposta inválida; 404 sessão expirada ou de outra empresa; 409 rodadas esgotadas ou chamada em andamento; 429; 502; 503 |

Resultado: `{sessaoId, rodada, maxRodadas, situacao: "PERGUNTAS"|"PRONTO", perguntas, entendimento, avisos, usosRestantesHoje}`. O estado de cada campo é `OK`, `DUVIDA` (com opções), `NAO_ENCONTRADO`, `AUSENTE` ou, só para serviços e peças, `LIVRE` (texto livre, sem catálogo).

## Limitações conhecidas

- **Sessão em memória:** se o backend reiniciar no meio de um ditado (deploy ou desligamento), a conversa se perde. O app percebe (404) e recomeça sozinho com o texto original mais as respostas já dadas, gastando 1 uso.
- **Catálogo muito grande:** acima de uns 60 mil tokens, os clientes são pré-filtrados (os que combinam com o que foi dito mais os 200 mais recentes). Se só os componentes, serviços e peças já passarem do limite, o ditado responde 502 "catálogo grande demais".
- **Navegadores:** o reconhecimento de voz funciona no Chrome (Android e computador) e no Safari do iPhone; precisa de HTTPS e da permissão do microfone. No Firefox não há reconhecimento: o painel mostra só a caixa de texto (o microfone do teclado do celular também serve). O **APK TWA antigo** usava o Chrome por dentro e tinha o mesmo problema. O **APK novo** (Capacitor, [android-app/LEIA-ME.md](../android-app/LEIA-ME.md)) usa o reconhecimento de voz nativo do Android; no Android 13 ou mais novo o microfone fica aberto entre as pausas e não corta palavras no reinício. Isso **precisa ser confirmado nos aparelhos**.
- **Primeira versão só em pedido novo**, e a IA não tem acesso a pedidos anteriores.
- Todas as empresas usam a **mesma chave e o mesmo teto global**; o gasto não é medido por empresa (ver [docs/SAAS.md](../docs/SAAS.md)).

## Erros comuns

- **O botão não aparece:** a chave não está configurada, o backend estava dormindo quando o app abriu (recarregue) ou o app está em cache antigo (o aviso de nova versão resolve).
- **"A IA do ditado não está configurada corretamente" (503):** a Anthropic recusou a chave. Confira a `ANTHROPIC_API_KEY` e o saldo/limite no Console.
- **"A IA está ocupada" ou "não conseguiu responder" (502):** falha temporária; o uso é devolvido e basta tentar de novo.
- **"O limite de N ditados por dia foi atingido" (429):** preencha à mão ou tente amanhã; o limite vira à meia-noite de Brasília.

## Onde está no código

- `backend/.../ditado/`: `DitadoService` (orquestra), `NormalizadorDitado` (barreira de segurança), `PromptDitado`, `EsquemaDitado`, `AnthropicModeloDitado` (SDK da Anthropic), `CatalogoDitado`, `SessoesDitado`, `LimiteDitado`; controller em `backend/.../web/DitadoController.java`.
- `frontend/src/app/shared/ditado-regra.ts`: regra pura do front (transforma o entendimento em dados do formulário, sem nunca sobrescrever); o painel (microfone, perguntas, conferência) está em `telas/pedido-form/ditado-overlay`.
- Testes: ver [TESTES.md](TESTES.md). Nenhum teste usa uma chave real: o SDK fala com um servidor falso no localhost.
