# Spec: Entrar com um provedor externo (Google e companhia)

**Trilho**: completo (rota pública nova e caminho de autenticação)
**Estado**: implementada em 1.2.0 e 1.2.1
**Data**: 2026-10-04
**Escrita antes do código**: **não**. Saiu de uma pergunta do dono enquanto se
testava a instância implantada e foi construída na hora; esta spec foi escrita
depois, para que `specs/nucleo/` continue descrevendo o sistema completo. O que segue é
o que ficou construído, não um plano.

## Problema

A equipe de um cliente já tem conta do Google (Workspace ou Gmail). Obrigá-los a
lembrar de mais uma senha para o CRM adiciona uma senha fraca, um canal por onde
passá-la e um suporte ("perdi a senha") que o administrador atende à mão. Mas
ligar um provedor externo tem um risco evidente: se entrar com o Google desse acesso,
qualquer um com uma conta do Gmail entraria no CRM do cliente.

## Decisões do dono

- D1 (2026-10-04) Adiciona-se ao repositório da comunidade, opcional e **desligado de fábrica**.
- D2 (2026-10-04) O CRM não tem variáveis próprias para isso: configura-se no
  servidor de autenticação e o CRM se adapta sozinho.

## Cenários

1. **Sem configurar** — O login se vê exatamente como hoje: e-mail e senha. Ninguém fica
   sabendo que a possibilidade existe.
2. **Configurado** — Aparece "Continuar com Google" acima do formulário, com um
   separador. Quem já está na equipe com esse e-mail entra e cai no início.
3. **Alheio** — Alguém com uma conta do Google que não está em `team_members` entra no
   provedor, volta ao CRM e termina em `/sin-acceso`. Não vê nenhum dado.
4. **Cadastro ordenado** — O administrador cadastra a pessoa em Ajustes -> Equipo com
   o e-mail exato da conta Google dela e **sem senha temporária**; depois ela
   entra pelo botão.

## Requisitos

- FR-001 `proveedoresExternos()` consulta `GET {SUPABASE_URL}/auth/v1/settings` com a
  chave anônima e devolve os provedores ligados. Cacheia 5 minutos, timeout de 5 s e
  **falha fechado**: se não responder, lista vazia e fica só e-mail e senha.
- FR-002 `/login` e `/signup` recebem essa lista e renderizam um botão por provedor
  (`BotonProveedor`, que chama `signInWithOAuth` a partir do navegador).
- FR-003 `GET /auth/callback` troca o código pela sessão e redireciona. O endereço de
  volta sai de `APP_BASE_URL` / `NEXT_PUBLIC_APP_URL` e só se faltar se olham os
  cabeçalhos do proxy: atrás de um proxy o `origin` da requisição é o endereço
  interno do contêiner (`https://0.0.0.0:3000`) e redirecionar para lá manda para o nada.
- FR-004 O parâmetro `next` só é aceito se for uma rota relativa (`/...` e não `//`):
  um `next` manipulado não pode mandar para outro site.
- FR-005 Entrar com um provedor **não** concede acesso: a membresia continua se resolvendo
  contra `team_members` em cada rota e layout, e sem linha cai-se em `/sin-acceso`.
- FR-006 O cadastro a partir de Ajustes -> Equipo aceita senha vazia, para a pessoa que vai
  entrar só pelo provedor.
- FR-007 Se o e-mail já tinha usuário com senha, o provedor se vincula a essa
  conta (as contas que Ajustes cria nascem confirmadas, que é o que permite isso).

## Configuração e módulos

Nenhuma variável do CRM. Auto-hospedado: `GOTRUE_EXTERNAL_GOOGLE_ENABLED`, `CLIENT_ID`,
`SECRET`, `REDIRECT_URI` e a URL do CRM em `GOTRUE_URI_ALLOW_LIST`. Supabase cloud: o
interruptor do painel e as *Redirect URLs*. Passo a passo em `docs/GOOGLE-AUTH.md`.

## Modelo de dados

Nenhum. A identidade o provedor guarda no próprio esquema (`auth.identities`).

## Agente de IA

Não o toca.

## Critérios de aceitação

- CA-001 Sem configurar, `/login` não mostra nenhum botão de provedor.
- CA-002 Com o Google ligado, `/auth/v1/settings` traz `"google": true` e o botão
  aparece sem tocar no CRM.
- CA-003 Um usuário do Google que não está em `team_members` termina em `/sin-acceso`.
- CA-004 A volta do provedor aterrissa no domínio público, não em `0.0.0.0:3000`.
- CA-005 `npm run verificar` informa os provedores na linha "Formas de entrar".

## Constitution Check

- I. Núcleo intocável: é núcleo; a instância não precisa editar nada para ativá-lo.
- II. Spec antes do código: **não se cumpriu**; esta spec é posterior e declara isso.
- III. Autoverificação: o verificador informa as formas de entrar.
- IV. Zero segredos: as credenciais do provedor vivem no servidor de
  autenticação; o repositório só documenta os nomes.

## Fora de escopo

- Vincular e desvincular provedores a partir da UI do CRM.
- Domínio permitido (entrar só com e-mails de uma empresa): hoje isso resolve
  `team_members`, que é uma lista explícita e mais estrita.
- SAML e SSO corporativo.
