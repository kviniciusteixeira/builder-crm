# modules/ — zona do cliente

Cada acréscimo específico de um cliente (pedidos, consultas, imóveis, visitas...) é um
**módulo**: uma pasta autocontida que o núcleo descobre pela configuração. Adicionar
um módulo nunca toca em `src/`.

```
modules/
|-- README.md            <- este guia
|-- _plantilla/          <- copiar para começar (não ativável)
|-- ejemplo/             <- módulo mínimo funcionando (tarefas); pode ser apagado
`-- <nombre>/
    |-- manifiesto.ts    <- nav, campos, título (seguro para o navegador)
    |-- servidor.tsx      <- páginas, api, tools, seed
    |-- componentes/     <- UI do módulo
    |-- migrations/      <- SQL idempotente, com RLS
    `-- README.md
```

## Como se ativa

`config/modulos.json`:

```json
{ "activos": ["propiedades", "visitas"] }
```

Essa lista é lida por três coisas: `config/cliente.ts` (validação), o runner de
migrações (`npm run db:migrar` aplica `modules/<activo>/migrations/`) e o gerador
do registro (`scripts/generar-registro-modulos.mjs`), que escreve
`src/lib/modules/*.generated.ts` com imports estáticos dos módulos ativos. O
gerador roda sozinho ao iniciar `next dev`, no `next build` e no `npm run typecheck`:
só os módulos ativos entram no bundle.

Desligar um módulo = tirá-lo da lista. As rotas passam a 404, ele some do menu e
as tabelas ficam intactas.

## O que um módulo pode contribuir

| Peça | Onde | Como chega ao núcleo |
|---|---|---|
| Entradas do menu | `manifiesto.nav` | Sidebar e menu móvel, na seção declarada |
| Páginas | `servidor.paginas` | `/m/<nombre>/<patron>` via o catch-all `src/app/m/[modulo]/[[...ruta]]` |
| API | `servidor.api` | `/api/m/<nombre>/<patron>`, já com `requireMember` |
| Campos do contato | `manifiesto.campos` | Somam-se a `config/cliente.ts`: formulário, ficha, tabela, chat e agente |
| Tools do agente | `servidor.tools` | Somam-se às do núcleo enquanto o módulo está ativo |
| Tabelas | `migrations/*.sql` | O runner as aplica, em ordem, uma única vez |
| Dados demo | `servidor.seed` | `npm run seed` |

Padrões de rota: `""` (principal), `"nueva"`, `"[id]"`, `"[id]/editar"`. Um segmento
entre colchetes captura e chega em `params`. O padrão com mais segmentos literais
vence.

## Regras

1. **Nome** em snake_case, igual à pasta. Tabelas, chaves de campos e tools com
   o nome do módulo como prefixo (`visitas_citas`, `visitas_zona`, `agendar_visita`).
2. **Sem tocar em `src/`.** Se algo não puder ser feito a partir do módulo, é uma melhoria do
   núcleo: pede-se ao repositório original, não se corrige na instância.
3. **Importar só** `@/lib/*`, `@/components/{ui,layout,shared}/*`, `@/db`, `@/lib/modules/types` e
   pacotes do `package.json`. Nunca outro módulo.
4. **RLS em toda tabela** (`alter table ... enable row level security` + política de
   leitura). O runner força isso de qualquer forma, mas sem política ninguém lê pela API pública.
5. **Credenciais por env**, documentadas no README do módulo e em `.env.example`.
6. **Spec antes** (`specs/<cliente>/spec.md`) e **autoverificação depois**
   (`probar-instancia` abre `/m/<nombre>` e testa se grava e mostra dados).

## Criar um

```bash
cp -r modules/_plantilla modules/<nombre>
# completar manifiesto.ts, servidor.tsx, migrations/0000_<nombre>.sql, README.md
# adicionar "<nombre>" a config/modulos.json
npm run db:migrar && npm run typecheck && npm run dev
```

Ou pedir ao Claude Code com a skill `crear-modulo`.
