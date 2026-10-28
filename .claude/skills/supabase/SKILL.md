---
name: supabase
description: |
  Tudo relacionado ao Supabase: criar tabelas, migrações, RLS, queries, métricas, CRUD,
  auth, storage, logs e operações de dados.
  Ativar quando o usuário diz: preciso de uma tabela, criar tabela, banco de dados, guardar dados,
  proteger dados, RLS, migração, query, quantos usuários, métricas, receita, me dá os dados,
  consulta supabase, quantos registros, analisa os dados, estatísticas, relatórios, churn,
  funil, storage, auth, configurar permissões, ou qualquer operação de banco.
allowed-tools: Bash(curl *) Bash(export *) Bash(grep *) Bash(python3 *) Read, Write, Edit, Grep
metadata:
  author: saas-factory
  version: "2.0"
---

# Supabase — o seu banco de dados completo

Estrutura, dados, segurança e métricas. Tudo num só lugar.

---

## Setup inicial (uma única vez)

### Passo 1: Credenciais

| Key | Onde encontrá-la | Para quê |
|-----|-------------------|----------|
| **Service Role Key** | Dashboard → Settings → API → `service_role` | Queries diretas (ignora RLS) |
| **Personal Access Token** | supabase.com/dashboard/account/tokens | Management API (SQL cru, logs) |

### Passo 2: Guardar em `.env`

```bash
SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGci...sua_service_role_key
SUPABASE_PAT=sbp_...seu_personal_access_token
SUPABASE_PROJECT_REF=seu_project_ref
```

### Passo 3: Documentar o seu schema

Execute o MEGAPROMPT no final deste arquivo para gerar `references/schema.md` automaticamente.

---

## Carregar credenciais

SEMPRE executar antes de qualquer query:

```bash
export SUPABASE_URL=$(grep '^SUPABASE_URL=' .env | cut -d= -f2)
export SUPABASE_SERVICE_KEY=$(grep '^SUPABASE_SERVICE_KEY=' .env | cut -d= -f2)
export SUPABASE_PAT=$(grep '^SUPABASE_PAT=' .env | cut -d= -f2)
export SUPABASE_PROJECT_REF=$(grep '^SUPABASE_PROJECT_REF=' .env | cut -d= -f2)
```

---

## MCP: estrutura e exploração

Se você tem `@supabase/mcp-server-supabase` em `.mcp.json`:

### Explorar
```
list_tables                    -- Ver estrutura do banco
execute_sql("SELECT ...")      -- Consultar dados
get_logs(service: "auth")      -- Depurar auth
get_logs(service: "postgres")  -- Depurar o banco
```

### Criar/modificar estrutura (DDL)
```
apply_migration(
  name: "nome_descritivo",
  query: "CREATE TABLE | ALTER TABLE | CREATE INDEX"
)
```

### Verificar segurança
```
get_advisors(type: "security") -- Detecta tabelas sem RLS
search_docs("consulta aqui")   -- Buscar na documentação oficial
```

---

## HTTP: dados e operações

### PostgREST (CRUD rápido)

```bash
curl -s "$SUPABASE_URL/rest/v1/TABELA?FILTROS" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
```

### Management API (SQL cru)

```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  -d '{"query": "SEU SQL AQUI"}'
```

**Quando usar cada um:**
- **MCP** → explorar, migrações, verificar segurança
- **PostgREST** → CRUD, filtros, paginação, scripts
- **Management API** → JOINs, agregações, SQL complexo, logs

---

## Padrão: criar tabela com RLS

```sql
-- 1. Criar a tabela
apply_migration(
  name: "create_profiles",
  query: "
    CREATE TABLE profiles (
      id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
      username TEXT UNIQUE,
      avatar_url TEXT,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    )
  "
)

-- 2. Habilitar RLS
apply_migration(
  name: "enable_rls_profiles",
  query: "ALTER TABLE profiles ENABLE ROW LEVEL SECURITY"
)

-- 3. Políticas
apply_migration(
  name: "profiles_select_own",
  query: "
    CREATE POLICY profiles_select_own ON profiles
    FOR SELECT USING (auth.uid() = id)
  "
)

apply_migration(
  name: "profiles_update_own",
  query: "
    CREATE POLICY profiles_update_own ON profiles
    FOR UPDATE USING (auth.uid() = id)
  "
)

-- 4. Verificar
get_advisors(type: "security")
```

### Chaves estrangeiras
```sql
apply_migration(
  name: "create_posts",
  query: "
    CREATE TABLE posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      published BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now()
    )
  "
)
```

### Índices
```sql
-- Simples
apply_migration(name: "idx_posts_user_id", query: "CREATE INDEX idx_posts_user_id ON posts(user_id)")

-- Composto
apply_migration(name: "idx_posts_user_published", query: "CREATE INDEX idx_posts_user_published ON posts(user_id, published)")

-- Parcial
apply_migration(name: "idx_posts_published", query: "CREATE INDEX idx_posts_published ON posts(created_at) WHERE published = true")
```

---

## PostgREST — referência rápida

### Filtros

| Operador | Significado | Exemplo |
|----------|-------------|---------|
| `eq` | Igual | `status=eq.active` |
| `neq` | Diferente | `status=neq.deleted` |
| `gt` / `gte` | Maior / maior ou igual | `price_cents=gt.1000` |
| `lt` / `lte` | Menor / menor ou igual | `created_at=lte.2026-01-01` |
| `like` / `ilike` | Padrão | `email=ilike.*@gmail.com` |
| `in` | Na lista | `status=in.(active,trialing)` |
| `is` | Checagem de null | `deleted_at=is.null` |
| `not` | Negação | `status=not.eq.canceled` |
| `cs` | Contém (arrays) | `tags=cs.{premium}` |

### Ordenar e paginar

| Parâmetro | Exemplo |
|-----------|---------|
| Ordenar | `order=created_at.desc` |
| Limitar | `limit=10` |
| Offset | `offset=20` |
| Selecionar colunas | `select=id,name,email` |
| Contar o total | Header: `Prefer: count=exact` + `-I` |

### CRUD completo

**Listar:**
```bash
curl -s "$SUPABASE_URL/rest/v1/users?select=id,email,created_at&status=eq.active&order=created_at.desc&limit=20" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
```

**Contar:**
```bash
curl -s "$SUPABASE_URL/rest/v1/users?select=id&status=eq.active" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Prefer: count=exact,head=true" -I 2>/dev/null | grep -i content-range
```

**Inserir:**
```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/users" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"email": "test@example.com", "name": "Test User"}'
```

**Atualizar:**
```bash
curl -s -X PATCH "$SUPABASE_URL/rest/v1/users?id=eq.UUID_AQUI" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation" \
  -d '{"status": "inactive"}'
```

**Upsert:**
```bash
curl -s -X POST "$SUPABASE_URL/rest/v1/metrics" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates,return=representation" \
  -d '{"date": "2026-03-16", "value": 100}'
```

**Filtrar por data (últimos 7 dias):**
```bash
curl -s "$SUPABASE_URL/rest/v1/events?created_at=gte.$(date -u -v-7d +%Y-%m-%dT00:00:00Z)&order=created_at.desc" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
```

---

## Management API — SQL cru

**Usuários por dia:**
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT date_trunc('\''day'\'', created_at)::date as day, count(*) FROM users WHERE created_at >= now() - interval '\''30 days'\'' GROUP BY 1 ORDER BY 1"}'
```

**Receita total:**
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT sum(price_cents)/100.0 as revenue_usd, count(*) as total FROM purchases WHERE status = '\''completed'\''"}'
```

**Top N com JOIN:**
```bash
curl -s -X POST "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT u.email, count(o.id) as orders FROM users u JOIN orders o ON o.user_id = u.id GROUP BY u.email ORDER BY orders DESC LIMIT 10"}'
```

**Logs:**
```bash
curl -s "https://api.supabase.com/v1/projects/$SUPABASE_PROJECT_REF/analytics/endpoints/logs.all?iso_timestamp_start=$(date -u -v-1d +%Y-%m-%dT00:00:00Z)" \
  -H "Authorization: Bearer $SUPABASE_PAT"
```

---

## Padrão: métricas de negócio

Adapte nomes de tabela e colunas ao seu schema:

### MRR (Monthly Recurring Revenue)
```bash
curl -s "$SUPABASE_URL/rest/v1/purchases?select=price_cents,billing_interval&status=eq.completed&cancel_at_period_end=eq.false" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" | python3 -c "
import sys,json; data=json.load(sys.stdin)
mrr=sum(r['price_cents']/(12 if r.get('billing_interval')=='year' else 1) for r in data)
print(f'MRR: \${mrr/100:,.2f} USD ({len(data)} assinaturas ativas)')
"
```

### Sinal de churn
```bash
curl -s "$SUPABASE_URL/rest/v1/purchases?select=id&status=eq.completed&cancel_at_period_end=eq.true" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" | python3 -c "
import sys,json; print(f'Vão cancelar: {len(json.load(sys.stdin))}')
"
```

### Funil de conversão
```bash
curl -s "$SUPABASE_URL/rest/v1/funnel_events?select=event_name&created_at=gte.$(date -u -v-7d +%Y-%m-%dT00:00:00Z)" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" | python3 -c "
import sys,json,collections; data=json.load(sys.stdin)
counts=collections.Counter(r['event_name'] for r in data)
for k,v in counts.most_common(): print(f'{k}: {v}')
"
```

---

## Padrão: snapshot de BI (métricas diárias)

Tabela que se preenche toda noite com um snapshot dos seus KPIs:

```sql
CREATE TABLE daily_metrics (
  date DATE PRIMARY KEY,
  total_users INTEGER,
  active_users INTEGER,
  new_signups INTEGER,
  revenue_cents INTEGER,
  mrr_cents INTEGER,
  churned INTEGER,
  snapshot_at TIMESTAMPTZ DEFAULT now()
);
```

Script de snapshot:
```bash
TOTAL=$(curl -s "$SUPABASE_URL/rest/v1/users?select=id" -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" -H "Prefer: count=exact,head=true" -I 2>/dev/null | grep -i content-range | sed 's/.*\///')

curl -s -X POST "$SUPABASE_URL/rest/v1/daily_metrics" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates,return=representation" \
  -d "{\"date\": \"$(date +%Y-%m-%d)\", \"total_users\": $TOTAL}"
```

---

## MEGAPROMPT: documentar o seu schema

Copie e cole no Claude Code:

```
Documenta o schema completo do meu banco de dados Supabase.

1. Execute: list_tables
2. Para cada tabela: execute_sql("SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'NOME_TABELA' ORDER BY ordinal_position")
3. Gere references/schema.md com o formato:

# [Meu projeto] -- Database Schema
## Project: [project_ref]
## Tables ([N] total)

### nome_tabela (CRITICAL - [domínio])
- coluna1: tipo, coluna2: tipo, ...

Marque CRITICAL as tabelas mais importantes (usuários, compras, conteúdo).
Agrupe por domínio (Core, Content, Analytics, etc.).
```

---

## Princípios

1. **RLS sempre**: toda tabela com dados de usuário deve ter RLS habilitado
2. **Migrações nomeadas**: nomes descritivos para rastreio
3. **apply_migration para DDL**: CREATE, ALTER, DROP
4. **execute_sql para DML**: SELECT, INSERT, UPDATE, DELETE
5. **get_advisors depois de criar tabelas**: verificar segurança
6. **NUNCA fabricar dados**: se uma query falhar, dizer
7. **NUNCA misturar janelas de tempo**: avisar se se comparam períodos incompatíveis
8. **Verificar com queries reais**: não confiar em docs desatualizados
9. **Service Role Key ignora RLS**: só em desenvolvimento/admin
10. **Documentar o seu schema**: o Claude é 10x mais útil quando conhece as suas tabelas

---

## Fluxo de trabalho

```
Estrutura:
  list_tables → desenhar → apply_migration → RLS → policies → get_advisors → test data

Dados:
  Carregar credenciais → PostgREST (CRUD) ou Management API (SQL) → verificar o resultado
```

## Referência: o seu schema

Se você documentou o schema, está em `references/schema.md`. Leia antes de qualquer query.
