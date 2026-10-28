# Módulo `propiedades` — catálogo e busca

Catálogo de imóveis que o agente consulta para responder com dados reais.

| O quê | Onde |
|---|---|
| Menu | "Propiedades" (Operaciones) |
| Página | `/m/propiedades` (listagem) |
| API | `GET /api/m/propiedades[?q=texto]` |
| Tabela | `propiedades` (`migrations/0000_propiedades.sql`, pgvector, RLS para membros) |
| Tools do agente | `buscar_propiedades` (por critérios) e `buscar_info_propiedades` (por endereço ou link) |
| Seed | 6 imóveis de demonstração (sem embeddings) |
| Sync | `npm run sync:tokko` (`scripts/sync-tokko.ts`): traz o catálogo do Tokko Broker |

## Variáveis de ambiente (todas opcionais)

| Variável | Para quê | Sem ela |
|---|---|---|
| `OPENAI_API_KEY` | Embeddings (busca semântica por critérios) | A busca usa filtros SQL (operação, tipo, preço, cômodos, zona) |
| `TOKKO_API_KEY` | Sincronizar o catálogo a partir do Tokko | Os imóveis são carregados por seed ou por SQL |
| `FIRECRAWL_API_KEY` | Ler um link de portal para encontrar o imóvel | `buscar_info_propiedades` só aceita endereço ou nome |

Para outra origem de catálogo (Excel, outra API), copie `scripts/sync-tokko.ts` e mapeie
para as colunas de `tabla.ts`; `external_id` é a chave de upsert.
