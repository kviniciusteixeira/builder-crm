---
name: nueva-plantilla-nicho
description: |
  Converte uma adaptação bem-sucedida de um cliente num modelo reutilizável para outros
  clientes do mesmo nicho: config/plantillas/<nicho>.ts genérico, módulos sem dados do
  cliente, spec do modelo e seed coerente. Ativar quando o usuário diz: converte
  isto em modelo, quero reutilizar o de <cliente> para outros, novo modelo de nicho,
  modelo para <clínicas|lojas|...>.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Novo modelo de nicho

> Nicho / cliente de origem: $ARGUMENTS

Referência: `config/plantillas/inmobiliaria.ts` + `modules/propiedades` +
`modules/visitas` + `specs/imobiliaria/spec.md`.

## 1. Extrair a configuração

1. Copie `config/cliente.ts` do cliente de origem para `config/plantillas/<nicho>.ts`
   exportando `plantilla<Nicho>: ConfigClienteEntrada` (não `definirConfig`).
2. **Despersonalize**: marca genérica ("Clinica Demo", cores neutras), sem
   telefones, endereços nem nomes reais; pipeline, campos e prompt do agente se
   conservam porque são do nicho, não do cliente.
3. O prompt do agente em espanhol neutro (tu) salvo que o nicho seja regional; deixe
   os placeholders `{{agente}}`, `{{negocio}}`, `{{canal}}`, `{{fecha}}`.
4. `modulos.activos` com os módulos do nicho (lembrete no comentário de que
   a lista real vai em `config/modulos.json`).

## 2. Generalizar os módulos

Por cada módulo que a adaptação criou:
- Nome e textos genéricos do nicho, não do cliente.
- Seed com dados inventados coerentes com o nicho (cidades e nomes fictícios).
- README com variáveis de ambiente e como se ativa.
- Se o módulo dependia de um provedor concreto do cliente (uma API), deixe o
  conector atrás de variáveis de ambiente e documente a alternativa sem ele.

## 3. Documentar

- `specs/<nicho>/spec.md` (exemplo: `specs/imobiliaria/spec.md`): problema do
  nicho, pipeline, campos, prompt, módulos, critérios de aceitação.
- Uma linha em `config/README.md` (tabela de modelos) e no `README.md` do repositório.
- `CHANGELOG.md`: "Novo: modelo <nicho>".

## 4. Verificar

1. Com o modelo ativo em `config/cliente.ts` e os módulos em
   `config/modulos.json`: `npm run typecheck && npm run lint && npm run build`.
2. Valide a config fora do Next (zod): um script `tsx` que importe
   `esquemaConfig` e o modelo e faça `safeParse` (ver `specs/nucleo/07-*`).
3. Numa instância de teste: `npm run seed` e `/simulador` com um roteiro do nicho;
   o agente deve qualificar com os campos e mover a etapa.
4. Deixe `config/cliente.ts` e `config/modulos.json` como estavam (o modelo não se
   ativa sozinho).

Commit: `Agregar plantilla <nicho>`. Se o repositório é um fork, abra um PR ao repositório original
para que o modelo chegue a toda a comunidade.
