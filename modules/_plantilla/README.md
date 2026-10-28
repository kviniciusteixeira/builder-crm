# Módulo `<nombre>`

Uma frase: o que resolve e para qual cliente ou nicho.

| O quê | Onde |
|---|---|
| Menu | `manifiesto.ts` → `nav` |
| Páginas | `servidor.tsx` → `paginas` (`/m/<nombre>/...`) |
| API | `servidor.tsx` → `api` (`/api/m/<nombre>/...`) |
| Tabelas | `migrations/*.sql` (prefixo `<nombre>_`, com RLS) |
| Campos de contato | `manifiesto.ts` → `campos` |
| Tools do agente | `servidor.tsx` → `tools` |
| Seed | `servidor.tsx` → `seed` |

## Variáveis de ambiente

Se o módulo precisar de credenciais (uma API externa, por exemplo), liste-as aqui e em
`.env.example`, nunca no código.

## Ativar

1. Adicionar `"<nombre>"` a `config/modulos.json` → `activos`.
2. `npm run db:migrar`.
3. Reiniciar o app (ou `npm run build`).
