# E-mails de acesso (convites e "esqueci a senha")

Opcional e desligado de fábrica. Sem isso o CRM funciona igual: o administrador cria a
conta em **Ajustes -> Equipo** e passa a senha temporária por onde quiser.

Com isso ligado aparecem três coisas:

| Onde | O que aparece |
|---|---|
| Ajustes -> Equipo -> Adicionar | **Como entra: convite por e-mail**. A pessoa escolhe a própria senha. |
| Ajustes -> Equipo, em cada linha | Um botão de envelope: **reenviar o acesso**, para quem perdeu a senha. |
| Login | **Esqueceu?**, que leva a pedir um link. |

Os três levam à mesma página (`/auth/definir-clave`), onde a pessoa escolhe a
senha e entra. O link serve **uma única vez e vence em 24 horas**.

## O primeiro ponto, porque explica todo o resto

**O CRM não manda e-mails: manda o servidor de autenticação.** O CRM não tem
credenciais de SMTP nem templates próprios; pede ao GoTrue (ou ao Supabase cloud) que
mande o convite, e o GoTrue gera o link, controla os limites de envio e envia.

Por isso a configuração está em dois lugares distintos e os dois são obrigatórios:

1. **O SMTP, no servidor de autenticação.** É o que faz o e-mail sair.
2. **`AUTH_ENVIA_CORREOS=true`, no CRM.** É o que faz a UI oferecer.

E por isso faz falta o interruptor, que é a pergunta óbvia ao ler isto: quando o GoTrue
não tem SMTP configurado **não falha**. Usa um cliente de e-mail que engole a mensagem e
responde 200. Sem o interruptor, o CRM diria "convite enviado" sobre um e-mail que
nunca saiu. É o contrário de entrar com o Google, que se detecta só perguntando ao
provedor (ver [GOOGLE-AUTH.md](GOOGLE-AUTH.md)): o SMTP não aparece nessa resposta, não
há nada a perguntar.

Regra prática: **ligue o interruptor depois que um e-mail de teste chegar de
verdade**, não antes.

## Passo a passo com Resend

Qualquer SMTP serve (Postmark, SES, Brevo, o do cliente). Resend é o caminho curto:
plano gratuito de 3.000 e-mails por mês, SMTP sem rodeios e registros DNS claros.

### 1. O domínio

Em [resend.com](https://resend.com) -> **Domains -> Add Domain**. Use um **subdomínio**,
não o domínio pelado:

```
send.seudominio.com
```

Assim a reputação de envio do CRM não se mistura com o e-mail da empresa, e se algum
dia se mandar algo que termine em spam, não arrasta o domínio principal.

O Resend te dá três ou quatro registros DNS (um MX, um TXT de SPF, um TXT de DKIM e,
opcional, um DMARC). Colam-se tal qual no DNS do domínio. No Cloudflare, **sem
proxy** (nuvem cinza). Verifica em minutos; às vezes demora uma hora.

> Enquanto o domínio não estiver verificado, o Resend só deixa mandar a partir de
> `onboarding@resend.dev` e **só para o endereço do dono da conta**. Serve para
> provar que o SMTP responde, não para convidar ninguém.

### 2. A chave

**API Keys -> Create API Key**, permissão **Sending access** e, se oferecer,
restrita ao domínio que você acabou de criar. Guarde: não se mostra de novo.

### 3. Os dados do SMTP

| Dado | Valor |
|---|---|
| Host | `smtp.resend.com` |
| Porta | `465` (TLS direto; também funciona 587 com STARTTLS) |
| Usuário | `resend` |
| Senha | a API key (`re_...`) |
| Remetente | um endereço **do domínio verificado**, por exemplo `crm@send.seudominio.com` |

O remetente não precisa existir como caixa: ninguém vai responder ali. Se você quiser que
possam responder, use uma que exista.

## Ligar

### Auto-hospedado (GoTrue no seu VPS)

Nas variáveis do contêiner de autenticação, e reiniciá-lo:

```
GOTRUE_SMTP_HOST=smtp.resend.com
GOTRUE_SMTP_PORT=465
GOTRUE_SMTP_USER=resend
GOTRUE_SMTP_PASS=re_...
GOTRUE_SMTP_ADMIN_EMAIL=crm@send.seudominio.com
GOTRUE_SMTP_SENDER_NAME=Nome do CRM
GOTRUE_SMTP_MAX_FREQUENCY=10s

GOTRUE_MAILER_URLPATHS_INVITE=/auth/v1/verify
GOTRUE_MAILER_URLPATHS_RECOVERY=/auth/v1/verify
GOTRUE_MAILER_URLPATHS_CONFIRMATION=/auth/v1/verify
GOTRUE_MAILER_URLPATHS_EMAIL_CHANGE=/auth/v1/verify

GOTRUE_MAILER_SUBJECTS_INVITE=Te sumaron al CRM
GOTRUE_MAILER_SUBJECTS_RECOVERY=Volver a entrar al CRM

GOTRUE_MAILER_TEMPLATES_INVITE=https://crm.seudominio.com/correo/invitacion.html
GOTRUE_MAILER_TEMPLATES_RECOVERY=https://crm.seudominio.com/correo/recuperacion.html
```

Dois detalhes que não se adivinham:

- **`GOTRUE_URI_ALLOW_LIST` tem que incluir a URL do CRM** (`https://crm.seudominio.com/**`).
  É o destino para o qual a pessoa volta depois do link; se não estiver na lista, o
  provedor se recusa e ninguém entende por quê.
- **Os `URLPATHS` começam com `/auth/v1`** se você expôs o GoTrue como indica
  [SUPABASE-NO-VPS.md](SUPABASE-NO-VPS.md), onde o domínio inclui essa rota e o proxy
  a recorta. Se o seu GoTrue está publicado na raiz, vão como `/verify`. O link do
  e-mail se monta com `API_EXTERNAL_URL` + essa rota: se ficar errado, o e-mail chega e o
  link dá 404.

### Supabase cloud

**Project Settings -> Authentication -> SMTP Settings**: os mesmos cinco dados da
tabela acima. E em **Authentication -> URL Configuration**, adicione
`https://crm.seudominio.com/**` às *Redirect URLs*.

Isso não é opcional na cloud mesmo que os e-mails "já funcionem": sem SMTP próprio, o Supabase
manda **2 e-mails por hora** com o remetente dele e um aviso de que é só para
desenvolvimento. Com uma equipe de cinco pessoas você fica no meio do caminho.

Os templates na cloud se colam à mão em **Authentication -> Emails**: abra
`https://crm.seudominio.com/correo/invitacion.html`, copie o HTML e cole ali. Mesmo
template, outro caminho.

### O CRM

```
AUTH_ENVIA_CORREOS=true
APP_BASE_URL=https://crm.seudominio.com
```

`APP_BASE_URL` já deveria estar: é a que monta o link para o qual a pessoa volta. Sem
ela o CRM se recusa a convidar, em vez de mandar um e-mail com um link para o nada.

## Os templates

O CRM serve os dois templates com a marca da instância (nome, logo e cor de
`config/cliente.ts`), em espanhol e em HTML de e-mail:

```
https://crm.seudominio.com/correo/invitacion.html
https://crm.seudominio.com/correo/recuperacion.html
```

O GoTrue os baixa e substitui o link ao enviar. São públicos de propósito: pede-os
um servidor que não tem sessão no CRM, e não contêm dados de ninguém. Se a URL não
responder, o GoTrue usa o template padrão, que é correto mas está em inglês.

Para mudar os textos: `src/lib/plantillas-correo.ts`. Para mudar as cores não faz
falta tocar em nada, saem da marca.

## Conferir

```bash
# 1. O template está público (tem que dar 200 e trazer o nome do cliente)
curl -s https://crm.seudominio.com/correo/invitacion.html | head -20

# 2. A instância declara a capacidade
curl -s https://crm.seudominio.com/api/health
# -> {"ok":true,...,"correo":true}
```

3. Convide a si mesmo para um endereço que não seja o do admin e veja se chega. No
   Resend, **Logs** mostra cada envio com o estado.
4. `npm run verificar` informa na linha **Formas de entrar**.

## O que quebra e por quê

- **A UI diz "convidado" e o e-mail não chega.** `AUTH_ENVIA_CORREOS=true` mas o
  servidor de autenticação não tem SMTP: engole em silêncio. É o motivo de o
  interruptor ser manual. Olhe os logs do contêiner de auth.
- **O Resend responde que o domínio não está verificado.** Faltam os registros DNS, ou o
  remetente não é do domínio verificado.
- **O link do e-mail leva a `0.0.0.0:3000` ou a `localhost`.** Falta `APP_BASE_URL`
  no CRM.
- **"requested path is invalid".** `GOTRUE_URI_ALLOW_LIST` sem a URL do CRM.
- **O link diz "já foi usado" sem ter sido usado.** Alguns e-mails corporativos
  (Outlook com SafeLinks, antivírus com análise de links) abrem os links antes da
  pessoa, e o link vale uma única vez. Reenvie o acesso e peça que abra pelo
  telefone, ou dê uma senha temporária.
- **"email_exists" ao convidar.** Esse e-mail já tem usuário (registrou-se antes ou entrou
  com o Google). O CRM não convida de novo: soma à equipe e manda um link para
  definir a senha.
- **O segundo e-mail não sai.** `GOTRUE_SMTP_MAX_FREQUENCY` limita os envios à mesma
  pessoa, e `GOTRUE_RATE_LIMIT_EMAIL_SENT` o total por hora. São defesas, não erros.
- **Cai em spam.** Verifique SPF e DKIM, mande a partir do domínio do cliente e adicione um
  registro DMARC.

## O que isto NÃO faz

- Não é e-mail transacional do CRM: não manda resumos, avisos de lead novo nem
  notificações. Para isso estão os avisos push (Ajustes -> Notificaciones).
- Não abre o cadastro público. Continua sendo verdade: **só entra quem está em
  `team_members`**, e ali o põe um administrador. Um convite é um cadastro que fez um
  admin, nada mais.
