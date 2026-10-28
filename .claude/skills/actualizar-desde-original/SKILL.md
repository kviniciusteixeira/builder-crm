---
name: actualizar-desde-original
description: |
  Traz uma versão nova do repositório original do Builder CRM a uma instância já adaptada
  (fork ou clone de um cliente) sem perder a personalização: upstream, merge, migrações,
  verificação. Ativar quando o usuário diz: atualiza o CRM, há versão nova, traz
  as mudanças do original, sync com upstream, atualizar a partir do repositório da comunidade.
allowed-tools: Bash, Read, Edit, Grep
---

# Atualizar a partir do repositório original

> Instância: $ARGUMENTS

A personalização vive na **zona do cliente** (`config/`, `modules/`,
`public/marca/`, `specs/<cliente>/`); o núcleo (`src/`, `supabase/`, `scripts/`,
Docker) vem do original. Se a adaptação respeitou isso, atualizar é um merge sem
conflitos. Guia completo para humanos: `ATUALIZAR.md`.

## 1. Preparar

```bash
git status                      # limpo; se não, commit ou stash
git remote add upstream https://github.com/diegovasquez-ai/builder-crm.git   # uma única vez
git fetch upstream --tags
```

Leia no `CHANGELOG.md` do upstream a seção **"Atualizar desde X.Y.Z"** de cada
versão intermediária: ali estão as variáveis novas, migrações e passos manuais.
Uma versão **maior** sempre tem passos manuais; uma menor ou patch, não.

## 2. Mesclar

```bash
git merge upstream/main          # ou a tag vX.Y.Z
```

Se houver conflitos:
- Na **zona do cliente** ganha a versão local (é do cliente).
- No **núcleo** ganha o upstream; se a instância tinha tocado no núcleo, isso era uma
  exceção à constituição: resolver com upstream e mover a mudança para um módulo ou para
  a config, ou propô-la ao original.
- `src/lib/modules/*.generated.ts`: pegar qualquer uma e regenerar
  (`npm run modulos:registro`).
- A migração base (`supabase/migrations/20261001000000_base.sql`): antes de 1.0.0 se regenerava; a partir de 1.0.0 só
  se adicionam arquivos, então não deve haver conflito. Se houver, ganha o upstream.

## 3. Aplicar

```bash
npm install
npm run typecheck && npm run lint && npm run build
npm run db:migrar            # novas migrações do núcleo e dos módulos
```

Variáveis novas: `.env.example` do upstream vs `.env.local` / Coolify (`diff`).
Adicioná-las antes de implantar.

## 4. Implantar e verificar

Deploy no Coolify (redeploy do app) e `probar-instancia`. Se um módulo do cliente
deixou de compilar porque o contrato mudou (versão maior), o CHANGELOG diz o que
mudou; adaptar o módulo e testar de novo.

Commit do merge: `Actualizar nucleo a vX.Y.Z`. Anotar em `.claude/memory/` qualquer
coisa não óbvia que tenha acontecido nesta atualização.
