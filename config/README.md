# config/ — zona do cliente

Tudo o que distingue esta instância vive aqui. O núcleo (`src/`) não se toca.

| Arquivo | O que é |
|---|---|
| `cliente.ts` | A configuração desta instância: marca, pipeline, campos do contato, agente e módulos ativos. Validada com o esquema de `src/lib/config/schema.ts` na inicialização e em `/api/health`. |
| `plantillas/` | Modelos de nicho reutilizáveis (por exemplo `inmobiliaria.ts`). `cliente.ts` os importa e os estende. |

Os arquivos de marca (logo, ícone) ficam em `public/marca/`. Depois de trocar o ícone,
`npm run pwa:icons` regenera `public/icons/`.

Como uma mudança é aplicada:

- **Marca**: ao reiniciar o app (as cores são injetadas no SSR; o manifesto e o
  título saem daqui).
- **Pipeline**: na inicialização, `sincronizarPipeline()` cria ou atualiza as etapas pela
  `clave`; nunca apaga etapas que tenham operações.
- **Campos do contato**: aparecem no formulário, na ficha, na tabela (`enTabla`) e no
  painel do chat; o agente os qualifica se tiverem `agente`.
- **Módulos**: `modulos.nucleo` desliga funções do núcleo; `modulos.activos` liga
  pastas de `modules/`.
