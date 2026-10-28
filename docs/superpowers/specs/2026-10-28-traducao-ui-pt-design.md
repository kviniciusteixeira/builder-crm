# Tradução dos textos visíveis para português do Brasil

**Data**: 2026-10-28
**Estado**: aprovado no chat; a implementação ainda não começou.

## Problema

Classes, funções, arquivos, documentação e comentários já estão em português do Brasil. O que a pessoa lê continua em espanhol: menu, login, formulários, toasts, títulos, e-mails de acesso, prompt padrão do agente, nomes de etapas nas plantillas e frases de demonstração.

Uma instância deste CRM fala uma língua só. A tradução substitui o espanhol visível. Não há catálogo de idiomas nem coexistência com o espanhol na interface.

## Constitution Check

- **I. Núcleo**: esta mudança é do repositório original, não de uma instância de cliente. Os textos do núcleo mudam aqui e chegam às instâncias na próxima atualização.
- **II. Spec**: este arquivo é o trilho leve (copy e configuração visível, sem modelo de dados nem contrato de API novo).
- **III. Verificação**: cada lote termina com busca por marcas de espanhol nos arquivos daquele lote. No fim, `npm test`. Login, menu, contatos, pipeline e configurações se conferem no navegador com o app local no ar.
- **IV. Segredos**: nenhum segredo entra na tradução.

## O que muda

Texto que uma pessoa lê, em português do Brasil, tratamento por «você»:

- Páginas, componentes e módulos: rótulos, botões, placeholders, toasts, títulos, `aria-label` e `metadata`.
- Mensagens de erro e sucesso que a API devolve e a tela mostra.
- E-mails de acesso em `src/lib/plantillas-correo.ts` (`invitacion`, `recuperacion`).
- Prompt padrão do agente, o texto que o modelo usa para falar com o lead, e a cópia correspondente em Ajustes.
- Valores visíveis em `config/cliente.ts` e `config/modelos/inmobiliaria.ts`: descrição da marca, nomes das etapas, etiquetas de campos. As chaves (`nuevo`, `contactado`, `nombre`) ficam.
- Frases do seed (`src/lib/seed-demo.ts`) e do simulador. Nomes de pessoas fictícias ficam.

## O que fica

- Rotas (`/contacts`, `/settings`, `/modelos`, `/automacoes`).
- Nomes de arquivo e identificadores de código.
- Chaves de configuração e nomes de colunas.
- Nomes de produto: WhatsApp, Instagram, Messenger, Zernio, Supabase, OpenRouter, Builder CRM, IA Builder Lab.
- Pipeline, Dashboard, Simulador e a palavra «lead».

## Glossário

| Espanhol | Português |
|---|---|
| Contactos | Contatos |
| Conversaciones | Conversas |
| Configuración / Ajustes | Configurações |
| Equipo | Equipe |
| Plantillas | Modelos |
| Automatizaciones | Automações |
| Actividades | Atividades |
| Reportes | Relatórios |
| Guardar | Salvar |
| Cancelar | Cancelar |
| Iniciar sesión | Entrar |
| Cerrar sesión | Sair |
| Nuevo lead | Novo lead |
| Contactado | Contatado |
| Calificado | Qualificado |
| Propuesta | Proposta |
| Negociación | Negociação |
| Cerrado ganado | Fechado ganho |
| Cerrado perdido | Fechado perdido |

O mesmo termo não muda de tela para tela. Onde o espanhol usa «tú», o português usa «você».

## Lotes

Cada lote é uma revisão própria. A ordem evita uma tela pela metade.

1. **Acesso e navegação.** `src/components/layout/` (`Sidebar`, `MobileNav`, `UserMenu`, `Header`, `PageHeader`, `NotificationBell`), `src/components/auth/`, `src/app/login/`, `src/app/signup/page.tsx`, `src/app/sem-acesso/page.tsx`, `src/app/auth/`.
2. **Painel, contatos, pipeline e atividades.** `src/app/page.tsx`, `src/components/dashboard/`, `src/components/contacts/`, `src/app/contacts/`, `src/components/pipeline/`, `src/components/deals/`, `src/app/pipeline/`, `src/components/activities/`, `src/app/activities/`.
3. **Conversas, modelos de WhatsApp e automações.** `src/components/conversations/`, `src/app/conversations/`, `src/components/whatsapp/`, `src/app/modelos/`, `src/components/automations/`, `src/app/automacoes/`.
4. **Configurações, relatórios e simulador.** `src/components/settings/`, `src/app/settings/`, `src/components/relatorios/`, `src/app/relatorios/`, `src/components/simulador/`, `src/app/simulador/`.
5. **Módulos.** `modules/propriedades/componentes/`, `modules/visitas/componentes/`, `modules/exemplo/componentes/`, mais as frases que esses módulos devolvem à tela.
6. **Fora do React.** `src/lib/plantillas-correo.ts`, `src/lib/agent/prompt.ts`, valores visíveis de `config/cliente.ts` e `config/modelos/inmobiliaria.ts`, `src/lib/seed-demo.ts`, frases do `src/lib/simulador.ts`, e `{ error }` / `{ message }` das rotas em `src/app/api/` que a interface exibe. Respostas internas de cron (`Unauthorized` para o worker) ficam em inglês, como já estão.
7. **Contrato escrito.** Testes que comparam essas frases, em especial `tests/plantillas-correo.test.ts`. A frase de `AGENTS.md` que manda a interface continuar em espanhol passa a dizer português do Brasil. `docs/CORREIO.md` e `specs/nucleo/09-correio-de-acesso.md` deixam de afirmar que os e-mails são em espanhol.

Componentes em `src/components/ui/` só mudam se tiverem texto visível próprio. São primitivos do shadcn e, em geral, não têm copy.

## Pronto quando

- Busca nos arquivos de cada lote sem `¿`, `ñ` em copy, nem as formas do glossário em espanhol (`sesión`, `Guardar`, `Contactos`, `Ajustes`, `Equipo`, `Plantillas`, `Conversaciones`).
- `npm test` verde. Os testes de e-mail passam a esperar o português.
- No navegador, com o app local: entrar, ler o menu, abrir contatos, pipeline e configurações, e ver só português nos rótulos.
