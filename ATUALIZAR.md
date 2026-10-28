# Atualizar uma instância a partir do repositório original

Cada cliente vive no próprio repositório (fork ou clone do Builder CRM) com a zona do
cliente por cima do núcleo. Trazer uma versão nova do original é um merge: se a
adaptação respeitou as zonas, não há conflitos. A skill
`actualizar-desde-original` faz exatamente isso.

## 1. Adicionar o original como `upstream` (uma vez)

```bash
git remote add upstream https://github.com/diegovasquez-ai/builder-crm.git
git fetch upstream --tags
```

## 2. Ler o que muda

No [`CHANGELOG.md`](CHANGELOG.md) do upstream, a seção **"Atualizar desde X.Y.Z"**
de cada versão entre a sua e a nova diz: variáveis de ambiente novas,
migrações, passos manuais. Uma versão **maior** sempre traz passos manuais; uma
menor ou um patch, não.

## 3. Mesclar

```bash
git status                       # tudo commitado
git merge upstream/main          # ou a tag: git merge v1.1.0
```

Regras para conflitos:

| Arquivo em conflito | Ganha |
|---|---|
| `config/`, `modules/<seu>/`, `public/marca/`, `specs/<cliente>/` | **a sua versão** (é do cliente) |
| `src/`, `supabase/`, `scripts/`, Docker | **upstream** (é núcleo). Se você tinha mexido, mova essa mudança para um módulo ou para a config, ou proponha ao original. |
| `src/lib/modules/*.generated.ts` | qualquer uma; depois `npm run modulos:registro` |
| `modules/ejemplo/`, `modules/_plantilla/`, `modules/propiedades/`, `modules/visitas/` | upstream (são do original); se você os modificou, é uma melhoria para propor |

## 4. Aplicar

```bash
npm install
npm run typecheck && npm run lint && npm run build
npm run db:migrar
```

Compare o `.env.example` novo com as suas variáveis (no Coolify ou no `.env.local`) e adicione as
que faltarem antes de implantar.

## 5. Implantar e verificar

Redeploy no Coolify (as migrações rodam na inicialização) e:

```bash
curl https://<dominio>/api/health
node scripts/verificar-instancia.mjs --url https://<dominio> --email ... --password ...
```

Se um módulo seu deixou de compilar, o CHANGELOG dessa versão maior diz o que mudou
no contrato (`src/lib/modules/types.ts` ou `src/lib/channels/conector.ts`).

## Manter a atualização fácil

- Nunca editar o núcleo na instância (constituição, princípio I).
- Módulos próprios com nomes diferentes dos do original.
- Commits pequenos e descritivos na zona do cliente.
- Antes da 1.0.0 a migração `0000_base.sql` era regenerada; a partir da 1.0.0 o original
  só adiciona arquivos de migração, nunca edita os existentes.
