# Integrar o Zernio no seu aplicativo

**O prompt completo para o Claude Code construir certo da primeira vez.**

---

## O que é isto

O Zernio é uma API que unifica WhatsApp, Instagram DM, Facebook Messenger e mais uma dúzia
de plataformas atrás de um único contrato: uma API key, um webhook, uma caixa de entrada.
Poupa tratar com a Meta diretamente — sem App Review, sem Business Verification, sem
manter três integrações distintas que se comportam de forma distinta.

O que segue não é documentação. É o **prompt** que você passa ao Claude Code para que
construa a integração, com as restrições que normalmente só se aprendem depois
de quebrar produção duas ou três vezes.

**Como usar:** copie cada bloco no Claude Code, em ordem. Cada um deixa algo que
funciona. Se você tiver pressa, cole os oito de uma vez e deixe trabalhar.

**Serve para qualquer stack.** Os exemplos mencionam Next.js porque é onde está
construído, mas cada regra é da API do Zernio, não do framework. Troque "route
handler" por "endpoint de Express / FastAPI / Laravel" e o resto se mantém.

---

## Antes de começar

Crie a conta em [zernio.com](https://zernio.com), tire a sua API key e guarde estas
variáveis. Nunca no cliente: **a API key vive só no servidor.**

```bash
ZERNIO_API_KEY=sk_...              # a sua chave
ZERNIO_API_BASE=https://zernio.com/api/v1
ZERNIO_PROFILE_ID=                 # opcional: agrupa contas por cliente
ZERNIO_WEBHOOK_SECRET=             # você gera, 32+ caracteres aleatórios
APP_BASE_URL=https://seu-app.com   # sem isto o webhook se registra apontando para localhost
```

---

## Prompt 1 — O cliente HTTP

```
Construa um cliente HTTP para a API do Zernio (https://zernio.com/api/v1)
com estas regras:

- Autenticação por header: Authorization: Bearer <ZERNIO_API_KEY>.
  A key se lê de variáveis de ambiente e NUNCA se expõe ao navegador.

- O cliente NUNCA lança exceções. Tudo volta como um Result discriminado:
    { success: true, data }
    { success: false, error: { status, code, message, retryAfter } }
  Motivo: este cliente se chama a partir de webhooks e workers onde uma exceção
  não capturada mata o processo e perde a mensagem.

- Timeout de 15 segundos por request (AbortSignal.timeout ou equivalente).

- Nova tentativa automática SÓ em 429, 502, 503, 504 e timeout. Nunca num 4xx
  de validação: tentar de novo um 400 é queimar cota para obter o mesmo 400.
  Backoff exponencial com jitter, e se a resposta traz Retry-After, esse
  valor manda.

- Uma opção noRetry para os chamadores com orçamento de tempo apertado
  (o handler do webhook, por exemplo).

- Suporte a headers extras, em particular Idempotency-Key: o Zernio replica a
  resposta original em vez de reenviar a mensagem se você repetir a request
  dentro de 24 horas. É a diferença entre um timeout e um cliente que
  recebe a mesma mensagem duas vezes.

- Faça o parse do corpo de erro buscando message e code; se não houver JSON válido,
  guarde o texto cru. Os erros do Zernio são legíveis e perdê-los te
  deixa depurando no escuro.
```

---

## Prompt 2 — Conectar contas

```
Implemente a conexão de contas do Zernio. Endpoints:

  GET  /v1/accounts                        contas já conectadas
  GET  /v1/profiles                        perfis (agrupadores)
  GET  /v1/connect/{platform}              devolve { authUrl } para o OAuth
  POST /v1/connect/whatsapp/credentials    conexão headless de uma WABA própria

FLUXO OAUTH (Instagram, Messenger, WhatsApp novo)
O SERVIDOR pede a authUrl passando redirect_url, e devolve ao navegador
UNICAMENTE essa URL, que se abre num popup. A API key não cruza para o cliente.

Dois parâmetros que não são opcionais embora a doc os apresente assim:

- WhatsApp, "onboarding":
    business_app -> coexistência. O número continua vivo no app WhatsApp
                    Business do celular, e o que o humano responde dali
                    também chega ao seu aplicativo. É o caso normal de
                    um negócio pequeno.
    api          -> mostra o seletor de WABA da Meta e tira o número do
                    telefone. Só serve se o número JÁ está na Cloud API.

  Se você escolher "api" com um número que vive no app WhatsApp Business, a Meta o
  lista como "não cumpre os requisitos". Isso NÃO é um problema do número: é
  o sintoma de ter escolhido o modo errado. Exponha a escolha na sua
  interface antes de conectar, não a esconda.

- Instagram, "loginMethod":
    instagram_login -> autoriza a conta profissional diretamente, sem
                       necessidade de uma Página do Facebook. Use por padrão.
    facebook_login  -> passa por uma Página com Instagram vinculado e adiciona um
                       passo a mais de seleção.

CONEXÃO HEADLESS (BYO-WABA)
Quando o número já está dentro de uma WABA, o Embedded Signup do navegador
não serve: a Meta não re-onboarda um número que já pertence a uma WABA. O
caminho é POST /v1/connect/whatsapp/credentials com:

  accessToken     System User token PERMANENTE da Meta, com as permissões
                  whatsapp_business_management e whatsapp_business_messaging.
                  Um token temporário do console funciona hoje e falha em 24h.
  wabaId
  phoneNumberId
  pin             o PIN de verificação em dois passos do número. Se o número
                  o tem ativado (qualquer número de negócio real o tem)
                  e você não o manda, a Meta responde erro 133005 e o número fica
                  conectado mas sem poder enviar.

O número e a WABA continuam sendo do cliente. O Zernio só recebe credenciais
para operá-la.

PERSISTÊNCIA
Guarde o accountId do Zernio na sua base com índice único: é a chave com a
qual você roteia as mensagens recebidas para o cliente correto. Cuidado, o Zernio
devolve o identificador como "id" nuns endpoints e "_id" noutros;
normalize numa única função.
```

---

## Prompt 3 — O webhook que recebe

Esta é a parte onde se perdem as tardes. Quatro regras, e as quatro são
consequência de como o Zernio entrega.

```
Crie o endpoint público que recebe os webhooks do Zernio. Quatro regras
obrigatórias:

1. VERIFICAR A ASSINATURA, SOBRE O CORPO CRU
   HMAC SHA256 do body com ZERNIO_WEBHOOK_SECRET, comparado contra o header
   X-Zernio-Signature. Vem em hex minúscula e SEM o prefixo "sha256=" que
   a Meta usa.
   - Leia o corpo como texto ANTES de fazer o parse. Se você fizer JSON.parse e depois
     stringify, mudam os espaços e a assinatura nunca valida.
   - Compare com uma função de tempo constante (timingSafeEqual), validando
     que os comprimentos coincidam antes: timingSafeEqual lança se diferirem.
   - Fail-closed: sem segredo configurado, rejeite. Um webhook público sem
     assinatura deixa que qualquer um injete mensagens falsas na sua caixa de entrada.

2. RESPONDER 2xx EM MENOS DE 5 SEGUNDOS
   Passado esse tempo o Zernio tenta de novo até 7 vezes e depois manda o evento
   para uma dead-letter queue. O handler deve importar o MÍNIMO e fazer o
   trabalho pesado em segundo plano (after() no Next.js, uma fila noutro
   stack), com imports dinâmicos. Se o seu handler arrasta o grafo inteiro do
   aplicativo, o cold start sozinho come o orçamento de tempo.

3. IDEMPOTÊNCIA REAL, NÃO "acho que não se repete"
   O Zernio entrega at-least-once. Tabela webhook_events com o id do evento
   como PRIMARY KEY, e insert com ON CONFLICT DO NOTHING como PRIMEIRO passo: se
   você não inseriu a linha, alguém mais já pegou o evento; devolva 200 e corte.
   Uma única ida e volta, sem condições de corrida.
   O id sai do header X-Zernio-Event-Id ou do campo id do payload; se não
   vier nenhum, use o SHA256 do corpo cru, que continua deduplicando entre
   novas tentativas do mesmo evento.

4. UMA VARREDURA DE RECUPERAÇÃO
   Como a nova tentativa do Zernio se auto-deduplica contra a sua tabela, se o
   processamento em segundo plano morre o evento fica reivindicado e ninguém o
   reprocessa jamais. Você precisa de um endpoint que varra os eventos em estado
   'received' com mais de dois minutos e os reprocesse, com um teto de tentativas.
   Proteja-o com um segredo por header.

Além disso: guarde o payload completo numa coluna JSON. Quando algo sair estranho
em produção, esse payload é a única prova do que chegou de verdade.
```

---

## Prompt 4 — Registrar o webhook por API

```
Escreva um script que dê de alta o webhook no Zernio sem passar pelo
dashboard, contra /v1/webhooks/settings (GET lista, POST cria, PUT atualiza,
DELETE apaga).

  node scripts/zernio-webhook.mjs                       lista os existentes
  node scripts/zernio-webhook.mjs --url https://seu.app cria ou atualiza
  node scripts/zernio-webhook.mjs --url ... --test      dispara um webhook.test

CRÍTICO: busque primeiro por NOME e faça PUT se já existe. O Zernio tolera até
50 webhooks por usuário e NÃO valida URLs duplicadas: sem essa busca, cada
corrida do script soma mais uma entrega do mesmo evento, e você termina
processando tudo três vezes sem entender por quê.

Assine esta lista completa. Assinar menos deixa buracos silenciosos:
sem message.sent você não vê no seu aplicativo o que o humano respondeu a partir do
app de Instagram do celular.

  conversation.started
  message.received      message.sent
  message.delivered     message.read
  message.failed        message.edited      message.deleted
  account.connected     account.disconnected

Mostre também o contador de falhas de entrega na listagem: o Zernio DESLIGA
a assinatura depois de 10 falhas consecutivas. Um deploy quebrado que devolva
500 um tempo a deixa inativa, e ninguém avisa.

O ZERNIO_WEBHOOK_SECRET tem que ser idêntico em três lugares: o seu ambiente
local, a sua hospedagem de produção e a assinatura do Zernio. Se não coincidirem,
o seu endpoint devolve 401 e as mensagens entram no Zernio mas nunca chegam ao seu
aplicativo, sem nenhum erro visível do seu lado.
```

---

## Prompt 5 — Normalizar os eventos

```
Implemente o processador de eventos. O envelope de todo webhook é:

  { id, event, timestamp, message?, conversation?, account? }

Os campos concretos variam por evento, então leia-os de forma defensiva.

SETE COISAS QUE NÃO SÃO ÓBVIAS:

1. O REST e o webhook NÃO têm a mesma forma para a mesma entidade.
     Webhook:  message.text     message.sender.id   sentAt     platformMessageId
     REST:     message.message  message.senderId    createdAt  (sem platformMessageId)
   São dois contratos distintos. Escreva DOIS adaptadores para o seu modelo
   interno, não um só que tente cobrir ambos.

2. message.sent inclui o que o seu próprio aplicativo enviou.
   É o eco do seu próprio envio voltando pelo webhook. Se você não deduplicar,
   cada mensagem que o seu aplicativo manda aparece DUAS VEZES na caixa de entrada,
   embora ao cliente chegue uma só. A chave está no prompt 6: guardar
   o id que o envio devolve.

3. Os eventos chegam fora de ordem.
   message.delivered pode chegar antes de o mensagem existir. Não falhe:
   marque o evento para nova tentativa e deixe que a varredura o pegue depois.

4. A direção vem como incoming / outgoing. Normalize para a sua convenção num
   único lugar.

5. WhatsApp: o telefone pode não vir.
   Desde o rollout de BSUID, um usuário com username escreve sem expor o
   número: sender.phone é nullable e a âncora estável é
   sender.businessScopedUserId. Guarde as identidades numa tabela à parte
   (uma linha por identificador, com índice único), não como coluna do
   contato. Se não, essas mensagens criam um contato novo toda vez.

6. A conversa não é o contato.
   Uma mesma pessoa pode te escrever por WhatsApp e por Instagram, e esses dois
   fios não se misturam: são conversas distintas do mesmo contato.
   Modele conversations como entidade própria, com (canal, external_id).

7. O metadata traz a atribuição, e quase ninguém a usa.
   Os campos ctwa_* (Click To WhatsApp Ads) e meta_ad_* dizem de qual anúncio
   veio o lead: id do anúncio, título, URL de origem. Persista-os. É a
   diferença entre "entraram 40 consultas" e "o anúncio B trouxe 40 consultas
   e o A nenhuma".

Ponha o índice único de deduplicação sobre o id da mensagem na plataforma.
Se você tiver dois provedores convivendo durante uma migração, faça sobre o id
SOZINHO, não sobre (provedor, id): o mesmo wamid pode entrar por dois webhooks
distintos e com chave composta se duplicaria.
```

---

## Prompt 6 — Enviar mensagens

```
Implemente o envio. Há DOIS endpoints e confundi-los é o erro mais comum:

  POST /v1/inbox/conversations/{id}/messages   dentro de um fio que JÁ existe
  POST /v1/inbox/conversations                 abrir um fio novo

REGRA DE OURO: um único caminho de saída em todo o seu código. Uma função
enviarMensaje() que decide o endpoint, o provedor e a persistência. Assim
que há dois lugares que enviam, se desalinham, e você termina com mensagens
que saíram mas não estão na sua base.

A JANELA DE 24 HORAS O SEU SERVIDOR DECIDE
Guarde last_inbound_at na conversa e compare antes de enviar:
  - Dentro da janela: texto livre nos três canais.
  - Fora, no Instagram e no Messenger: continua sendo possível com
    messageTag: "HUMAN_AGENT" + messagingType: "MESSAGE_TAG" (vale 7 dias).
  - Fora, no WhatsApp: NÃO há texto livre. Só um template aprovado.
Não deixe que o usuário descubra com um erro da API: desative o campo
na interface e explique por quê.

TEMPLATES: o formato muda conforme o endpoint
  - Dentro de um fio:
      template: { elements: [ { name, language, components } ] }
    onde components é a estrutura da Meta.
  - Para abrir um fio:
      templateName, templateLanguage, templateParams
    templateParams NÃO são components: é um array PLANO de valores, na ordem
    em que aparecem — primeiro as variáveis do header, depois as do body, e
    no final uma por cada botão de URL dinâmica.
  Escreva uma função que achate os components nesse array. Sem template,
  abrir conversa devolve TEMPLATE_REQUIRED: o WhatsApp não permite abrir um
  fio com texto livre.

O ID DE RESPOSTA VIVE UM NÍVEL PARA DENTRO
O Zernio responde { success: true, data: { messageId, conversationId } }.
Se você ler res.messageId obtém undefined e grava a linha sem id externo.
A consequência exata: o webhook message.sent chega com o eco dessa mesma
mensagem, o seu índice único não pode freá-lo porque a linha anterior tem NULL,
e a mensagem aparece duas vezes na caixa de entrada. Leia data.messageId, e como
respaldo data.messageIds[0] — Facebook e Instagram partem anexo + texto em
duas mensagens.

Como rede de segurança adicional, ao ingerir um message.sent de saída: se já
existe uma linha de saída recente (últimos dois minutos) com o mesmo texto e
sem id externo, ADOTE-A em vez de inserir outra.

IDEMPOTÊNCIA AO ENVIAR: mande Idempotency-Key com um identificador estável dessa
tentativa de envio. Se a sua request morre por timeout depois de o Zernio já
ter enviado, a nova tentativa não manda a mensagem duas vezes.
```

---

## Prompt 7 — Importar o histórico

```
Implemente a importação de conversas existentes:

  GET /v1/inbox/conversations                  (paginado)
  GET /v1/inbox/conversations/{id}/messages    (paginado)

- A paginação é por cursor: siga pagination.nextCursor enquanto hasMore
  for true. Ponha um TETO DURO de páginas: se o provedor devolver um cursor que
  não avança, um while sem teto é um loop infinito em produção. Corte também
  se o cursor novo for igual ao anterior.

- As mensagens voltam em "messages", não em "data". A lista de conversas
  sim usa "data". Contemple as duas formas.

- OLHE meta.failedAccounts. O Zernio não falha a request inteira se uma conta não
  responde: degrada ali dentro e devolve 200 com o resto. Se você não
  registrar, uma importação pela metade se lê como bem-sucedida.

- Distinga "não há conversas" de "a API falhou". Se o erro se engole em
  silêncio, uma importação quebrada parece uma conta vazia.

DESLIGUE O AGENTE ANTES DE IMPORTAR
Se você tem um agente de IA respondendo automaticamente e roda o backfill com
ele ligado, cada mensagem histórica entra como se fosse nova e o bot escreve
para centenas de clientes velhos de uma só vez. Isso não se pode desfazer.
Ponha uma flag explícita e deixe documentado em letras grandes.
```

---

## Prompt 8 — Verificar de ponta a ponta

```
Verifique a integração nesta ordem, e não dê nada por bom até o passo 6:

1. GET /v1/accounts devolve as suas contas conectadas.

2. O script de webhook lista a sua assinatura com estado ativo e 0 falhas.

3. Dispare um webhook.test e confirme que a linha aparece na sua tabela
   webhook_events. Se não aparecer, o segredo não coincide entre a sua hospedagem e
   o Zernio: o seu endpoint está devolvendo 401 em silêncio.

4. Escreva para o seu número a partir de outro telefone. A mensagem deve aparecer na sua base
   em segundos, com o contato e a conversa criados.

5. Responda a partir do seu aplicativo. Verifique que chega ao telefone e que na sua base
   há UMA única linha de saída, com o id externo preenchido (não NULL).

6. Responda a partir do app WhatsApp Business do celular, se você usa coexistência.
   Essa mensagem também deve aparecer na sua caixa de entrada, via message.sent.
```

---

## As armadilhas, numa tabela

Se você só levar uma coisa deste documento, que seja esta.

| Sintoma | Causa real |
|---|---|
| A mensagem aparece duas vezes no seu aplicativo, mas ao cliente chega uma | Você leu `res.messageId` em vez de `res.data.messageId`; a linha ficou sem id e o eco de `message.sent` inseriu outra |
| As mensagens entram no Zernio mas nunca no seu aplicativo, sem nenhum erro | O `ZERNIO_WEBHOOK_SECRET` não coincide entre a sua hospedagem e a assinatura. O seu endpoint responde 401 em silêncio |
| A assinatura nunca valida embora o segredo esteja correto | Você assinou sobre o JSON re-serializado em vez do corpo cru |
| Tudo se processa três vezes | Você rodou o script de alta do webhook três vezes. O Zernio não valida URLs duplicadas |
| Deixou de chegar tudo, de repente | 10 falhas de entrega consecutivas: o Zernio desligou a assinatura |
| A Meta diz que o seu número "não cumpre os requisitos" | Você escolheu `onboarding=api` com um número que vive no app WhatsApp Business. Use `business_app` |
| O número conecta mas não consegue enviar | Falta o PIN de verificação em dois passos (erro 133005 da Meta) |
| Funcionou ontem e hoje dá 401 contra a Meta | Você usou um token temporário do console. Precisa de um System User token permanente |
| Um contato novo por cada mensagem do mesmo cliente | O WhatsApp mandou BSUID sem telefone. Âncore a identidade em `businessScopedUserId` |
| A importação "terminou bem" mas faltam conversas | Você não olhou `meta.failedAccounts`: o Zernio degradou uma conta e devolveu 200 |
| Um evento se perdeu e nunca se reprocessou | A nova tentativa se auto-deduplicou contra a sua tabela. Sem varredura não há recuperação |
| O bot escreveu para 300 clientes velhos | Você rodou o backfill com o agente ligado |

---

## O que custa

O Zernio cobra por conta conectada, não por mensagem. As mensagens que **o cliente inicia**
(ele te escreve) não têm custo da Meta no WhatsApp; as que você inicia fora da
janela de 24 horas vão por template e sim se cobram por conversa.

Para um negócio com três canais conectados, a mensageria fica na ordem de uma
dezena de dólares por mês. Se você soma um agente de IA respondendo, é esse que manda na
fatura, não a mensageria.

---

## Quando NÃO usar o Zernio

Vale a pena ser honesto com isto antes de vender qualquer coisa:

- **Você precisa da API de Grupos do WhatsApp.** Não está disponível em coexistência.
- **O seu cliente exige ser o dono direto da relação com a Meta**, sem intermediário
  técnico. Aí o caminho é Cloud API própria e App Review.
- **Volume muito alto com margens finas.** A certa escala, ir direto à Meta sai mais
  barato que qualquer camada intermediária.
- **Você precisa de funções da Meta no dia em que saem.** Um intermediário sempre vai algumas
  semanas atrás.

Para todo o resto — que é a maioria dos projetos — poupa semanas de
verificação e três integrações para manter separadas.

---

## A ordem que recomendo

1. **Cliente HTTP** (prompt 1) — meia hora
2. **Webhook com assinatura e idempotência** (prompt 3) — é a peça que sustenta tudo
3. **Registro do webhook por API** (prompt 4)
4. **Conexão de uma conta real** (prompt 2)
5. **Normalização de eventos** (prompt 5)
6. **Envio** (prompt 6)
7. **Histórico** (prompt 7), só se você precisar
8. **Verificação** (prompt 8)

Construir o webhook antes do envio não é um detalhe de gosto: até você ver
entrar uma mensagem real, todo o resto é teoria.

---

*Documentação oficial: [docs.zernio.com](https://docs.zernio.com)*
