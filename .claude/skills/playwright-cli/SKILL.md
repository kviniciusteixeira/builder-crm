---
name: playwright-cli
description: "Testes automatizados com Playwright CLI. Navega o app, preenche formulários, clica, tira screenshots e gera relatórios. Ativar quando o usuário diz: testa isto, confere se funciona, há um bug, verifica, olha no browser, ou depois de implementar uma feature para validar."
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

# Skill: QA automatizado com Playwright CLI

> Executar QA: $ARGUMENTS

---

## Por que CLI em vez de MCP

O Playwright MCP injeta snapshots completos de página diretamente na janela de contexto. Isso consome muitos tokens e pode causar ruído para fluxos conhecidos.

O Playwright CLI, por outro lado:
- Guarda dados de página em disco (arquivos YAML/screenshots) em vez de encher o contexto
- Menos tokens consumidos, maior precisão para fluxos definidos
- O Claude já sabe usar comandos de shell, zero overhead de carga de ferramentas
- Os artefatos ficam em disco para revisão posterior

**Quando usar MCP em vez de CLI**: exploração interativa de páginas desconhecidas ou debugging visual em tempo real. Para todo o resto, CLI.

---

## Pré-requisitos

Instalar o Chromium se não estiver instalado:

```bash
npx playwright install chromium
```

---

## Comandos centrais do Playwright CLI

```bash
# Navegar a uma página
npx playwright navigate http://localhost:3000

# Tirar screenshot
npx playwright screenshot http://localhost:3000 --output screenshot.png

# Clicar num elemento
npx playwright click "text=Sign In"

# Preencher um campo de formulário
npx playwright fill "#email" "test@example.com"

# Obter snapshot de página (árvore de acessibilidade como YAML)
npx playwright snapshot http://localhost:3000
```

---

## Fluxo de QA em 6 fases

### Fase 1: SETUP

Ler os requisitos do teste. Identificar o que precisa de teste.

- Que feature ou bug se está verificando?
- Quais são os critérios de sucesso?
- Que URL/rotas estão envolvidas?
- Precisa-se de dados de teste?

Criar o diretório de artefatos:

```bash
mkdir -p .qa-reports/[YYYY-MM-DD]-[nome]/screenshots
```

### Fase 2: PROVISION

Preparar dados de teste se forem necessários.

- Criar usuário de teste via Supabase MCP se couber
- Preparar dados no banco que o fluxo precise
- Verificar que o servidor de desenvolvimento está rodando

```bash
# Verificar que o app está rodando
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000
```

### Fase 3: NAVIGATE

Abrir o app e navegar às páginas relevantes.

```bash
# Screenshot inicial da página
npx playwright screenshot http://localhost:3000/[rota] --output .qa-reports/[data]-[nome]/screenshots/01-inicio.png
```

### Fase 4: TEST

Executar os passos do teste. Preencher formulários, clicar, verificar resultados.

```bash
# Exemplo: teste de login
npx playwright screenshot http://localhost:3000/login --output .qa-reports/[data]-[nome]/screenshots/02-login-page.png
npx playwright fill "#email" "test@example.com"
npx playwright fill "#password" "testpassword"
npx playwright click "text=Sign In"
npx playwright screenshot http://localhost:3000/dashboard --output .qa-reports/[data]-[nome]/screenshots/03-after-login.png
```

Tirar screenshot ANTES e DEPOIS de cada ação crítica.

### Fase 5: DOCUMENT

Guardar snapshots de página só quando for preciso inspecionar a estrutura.

```bash
# Só se você precisar ver a estrutura do DOM
npx playwright snapshot http://localhost:3000/[rota] > .qa-reports/[data]-[nome]/snapshot-[passo].yaml
```

**Princípio sticky-notes**: NÃO despejar snapshots completos no contexto. Ler o arquivo YAML só quando for preciso inspecionar algo específico. Resumo primeiro, detalhes sob demanda.

### Fase 6: REPORT

Gerar relatório markdown com os achados.

---

## Template do relatório

Criar o arquivo `.qa-reports/[YYYY-MM-DD]-[nome]/report.md`:

```markdown
# QA Report: [Feature/Bug Name]

**Date**: [YYYY-MM-DD]
**Status**: PASSED | FAILED | PARTIALLY_FIXED

## Test Steps
1. [Descrição do passo] - Screenshot: `screenshots/01-nome.png`
2. [Descrição do passo] - Screenshot: `screenshots/02-nome.png`
3. ...

## Findings
- [Problema encontrado ou confirmação de que funciona]
- [Comportamento inesperado observado]

## Screenshots
- `screenshots/01-inicio.png` - Estado inicial
- `screenshots/02-acao.png` - Depois de [ação]
- ...

## Recommendations
- [Correção sugerida ou melhoria]
- [Próximo passo]
```

---

## Modos de uso

| Comando | O que faz |
|---------|----------|
| `/qa verify [fluxo]` | Verificar que um fluxo funciona corretamente |
| `/qa reproduce [bug]` | Tentar reproduzir um bug reportado |
| `/qa full [feature]` | QA completo de uma feature (caminho feliz + casos de borda) |

### Exemplo: `/qa verify login flow`

```
Fase 1: SETUP - Verificar fluxo de login. Critério: o usuário consegue entrar e ver o dashboard.
Fase 2: PROVISION - Verificar que existe usuário de teste no banco.
Fase 3: NAVIGATE - Ir a /login, tirar screenshot.
Fase 4: TEST - Preencher e-mail/senha, clicar Sign In, verificar redirecionamento a /dashboard.
Fase 5: DOCUMENT - Screenshots em cada passo.
Fase 6: REPORT - Gerar report.md com status PASSED/FAILED.
```

---

## Diretório de saída

Todos os artefatos de QA se guardam em:

```
.qa-reports/
  [YYYY-MM-DD]-[nome]/
    report.md
    screenshots/
      01-nome.png
      02-nome.png
      ...
    snapshot-[passo].yaml  (só se foi preciso)
```

---

## Regras

- SEMPRE criar o diretório de artefatos antes de começar
- SEMPRE tirar screenshots em cada passo crítico
- NUNCA despejar snapshots YAML completos no contexto (lê-los sob demanda)
- SEMPRE gerar o relatório no final, mesmo que tudo tenha passado
- Se o servidor não estiver rodando, avisar o usuário em vez de falhar em silêncio
- Os screenshots se guardam em disco, NÃO se inserem inline no relatório (só os caminhos)
