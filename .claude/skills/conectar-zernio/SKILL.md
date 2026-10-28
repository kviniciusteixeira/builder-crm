---
name: conectar-zernio
description: |
  Conecta WhatsApp, Instagram DM e Facebook Messenger de um cliente a uma instância do
  Builder CRM através do Zernio: credenciais, webhook por API, contas, teste de ponta
  a ponta e diagnóstico. Ativar quando o usuário diz: conecta o WhatsApp, conecta
  Instagram/Messenger, configura o Zernio, não entram mensagens, o webhook não funciona.
allowed-tools: Read, Edit, Bash, Grep
---

# Conectar canais via Zernio

> Instância / canal: $ARGUMENTS

O Zernio é o provedor padrão: uma API e um webhook para os três canais. A Meta
Cloud API direta existe como conector parcial (`src/lib/channels/conectores/README.md`)
e não é este fluxo.

## 1. Credenciais (do cliente ou da agência)

| Variável | Onde |
|---|---|
| `ZERNIO_API_KEY` | zernio.com -> Settings -> API Keys |
| `ZERNIO_PROFILE_ID` | `npm run zernio:setup` as lista; vazio = perfil Default |
| `ZERNIO_WEBHOOK_SECRET` | você inventa (`openssl rand -hex 32`); vai na instância E na assinatura |

Carregá-las no Coolify (runtime) e reimplantar, ou em `.env.local` se for local.

## 2. Webhook (por API, não à mão)

```bash
ZERNIO_API_KEY=... ZERNIO_WEBHOOK_SECRET=... npm run zernio:webhook -- --url https://<dominio>
```

O script busca a assinatura pelo nome e faz PUT se já existe (o Zernio não valida
URLs duplicadas: sem isso cada corrida duplica entregas). `--test` manda um evento de
teste. Sem `--url` lista as assinaturas com o contador de falhas.

**Armadilha**: se `ZERNIO_WEBHOOK_SECRET` não for idêntico na instância e no Zernio, o
endpoint responde 401 e as mensagens "não chegam" sem nenhum erro visível no CRM.
**Armadilha 2**: 10 falhas de entrega seguidas (por exemplo um deploy quebrado que devolveu
500) e o Zernio desliga a assinatura: rodar o script de novo a reativa.

## 3. Conectar contas

- **Instagram / Messenger**: Ajustes -> Canales -> Conectar (popup OAuth da Meta). Ao
  voltar, `npm run zernio:setup -- --sync` ou o botão "Sincronizar cuentas" deixa a
  linha em `channel_accounts`.
- **WhatsApp**: escolher o modo ANTES de conectar.
  - *Coexistência* (`business_app`, default): o número continua no app WhatsApp
    Business do celular e o que se responde dali também entra no CRM.
  - *Só Cloud API* (`api`): o número sai do celular. Um número que está no app
    aparece como "não cumpre os requisitos" neste modo (é o sintoma de ter
    escolhido errado, não um problema do número).
  - BYO-WABA sem navegador: `npm run zernio:whatsapp` com `WHATSAPP_ACCESS_TOKEN`,
    `WHATSAPP_BUSINESS_ACCOUNT_ID` e `WHATSAPP_PHONE_NUMBER_ID` do cliente.
- Histórico prévio: "Importar historial" em Ajustes -> Canales (não dispara o agente).

## 4. Testar de ponta a ponta

1. `GET /api/channels` (com sessão) -> o conector `zernio` aparece `configurado` e a
   conta está `active`.
2. Enviar uma mensagem real ao número/conta do cliente a partir de outro telefone.
3. Em 2-10 segundos aparece em `/conversations`; se o agente está ligado para esse
   canal (Ajustes -> Agente), responde em ~7 s.
4. Responder a partir do chat: a mensagem sai e fica `sent`.

Instagram e Messenger começam com o agente **desligado**: ligá-los em Ajustes ->
Agente depois de escrever o prompt deles (se não, usariam o do WhatsApp).

## Diagnóstico

| Sintoma | Causa provável | O que olhar |
|---|---|---|
| Não entram mensagens, sem erros | segredo dessincronizado (401) ou assinatura desligada | `npm run zernio:webhook` (sem --url) mostra falhas; logs do Coolify buscando `firma invalida` |
| Entram mas o agente não responde | agente desligado para o canal, contato/fio em pausa, falta `OPENROUTER_API_KEY` | Ajustes -> Agente; painel do chat; `/api/health` |
| Enviar falha com `TEMPLATE_REQUIRED` | WhatsApp fora da janela de 24 h | mandar um template aprovado (Plantillas) |
| Enviar falha 401/403 | `ZERNIO_API_KEY` inválida ou conta desconectada | reconectar em Ajustes -> Canales |
| Mensagens duplicadas | duas assinaturas na mesma URL | `npm run zernio:webhook` lista e aponta; apagar a extra no Zernio |
