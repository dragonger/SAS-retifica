# Integração com o Alto Medidas (virabrequins do parceiro)

O parceiro de virabrequins finaliza os virabrequins no app **Alto Medidas** (repositório de terceiro, com Firebase). Cada OS finalizada chega aqui sozinha; a DIH marca **"Cliente pagou"** na tela do parceiro (Alto Medidas, dentro do *Catálogo*); quando a DIH repassa ao parceiro, ele toca em **"Confirmar Pagamento / Confirmar recebimento"** no Alto Medidas e a OS vira *Já repassado* nos dois apps. O topo da tela mostra **quanto a DIH deve ao parceiro** (clientes que já pagaram, ainda não repassado).

**Exclusiva de uma empresa:** só a empresa definida em `ALTO_MEDIDAS_EMPRESA_ID` (a retífica original, empresa 1) usa a integração. Para qualquer outra empresa, inclusive as demonstrações abertas na tela de login, `/api/alto-medidas/status` responde `habilitado=false`, a tela e o cartão do Início não aparecem e as OS que chegam entram sempre na empresa configurada (`IsolamentoEntreEmpresasTest.altoMedidasSoEhVisivelParaEmpresaDaIntegracao`, `DemoTest`).

A integração fica **desligada** até as variáveis abaixo existirem: sem elas o servidor sobe normal, a entrada responde 503 e a tela não aparece.

## Como as duas pontas conversam

```
Alto Medidas (Cloud Functions)                    DIH (este backend)
 OS finalizada / parceiro confirma ──POST /api/integracoes/alto-medidas/os──▶ guarda a OS
   (header X-Api-Key = chave A)
 dihPagamento  ◀──────POST {osId, pago}────────── "Cliente pagou" / "Desfazer"
   (header X-Api-Key = chave B)
```

Duas chaves aleatórias (nunca no código, nunca no GitHub):

| Chave | Quem usa | Railway (backend da DIH) | Firebase (Alto Medidas) |
|---|---|---|---|
| **A** (entrada) | Alto Medidas → DIH | `ALTO_MEDIDAS_ENTRADA_KEY` | segredo `DIH_ENTRADA_KEY` |
| **B** (saída) | DIH → Alto Medidas | `ALTO_MEDIDAS_SAIDA_KEY` | segredo `DIH_SAIDA_KEY` |

Cada par precisa ter **o mesmo valor** dos dois lados. Para gerar (PowerShell): `[Convert]::ToBase64String((1..32 | % { Get-Random -Max 256 }) -as [byte[]])` — gere duas vezes.

## 1. Railway (serviço `retifica-backend`, aba Variables — pelo painel)

| Variável | Valor |
|---|---|
| `ALTO_MEDIDAS_ENTRADA_KEY` | chave A |
| `ALTO_MEDIDAS_SAIDA_KEY` | chave B |
| `ALTO_MEDIDAS_PAGAMENTO_URL` | URL da função `dihPagamento` (aparece no deploy do Firebase, no formato `<URL da função>`) |
| `ALTO_MEDIDAS_EMPRESA_ID` | opcional; empresa que recebe as OS (padrão `1` = DIH) |
| `ALTO_MEDIDAS_RETRY_MS` | opcional; de quanto em quanto tempo repete o que não foi avisado (padrão 600000 = 10 min) |

Cole as chaves **pelo painel** (não pelo terminal, para não deixar no histórico).

## 2. Firebase (o projeto Firebase do Alto Medidas, feito por quem tem acesso: o parceiro ou o dono do projeto)

```bash
firebase functions:secrets:set DIH_ENTRADA_KEY    # cola a chave A
firebase functions:secrets:set DIH_SAIDA_KEY      # cola a chave B
firebase deploy --only functions                  # na pasta do app Alto Medidas
```
- A URL da DIH vai no parâmetro `DIH_BASE_URL` (o padrão já é `https://retifica-backend-production.up.railway.app`, o domínio público, que passa pelo wake-proxy: se o backend estiver desligado, a entrada espera ele acordar; ver `docs/PRODUCAO.md`).
- As funções novas: `enviarOsParaDih` (ao finalizar / ao parceiro confirmar), `reenviarOsParaDih` (de hora em hora, reenvia o que não chegou **e na primeira execução manda as OS já finalizadas dos últimos 30 dias**) e `dihPagamento`.
- Publique também a nova versão do app do parceiro (mostra o botão "Confirmar recebimento" nas OS finalizadas e mantém visíveis as que aguardam repasse).

## 3. Conferir com uma OS de teste
1. No Alto Medidas, finalize uma OS de teste → em até alguns segundos ela aparece em *Aguardando o cliente pagar*.
2. Toque em **Cliente pagou** → no Alto Medidas a OS ganha o selo **PAGO**.
3. No Alto Medidas, o parceiro toca em **Confirmar recebimento** → na DIH ela vai para *Já repassado* e sai do total devido.

## Filtro de meses
A tela tem um seletor **Mês de finalização** (o mês, no horário de Brasília, em que o parceiro finalizou o virabrequim). As três listas e os subtotais são do mês escolhido; abre no mês de hoje (ou no mais recente que tem OS) e há a opção **Todos os meses**. O total **devido ao parceiro** é **sempre o geral**, de todos os meses (o mesmo do cartão do Início), e quando o mês escolhido tem só uma parte dele a tela mostra as duas — filtrar nunca esconde uma dívida antiga. API: `GET /api/alto-medidas/os?mes=AAAA-MM|todos`.

## Como o total é calculado
`valor` + `valorPolir` (só se a OS tem polimento) de cada OS **paga pelo cliente e ainda não repassada**. `valor` negativo (abatimento) entra subtraindo, como no PDF do Alto Medidas. A conta é feita no servidor.

## O que acontece quando algo falha
- **DIH fora do ar quando o parceiro finaliza:** a função tenta de novo sozinha e, se não der, o reenvio de hora em hora entrega depois. Nada se perde.
- **Alto Medidas fora do ar quando a DIH marca pago:** a marcação vale na hora (e entra no total); o app mostra *"Ainda não avisado ao Alto Medidas — vai tentar de novo sozinho"* e o servidor repete a cada 10 min enquanto estiver acordado, e quando alguém abre a tela. O servidor da DIH dorme fora do horário (wake-proxy); a repetição retoma quando ele acorda.
- **OS já apagada no Alto Medidas (30 dias)** ou **já confirmada pelo parceiro:** respostas 404/409 encerram a repetição.
- A DIH guarda a **cópia permanente** de cada OS; o Alto Medidas apaga as finalizadas em 30 dias.
- **Depois que o parceiro confirma o recebimento**, a DIH não consegue mais desfazer o "cliente pagou" daquela OS (409).

## Regras de segurança
- A entrada compara a chave em tempo constante; sem `ALTO_MEDIDAS_ENTRADA_KEY` responde 503; chave errada, 401.
- As rotas públicas do backend são `/api/auth/**`, `/health` e `/api/integracoes/**` (esta, só com a chave `X-Api-Key`); todas as rotas da tela (`/api/alto-medidas/**`) exigem o token da DIH. `/status` só habilita a tela para a empresa `ALTO_MEDIDAS_EMPRESA_ID`; as demais rotas filtram pela empresa do token, então outra empresa vê listas vazias e recebe 404 ao tentar marcar a OS de outra.
- Se uma chave vazar, gere outra e troque nos dois lados.
