# Modo local: rodar o CRM sem criar uma conta em lugar nenhum

Escrita antes do código: **não**. Saiu de ver o problema ao vivo: ao mostrar o repositório
numa aula, `npm run dev` sobre um clone recém-feito não abria nenhuma página e pedia
criar um projeto no Supabase.

## Problema

Quem clona o repositório para olhar — um membro novo, alguém avaliando, o próprio
dono numa aula — não consegue ver o CRM funcionando sem antes criar um projeto de
Supabase, copiar quatro variáveis e rodar as migrações.

E não é que se veja pela metade: não se vê nada. `src/lib/supabase/middleware.ts` monta o
cliente com `process.env.NEXT_PUBLIC_SUPABASE_URL!`, então sem essa variável **toda**
requisição morre antes de renderizar. O sintoma é uma tela de erro, não um aviso
útil.

Esse passo é onde se perde a maioria. O CRM é o coração do módulo da
comunidade: a primeira aula não pode começar com "crie uma conta no Supabase".

## Cenários

1. Alguém clona o repositório, roda `npm install && npm run local` e em menos de dois
   minutos tem o CRM aberto com contatos, conversas, pipeline e relatórios.
2. Edita `config/cliente.ts` (marca, pipeline, campos), recarrega e vê a mudança, sem
   tocar em nenhuma base remota.
3. Abre o simulador, escreve uma mensagem e a vê entrar na caixa de entrada com o contato
   criado, mesmo sem chave do OpenRouter.
4. Adiciona `OPENROUTER_API_KEY` ao `.env.local` e agora o agente responde.
5. Quando quer uma instância de verdade, segue o caminho de sempre (Supabase +
   Coolify) sem desmontar nada do anterior.

## Requisitos

- **FR-1** `npm run local` não deve exigir nenhuma conta, serviço nem variável de
  ambiente. Node e npm é tudo.
- **FR-2** A base local aplica **as mesmas migrações** que uma instância
  implantada, RLS incluído. Se o esquema local e o real divergissem, o modo local
  deixaria de servir para testar qualquer coisa.
- **FR-3** O administrador da demo se cadastra pelo **mesmo caminho que em
  produção**: inserir em `auth.users` e deixar que o gatilho do primeiro admin
  crie a linha em `team_members`.
- **FR-4** Sem servidor de autenticação não há sessão: quem abre a URL é
  administrador. A UI tem que dizer isso o tempo todo.
- **FR-5** O modo local é **impossível** em produção, mesmo que a variável esteja
  definida.
- **FR-6** As variáveis que não existem no modo local (`DATABASE_URL` e as duas do
  Supabase) não contam como faltantes: se não, `/api/health` responde 503 e o CRM não
  abre.
- **FR-7** O que o modo local não pode dar se diz em voz alta, não se simula: login,
  equipe, e-mails e busca semântica de imóveis.

## Decisões

**Postgres embutido, não Docker.** `@electric-sql/pglite` é Postgres compilado para
WebAssembly e se instala como um pacote de npm. A alternativa (Docker com Postgres e
GoTrue) é mais fiel — haveria login de verdade — mas exige instalar o Docker Desktop, que é
justamente o ponto onde as pessoas caem numa aula ao vivo. A fidelidade se recupera no
passo seguinte, quando se implanta.

**Sem login, não com um login falso.** Um login de mentira seria mais parecido com a foto
final e muito pior: daria a sensação de que há autorização onde não há nenhuma.
Melhor que se veja que não há sessão.

**Dois cadeados, e o que conta é o segundo.** `MODO_LOCAL=true` só o põe
`npm run local`; mas uma variável vaza fácil (alguém copia o `.env.local` para o
servidor). Por isso também faz falta que `NODE_ENV` não seja `production`, coisa que não
depende de nenhuma configuração: `next build` + `next start` e a imagem de Docker
rodam em production sempre.

**pgvector fica de fora.** O Postgres embutido não o traz. Só o usa o módulo
`propiedades` para a busca por significado: a migração é pulada com um aviso e
o resto do módulo funciona.

## Fora de escopo

- Login, equipe e convites no modo local.
- Webhooks reais (o Zernio precisa de uma URL pública).
- Usar a base local para algo que não seja testar e adaptar.

## Como se verifica

Clonar o repositório numa pasta limpa **sem `.env.local`**, `npm install`,
`npm run local`, e conferir: as cinco migrações aplicadas, `/api/health` em 200 com
`modoLocal: true`, as páginas principais em 200, os relatórios com números reais (não
em zero, que é como se veria se `db.execute` não estivesse normalizado) e uma mensagem
pelo simulador que entra na caixa de entrada sem chave do OpenRouter.
