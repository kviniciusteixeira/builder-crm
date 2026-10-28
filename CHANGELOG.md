# Mudanças

O que cada versão do Builder CRM traz e o que fazer para atualizar. SemVer segundo o que
importa a quem opera uma instância (ver "Versões" no [README](README.md)):
maior = passos manuais, menor = funções novas, patch = correções.

## 2.0.1 — 2026-10-26

### Atualizar desde 2.0.0

Traga esta versão. Se você já tinha `APP_BASE_URL` definida (a skill de deploy a pede), não
há nada a fazer.

### Segurança

- **O segredo do worker podia ir para um servidor alheio.** Quando faltava `APP_BASE_URL`,
  a URL para a qual o CRM se chama a si mesmo se montava com o `Host` e o
  `X-Forwarded-Proto` da requisição recebida, e a essa URL se manda `AGENT_WORKER_SECRET`
  num cabeçalho: quem pudesse pôr o `Host` levava o segredo para o próprio
  servidor. Estava atrás da assinatura HMAC do webhook, mas isso é uma defesa de outra
  coisa, não dessa função. Agora, em produção, sem `APP_BASE_URL` não se dispara nada: fica
  dito no log e os trabalhos a varredura levanta. Acontecia nos dois caminhos
  (`src/lib/agent/trigger.ts` e o webhook da Meta).
- **Duas rotas devolviam a mensagem interna do erro ao cliente** (`/api/push/test` e
  `/api/seed/demo`): um erro de Postgres traz nomes de tabelas e restrições, e um
  do provedor de push pode trazer endpoints. Agora vai uma mensagem genérica e o detalhe
  fica no log do servidor.

## 2.0.0 — 2026-10-26

Versão de segurança. Sai de revisar contra o Builder CRM um informe feito sobre **outro
produto** da mesma família (CRM Prime): de nove achados, quatro se aplicavam também
aqui. Os outros cinco já estavam cobertos (a autorização por `team_members`, o
middleware, o digest que não existe).

### Atualizar desde 1.6.x — HÁ QUE FAZER UMA COISA À MÃO

**`AGENT_WORKER_SECRET` passa a ser obrigatória.** Se a sua instância já a tem, não há
nada a fazer. Se não:

```bash
openssl rand -hex 32
```

e carregue nas variáveis do aplicativo antes de reimplantar. Sem ela, `/api/health`
responde 503 e o agente não processa nada: é de propósito, porque a alternativa era
continuar com as rotas internas abertas.

Se a sua base não aceita TLS (um Postgres na mesma máquina, ou na rede interna do
Docker), adicione também `DATABASE_SSL=off`. O Supabase, tanto cloud como auto-hospedado com
domínio, aceita TLS e não precisa de nada.

### Segurança

- **As rotas internas falhavam ABERTAS sem `AGENT_WORKER_SECRET`.** `/api/agent/process`
  (POST e GET), a varredura de automações e a varredura de webhooks pendentes faziam
  `if (secret) { ...conferir... }`: sem a variável não conferiam nada. Essas rotas são
  públicas no middleware de propósito, porque as chama um cron ou o próprio servidor sem
  sessão, então numa instância sem a variável qualquer um na internet podia executar
  trabalhos do agente, relançar eventos de webhook e semear dados. Não havia nenhum
  sintoma: o CRM funcionava igual. Agora há um único guardião (`src/lib/secreto-worker.ts`)
  que falha fechado e compara em tempo constante, com testes.
- **A conexão ao Postgres ia sem TLS.** `postgres-js` deixa `ssl` em false se a URL não
  traz `sslmode`, e nem a que se copia e cola do Supabase nem o modelo de `.env.example` o
  traziam: cada consulta (contatos, conversas inteiras, telefones) cruzava a rede em
  claro. Agora `ssl: "require"`, com `DATABASE_SSL=off` para uma base sem certificado na
  mesma máquina.
- **Os cookies de sessão iam sem `Secure`.** `@supabase/ssr` não o põe por padrão e o
  CRM não passava `cookieOptions`, então o navegador anexava o JWT de acesso e o token
  de refresh a qualquer requisição `http://` ao domínio. Agora vão `secure` (em produção),
  `httpOnly`, `sameSite: lax`, compartilhados pelo middleware e pelo cliente de servidor para
  que não se desalinhem, e com teste.
- **Cabeçalhos de segurança em produção**: `Strict-Transport-Security`,
  `X-Content-Type-Options`, `Referrer-Policy` e `X-Frame-Options`. HSTS fecha a janela
  da primeira visita em claro, que na Vercel a plataforma cobre e num VPS com Coolify
  não necessariamente.
- **A volta do OAuth de canais acreditava na URL.** Guardava o `accountId` da query sem
  conferir que essa conexão a tivesse iniciado este CRM: um link preparado e aberto
  por alguém da equipe conectava uma conta alheia. Agora se pergunta ao Zernio por essa
  conta com a chave da instância (que só vê as próprias) e o que se guarda sai da
  resposta, não da query.

### Dívida que fica anotada

- Atualizar `eslint-config-next` ativou `react-hooks/set-state-in-effect`, que em 16.2.2
  não rodava, e marca **9 lugares que já existiam**: componentes que carregam dados com
  `useEffect(() => { load() }, [load])` onde `load` toca o estado antes do primeiro
  `await`, o que provoca renders em cascata ao montar. Não é uma falha de correção nem de
  segurança. Fica como aviso (não erro) e à vista em cada `npm run lint`: arrumar
  bem é reestruturar a carga de dados de nove componentes e há que percorrer cada
  tela para conferir os estados de carga, coisa que não entra numa versão de
  segurança. Estão listados em `eslint.config.mjs`.

### Dependências

- De **22 vulnerabilidades em produção (2 críticas, 13 altas) a 0**. O Next passa a 16.4.3
  (a série 16.2.2 acumulava execução remota de código na otimização de imagens, em
  `next/og` e em `use cache`, SSRF em Server Actions e um bypass do middleware por rotas
  de prefetch), e `zod` a 4.6.7.
- **`shadcn` sai de `dependencies`**: é a ferramenta de linha de comando para adicionar
  componentes, não se importa em execução, e arrastava 20 avisos à árvore de produção.
  Fica em `devDependencies`.
- **`@anthropic-ai/sdk` se elimina**: nenhuma linha do código o usava. Era um resto do
  projeto do qual este nasceu.

## 1.6.1 — 2026-10-21

### Atualizar desde 1.6.0

Traga esta versão. Não muda uma única linha de código: muda o que você pode fazer com ele.

### Alterado

- **O Builder CRM passa a ser código aberto com licença MIT.** Copyright de Diego Vásquez.
  Qualquer um pode usá-lo, copiá-lo, modificá-lo, implantar instâncias para os seus clientes
  e cobrar por isso, sem ser membro de nenhuma comunidade e sem pedir permissão. A única
  condição é conservar o aviso de copyright. O repositório fica público.
- O que isto substitui: a licença proprietária de 1.3.6, que limitava a implantação
  para clientes aos membros do IA Builder Lab. Essa restrição já não existe. As
  instâncias que já estavam implantadas não exigem nenhuma ação.
- `LICENSE` agora é o texto canônico da MIT, sem acréscimos, para que se reconheça
  automaticamente. O aviso de copyright do auto-crm e o esclarecimento sobre as
  dependências de npm mudaram para `NOTICE`, que é onde vão os avisos de terceiros.
- `package.json` declara `"license": "MIT"` em lugar de `UNLICENSED`.
- O README se apresenta para quem chega sem conhecer a comunidade: a primeira linha diz
  que é o CRM, e o segundo parágrafo que é MIT e que não faz falta ser membro.

## 1.6.0 — 2026-10-12

### Atualizar desde 1.5.1

Traga esta versão e adicione `zonaHoraria` a `config/cliente.ts` com o fuso do negócio
(`America/Santiago`, `America/Mexico_City`, `Europe/Madrid`...). Se você não adicionar, a
instância continua em UTC e se comporta como antes, então atualizar não quebra nada; mas
enquanto estiver em UTC o agente vai nomear mal o dia de noite.

### Corrigido

- **O agente nomeava o dia errado.** O prompt inclui a data de hoje, e se
  calculava com o fuso do processo. O contêiner roda em UTC de propósito (uma imagem
  compartilhada por muitas instâncias não pode trazer o fuso gravado), então no Chile,
  das 21:00 até a meia-noite, o agente achava que já era o dia seguinte: um
  cliente que escrevia às 22:00 e perguntava se atendiam amanhã recebia a resposta
  deslocada um dia. Sem exceção e sem log, e na máquina de um membro chileno não se
  reproduz. Agora a data se resolve em `config.zonaHoraria`.
- **"Hoje" e "Ontem" eram uma janela de 24 horas**, não dias do calendário: às 00:30,
  algo das 23:00 saía como "Hoje". Agora se comparam dias no fuso configurado, então
  a mesma linha não diz uma coisa no servidor e outra no navegador.

### Adicionado

- `zonaHoraria` em `config/cliente.ts`: identificador IANA, validado contra o ambiente
  para que um erro de digitação se rejeite na validação em vez de cair longe. Por padrão
  `UTC`. Ver `specs/nucleo/11-fuso-horario.md`.
- `specs/_brief.md`: o que perguntar ao cliente antes de começar uma adaptação. Só
  três respostas são obrigatórias; o resto o Claude decide e informa ao entregar.
  É a entrada do passo 1 de `adaptar-a-cliente`.
- Cinco casos novos em `tests/`. A suíte se roda também com o processo em UTC
  (`TZ=UTC npm test`), que é a única forma de ver o bug da data.

## 1.5.1 — 2026-10-08

### Atualizar desde 1.5.0

Traga esta versão. Só mudam o arnês e a documentação.

### Corrigido

- **A skill `deploy-coolify` dava o Supabase cloud por certo.** Criava um projeto em
  supabase.com por MCP e não mencionava uma única vez `docs/SUPABASE-NO-VPS.md`, embora o
  CRM só use o Supabase para Postgres e GoTrue e os dois se possam auto-hospedar no mesmo
  Coolify, que é como roda a instância de demonstração. Agora o passo 1 apresenta os dois
  caminhos com os custos (cloud pausa os projetos inativos; auto-hospedado deixa os
  backups do seu lado) e, para o auto-hospedado, dá a ordem de passos que não é óbvia:
  base, `npm run claves:supabase`, `npm run auth:preparar`, GoTrue, e só aí
  `npm run db:migrar`, porque a última migração põe um gatilho sobre `auth.users`.
- **A mesma skill mandava marcar variáveis como `is_build_time: true`.** Ficou obsoleto
  em 1.2.2, quando a configuração pública passou a se servir em execução, e além disso a API
  do Coolify 4.3 rejeita esse campo: seguir a instrução ao pé da letra falhava. Agora diz que
  vão todas em runtime e por quê.
- O README resume os dois caminhos no passo 1 de "Implantar no Coolify".

## 1.5.0 — 2026-10-08

### Atualizar desde 1.4.3

Traga esta versão e rode `npm install` (entra uma dependência de desenvolvimento). Não há
migrações nem variáveis novas, e nada muda numa instância implantada.

### Adicionado

- **`npm run local`: o CRM rodando no seu PC sem criar uma conta em lugar nenhum.**
  Clonar, `npm install`, `npm run local`, e o CRM abre com dados de demonstração. Sem
  Supabase, sem Docker e sem nenhum arquivo `.env`. Sobe um Postgres embutido
  (`@electric-sql/pglite`, um pacote de npm compilado para WebAssembly) em `.local/db`, lhe
  acrescenta o que o Supabase traz de fábrica e um Postgres pelado não (os papéis
  `anon`/`authenticated`/`service_role`, o esquema `auth`, `auth.uid()` e `auth.users`),
  aplica **as mesmas migrações** que uma instância implantada com o RLS, cadastra
  o administrador da demo pelo mesmo gatilho do primeiro admin que roda em
  produção, e carrega a demo. Opções: `--reset`, `--sin-datos`, `--puerto`.
- **Não há login no modo local**, porque não há servidor de autenticação a quem
  perguntar: quem abre a URL é administrador. O menu lateral diz isso, o botão de
  encerrar sessão não aparece e `/api/health` informa `modoLocal`.

### Corrigido

- **O simulador levava a mensagem embora quando o agente não podia responder.** Sem
  `OPENROUTER_API_KEY` cortava antes de gravar nada, e com uma chave vencida o
  provedor devolvia 401 e a rota terminava em 500. Nos dois casos a pessoa via
  "Error" e a mensagem desaparecia da tela, quando o CRM tinha feito bem a
  parte dele. Agora a mensagem entra sempre — a conversa aparece na caixa de entrada e o
  contato se cria — e a resposta traz `agente.ok: false` com o motivo, que é o que
  a UI já sabia mostrar. Isso também acontecia numa instância implantada.

### Segurança

- O modo local desliga a autenticação inteira, então tem dois cadeados e o segundo
  é o que conta: faz falta `MODO_LOCAL=true`, que só `npm run local` põe, **e**
  que `NODE_ENV` não seja `production`. O segundo não depende de nenhuma configuração, de
  modo que é impossível ligá-lo numa imagem implantada mesmo que alguém copie um
  `.env` alheio para o servidor. Há um teste que cobre: se se ligasse por erro não
  falharia nada e o único sintoma seria que qualquer um entra.

### Detalhes que teriam falhado em silêncio

- `db.execute` devolve o array de linhas com o driver `postgres` e `{ rows }` com o
  embutido, e meia dúzia de lugares (relatórios, equipe, automações, seed) fazem
  `resultado[0]` sobre isso. Sem normalizar, no modo local os relatórios saíam em zero
  sem um único erro. Iguala-se no proxy de `src/db/index.ts`.
- `@electric-sql/pglite` resolve as extensões a partir do caminho do próprio arquivo e o
  compilador o reescreve para `file:///ROOT/...`: vai em `serverExternalPackages`.
- `DATABASE_URL` e as duas do Supabase deixam de contar como obrigatórias no modo local.
  Enquanto contavam, `/api/health` respondia 503 e o CRM iniciava mas não abria.

## 1.4.3 — 2026-10-07

### Atualizar desde 1.4.2

Traga esta versão. Nada a fazer: só muda a licença e o README.

### Alterado

- **Volta a licença a membros do IA Builder Lab.** 1.4.2 tinha aberto o uso a
  qualquer um porque o repositório ia ser público. O repositório volta a ser privado,
  então a licença volta à versão de 1.3.6: usá-lo é dos membros, enquanto o
  acesso à comunidade estiver vigente. O aviso MIT do auto-crm continua na seção à parte,
  intacto, porque essa licença obriga a conservá-lo nos derivados.
- `package.json` volta a `"license": "UNLICENSED"`, e o README volta a apresentá-lo como
  o que é: o CRM que os membros entregam aos seus clientes.

## 1.4.2 — 2026-10-06

### Atualizar desde 1.4.1

Traga esta versão. Nada a fazer: só muda a licença e o README.

### Alterado

- **O repositório é público e a licença o acompanha.** Até 1.4.1 a licença dizia
  que só os membros do IA Builder Lab podiam usar o código e que não se podia publicar
  num repositório aberto, o que num repositório público se contradiz sozinho. Agora tem dois
  níveis: **qualquer um** pode lê-lo, cloná-lo, rodá-lo e usá-lo no próprio negócio;
  **implantar instâncias para clientes e cobrar por elas** é dos membros. O que
  continua proibido para todos é revendê-lo ou redistribuí-lo como modelo, curso ou
  produto, e apresentá-lo como próprio. Continua sendo proprietário e continua sendo MIT o que
  vem do auto-crm, na seção à parte.
- **A licença diz o que acontece com os forks.** Estando o repositório publicado no
  GitHub, os termos permitem a qualquer usuário vê-lo e forká-lo dentro da
  plataforma, e nenhuma licença pode impedir isso. Fica escrito no ponto 4 para que
  ninguém leia "não redistribuir" e pense que a licença é papel molhado ao ver um fork: o
  que se regula é para que se usa o código, dentro ou fora do fork.
- `package.json` declara `"license": "SEE LICENSE IN LICENSE"`, que é a forma que o npm
  documenta para uma licença própria. `UNLICENSED` significava "não dou permissão a
  ninguém", e já não é verdade.

## 1.4.1 — 2026-10-06

### Atualizar desde 1.4.0

Traga esta versão. Nada mais.

### Corrigido

- **`npm test` falhava num clone limpo.** Desde 1.3.4 o registro de módulos não se
  versiona (geram-no `build`, `dev` e `typecheck`), mas os testes rodavam antes que
  qualquer um dos três: numa máquina recém-clonada, o arquivo ainda não existia e
  o teste que toca a configuração morria com `Cannot find module`. Agora `npm test`
  gera o registro primeiro, igual a `typecheck`. O CI encontrou no primeiro
  commit com testes, que é exatamente para o que estão.

## 1.4.0 — 2026-10-06

### Atualizar desde 1.3.6

Traga esta versão. Não há migrações nem mudanças de comportamento: entram os testes e o
CI passa a rodá-los. Se você tinha um fork, `npm install` traz o vitest.

### Adicionado

- **Primeira suíte de testes: 35 casos em 6 arquivos, um segundo, sem base nem rede.** Não
  cobrem tudo de propósito: cobrem os invariantes que, quando se quebram, **não avisam**.
  - *Assinatura do webhook*: sem segredo rejeita (fail-closed), assinatura de outro segredo
    rejeita, um caractere mudado no corpo rejeita, uma assinatura curta não estoura o
    handler, e tolera o prefixo `sha256=` da Meta.
  - *Janela de 24 h*: dentro deixa texto livre, fora não, no limite exato continua
    aberta, e sem mensagem recebida prévia se considera fechada.
  - *Filtro por papel*: o administrador é o único sem filtro; o assessor filtra por
    `owner_id` contra o próprio id (traduz-se a condição para SQL para vê-lo); um papel
    desconhecido se trata como assessor, não como admin.
  - *Esquema de `config/cliente.ts`*: etapas repetidas, pipeline de uma única etapa, cor
    que não é `#rrggbb`, chave que não é snake_case, campo de seleção sem opções e
    campos repetidos.
  - *Configuração pública*: escapa `<` para que não se possa fechar a tag `script`
    a partir de um valor do ambiente.
  - *Templates de e-mail*: conservam os marcadores que o provedor preenche e escapam
    o nome da marca.
- `npm test` e `npm run test:watch`. O CI os roda **antes** de typecheck, lint e build,
  nas duas pontas da matriz de módulos.

### Alterado

- `@types/node` passa de 20 a 22, que é a versão de Node que o repositório pede desde o
  README. Estavam desalinhados desde antes.
- `SEGURANCA.md` explica como varrer o histórico com gitleaks antes de tornar público um
  fork, e qual é o único achado que dá (um placeholder num exemplo da
  documentação).

## 1.3.6 — 2026-10-06

### Atualizar desde 1.3.5

Traga esta versão. Não há migrações nem mudanças de comportamento: muda a licença.

### Alterado

- **O Builder CRM passa a ser software proprietário.** Copyright de Diego Vásquez. Os
  membros do IA Builder Lab podem adaptá-lo, implantar instâncias para os seus clientes e
  cobrar por elas; não podem publicar o código nem redistribuí-lo como modelo ou
  produto. Os termos estão em `LICENSE` e o resumo no README.
- **Conserva-se o aviso MIT do auto-crm**, o projeto do qual isto nasceu como fork, numa
  seção à parte de `LICENSE`. Não é cortesia: a licença MIT permite relicenciar um
  derivado, inclusive como proprietário, **desde que o aviso de copyright viaje nas
  cópias**. Tirá-lo seria descumpri-la.
- `package.json` declara `UNLICENSED`, que é como o npm nomeia o software proprietário.

## 1.3.5 — 2026-10-05

### Atualizar desde 1.3.4

Traga esta versão e implante de novo. Não há migrações.

### Corrigido

- **O lockfile continuava mudando no primeiro `npm install`.** 1.3.4 arrumou o número de
  versão mas não o resto: o lockfile publicado declarava `hasInstallScript`, que sobrou
  dos tempos de SQLite, e o npm o substitui por `license` assim que alguém instala.
  Conferido num clone limpo: agora o primeiro `npm install` deixa a árvore sem mudanças, e
  uma adaptação a um cliente só mostra `config/cliente.ts` e `config/modulos.json`,
  que é o que a constituição promete.

## 1.3.4 — 2026-10-05

Saiu de percorrer o caminho de um membro de verdade: clonar o repositório publicado numa
pasta vazia, instalar, migrar uma base nova e adaptar o modelo a um cliente
inventado. Três coisas não estavam como diziam estar.

### Atualizar desde 1.3.3

Traga esta versão e implante de novo. Não há migrações. Depois de atualizar,
`src/lib/modules/*.generated.ts` deixa de estar versionado: se a sua instância os tinha
modificados, não acontece nada, regeneram-se sozinhos ao construir.

### Corrigido

- **Ativar um módulo sujava dois arquivos do núcleo.** O registro de módulos
  (`src/lib/modules/*.generated.ts`) se gera a partir de `config/modulos.json`, mas estava
  versionado, então qualquer adaptação deixava mudanças dentro de `src/`: quebrava a
  promessa de que `git status` só mostra a zona do cliente e garantia um conflito
  em cada atualização a partir do repositório original. Agora está no `.gitignore` e geram-no
  igual `next build`, `npm run dev` e `npm run typecheck`.
- **O `package-lock.json` publicado dizia `1.0.0`.** As versões se subiam à mão em
  `package.json` e o lockfile ficou para trás, com um `hasInstallScript` que sobrou dos
  tempos de SQLite. Resultado: o primeiro `npm install` de qualquer membro deixava o
  lockfile modificado sem que tivesse tocado em nada. Corrigido, e daqui em diante a versão
  se sobe com `npm version`, que atualiza os dois arquivos.
- **O runner de migrações não explicava as duas falhas mais prováveis.** Contra o seu próprio
  Postgres, antes de iniciar o GoTrue, dizia `schema "auth" does not exist` e nada mais.
  Agora diz que rode `npm run auth:preparar`, e no outro caso que suba o
  contêiner de autenticação primeiro. Também imprime os avisos do servidor numa
  linha em vez de despejar o objeto inteiro do driver, que parecia um erro.

### Verificado no caminho

Com uma base Postgres vazia e o repositório recém-clonado: as 5 migrações do núcleo entram
limpas, ficam 23 tabelas, **nenhuma sem RLS**, 20 políticas e o papel `anon` sem um único
privilégio. Adaptado a um cliente inventado (marca, pipeline e o módulo `visitas`
ativo), a migração do módulo entra sozinha e `npm run build` passa.

## 1.3.3 — 2026-10-05

### Atualizar desde 1.3.2

Traga esta versão e implante de novo. Não há migrações. O primeiro deploy demora
como sempre (os caches nascem vazios); o seguinte teria que ser bem mais curto.

### Alterado

- **O deploy reinstalava as 817 dependências toda vez.** O Dockerfile copia
  `package.json` antes de `npm ci`, e cada versão nova muda esse arquivo (o número de
  versão), então a camada se invalidava sempre: 4,5 minutos medidos no VPS da
  demo baixando e descomprimindo o mesmo que já estava. Agora `npm ci` usa um cache de
  BuildKit (`/root/.npm`), que sobrevive à invalidação da camada. Adiciona-se também
  um cache para `.next/cache`: com Turbopack ajuda pouco, mas não custa nada.
- O cabeçalho do `Dockerfile` já não diz que haja que marcar variáveis como de build:
  desde 1.2.2 o build não precisa de nenhuma variável.

### Adicionado

- O arnês avisa de algo que acontece no Coolify e manda buscar problemas que não existem:
  **depois de um deploy "concluído" o contêiner velho continua servindo um tempo**,
  então o domínio alterna as duas versões e a verificação olha código velho a
  metade das vezes. `probar-instancia` confere a versão várias vezes antes de
  diagnosticar, e `deploy-coolify` lista isso primeiro no diagnóstico.

## 1.3.2 — 2026-10-05

### Atualizar desde 1.3.1

Traga esta versão e implante de novo. Não há migrações. Se você tinha o cron de
`sweepers` ligado para uma instância na Vercel, volte a descomentá-lo (ver abaixo).

### Corrigido

- **O workflow de varreduras falhava a cada meia hora em cada clone do repositório.** Estava
  programado a cada 30 minutos e, sem os segredos configurados, o `curl` ficava sem
  URL (`URL rejected: No host part`). Resultado para qualquer membro que clonasse: o
  repositório vermelho, um e-mail de falha a cada meia hora e 1.440 minutos de Actions gastos no
  mês para nada. E é um workflow que **só faz falta na Vercel**: no Coolify as
  varreduras rodam dentro do processo. Agora vem com o cron desligado, liga-se
  descomentando duas linhas, e se se roda à mão sem segredos explica que não há nada a
  varrer em vez de falhar.

### Alterado

- **Já não há que marcar variáveis como "Build Variable" no Coolify.** Desde 1.2.2 a
  configuração pública se serve em execução, então o passo manual que a API do
  Coolify não permite deixou de ser necessário. Diziam isso o README, `.env.example`,
  `CLAUDE.md`, a skill `deploy-coolify` e `docs/SUPABASE-NO-VPS.md`, cada um à sua
  maneira: os cinco ficaram corrigidos. O `Dockerfile` continua aceitando as
  `NEXT_PUBLIC_*` como build args para plataformas que as gravam na imagem.
- O diagnóstico de `deploy-coolify` diz a causa real de um build que pede variáveis:
  código que consulta a base ou lê o ambiente ao se importar.

### Adicionado

- **As duas specs que faltavam**: `specs/nucleo/08-auth-externa.md` e
  `09-correio-de-acesso.md`. Entrar com o Google (1.2.0) e os e-mails de acesso (1.3.0) se
  construíram sem spec prévia, contra o princípio II da constituição. Ambas o
  declaram no cabeçalho em vez de disfarçar, e com isto `specs/nucleo/` volta a
  descrever o sistema completo, que é o que o Claude lê ao adaptar uma instância.

## 1.3.1 — 2026-10-05

### Atualizar desde 1.3.0

Traga esta versão e implante de novo. Não há migrações nem passos manuais.

### Alterado

- **O aviso de Ajustes -> Canales mandava a um arquivo que não existe.** Dizia que
  `ZERNIO_API_KEY` vai em `.env.local`, que é verdade em desenvolvimento e falso numa
  instância implantada: ali são as variáveis do aplicativo. Agora nomeia os dois
  lugares, avisa que há que implantar de novo para que pegue o valor, e no do
  segredo do webhook lembra que tem que ser idêntico ao da assinatura do Zernio
  e que `npm run zernio:webhook` os deixa iguais.
- **As credenciais do Zernio se leem ao usá-las, não ao importar o módulo.**
  `src/lib/zernio/client.ts` e `webhooks.ts` as guardavam em constantes do módulo, e
  `zernioConfig` era um objeto calculado no primeiro import (agora é uma função). Não
  havia nenhuma falha em produção, porque o contêiner inicia de novo em cada
  deploy e aí lê o ambiente; é a mesma forma que obrigou a tornar preguiçoso o
  cliente de base, e atá-la ao momento do import é uma armadilha esperando que alguém
  importe o módulo a partir de um script ou de um contexto que se avalia antes de carregar o
  ambiente. Ficam com o padrão velho, de propósito e documentado, `meta-whatsapp.ts` (a
  válvula de escape da Meta, que não se estende) e `push.ts`.

## 1.3.0 — 2026-10-04

### Atualizar desde 1.2.2

Traga esta versão e implante de novo. Não há migrações. Se você não configurar SMTP, nada
muda: o cadastro continua sendo com senha temporária, igual a hoje.

Para ligar os convites por e-mail há que fazer duas coisas, e as duas importam:
pôr o SMTP no servidor de autenticação e depois `AUTH_ENVIA_CORREOS=true` no
CRM. Passo a passo com Resend, Supabase cloud e os templates: `docs/CORREIO.md`.

### Adicionado

- **Convites por e-mail.** Em Ajustes -> Equipo, o cadastro agora pergunta **como
  se entra**: um convite por e-mail, onde a pessoa escolhe a própria senha, ou a
  senha temporária de sempre. Só aparece se a instância declara que o servidor de
  autenticação manda e-mails.
- **Reenviar o acesso.** Um botão por membro, para quem perdeu a senha ou nunca
  abriu o convite. Não muda nada até que a pessoa use o link.
- **"Esqueceu?" no login**, com a página: pede o e-mail e manda um link. Antes
  não havia forma de recuperar uma senha sem que um admin a trocasse à mão.
- **Página para escolher a senha** (`/auth/definir-clave`), onde aterrissam os três
  caminhos. Guarda a sessão que vem no fragmento da URL e limpa a barra de
  endereços, para que o link não fique no histórico nem numa captura.
- **Templates de e-mail com a marca da instância**, em espanhol, servidos pelo
  próprio CRM em `/correo/invitacion.html` e `/correo/recuperacion.html`. O GoTrue os
  baixa; no Supabase cloud se copiam e se colam no painel. Se a URL não responder,
  o GoTrue usa o template padrão e o e-mail sai igual.
- `/api/health` informa `correo: true|false`, e `npm run verificar` diz isso na linha
  **Formas de entrar**.

### Alterado

- O diálogo de cadastro já não afirma que nunca se envia um e-mail: diz conforme o que está
  configurado (era verdade em 1.2.2, deixou de ser).
- `AUTH_ENVIA_CORREOS` é um interruptor manual de propósito. O GoTrue sem SMTP **não falha**:
  usa um cliente de e-mail que engole a mensagem e responde 200, então detectá-lo
  automaticamente era impossível e sem o interruptor a UI diria "convite enviado"
  sobre um e-mail que nunca saiu.
- `docs/SUPABASE-NO-VPS.md` corrige um conselho: `GOTRUE_MAILER_AUTOCONFIRM` fica em
  `true` também com SMTP configurado, porque só afeta o cadastro público, que está
  fechado.

## 1.2.2 — 2026-10-04

### Atualizar desde 1.2.1

Traga esta versão e implante de novo. Não há migrações nem passos manuais.

### Corrigido

- **O rodapé do menu lateral ficava cinza para sempre.** O Next grava as
  variáveis NEXT_PUBLIC durante o build, e numa instância por cliente a URL do
  Supabase não se conhece ao compilar a imagem. Por cima, a API do Coolify 4.3 não permite
  marcar uma variável como de build, então chegavam vazias ao bundle: o cliente de
  Supabase do navegador nascia quebrado e o menu de usuário nunca carregava, sem nenhum erro
  visível. Agora o layout escreve esses dois valores públicos num bloco JSON em tempo
  de execução e o navegador os lê dali, então a mesma imagem serve para
  qualquer instância. Isso também era necessário para que funcionasse o botão de entrar
  com um provedor externo.
- O menu de usuário lê o nome e o e-mail do próprio CRM em vez do cliente do
  Supabase, e se a consulta falhar mostra um aviso em vez de ficar carregando.

### Alterado

- **Ajustes -> Equipo explica o que cada papel vê** ao escolhê-lo: o assessor vê só os
  contatos atribuídos a ele com tudo o que pende deles, o administrador vê tudo.
  O comportamento já era esse; o que faltava era dizê-lo onde se decide.
- O diálogo de cadastro esclarece que **não se envia nenhum e-mail**: a conta fica pronta na
  hora e a senha temporária o administrador passa, ou se deixa vazia se essa
  pessoa vai entrar com um provedor externo.

## 1.2.1 — 2026-10-03

### Atualizar desde 1.2.0

Traga esta versão e implante de novo. Se você ainda não configurou nenhum provedor
externo, não te afeta.

### Corrigido

- **A volta do login com um provedor externo redirecionava para o endereço interno do
  contêiner.** Atrás de um proxy, a origem da requisição é algo como
  https://0.0.0.0:3000, então depois de entrar com o Google o navegador terminava numa
  URL inalcançável. Agora o endereço público sai de APP_BASE_URL, que é a
  fonte que não se pode falsificar de fora, e só se faltar se olham os cabeçalhos
  do proxy. Encontrado testando a rota na instância implantada.

## 1.2.0 — 2026-10-03

### Atualizar desde 1.1.2

Traga esta versão e implante de novo. Não há migrações nem passos manuais, e se você não
configurar nenhum provedor externo nada muda: o login se vê igual a hoje.

### Adicionado

- **Entrar com o Google, opcional e desligado de fábrica.** Se o servidor de autenticação
  tem o provedor ligado, aparece o botão no login e no cadastro; se não, não
  aparece. O CRM **não tem variáveis próprias** para isso: pergunta ao provedor pelo
  endpoint público `/auth/v1/settings` o que tem ligado, então se configura num
  só lugar e não há nada a manter sincronizado. Serve igual para GitHub,
  Microsoft, Facebook e Apple.

  Entrar com um provedor **não dá acesso por si só**: quem não estiver em
  `team_members` cai em `/sin-acceso`, igual a e-mail e senha. O provedor
  diz quem você é; a equipe diz se você entra. Passo a passo, com a configuração do Google
  Cloud e as falhas típicas: [docs/GOOGLE-AUTH.md](docs/GOOGLE-AUTH.md).

- A **senha temporária é opcional** ao cadastrar alguém em Ajustes -> Equipo.
  Se essa pessoa vai entrar com um provedor externo, inventar uma senha que ninguém
  usará só adiciona ruído.

- `npm run verificar` informa as **formas de entrar** que a instância admite.

## 1.1.2 — 2026-10-03

### Atualizar desde 1.1.1

Traga esta versão e implante de novo. Não há migrações nem passos manuais.

### Corrigido

- **Cinco páginas não mandavam a `/sin-acceso`.** Contatos, ajustes, atividades,
  automações e templates são componentes de cliente, então resolviam a sessão
  no navegador e se renderizavam igual para alguém com sessão de Auth mas sem linha
  em `team_members`. Não escapava nenhum dado, porque toda rota de dados exige
  membresia e devolvia 403, mas se via o esqueleto do aplicativo em lugar do aviso.
  Agora a porta é a mesma em todas: `layoutSoloMiembros()` para as duas primeiras e
  a checagem dentro de `gateLayout` para as outras três.

## 1.1.1 — 2026-10-03

### Atualizar desde 1.1.0

Traga esta versão e implante de novo: a migração roda sozinha ao iniciar. **Se a sua
instância já estava publicada na internet, depois entre em Ajustes -> Equipo e desative
qualquer conta que você não reconheça**, porque a correção fecha a porta para a frente
mas não apaga quem tenha entrado antes.

### Corrigido (segurança)

- **Qualquer um podia se cadastrar e entrar como assessor.** O gatilho da base
  criava a linha de `team_members`, ativa, para todo usuário novo de Auth. E o
  cadastro do Supabase Auth é público por natureza, porque a chave anônima viaja no
  navegador: bastava chamar `/auth/v1/signup` à mão para pular a página
  de cadastro fechada do CRM e entrar na caixa de entrada e nos contatos. Conferido contra
  uma instância real antes e depois da correção.

  Agora o gatilho **só resolve a partida**: a primeira conta da instância
  fica como administradora e ninguém mais entra sozinho. Um usuário de Auth sem convite não
  tem linha em `team_members` e cai em `/sin-acceso`, que é o que a documentação
  dizia desde o princípio. O cadastro a partir de Ajustes -> Equipo não muda: essa rota sempre
  inseriu a linha ela mesma.

  Como defesa em profundidade, uma vez criada a conta administradora convém fechar
  também o cadastro no provedor: `GOTRUE_DISABLE_SIGNUP=true` se você auto-hospeda, ou
  o interruptor de cadastros no painel do Supabase cloud. `npm run admin:crear` continua
  funcionando igual, porque usa a chave de serviço.

## 1.1.0 — 2026-10-03

### Atualizar desde 1.0.3

Traga esta versão e implante de novo. Se você já pôs a marca do seu cliente em
`config/cliente.ts` e em `public/marca/`, o merge vai marcar conflito nesses
arquivos: **ganha a sua versão**, como diz [ATUALIZAR.md](ATUALIZAR.md). Não há
migrações.

### Alterado

- **O modelo vem com a marca do IA Builder Lab**: o logo da comunidade e as
  cores, medidas do próprio logo, com o ciano `#3CF5F5` nas ações primárias e
  o carbono `#171E21` no painel lateral e na barra do celular. Antes o valor por
  padrão era um verde genérico. Para um cliente se muda onde sempre, na zona do
  cliente, e nada do núcleo se toca.

### Adicionado

- A autoverificação avisa quando uma instância **continua com a marca do modelo**.
  Não é uma falha, porque para uma demo está bem, mas entregar a um cliente um CRM
  com o logo da comunidade não dá nenhum erro por si só e convém ver antes.

## 1.0.3 — 2026-10-03

### Atualizar desde 1.0.2

Traga esta versão e implante de novo. Há uma migração nova e roda sozinha ao
iniciar o contêiner.

### Corrigido

- **Apagar um contato falhava com um 500.** As chaves estrangeiras de `activities`,
  `deals` e `messages` para `contacts` estavam em NO ACTION, e todo contato acaba
  tendo atividades, porque as escrevem a ingestão, o agente e as
  automações. Ou seja: o apagamento chocava sempre. A migração
  `20261003000000_cascada_contactos.sql` passa essas três a ON DELETE CASCADE buscando a
  restrição pela definição, não pelo nome. O que deve sobreviver ao apagamento não
  se toca: `automation_runs` e `notifications` continuam em SET NULL porque são registro.
- **A autoverificação carregava `.env.local` mesmo para verificar uma instância
  remota**, então o login se tentava contra outro Supabase e falhava com
  "Invalid login credentials", que parece um problema da instância. Agora esse arquivo
  se lê só quando não se passa `--url`; para uma instância remota vão
  `--supabase-url` e `--anon-key`.

### Alterado

- A autoverificação confere que **o agente aja sobre o CRM** (etapa, campos,
  resumo ou nome do contato) em vez de exigir que mova a etapa. Quando mover a
  etapa o decide o prompt de cada cliente, não o código, e se não deixou nenhum rastro
  continua sendo uma falha. Se não moveu a etapa, informa-se sem pintar de vermelho.

## 1.0.2 — 2026-10-03

### Atualizar desde 1.0.1

Traga esta versão e implante de novo. Não há passos manuais nem migrações.

### Corrigido

- **A página de relatórios não carregava e o seed de demonstração se cortava no meio.**
  As duas coisas passavam objetos `Date` como parâmetro dentro de SQL cru. Pelo caminho
  de `db.execute(sql\`...\`)` o driver não serializa datas: a consulta morre com
  `ERR_INVALID_ARG_TYPE` sem chegar ao Postgres. Agora os relatórios mandam as datas
  como texto ISO com cast a `timestamptz`, e o seed usa o construtor do Drizzle, que
  sim conhece o tipo de cada coluna. Encontrado implantando a instância de
  demonstração; nenhum gate via porque não tocam a base.

## 1.0.1 — 2026-10-03

### Atualizar desde 1.0.0

Traga esta versão e implante de novo. Não há passos manuais. Se a sua instância já
estava funcionando é porque você tinha ativos os módulos de imóveis e visitas; nesse
caso não muda nada para você.

### Corrigido

- **Uma instância com os módulos desligados não podia migrar.** A migração de RLS do
  núcleo declarava políticas sobre `visits` e `properties`, duas tabelas que desde 1.0.0
  pertencem aos módulos de visitas e imóveis. Com `config/modulos.json` no
  valor padrão, que é sem módulos, essas tabelas não existem: `db:migrar` falhava e
  o contêiner não chegava a iniciar. Cada módulo já declara o próprio RLS na
  migração, então o núcleo não as nomeia mais.

### Adicionado

- **Modo de banco de dados auto-hospedado**, para implantar sem conta do Supabase:
  `npm run claves:supabase` gera o segredo JWT e as chaves anônima e de serviço;
  `npm run auth:preparar` cria no seu Postgres os papéis, o esquema `auth` e as
  funções `auth.uid()` e companheiras que o Supabase cloud traz de fábrica, com o dono
  que o GoTrue precisa. O guia completo, com a ordem dos passos e as falhas típicas,
  está em `docs/SUPABASE-NO-VPS.md`. Fazem falta dois contêineres em lugar dos 13 do
  stack completo do Supabase, porque o CRM usa o Supabase só para autenticação.

## 1.0.0 — 2026-10-02

Primeira versão para a comunidade IA Builder Lab. Nasce de um CRM construído para um
cliente imobiliário (Next.js 16 + Supabase + Zernio) e o converte num modelo
com núcleo mínimo, zona do cliente e arnês de Claude Code.

### Atualizar desde…

Não há versão anterior compatível: esta é a base. As instâncias do CRM de origem não
se atualizam por merge; migram-se criando uma instância nova e carregando os dados.

### Núcleo

- **Base implantável**: migrações canônicas em `supabase/migrations/` (base, RLS,
  primeiro admin) aplicadas por `scripts/migrar.mjs` (tabela `_migraciones`, transação
  por arquivo, novas tentativas, RLS forçado); `src/lib/env.ts`; `/api/health` com versão e
  commit; Dockerfile multi-stage com migrações ao iniciar; `docker-compose.yml`
  só app; varreduras dentro do processo fora da Vercel.
- **Segurança**: RLS em todas as tabelas, `anon` sem privilégios, políticas de leitura
  por papel; `requireMember` em toda rota de dados e checagem de proprietário por
  contato; cadastro público aberto só para a primeira conta (admin);
  `scripts/crear-admin.mjs`.
- **Configuração por cliente**: `config/cliente.ts` (marca, idioma, moeda, papéis,
  pipeline, campos do contato, agente, módulos) validada com zod; marca aplicada em
  SSR (CSS variables, manifesto da PWA, título); pipeline sincronizado por chave ao
  iniciar; `contacts.custom_fields` no formulário, na ficha, na tabela e no chat.
- **Módulos**: `modules/<nombre>/` com manifesto, servidor (páginas, API, tools,
  seed) e migrações; `config/modulos.json`; registro gerado com imports
  estáticos; catch-all `/m/<modulo>` e `/api/m/<modulo>`; menu construído a partir da
  config. Inclui `_plantilla` e `ejemplo`.
- **Conectores**: interface `Conector` (enviar, webhook, estado); Zernio completo,
  Meta Cloud API parcial e documentada, simulador; mecânica genérica de webhooks;
  webhook de leads em `/api/webhooks/leads`.
- **Agente**: tools genéricas (`mover_etapa`, `actualizar_contacto`,
  `registrar_actividad`, `resumen_lead`, `derivar_asesor`, `asignar_asesor`) mais as
  dos módulos; prompt genérico com CONTEXTO e EQUIPE; cascata canal -> global ->
  config -> default; pausa por conversa; responde só por `deliverMessage`;
  `contacts.ai_summary`.
- **Simulador** (`/simulador`, só admin): conversar com o agente sem canal conectado
  e ver o que muda no CRM; base da autoverificação.
- **Relatórios reais** por 7/30/90 dias e dashboard sem números inventados;
  `messages.origin`.
- **Dados demo** por `POST /api/seed/demo`, `npm run seed` e botão do início.

### Modelos e módulos

- `config/plantillas/inmobiliaria.ts` (7 etapas, 5 campos, prompt qualificador).
- `modules/propiedades` (catálogo, busca semântica ou por filtros, Tokko opcional).
- `modules/visitas` (visitas, calendário, tool `agendar_visita`).

### Arnês

- `CLAUDE.md`, `specs/CONSTITUICAO.md`, `specs/_modelo.md`, `specs/nucleo/*`,
  `specs/imobiliaria/spec.md`.
- Skills: `adaptar-a-cliente`, `crear-modulo`, `nueva-plantilla-nicho`,
  `deploy-coolify`, `conectar-zernio`, `probar-instancia`, `actualizar-desde-original`.
- `.mcp.json.example` + `docs/MCP.md`; `scripts/verificar-instancia.mjs`; CI.

### Removido em relação ao CRM de origem

Classificação com Anthropic, digest por Resend, servidor MCP sobre SQLite, slash
commands do auto-crm, experimento GoHighLevel, scripts de operação de um cliente,
dados do cliente no prompt, maquete de relatórios.
