# Módulo `visitas` — visitas e calendário

Coordenação de visitas presenciais (a um imóvel, uma loja, uma obra) com agenda
mensal. Faz parte do modelo imobiliário, mas não tem nada de imobiliário:
serve para qualquer negócio que agende encontros.

| O quê | Onde |
|---|---|
| Menu | "Visitas" (Operaciones) e "Calendario" (Productividad) |
| Páginas | `/m/visitas` (lista por estado) e `/m/visitas/calendario` (mês) |
| API | `GET/POST /api/m/visitas`, `PATCH/DELETE /api/m/visitas/<id>` |
| Tabela | `visitas` (`migrations/0000_visitas.sql`, RLS pelo contato visível) |
| Tool do agente | `agendar_visita` (deixa a visita em coordenação; uma pessoa confirma) |
| Seed | 4 visitas de exemplo sobre os primeiros contatos |

Estados: `coordinating` (sem data confirmada), `scheduled` (data e hora),
`completed`, `cancelled`. Um assessor vê só as visitas dos seus contatos.

Sem variáveis de ambiente. A sincronização com o Google Calendar não está implementada.
