import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // DÍVIDA CONHECIDA, de propósito e com data. A regra chegou ativa ao atualizar para
      // eslint-config-next 16.4.3 (em 16.2.2 não estava) e marca 9 lugares que já existiam:
      // componentes que carregam dados com `useEffect(() => { load() }, [load])` onde
      // `load` mexe no estado antes do primeiro `await`. Provoca renders em cascata ao
      // montar; não é uma falha de correção nem de segurança.
      //
      // Fica em `warn` e não em `error` porque arrumar direito é reestruturar a carga
      // de dados de nove componentes e isso não entra numa versão de segurança: cada
      // um precisa que alguém percorra a tela e confira os estados de carregamento.
      // Continua saindo em cada `npm run lint` para que não se esqueça.
      //
      // Os nove: app/plantillas/page.tsx, contacts/OwnerSelect, conversations/
      // ContactDetailPanel, conversations/TemplatePicker, pipeline/KanbanBoard,
      // pipeline/PipelineEditor, settings/AgentSettings, settings/ChannelsSettings,
      // lib/use-push.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
