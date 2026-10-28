---
name: crear-modulo
description: |
  Cria um módulo novo em modules/<nombre>/ respeitando o contrato do núcleo
  (manifesto, servidor, migrações com RLS, campos, tools do agente, seed) e o ativa
  em config/modulos.json. Ativar quando o usuário diz: cria um módulo, preciso de uma
  seção de <pedidos|consultas|imóveis|...>, adiciona uma tabela para o cliente, o CRM
  tem que lidar com <coisa>, ou quando adaptar-a-cliente o exige.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Criar um módulo

> Módulo a criar: $ARGUMENTS

Um módulo é uma pasta autocontida que o núcleo descobre pela configuração.
Antes de escrever, leia `modules/README.md` (regras), `src/lib/modules/types.ts`
(contrato) e `modules/ejemplo/` (módulo mínimo funcionando).

## 1. Definir

- **Nome** em snake_case, igual à pasta (`pedidos`, `citas`, `propiedades`).
- Que **telas** tem (`""` principal, `nueva`, `[id]`, `[id]/editar`), que **API**,
  que **tabelas** (prefixo `<nombre>_`), que **campos de contato** contribui (prefixo
  `<nombre>_` na chave), que **tools** dá ao agente, e que **seed**.
- Se houver spec do cliente (`specs/<cliente>/spec.md`), a seção "Configuração e
  módulos" já diz. Se não, escreva a spec leve primeiro.

## 2. Criar a pasta

```bash
cp -r modules/_plantilla modules/<nombre>
```

Complete:

- `manifiesto.ts`: `nombre`, `titulo`, `descripcion`, `version`, `nav` (ícone de
  lucide, seção Operaciones | Productividad | Inteligencia), `campos`.
  **Seguro para o navegador**: nada de banco de dados nem `server-only`.
- `tabla.ts` (se houver tabelas): `pgTable` do drizzle, espelho exato da migração.
- `migrations/0000_<nombre>.sql`: `create table if not exists`, índices, `alter table
  ... enable row level security` e uma política de leitura (`public.contacto_visible`
  se pende de um contato; `public.es_miembro()` se é catálogo; `public.es_admin()`
  se é sensível). Idempotente.
- `servidor.tsx`: `paginas`, `api` (handlers recebem `{ params, member }`, já passaram
  `requireMember`; filtra por `ownerFilter(member)` / `canAccessContactId` o que pende
  de contatos), `tools` (nome único, `descripcionUI`, `ejecutar(args, ctx)` devolve
  `{ ok, data | error }`), `seed` idempotente.
- `componentes/`: UI. Importe só `@/components/{ui,layout,shared}/*`, `@/lib/*`.
- `README.md`: tabela do que há onde, variáveis de ambiente (se houver), como ativar.

## 3. Ativar e migrar

1. Adicione `"<nombre>"` a `config/modulos.json` -> `activos`.
2. `npm run db:migrar` (aplica `modules/<nombre>/migrations/`).
3. `npm run typecheck && npm run lint && npm run build`.

## 4. Verificar

- `npm run dev` e abrir `/m/<nombre>`: a página carrega, o item está no menu.
- `curl` (com sessão) ou a UI: criar um registro, vê-lo, editá-lo.
- Se contribui campos: aparecem no formulário de contato e na ficha.
- Se contribui tools: aparecem em Ajustes -> Agente IA; testar com `/simulador` que o
  agente as usa.
- Se tem variáveis de ambiente: adicioná-las a `.env.example` com guia e ao README.

Commit: `Agregar modulo <nombre>`.

## O que NÃO se faz

- Tocar em `src/` para "ajudar" o módulo. Se o contrato não alcançar, é uma melhoria do
  núcleo: anotá-la e propô-la ao repositório original.
- Importar de outro módulo.
- Tabelas sem RLS, chaves de campos sem prefixo, tools com nomes genéricos que choquem
  com as do núcleo (`mover_etapa`, `actualizar_contacto`, `registrar_actividad`,
  `resumen_lead`, `derivar_asesor`, `asignar_asesor`).
