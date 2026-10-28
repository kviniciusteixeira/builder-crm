---
name: probar-instancia
description: |
  Autoverificação de uma instância do Builder CRM (local ou implantada): health check,
  início de sessão, marca e pipeline aplicados, conversa de teste pelo simulador
  com resposta do agente e mudança de etapa, e módulos ativos. Corrige até passar.
  Ativar quando o usuário diz: testa a instância, verifica se funciona, autoverifica,
  está tudo ok?, antes de entregar, ou no final de deploy-coolify / adaptar-a-cliente.
allowed-tools: Bash, Read, Edit, Grep
---

# Testar uma instância

> Instância: $ARGUMENTS

Nada se entrega sem isto em verde (constituição, princípio III). A prova você faz,
não o membro nem o cliente.

## 1. Rodar o script

```bash
node scripts/verificar-instancia.mjs \
  --url https://<dominio> \
  --email <admin demo> --password '<senha>' \
  --secreto '<AGENT_WORKER_SECRET da instância>' \
  [--marca "Casa Sur"] [--etapas "nuevo,calificado,visita_agendada"] [--modulos propiedades,visitas] \
  [--guion "Olá, busco um apto de 2 dormitórios em Providencia, tenho 150 mil para comprar"]
```

Sem `--url` usa `APP_BASE_URL` / `NEXT_PUBLIC_APP_URL` / `http://localhost:3000`; sem
`--secreto` usa `AGENT_WORKER_SECRET` do ambiente (lê `.env.local` se existir). Os
valores esperados de marca, etapas e módulos saem de `config/cliente.ts` e
`config/modulos.json` da instância que você está testando; passe-os para o script
comparar.

O que confere, em ordem:

1. **Responde**: `GET /api/health` -> `ok: true` (se não, imprime `faltan` ou o erro).
2. **Login**: password grant contra o Supabase Auth com o e-mail/senha e
   `GET /api/team/me` com a sessão -> papel `admin`.
3. **Marca**: `/manifest.webmanifest` -> `name` = `--marca`.
4. **Pipeline e config**: `GET /api/simulador/estado` -> etapas (chaves) contêm
   `--etapas`, módulos ativos contêm `--modulos`, campos configurados.
5. **Conversa de teste**: cria uma conversa pelo simulador, manda o roteiro
   (2-3 mensagens), espera a resposta do agente e confere se a conversa está
   na caixa de entrada e se o contato ficou com operação numa etapa (ou a etapa
   mudou).
6. **Módulos**: `GET /api/m/<modulo>` responde 200 com a sessão, para cada ativo.

Sai com código 1 se algo falhou e imprime uma tabela com cada check.

## 2. Se algo falhar

| Check | Causa típica | Correção |
|---|---|---|
| health 503 `env_invalida` | variável obrigatória sem definir | adicioná-la no Coolify e reimplantar |
| health 503 `config_invalida` | `config/cliente.ts` não valida | o corpo traz o detalhe; corrigir e reimplantar |
| login falha | a conta não existe ou a senha mudou | `npm run admin:crear` de novo (é upsert) |
| marca não coincide | build velho ou `config/cliente.ts` sem commit | commit + redeploy |
| etapas faltam | a sincronização não rodou (instância iniciada sem base) | reiniciar o contêiner; ver logs `[boot] pipeline sincronizado` |
| agente não responde (`agente_no_configurado`) | falta `OPENROUTER_API_KEY` | adicioná-la; se o cliente não a der, dizer na entrega |
| agente responde mas não move a etapa | o prompt não indica quando mover | ajustar `agente.prompt` na config (ou Ajustes -> Agente) e repetir |
| módulo 404 | não está em `config/modulos.json` do build implantado | ativar, commit, redeploy, `db:migrar` |

**Antes de dar um problema por real, confira a versão duas ou três vezes:**

```bash
for i in 1 2 3; do curl -s https://<dominio>/api/health; echo; sleep 3; done
```

O Coolify costuma deixar o contêiner velho servindo um tempo depois de um deploy
"concluído", então o domínio responde alternando as duas versões e metade dos
checks olha código velho. Se você vir versões distintas, reinicie o aplicativo (na
interface, ou `POST /api/v1/applications/<uuid>/restart`) e só então verifique. Visto
duas vezes na instância de demonstração.

Corrija, reimplante e rode o script de novo. Repita até verde. Se um check não
puder se cumprir por uma decisão externa (sem OpenRouter, sem logo), deixe
explícito na entrega: nunca esconda.

## 3. Prova manual complementar (demo de venda)

Abra `/simulador` como admin, escolha WhatsApp, escreva como cliente e olhe o painel
"Lo que ve el CRM": etapa, campos e resumo devem mudar. Depois `/conversations`
(a conversa marcada `sim`), `/pipeline` (a operação na coluna) e
`/reportes`. Se você usar Playwright (skill `playwright-cli`), tire capturas dessas
quatro telas para a entrega.
