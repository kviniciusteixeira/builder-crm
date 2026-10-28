---
name: memory-manager
description: |
  Sistema de memória persistente POR PROJETO. Guarda conhecimento em .claude/memory/ dentro do repositório,
  versionado com git, compartilhado com a equipe. Substitui a auto-memory do Claude Code, que é local
  e não viaja com o projeto. Usar de forma PROATIVA no início da sessão para carregar contexto,
  quando o usuário corrige algo, quando se descobre um padrão novo, quando se resolve um bug,
  ou quando o usuário diz lembrar/lembra/guarda isto/não esqueça.
  Gatilhos: lembra, remember, guarda isto, não esqueça, você se lembra, memória,
  em que ficamos, contexto anterior, o que você sabe de, conversa passada, sessão anterior.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Memory Manager — Memória persistente por projeto

> A memória vive em `.claude/memory/` DENTRO do repositório. Versionada no git. O usuário tem controle total.
> A auto-memory do Claude Code está DESATIVADA. Esta skill é o único mecanismo de memória.

---

## Ativação (primeira vez)

**IMPORTANTE:** Quando esta skill se ativa pela primeira vez num projeto, executar automaticamente estes passos de setup:

### Passo 1: Desabilitar a auto-memory do Claude Code

Criar ou atualizar `.claude/settings.json` na raiz do projeto:

```json
{
  "autoMemoryEnabled": false
}
```

Se o arquivo já existir, adicionar `"autoMemoryEnabled": false` sem apagar o que já tiver.

**Por quê?** A auto-memory do Claude Code guarda notas em `~/.claude/projects/` (local à máquina).
Isso significa que:
- NÃO viaja com o repositório (se você mudar de laptop, se perde)
- NÃO é versionada (sem git history, sem poder reverter)
- NÃO é compartilhada (outros colaboradores não a veem)
- O Claude decide o que guardar (sem controle do usuário)

Esta skill substitui tudo isso com memória DENTRO do repositório.

### Passo 2: Criar a estrutura de pastas

```bash
mkdir -p .claude/memory/{user,feedback,project,reference}
```

### Passo 3: Criar o índice MEMORY.md

Criar `.claude/memory/MEMORY.md` com o template base se não existir:

```markdown
# Memória do projeto — Índice

> Arquivos organizados por pasta (tipo). Máx. 200 linhas.
> Gerenciado pela skill memory-manager. Auto-memory do Claude Code DESATIVADA.

## user/ — Sobre o usuário/equipe
(vazio)

## project/ — Projetos e decisões ativas
(vazio)

## feedback/ — Correções e preferências
(vazio)

## reference/ — Onde encontrar as coisas
(vazio)
```

### Passo 4: Confirmar ao usuário

Informar: "Memória persistente ativada. Auto-memory do Claude Code desabilitada. O seu projeto agora guarda conhecimento em `.claude/memory/`, versionado com git."

---

## Arquitetura

```
.claude/memory/
├── MEMORY.md              <- Índice (máx. 200 linhas, carrega-se no início)
├── user/                  <- Sobre o usuário/equipe (preferências, como trabalham)
├── feedback/              <- Correções do usuário (o que fazer/não fazer e POR QUÊ)
├── project/               <- Estado de iniciativas em curso (datas absolutas)
└── reference/             <- Onde encontrar as coisas, padrões descobertos, soluções
```

A pasta É o tipo. Não se usa frontmatter nos arquivos de memória.

---

## Quando CONSULTAR a memória

### Automático (sem o usuário pedir)
- **Início de sessão**: Ler MEMORY.md para se orientar. Se um tema do índice for relevante ao trabalho atual, ler o arquivo de detalhe.
- **Tema recorrente**: Se o usuário mencionar algo que soe a uma correção ou decisão passada, buscar na memória antes de responder.
- **Antes de propor algo**: Se você for sugerir uma arquitetura, fluxo ou decisão, verificar que não contradiga uma decisão guardada.

### Quando o usuário pede
- "Você se lembra de...?" / "Em que ficamos com...?" / "O que você sabe de...?"
- Buscar em MEMORY.md primeiro, depois nos arquivos de detalhe se houver match.

### Como consultar
1. Ler `.claude/memory/MEMORY.md` (o índice)
2. Se houver um arquivo de detalhe relevante, lê-lo
3. Se não encontrar nada, dizer com honestidade: "Não tenho isso na memória"

---

## Quando GUARDAR memória

### Gatilhos de gravação (proativo)

| Gatilho | Tipo | Exemplo |
|---------|------|---------|
| O usuário te corrige | `feedback` | "Não faça isso, melhor assim..." |
| O usuário diz "lembra" | qualquer um | "Lembra que o deploy é manual" |
| Resolve-se um bug não óbvio | `reference` | "O erro era por X, a solução é Y" |
| Decisão de arquitetura importante | `project` | "Vamos usar Stripe em vez de Polar" |
| Você descobre um padrão útil | `reference` | "Este endpoint precisa do header X" |
| Preferências do usuário/equipe | `user` | "Prefiro componentes funcionais" |
| Algo quebrou e se arrumou | `feedback` | "Nunca use --force nesse repositório" |

### Gatilhos de gravação (quando o usuário pede)
- "Guarda isto" / "Não esqueça" / "Lembra que" / "Anota"

### O que NÃO guardar (NUNCA)
- Coisas deriváveis do código atual (ler o repositório é melhor)
- Git history (git log/blame é a fonte da verdade)
- O que já está em CLAUDE.md (não duplicar)
- Estado temporário da conversa atual (efêmero)
- Soluções de debugging triviais (o fix está no código)

---

## Como GUARDAR

### Passo 1: Verificar que não existe
Ler MEMORY.md. Se já houver um arquivo sobre esse tema, ATUALIZAR em vez de criar um novo.

### Passo 2: Escrever/atualizar o arquivo de detalhe

Criar o arquivo na pasta correta conforme o tipo:

| Pasta | Conteúdo |
|---------|-----------|
| `user/` | Sobre o usuário/equipe (preferências, como trabalham) |
| `feedback/` | Correções do usuário (o que fazer/não fazer e POR QUÊ) |
| `project/` | Estado de iniciativas em curso (com datas absolutas, não relativas) |
| `reference/` | Onde encontrar as coisas, padrões, soluções a problemas recorrentes |

Formato: Markdown plano. Sem frontmatter. Começa com `# Título`.

### Passo 3: Atualizar o índice MEMORY.md

Adicionar uma linha ao índice com link ao arquivo e descrição de 1 linha.
Manter MEMORY.md abaixo de 200 linhas.
Organizar por tema, não cronologicamente.

### Passo 4: Informar ao usuário

Dizer que você guardou e em que arquivo. Não pedir permissão (ele verá no diff do git).
Se o usuário reverter a mudança, respeitar sem discutir.

---

## Regras de ouro

1. **Consultar é de graça, guardar é caro.** Leia a memória com frequência. Escreva só quando o conhecimento sobrevive à sessão atual.
2. **Datas absolutas sempre.** "Quinta" -> "2026-03-12". As memórias se leem semanas depois.
3. **Um arquivo por tema.** Não misturar. Se crescer demais, dividir.
4. **O usuário é o dono.** Ele pode apagar, editar, reverter qualquer memória. Você não apaga sem que ele peça.
5. **Sem duplicatas com CLAUDE.md.** Se algo já está no CLAUDE.md principal, não repetir na memória.
6. **Honestidade sobre limites.** Se você não tem algo na memória, diga. Não invente.
