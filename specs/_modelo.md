# Spec: <nome curto da funcionalidade ou do cliente>

> Copiar este arquivo para `specs/<cliente>/spec.md` (adaptação de um cliente) ou para
> `specs/nucleo/NN-nome.md` (mudança no núcleo). Apagar as notas em itálico.
> Uma spec se escreve ANTES do código. Se foi escrita depois, dizer isso no cabeçalho:
> é documentação, não desenho.

**Trilho**: completo | leve — *completo se mexe no modelo de dados, num contrato público
(API, webhook, interface de conector) ou no núcleo; leve se é config, módulo ou UI.*
**Estado**: rascunho | aprovada | implementada
**Data**: AAAA-MM-DD
**Escrita antes do código**: sim | não

## Problema

*O que o cliente ou o núcleo precisa, em duas ou três frases. O que acontece hoje se não for feito.*

## Decisões do dono

*Respostas às perguntas que foi preciso fazer antes de começar (máximo 3 por brief).
Numeradas D1, D2... para poder citá-las.*

## Cenários

*Como se usa, com verbos. Um por linha, numerados. Cada cenário tem que ser
observável: alguém consegue testá-lo sem ler código.*

1. **Receber** — ...
2. **Responder** — ...

## Requisitos

*O que o sistema DEVE fazer. Numerados FR-001, FR-002... Se algo não estiver claro,
marcar `[PENDENTE: pergunta]` em vez de inventar.*

- FR-001 O sistema DEVE ...
- FR-002 ...

## Configuração e módulos

*O que muda em `config/cliente.ts` (marca, pipeline, campos, módulos ativos) e quais
módulos novos se criam em `modules/`. Se não mexe em config nem em módulos, dizer "nenhum".*

## Modelo de dados

*Tabelas ou colunas novas, com a migração. As tabelas de um módulo vivem em
`modules/<modulo>/migrations/`. Se não mexe em dados, dizer "nenhum".*

## Agente de IA

*Prompt, campos a qualificar e tools novas. Se não muda, dizer "sem mudanças".*

## Critérios de aceitação

*O que `probar-instancia` (ou uma pessoa) verifica para dar a spec por cumprida.
Numerados CA-001... Cada um tem que poder ficar vermelho ou verde.*

- CA-001 ...

## Constitution Check

*Uma linha por princípio de `specs/CONSTITUICAO.md`: cumpre / não se aplica / exceção
justificada.*

- I. Núcleo intocável: ...
- II. Spec antes do código: ...
- III. Autoverificação: ...
- IV. Zero segredos: ...

## Fora de escopo

*O que se decidiu NÃO fazer, e por quê. Evita que se discuta de novo.*
