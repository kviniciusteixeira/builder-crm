# Spec: E-mails de acesso (convites e recuperar a senha)

**Trilho**: completo (rotas públicas novas, variável nova, caminho de autenticação)
**Estado**: implementada em 1.3.0
**Data**: 2026-10-04
**Escrita antes do código**: **não**. Nasceu de três perguntas do dono sobre o cadastro de
membros ("quando se convida, chega um e-mail?") e foi construída na hora. Esta
spec documenta o que ficou.

## Problema

O cadastro de um membro criava a conta na hora e o administrador tinha que passar
a senha temporária por onde pudesse: um chat, um áudio, um papel. Duas consequências:
a senha viaja por um canal que ninguém controla e fica escrita ali para sempre, e a
pessoa entra com uma senha que não escolheu e que provavelmente não vai mudar. Além disso não havia
nenhuma forma de recuperar uma senha: a única saída era pedir a um administrador
que a trocasse à mão.

## Decisões do dono

- D1 (2026-10-04) Usa-se **Resend** como provedor recomendado na documentação, por
  SMTP. Qualquer outro SMTP serve igual.
- D2 (2026-10-04) Opcional e desligado de fábrica: sem configurar, o cadastro continua sendo com
  senha temporária, como até 1.2.2.

## Cenários

1. **Convidar** — O administrador adiciona alguém em Ajustes -> Equipo e escolhe "Como
   entra: convite por e-mail". A pessoa recebe um link, escolhe a senha e
   entra. O administrador nunca vê nem manuseia essa senha.
2. **Reenviar** — A pessoa perdeu o e-mail ou a senha. O administrador aperta o
   envelope na linha dela e chega um link novo. Nada muda até que ela o use.
3. **Esqueci a senha** — A partir do login, a pessoa pede o link com o e-mail e
   chega à mesma página para escolher uma nova.
4. **Sem SMTP** — Não aparece nenhuma das três coisas: o cadastro pede senha temporária e
   `/auth/recuperar` explica que o acesso é distribuído por um administrador.
5. **Link vencido ou usado** — A página diz isso com clareza e oferece pedir outro, em vez
   de deixar um formulário que não vai funcionar.

## Requisitos

- FR-001 O e-mail é enviado pelo servidor de autenticação com o próprio SMTP. O CRM não
  tem credenciais de e-mail nem templates compilados dentro.
- FR-002 `AUTH_ENVIA_CORREOS=true` declara a capacidade. É um interruptor **manual** de
  propósito: o GoTrue sem SMTP não falha, usa um cliente de e-mail que engole a mensagem e
  responde 200, então não há nada a detectar e sem o interruptor a UI diria
  "convite enviado" sobre um e-mail que nunca saiu.
- FR-003 A capacidade viaja ao navegador no bloco de configuração pública
  (`authEnviaCorreos`), que é a mesma fonte que a API olha: a UI e o servidor não
  podem se contradizer.
- FR-004 `POST /api/team` com `invitar: true` usa `inviteUserByEmail` com `redirectTo`
  em `/auth/definir-clave`. O GoTrue cria o usuário e manda o e-mail numa transação: se
  o envio falhar não fica nenhum usuário pela metade e o erro se mostra tal qual.
- FR-005 Se o e-mail já tinha usuário, não se convida de novo (o GoTrue responde
  `email_exists`): soma-se à equipe e manda-se um link de acesso. Se esse envio
  falhar, o cadastro vale igual e a UI avisa.
- FR-006 `POST /api/team/[id]/acceso` (só admin) reenvia o acesso. Rejeita membros
  desativados e membros sem usuário de Auth, com o motivo.
- FR-007 `/auth/recuperar` pede o e-mail por uma ação de servidor e responde **o
  mesmo exista ou não a conta**; os limites de frequência os põe o provedor.
- FR-008 Os e-mails de acesso se pedem com um cliente anônimo de uso único e **fluxo
  implícito**: PKCE guarda um verificador no navegador que pediu o e-mail e ataria o
  link a esse navegador, quando aqui quem pede é o servidor ou um administrador de outro
  computador.
- FR-009 `/auth/definir-clave` roda no navegador (a sessão chega no fragmento da
  URL, que não chega ao servidor), guarda a sessão, **limpa a barra de endereços**
  para que o link não fique no histórico nem numa captura, exige 8 caracteres e
  confirmação, e ao gravar recarrega inteira para que o servidor veja os cookies novos.
  Também aceita `?code=` (PKCE) para o caso do Supabase cloud.
- FR-010 `GET /correo/[plantilla].html` serve os dois templates com a marca da
  instância, em espanhol. É pública porque o servidor de autenticação a baixa, e
  ele não tem sessão; são templates vazios, sem dados de ninguém. Se a URL não responder,
  o GoTrue usa o template padrão e o e-mail sai igual.
- FR-011 `/api/health` informa `correo: true|false` e o verificador diz isso na linha
  "Formas de entrar".
- FR-012 Isso não abre o cadastro público: continua entrando só quem está em
  `team_members`, e um convite é um cadastro que um administrador fez.

## Configuração e módulos

`AUTH_ENVIA_CORREOS` e `APP_BASE_URL` no CRM (sem a segunda ele se recusa a convidar, em vez
de mandar um link para o nada). SMTP, assuntos, rotas de verificação e templates no
servidor de autenticação. Passo a passo em `docs/CORREIO.md`.

## Modelo de dados

Nenhum. Os tokens e o vencimento vivem no esquema `auth`.

## Agente de IA

Não o toca.

## Critérios de aceitação

- CA-001 Com SMTP configurado, convidar um endereço de teste manda um e-mail com o
  assunto e o template da instância (verificado contra os registros do provedor).
- CA-002 O link do e-mail leva a `/auth/definir-clave` do domínio público com a
  sessão pronta, e depois de gravar a pessoa entra com o seu papel.
- CA-003 Um link usado duas vezes mostra "o link já foi usado", não um erro cru.
- CA-004 Com `AUTH_ENVIA_CORREOS` desligado não aparece nem o seletor, nem o envelope, nem o
  "esqueceu?", e `/api/health` responde `correo: false`.
- CA-005 O template responde 200 em `/correo/invitacion.html` com o nome e as
  cores da marca, e 404 com qualquer outro nome.

## Constitution Check

- I. Núcleo intocável: é núcleo; a marca dos e-mails sai de `config/cliente.ts`, sem
  tocar em `src/`.
- II. Spec antes do código: **não se cumpriu**; esta spec é posterior e declara isso.
- III. Autoverificação: `/api/health` e o verificador informam a capacidade.
- IV. Zero segredos: a chave do SMTP vive no servidor de autenticação; o repositório só
  documenta nomes e placeholders.

## Fora de escopo

- E-mail transacional do CRM (resumos, aviso de lead novo): para isso estão os avisos
  push.
- Mandar os e-mails a partir do CRM com a API do Resend: obrigaria a ter uma rota pública
  que dispara envios e a limitá-la à mão, quando o provedor já faz as duas coisas.
- Escolher o provedor a partir da UI.
