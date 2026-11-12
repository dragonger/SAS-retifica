# Envio automático do orçamento pelo WhatsApp (API da Meta)

O código já está pronto e **desligado**. Ele liga sozinho quando as variáveis
`WHATSAPP_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID` existirem no serviço
`retifica-backend` do Railway. Enquanto isso, o botão "Enviar no WhatsApp do
cliente" funciona no modo manual: salva o PDF e abre a conversa pelo link wa.me.

Com a API ligada, o botão vira "Enviar orçamento no WhatsApp do cliente". Ele
pede confirmação e manda o PDF direto pro número do cliente, sem abrir o
WhatsApp. O PDF enviado é o do aparelho, com a foto se tiver alguma. Se o envio
falhar, o app mostra o motivo e o botão volta ao modo manual.

## 1. Na Meta (uma vez só)

1. **Verificar a empresa** em business.facebook.com → Configurações →
   Central de segurança (CNPJ e documentos). Pode levar alguns dias.
2. Em developers.facebook.com, **criar um app** do tipo *Business* e adicionar
   o produto **WhatsApp**.
3. **Adicionar e verificar o número** do WhatsApp Business (WhatsApp Manager →
   Números de telefone).
   - Número já usado no app WhatsApp Business do celular: dá pra conectar pelo
     modo de "coexistência" da Meta, se estiver disponível na hora do cadastro.
     Sem ele, o número sai do app e passa a funcionar só pela API.
4. **Cadastrar um cartão** de pagamento na conta do WhatsApp Business. Contas
   brasileiras podem ser em reais (cobrança pela Facebook Brasil).
5. **Criar um usuário do sistema** (Configurações do negócio → Usuários →
   Usuários do sistema, tipo *Admin*). Atribuir a ele o app e a conta do
   WhatsApp e **gerar um token que não expira**, com as permissões
   `whatsapp_business_messaging` e `whatsapp_business_management`.
   Não use o token temporário de 24h da tela de teste.
6. Anotar o **Phone number ID**: é o identificador do número, não o número em
   si. Fica em WhatsApp → Configuração da API.

## 2. Modelo de mensagem (template)

Mensagem que a empresa inicia precisa seguir um modelo aprovado pela Meta. Crie
no WhatsApp Manager → Modelos de mensagem:

| Campo | Valor |
|---|---|
| Nome | `orcamento` |
| Categoria | **Utilidade** (Utility) |
| Idioma | Português (BR) — `pt_BR` |
| Cabeçalho | **Documento** |
| Corpo | ver abaixo |
| Rodapé (opcional) | `Retífica Dih Soluções` |

Corpo, com exatamente três variáveis e nessa ordem, que é a ordem que o
servidor envia:

```
Olá, {{1}}! Segue o orçamento nº {{2}} da Retífica Dih Soluções.
Modelo: {{3}}

Qualquer dúvida é só responder esta mensagem.
```

- `{{1}}`: primeiro nome do cliente (ex.: Cliente Exemplo)
- `{{2}}`: número do orçamento (ex.: 0001)
- `{{3}}`: modelo, o mesmo "Modelo" do PDF (ex.: Motor Tracker 2.0 Gasolina)

Pra aprovação a Meta pede exemplos. Use Cliente Exemplo / 0001 / Motor Tracker 2.0
Gasolina e um PDF de orçamento qualquer como exemplo do documento. Pode trocar
o texto fixo à vontade, desde que as três variáveis continuem com esse
significado e nessa ordem. Mudou o nome ou o idioma do modelo? Ajuste as
variáveis opcionais abaixo.

## 3. Variáveis no Railway (serviço `retifica-backend`)

| Variável | Obrigatória | Padrão | O que é |
|---|---|---|---|
| `WHATSAPP_TOKEN` | sim | — | token permanente do usuário do sistema (passo 5) |
| `WHATSAPP_PHONE_NUMBER_ID` | sim | — | Phone number ID (passo 6) |
| `WHATSAPP_TEMPLATE_NAME` | não | `orcamento` | nome do modelo |
| `WHATSAPP_TEMPLATE_LANG` | não | `pt_BR` | idioma do modelo |
| `WHATSAPP_API_VERSION` | não | `v23.0` | versão da Graph API |
| `WHATSAPP_GRAPH_URL` | não | `https://graph.facebook.com` | endereço base da Graph API (serve para apontar para um servidor falso em testes; o `WhatsAppEnvioTest` usa essa variável) |

O token é segredo. Configure pelo painel do Railway (Variables do serviço
retifica-backend), nunca em arquivo do repositório. Salvar a variável reinicia
o serviço, e no app basta recarregar a página pra aparecer o modo automático.

## 4. Testar

1. Abra um pedido de um cliente com o **seu próprio celular** cadastrado como
   telefone.
2. Toque em "Enviar orçamento no WhatsApp do cliente" e confirme.
3. O PDF deve chegar no WhatsApp desse número, com a mensagem do modelo.

Erros comuns, que o app mostra na tela:

- **Modelo inexistente, código 132001:** o modelo ainda não foi aprovado, ou o
  nome/idioma não bate com as variáveis.
- **Parâmetros não batem, código 132000:** o corpo do modelo não tem
  exatamente três variáveis.
- **Token inválido ou expirado, código 190:** gere o token permanente do
  passo 5.
- **Método de pagamento, código 131042:** falta cartão na conta.

## Custo

A Meta cobra por conversa de template, e os valores e as regras (inclusive para
respostas dentro da janela de 24h) mudam com o tempo. Conferir a tabela atual de
preços da Meta antes de ligar.

## Onde está no código

- `backend/.../whatsapp/WhatsAppService.java`: chamadas à Graph API (sobe o
  PDF em `/media` e manda o modelo em `/messages`).
- `backend/.../web/WhatsAppController.java`: `GET /api/whatsapp/status` e
  `POST /api/pedidos/{id}/whatsapp`, que aceita opcionalmente o PDF do aparelho
  no campo `pdf`.
- `frontend/src/app/core/whatsapp.service.ts`: botão na tela do pedido.
