# Banco de dados e Auth no seu próprio VPS

O Builder CRM funciona com Supabase cloud, que é o caminho curto. Este guia é para o
outro caso: **tudo no seu VPS, sem conta do Supabase**. Serve para um servidor de demos,
para um cliente que não quer dados fora da infraestrutura dele, ou para não somar uma
assinatura por instância.

## O que faz falta de verdade

O Builder CRM usa o Supabase **só para autenticação**. Todas as consultas de dados vão
pelo Drizzle contra o Postgres. Não usa PostgREST, nem Realtime, nem Storage do Supabase: os
documentos vão direto para um bucket S3.

Por isso **você não precisa do stack completo do Supabase**, que são 13 contêineres e uns
1,9 GB de memória. Com dois basta:

| Contêiner | Para quê | Memória típica |
|---|---|---|
| Postgres com pgvector | a base do CRM e o esquema `auth` | 150 a 400 MB |
| `supabase/gotrue` | o login e os usuários | 15 a 40 MB |

O módulo de imóveis usa busca vetorial, então a imagem tem que trazer a
extensão. `pgvector/pgvector:pg16` é um Postgres normal com essa extensão, e se porta
bem sob qualquer orquestrador.

## Consequência de segurança que há que entender

Com Supabase cloud, as tabelas de `public` ficam expostas pelo PostgREST a quem tenha
a chave anônima, que viaja no navegador. Por isso o núcleo traz RLS em todas as
tabelas: é o escudo dessa API pública.

Auto-hospedado sem PostgREST **não há API pública de dados**, então esse escudo deixa de
ser necessário. As migrações de RLS rodam igual e não há que tocar em nada, mas passam a
ser defesa em profundidade. A autorização de verdade continua onde sempre: no
servidor, com `requireMember()` e o filtro por proprietário. Ver [SEGURANCA.md](../SEGURANCA.md).

## Ordem dos passos

A ordem importa e não é intuitiva:

1. **Postgres no ar.**
2. **`node scripts/preparar-auth-autoalojado.mjs`** cria o que o Supabase cloud traz de
   fábrica: os papéis `anon`, `authenticated` e `service_role`, o esquema `auth` com
   dono `supabase_auth_admin`, e as funções `auth.uid()`, `auth.role()`,
   `auth.email()` e `auth.jwt()`.
3. **O GoTrue inicia** e cria `auth.users` com as próprias migrações.
4. **`npm run db:migrar`** aplica as migrações do CRM. A última põe um gatilho
   sobre `auth.users`, que para então já existe.

Pular o passo 2 deixa o GoTrue sem o papel com o qual entra. Inverter 3 e 4 faz a
migração do primeiro administrador falhar porque a tabela ainda não está.

## Chaves

```bash
node scripts/generar-claves-supabase.mjs
```

Imprime o segredo JWT e, assinadas com ele, a chave anônima e a de serviço. As três
têm que ser coerentes: o segredo vai no GoTrue, as duas chaves no CRM. Se você mudar
o segredo há que regenerar as chaves e todas as sessões abertas se cortam.

## Variáveis do GoTrue

As que importam, testadas com `supabase/gotrue:v2.186.0`:

```
GOTRUE_API_HOST=0.0.0.0
GOTRUE_API_PORT=9999
API_EXTERNAL_URL=https://auth.seudominio.com
GOTRUE_DB_DRIVER=postgres
GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:SENHA@HOST_DA_BASE:5432/postgres?search_path=auth&sslmode=disable
GOTRUE_SITE_URL=https://crm.seudominio.com
GOTRUE_URI_ALLOW_LIST=https://crm.seudominio.com/**
GOTRUE_JWT_SECRET=O_SEGREDO
GOTRUE_JWT_EXP=3600
GOTRUE_JWT_AUD=authenticated
GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated
GOTRUE_JWT_ADMIN_ROLES=service_role
GOTRUE_DISABLE_SIGNUP=false
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_MAILER_AUTOCONFIRM=true
```

**`GOTRUE_MAILER_AUTOCONFIRM=true` não é opcional se você não tem SMTP.** Em falso, as
contas nascem sem confirmar e ninguém consegue entrar, sem nenhum erro visível no CRM.

Essa variável só afeta o cadastro público, que neste modelo se fecha assim que
existe a primeira conta, então fica em `true` também depois de configurar SMTP.
Os convites e a recuperação de senha não dependem dela: ligam-se com
as variáveis de SMTP e o interruptor do CRM, e vão em [CORREIO.md](CORREIO.md).

## A URL do prefixo

A biblioteca do Supabase chama `https://SUA_URL/auth/v1/token`, mas o GoTrue serve a API
na raiz. Há que recortar `/auth/v1` antes de chegar ao contêiner.

No Coolify se resolve sem contêineres extras: no domínio do aplicativo do GoTrue
você põe **a rota incluída**, `https://auth.seudominio.com/auth/v1`, e o proxy recorta o
prefixo sozinho. Confere-se assim:

```bash
curl https://auth.seudominio.com/auth/v1/health
# {"version":"v2.186.0","name":"GoTrue",...}
```

No CRM, `NEXT_PUBLIC_SUPABASE_URL` é a raiz, **sem** `/auth/v1`:
`https://auth.seudominio.com`.

Com outro proxy, o mesmo com um recorte de prefixo. Um Caddy de 20 MB também serve.

## O que quebra e por quê

- **O GoTrue reinicia com `must be owner of function uid`.** A primeira migração volta a
  declarar `auth.uid()` e `auth.role()`. Se essas funções existem com outro dono,
  o Postgres rejeita. O script do passo 2 as cria já com dono `supabase_auth_admin`
  e, se as encontra com outro dono, troca. Rodar de novo arruma o caso.
- **`relation "auth.users" does not exist` ao migrar.** O GoTrue ainda não iniciou. Passo 3
  antes do 4.
- **O navegador não consegue iniciar sessão e no console se vê `undefined` como URL.**
  Era isso até 1.2.1: as `NEXT_PUBLIC_*` se gravavam no build e a API do Coolify
  4.3 não permite marcar uma variável como de build. Desde 1.2.2 o servidor entrega
  essa configuração ao navegador ao executar, então basta tê-las em runtime e
  implantar de novo. Se você continuar vendo, confira se o bloco está na página:
  `curl -s https://crm.seudominio.com/login | grep builder-crm-config`.
- **O cookie de sessão.** A biblioteca o nomeia com a primeira etiqueta do host do
  Supabase. Com `auth-demo.meudominio.com` o cookie é `sb-auth-demo-auth-token`. Se
  você mudar esse host, as sessões abertas deixam de valer.

## Acesso à base para os passos iniciais

Os scripts de preparação e `admin:crear` rodam da sua máquina e precisam chegar ao
Postgres. No Coolify a base nasce só na rede interna, então durante a instalação
habilita-se o acesso público, rodam-se os scripts e **volta-se a fechar**. A
alternativa é rodá-los dentro do servidor.

## Backups

Com Supabase cloud vinham incluídos. Aqui são seus: a base gerenciada do Coolify tem
backups programados para S3, e convém ativá-los no primeiro dia se nessa instância
vai haver dados de um cliente.

## Resumo de variáveis do CRM

```
DATABASE_URL=postgres://postgres:SENHA@HOST_DA_BASE:5432/postgres
NEXT_PUBLIC_SUPABASE_URL=https://auth.seudominio.com
NEXT_PUBLIC_SUPABASE_ANON_KEY=...        # do gerador
SUPABASE_SERVICE_ROLE_KEY=...            # do gerador
```

O resto não muda em relação ao Supabase cloud: ver [.env.example](../.env.example).
