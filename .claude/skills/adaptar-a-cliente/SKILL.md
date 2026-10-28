---
name: adaptar-a-cliente
description: |
  Do brief de um cliente a uma instância do Builder CRM adaptada, implantada e testada,
  num único fluxo: entender, especificar, configurar, construir módulos, implantar no
  Coolify, testar e entregar. É a skill orquestradora do fluxo one-shot.
  Ativar quando o usuário diz: adapta o CRM para <cliente>, cliente novo, quero um
  CRM para um <nicho>, personaliza o Builder CRM, implanta uma instância para <cliente>,
  ou cola um brief de cliente.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Skill
---

# Adaptar o Builder CRM a um cliente

> Entrada: $ARGUMENTS (brief, prompt ou nome do cliente)

O seu trabalho termina com uma **URL funcionando**, credenciais de demo e um resumo. Não
termina com "pronto para implantar". Siga os passos em ordem; cada passo deixa um commit.

## 0. Regras que não se negociam

- **Nunca edite o núcleo** (`src/`, `supabase/`, `scripts/`, Docker). Tudo vai em
  `config/`, `modules/`, `public/marca/`, `specs/<cliente>/`. Se você achar que faz falta
  tocar no núcleo, pare e explique: é uma melhoria para o repositório original.
- Segredos só em `.env.local` (local) e nas variáveis do Coolify. Nada no repositório.
- Zero dados reais em seeds, specs ou commits.
- Se o repositório tem `.claude/memory/`, leia `MEMORY.md` antes de começar.

## 1. Entender (no máximo 3 perguntas, todas juntas)

Leia o brief e resolva com bom senso. Pergunte SÓ se faltar algo crítico e
agrupe as perguntas numa única mensagem. `specs/_brief.md` é o questionário completo:
se o brief vier muito magro, passe esse arquivo ao membro em vez de interrogá-lo pelo
chat. O típico que faz falta:

1. **Nome do cliente e nicho** (imobiliária, clínica, loja...). Se existe
   `config/plantillas/<nicho>.ts`, parta dali.
2. **Domínio** para a instância (`crm.cliente.com`, com DNS apontando para o VPS) e
   acesso ao **Coolify** (URL + token) e ao **Supabase** (MCP em modo conta, ou um
   projeto já criado). Sem isso dá para fazer tudo menos implantar.
3. **Chave do OpenRouter** (se não, o agente não responde e a demo fica sem IA).

Não pergunte por canais (Zernio): conectam-se depois com `conectar-zernio`.

## 2. Especificar

Copie `specs/_modelo.md` para `specs/<cliente>/spec.md` e complete: problema,
decisões do dono (as respostas do passo 1), cenários, requisitos, configuração
(marca, pipeline, campos, módulos), modelo de dados (só tabelas de módulos), agente
(prompt, campos a qualificar), critérios de aceitação. Trilho leve salvo que haja
módulos com tabelas novas. Commit: `Spec de <cliente>`.

## 3. Configurar (zona do cliente)

1. `config/cliente.ts`: `definirConfig({ ...plantilla, marca: {...}, ... })` ou do
   zero. Marca (nombre, nombreCorto, descripcion, colorPrimario, colorSidebar),
   `idioma`, `moneda`, `roles.etiquetaAsesor`, `pipeline.etapas` (clave snake_case,
   nombre, color, ganada/perdida), `contacto.campos` (com `agente.descripcion` nos
   que o agente deva descobrir), `agente` (nombre, prompt, mensajeDerivacion).
2. `config/modulos.json`: `{ "activos": [...] }` com os módulos que a spec pede.
3. `public/marca/logo.png` e `icono.png` (se o cliente os deu; se não, deixe os
   genéricos e anote no resumo). `npm run pwa:icons`.
4. Verifique: `npm run typecheck && npm run lint && npm run build`. Commit:
   `Configuracion de <cliente>`.

## 4. Construir módulos

Por cada módulo novo que a spec peça, invoque a skill `crear-modulo`. Os que já
existem (`modules/propiedades`, `modules/visitas`, `modules/ejemplo` como referência)
só se ativam. Commit por módulo.

## 5. Implantar

Invoque `deploy-coolify`. Resultado esperado: projeto Supabase com migrações
aplicadas, conta admin de demo criada, app no Coolify respondendo `/api/health`
com `ok: true`, dados demo carregados (`npm run seed -- --url https://...`).

## 6. Conectar canais (opcional agora)

Se o cliente já tem credenciais do Zernio, invoque `conectar-zernio`. Se não, deixe
instruções no resumo: a demo funciona com o simulador.

## 7. Testar

Invoque `probar-instancia` contra a URL implantada. Se algo falhar: diagnostique,
corrija, reimplante e teste de novo. Não entregue com checks vermelhos; se um não se
puder cumprir (por exemplo falta OpenRouter), diga explicitamente.

## 8. Entregar

Uma mensagem com:
- **URL** da instância e `/api/health`.
- **Acesso demo**: e-mail e senha do admin criado (pedir para trocá-la).
- **O que se construiu**: marca, etapas, campos, módulos, prompt do agente (resumo).
- **Como seguir**: conectar WhatsApp/IG/Messenger (`conectar-zernio`), carregar
  catálogo real, ajustar o prompt em Ajustes -> Agente.
- **Pendências e decisões** que você tomou sozinho.
- Tempo total do fluxo.

Guarde em `.claude/memory/` o que não for óbvio do cliente (skill `memory-manager`).
