# Spec: Casa Sur — imobiliária (exemplo de spec de cliente)

> Exemplo completo da spec que `adaptar-a-cliente` escreve para um cliente do nicho
> imobiliário. Os dados são inventados. Serve como referência de nível de detalhe.

**Trilho**: leve (usa o modelo imobiliário e os dois módulos; sem tabelas novas)
**Estado**: aprovada
**Data**: 2026-10-02
**Escrita antes do código**: sim

## Problema

Casa Sur é uma imobiliária com três assessores que atende leads de portais,
Instagram e WhatsApp a partir de telefones pessoais. Perdem consultas fora do horário,
ninguém sabe em que etapa está cada lead e as visitas se coordenam por chat solto.
Precisam de uma caixa de entrada única com um agente que qualifique (operação, tipo, zona,
orçamento, dormitórios), mostre opções do catálogo e agende visitas, com um
pipeline visível para a equipe.

## Decisões do dono

- D1 Nicho: imobiliária (venda e aluguel) -> modelo `inmobiliaria`.
- D2 Domínio `crm.casasur.ejemplo`, Coolify do membro, projeto Supabase novo.
- D3 OpenRouter com `anthropic/claude-sonnet-4.5` (a agência paga o modelo).
- D4 Canais: WhatsApp e Instagram via Zernio; Messenger não (não têm página).
- D5 Tom do agente: espanhol neutro, próximo, sem "¿" inicial (preferência do
  cliente).

## Cenários

1. **Receber** — Um lead escreve pelo WhatsApp "olá, vi o apto de Providencia":
   entra na caixa de entrada, o agente responde em segundos com os dados do catálogo e
   pergunta operação e orçamento.
2. **Qualificar** — Com operação, tipo, zona e orçamento conhecidos, o agente grava
   os campos na ficha e move a operação para "Calificado".
3. **Oferecer** — Se o lead descreve o que busca, o agente oferece 2-3 imóveis
   do catálogo (nunca inventados).
4. **Agendar** — Se o lead quer visitar, o agente cria a visita em coordenação e
   move para "Visita agendada"; um assessor confirma a data em `/m/visitas`.
5. **Encaminhar** — Perguntas de financiamento ou documentação passam a uma pessoa; o
   fio fica pausado com o motivo e o assessor o reativa ao terminar.
6. **Ver** — Os assessores veem só os seus leads; a dona (admin) vê tudo e os relatórios.

## Requisitos

- FR-001 Marca: nome "Casa Sur", curto "CasaSur", cor primária `#1E6F5C`, logo
  do cliente em `public/marca/`.
- FR-002 Pipeline: Nuevo lead -> Calificado -> Visita agendada -> Visita realizada ->
  Negociacion -> Cerrado ganado / Cerrado perdido (chaves do modelo).
- FR-003 Campos: tipo_operacion (Compra/Arriendo), tipo_propiedad, zona,
  presupuesto (número), dormitorios (número); os cinco qualificáveis pelo agente.
- FR-004 Módulos ativos: `propiedades`, `visitas`.
- FR-005 Agente: prompt do modelo com tom D5; encaminhar diante de financiamento,
  documentação ou pedido de falar com uma pessoa.
- FR-006 Moeda USD; idioma es; rótulo de papel "Asesor".
- FR-007 Catálogo: carregar a partir do Tokko (`TOKKO_API_KEY` do cliente) com
  `npm run sync:tokko`; enquanto não houver key, seed de demo.

## Configuração e módulos

`config/cliente.ts`:

```ts
import { definirConfig } from "@/lib/config/schema";
import modulos from "./modulos.json";
import { plantillaInmobiliaria } from "./plantillas/inmobiliaria";

export default definirConfig({
  ...plantillaInmobiliaria,
  marca: {
    ...plantillaInmobiliaria.marca,
    nombre: "Casa Sur",
    nombreCorto: "CasaSur",
    descripcion: "Propiedades en venta y arriendo. Te respondemos al instante.",
  },
  agente: {
    ...plantillaInmobiliaria.agente,
    nombre: "Sofia de Casa Sur",
  },
  modulos: { ...plantillaInmobiliaria.modulos, activos: modulos.activos },
});
```

`config/modulos.json`: `{ "activos": ["propiedades", "visitas"] }`.

## Modelo de dados

Nenhum novo (tabelas `propiedades` e `visitas` dos módulos).

## Agente de IA

Prompt do modelo + ajuste de tom (D5): adiciona-se no final do prompt
"Escribis las preguntas sin el signo de apertura ¿". Campos a qualificar: os cinco.
Tools: as genéricas + `buscar_propiedades`, `buscar_info_propiedades`,
`agendar_visita`.

## Critérios de aceitação

- CA-001 `probar-instancia` em verde contra `https://crm.casasur.ejemplo` com
  `--marca "Casa Sur" --etapas nuevo,calificado,visita_agendada --modulos propiedades,visitas`.
- CA-002 Em `/simulador`, o roteiro "busco um apto de 2 dormitórios em Providencia,
  tenho 150 mil para comprar" termina com campos preenchidos e a operação em
  "Calificado"; "quero visitá-lo" cria a visita e move para "Visita agendada".
- CA-003 Um assessor não vê os leads de outro assessor em `/contacts` nem em `/reportes`.
- CA-004 `git status` após a adaptação só mostra `config/`, `public/marca/`,
  `public/icons/` e `specs/casasur/`.

## Constitution Check

- I. Núcleo intocável: cumpre (só config, módulos existentes e assets).
- II. Spec antes do código: esta spec.
- III. Autoverificação: CA-001 e CA-002.
- IV. Zero segredos: Tokko, OpenRouter e Zernio por variáveis da instância.

## Fora de escopo

- Messenger (D4). Integração com o portal próprio do cliente (não tem). Assinatura
  digital de contratos.
