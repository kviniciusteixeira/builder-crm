# Constituição do Builder CRM

Princípios inegociáveis do projeto. Toda spec, todo módulo e toda sessão de Claude
Code se regem por isto. Mudá-la é uma decisão do dono do repositório e se registra em
`CHANGELOG.md`.

**Versão**: 1.0.0 · **Ratificada**: 2026-10-01

## Princípios

### I. O núcleo não se modifica para um cliente

Tudo o que é específico de um cliente vive em **configuração** (`config/cliente.ts`) ou em
**módulos** (`modules/<nombre>/`). O núcleo (`src/`, `supabase/migrations/`,
`scripts/`, `Dockerfile`) é o mesmo em todas as instâncias e só muda com uma
versão nova do repositório original.

- Marca, pipeline, campos do contato e módulos ativos: configuração.
- Telas, tabelas, rotas de API e tools do agente próprias de um cliente: um módulo.
- Se uma adaptação não puder ser feita sem tocar em `src/`, é um bug do núcleo: se
  reporta ao repositório original como melhoria genérica, não se corrige na instância.

**Razão**: uma instância que edita o núcleo não consegue atualizar sem conflitos, e
o valor do modelo é que as atualizações cheguem a todos os clientes.

### II. Toda funcionalidade nova parte de uma spec

Antes de escrever código existe um `spec.md` (modelo em `specs/_modelo.md`)
com problema, cenários observáveis, requisitos numerados e critérios de
aceitação. Uma adaptação de cliente vai em `specs/<cliente>/`; uma mudança do núcleo
em `specs/nucleo/`.

- Trilho **completo** quando mexe em modelo de dados, contrato público ou núcleo.
- Trilho **leve** (só `spec.md`) quando é configuração, um módulo ou UI.
- Uma spec escrita depois do código declara isso no cabeçalho.

**Razão**: a spec é o que permite que um membro, o Claude e o cliente falem da mesma
coisa, e é o estado durável entre sessões.

### III. Nada se entrega sem passar na autoverificação

Uma instância está "terminada" quando `scripts/verificar-instancia.mjs` (skill
`probar-instancia`) passa em verde contra a instância implantada: responde o health
check, dá para iniciar sessão, a marca e o pipeline do cliente estão aplicados,
uma conversa de teste entra pelo simulador, o agente responde e move a
etapa, e os módulos novos gravam e mostram dados.

- "Compila" não é "funciona". O gate técnico (`typecheck + lint + build`) é o piso.
- Quem implementa testa; a prova não se delega ao cliente nem ao membro.
- Se algo falha, diagnostica-se, corrige-se e verifica-se de novo até ficar verde.

**Razão**: o membro entrega a URL numa reunião com o cliente; não há segunda
chance para que "quase" funcione.

### IV. Zero segredos no código

Credenciais, tokens e URLs com segredos vão em variáveis de ambiente (`.env.local`
no local, variáveis da plataforma no Coolify). O repositório só versiona
`.env.example` e `.mcp.json.example`, com cada variável explicada e sem valores.

- Nenhum dado de clientes reais em seeds, fixtures, specs ou commits.
- As chaves `NEXT_PUBLIC_*` são públicas por design: só vão aí as que o são.
- Todas as tabelas têm RLS ativado; a API pública do Supabase não expõe dados.
- Antes de publicar: varredura do histórico (gitleaks).

**Razão**: cada membro clona este repositório para vários clientes; um segredo vazado se
multiplica por cada instância.

## Governança

- Esta constituição manda sobre `CLAUDE.md`, as skills e qualquer instrução de
  sessão. Se chocarem, ganha a constituição.
- Emendas: proposta escrita, aprovação do dono, versão nova (maior se se
  tira ou redefine um princípio; menor se se adiciona ou amplia; patch se é
  redação), e entrada em `CHANGELOG.md`.
- Cada spec inclui um **Constitution Check**: uma linha por princípio.
