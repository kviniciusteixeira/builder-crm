# Módulo `ejemplo` — Tarefas

Módulo mínimo que existe para mostrar (e testar) o mecanismo de módulos. Pode ser
apagado numa instância real sem tocar em mais nada.

| O quê | Onde |
|---|---|
| Menu | "Tareas" na seção Productividad (`manifiesto.ts`) |
| Página | `/m/ejemplo` (`servidor.tsx` → `paginas[""]`) |
| API | `GET/POST /api/m/ejemplo`, `PATCH/DELETE /api/m/ejemplo/<id>` |
| Tabela | `ejemplo_tareas` (`migrations/0000_ejemplo.sql`, com RLS) |
| Campo de contato | `ejemplo_prioridad` (seleção Alta/Media/Baja) |
| Tool do agente | `anotar_tarea` |
| Seed | duas tarefas para o primeiro membro |

Ativar: adicionar `"ejemplo"` a `config/modulos.json` → `activos` e rodar
`npm run db:migrar`. Desativar: tirá-lo da lista (a tabela permanece).
