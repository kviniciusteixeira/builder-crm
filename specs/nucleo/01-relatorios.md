# Spec: Relatórios reais (requisito 1 do brief, "relatórios visuais básicos")

**Trilho**: completo (mexe no modelo de dados: origem da mensagem)
**Estado**: aprovada (plano da Fase 0, 2026-10-01)
**Data**: 2026-10-01
**Escrita antes do código**: sim

## Problema

`/reportes` é uma maquete com números inventados ("$1.24M") e o dashboard mostra
deltas e sparklines falsos ("+12% vs mês passado"). Numa demo de venda isso é um
risco: o cliente pergunta de onde sai o número. O brief pede relatórios visuais
básicos que funcionem.

## Decisões do dono

- D1 (Fase 0) Relatórios é núcleo, desligável por config (`modulos.nucleo.reportes`).

## Cenários

1. **Ver o período** — O membro abre Relatórios, escolhe 7 / 30 / 90 dias e vê KPIs e
   gráficos calculados sobre os dados reais desse período (um assessor só sobre os seus
   contatos; o admin sobre tudo).
2. **Entender o funil** — Quantas operações há por etapa do pipeline padrão
   e quanto valor; quantas foram ganhas e perdidas no período e a taxa de fechamento.
3. **Ver de onde vêm** — Contatos novos por fonte e conversas novas por
   canal.
4. **Medir o agente** — Mensagens recebidas, quantas enviadas o agente escreveu e
   quantas uma pessoa, encaminhamentos para humano, e tempo médio da primeira resposta.
5. **Dashboard honesto** — Os cartões do início mostram valores e comparações
   reais (últimos 7 dias vs os 7 anteriores) ou nada; sem sparklines inventadas.

## Requisitos

- FR-001 `messages.origin` (`agent | human | template | webhook`, nullable) escrito por
  `deliverMessage` conforme a origem; a ingestão de recebidas deixa nulo.
- FR-002 `src/lib/reportes.ts` calcula, com `ownerFilter`, para um intervalo de dias:
  KPIs (contatos novos, conversas novas, mensagens recebidas, % respondido pelo
  agente, operações ganhas e seu valor, taxa de fechamento, primeira resposta média),
  contatos por fonte, conversas por canal, conversas e mensagens por dia,
  funil por etapa, encaminhamentos. Exclui `provider = "simulador"`.
- FR-003 `/reportes` é server-rendered com `?dias=7|30|90` (default 30) e passa os
  dados a componentes cliente de gráficos (recharts, já instalado). Sem dados mostra
  estados vazios, não zeros disfarçados.
- FR-004 O dashboard (`/`) usa comparações reais (7 dias vs 7 anteriores) e uma
  série diária real nos cartões; elimina-se `mockSparkline`.
- FR-005 Elimina-se `ReportesMockup.tsx`.

## Configuração e módulos

Nenhum novo.

## Modelo de dados

`messages.origin text` (base regenerada, pré-1.0.0).

## Agente de IA

Sem mudanças (as saídas dele levam `origin = "agent"`).

## Critérios de aceitação

- CA-001 Com a base vazia, `/reportes` carrega sem erro e mostra estados vazios.
- CA-002 Com o seed demo (Fase 9), os KPIs coincidem com contagens SQL diretas.
- CA-003 Um assessor vê só o dos seus contatos.
- CA-004 As conversas simuladas não somam em Relatórios.
- CA-005 `typecheck + lint + build` em verde.

## Constitution Check

- I. Núcleo intocável: núcleo, sem nada do cliente.
- II. Spec antes do código: esta spec.
- III. Autoverificação: `probar-instancia` abre /reportes e espera 200.
- IV. Zero segredos: não se aplica.

## Fora de escopo

- Exportar relatórios, comparar períodos arbitrários, relatórios por assessor para o admin
  (o admin vê o total).
