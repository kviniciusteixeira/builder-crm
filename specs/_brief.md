# Brief do cliente — Builder CRM

O que o Claude Code precisa saber para adaptar uma instância. Preenche-se antes de escrever
uma única linha: é a entrada do fluxo one-shot (`adaptar-a-cliente`), e dele saem
`specs/<cliente>/spec.md`, `config/cliente.ts` e os módulos.

**Como se usa.** Copie este arquivo para `specs/<cliente>/brief.md`, preencha e abra o Claude
Code no repositório:

> Adapta o Builder CRM para <cliente> com o brief de specs/<cliente>/brief.md e
> implanta no meu Coolify.

Também serve colado no chat sem criar o arquivo.

**Não precisa preencher tudo.** Só as três coisas de *O mínimo* são obrigatórias. O
que você deixar em branco o Claude decide com critério de negócio e te diz no resumo
final, para você corrigir em Ajustes ou pedindo a mudança. Um brief pela metade e
implantado vale mais que um brief perfeito sem implantar.

**As credenciais não vão aqui.** Este arquivo pode acabar num commit. As chaves
vão em `.env.local` (local) ou nas variáveis do Coolify, e nunca no repositório. Se você as
passar ao Claude, cole no chat, não no arquivo.

---

## O mínimo

**1. Cliente e nicho**
Nome exatamente como se escreve, e a que se dedica numa linha.

> Exemplo: Casa Sur, imobiliária que vende e aluga apartamentos em Santiago.

O nicho decide o ponto de partida: se existe `config/plantillas/<nicho>.ts` começa-se
dali e se ajusta. Hoje existe `inmobiliaria`. Se não existir, monta-se do zero (e
depois convém convertê-lo em modelo com `nueva-plantilla-nicho`).

**2. Domínio da instância**
Onde o CRM vai viver, com o DNS já apontando para o VPS.

> Exemplo: crm.casasur.cl

**3. O que o agente tem que conseguir**
Duas ou três frases sobre o que acontece hoje quando entra uma mensagem, e o que o cliente
quereria que acontecesse. Isso é o que mais influencia o resultado: daqui sai o prompt.

> Exemplo: hoje as mensagens de WhatsApp a recepcionista responde quando pode, e de
> noite ninguém responde. Queremos que o agente responda na hora, descubra se busca
> comprar ou alugar, em que zona e com que orçamento, agende a visita se estiver pronto,
> e avise um assessor quando o lead estiver qualificado.

---

## Acessos que fazem falta (passam pelo chat, não pelo arquivo)

| Para quê | O que se precisa | Sem isso |
|---|---|---|
| Banco de dados | Projeto do Supabase, ou o MCP do Supabase em modo conta para criá-lo | Não há instância |
| Hospedagem | URL e token do Coolify | Monta-se tudo mas não se implanta |
| O agente | Chave do OpenRouter | A demo sobe sem IA: o agente não responde |
| Canais | Credenciais do Zernio | A demo funciona com o simulador; WhatsApp, Instagram e Messenger se conectam depois com `conectar-zernio` |

Os três primeiros convém ter antes de começar. Os canais podem esperar: uma
instância se entrega e se demonstra com o simulador.

---

## Marca

| Dado | O que é | Limite |
|---|---|---|
| Nome | Aba do navegador, login, sidebar | 60 caracteres |
| Nome curto | Ícone do app no celular e notificações | **12 caracteres** |
| Descrição | Uma frase, aparece no login | 200 caracteres |
| Cor primária | Botões e ações | formato `#rrggbb` |
| Cor da sidebar | Fundo da barra lateral, e do navegador no celular | formato `#rrggbb` |
| Logo e ícone | PNG. O ícone tem que se ler em 64 px | — |

Se o cliente não deu logo nem cores, usam-se os genéricos e fica anotado como
pendente. Os arquivos vão em `public/marca/` como `logo.png` e `icono.png`.

**Idioma** (`es` ou `en`), **moeda** (código de três letras: `USD`, `CLP`, `MXN`, `EUR`)
e **como se chama o papel** na tela: Assessor, Vendedor, Agente, Executivo, Consultor.

**Fuso horário do negócio**, em formato IANA: `America/Santiago`,
`America/Mexico_City`, `America/Bogota`, `Europe/Madrid`, `America/Sao_Paulo`. Não é um detalhe cosmético: é
o fuso com o qual o agente decide que dia é hoje, e o servidor roda em UTC. Se ficar
errado, o cliente que escreve às 22:00 recebe a resposta deslocada um dia.

---

## Pipeline

As etapas por que passa uma operação, **em ordem**, com qual fecha ganhando e qual
fecha perdendo. Mínimo duas. O agente move o contato entre essas etapas, então
têm que ser as reais do negócio, não as de um manual.

> Exemplo: Novo lead → Qualificado → Visita agendada → Visita realizada → Negociação →
> Fechado ganho (ganha) → Fechado perdido (perdida)

Se você não souber, usa-se o pipeline do modelo do nicho e se ajusta depois arrastando
na tela.

---

## Dados a descobrir de cada lead

Os campos próprios do negócio: o que um vendedor precisa saber antes de ligar. Por
cada um:

- **Rótulo**: como se vê na ficha ("Orçamento máximo").
- **Tipo**: `texto`, `numero`, `seleccion`, `booleano` ou `fecha`.
- **Opções**: obrigatórias se for `seleccion` ("Compra" / "Aluguel").
- **O agente pergunta?** Se sim, com que palavras tem que descobrir. Isso é o que
  o modelo lê, então melhor "orçamento máximo em reais" que "orçamento".
- **Vai como coluna na tabela de contatos?** Dois ou três campos, não dez.

> Exemplo: Tipo de operação (seleção: Compra / Aluguel, o agente pergunta, na
> tabela) · Zona (texto, o agente pergunta: bairro ou cidade onde busca, na tabela) ·
> Orçamento (número, o agente pergunta: orçamento máximo) · Dormitórios
> (número, o agente pergunta) · Crédito pré-aprovado (booleano, o agente não pergunta:
> o assessor preenche)

Regra prática: entre três e seis campos que o agente descobre. Mais que isso e a
conversa vira um interrogatório.

---

## O agente

- **Como se apresenta**: nome, e se diz que é um assistente virtual ou não.
- **Tom**: formal ou próximo, você ou tu, longo ou telegráfico. Uma frase de exemplo
  escrita como o cliente falaria ajuda mais que três adjetivos.
- **O que SIM pode fazer**: dar preços, agendar, mandar fichas, cotar.
- **O que NÃO pode fazer nunca**: prometer descontos, dar prazos de entrega, opinar da
  concorrência, falar da obra em construção.
- **Quando passa para uma pessoa**, e o que diz ao cliente enquanto espera.
- **Horário**: responde sempre, ou fora do horário avisa que responde no dia seguinte.

O que o agente **não** deve inventar convém escrever explícito. É a parte do
prompt que mais problemas evita.

---

## Módulos

Contatos, conversas, pipeline, atividades, templates, relatórios e simulador já
vêm. Um módulo se adiciona quando o negócio lida com **coisas** que o CRM tem que
listar e que o agente tem que poder consultar.

Já construídos: `propiedades`, `visitas`.

Por cada módulo novo: que coisa lista (imóveis, pedidos, consultas, cursos), que dados
cada uma tem, e o que o agente teria que poder fazer com isso ("buscar imóveis por
zona e orçamento e mandar até três").

Se você não tiver certeza de que faz falta um módulo, não peça: um campo personalizado
quase sempre basta, e um módulo a mais é código que há que manter em cada
atualização do núcleo.

**Se fizer falta agendar consultas ou visitas**, mais três perguntas, porque mudam como se
constrói:

1. O agente **fecha** o horário ("te espero quinta às 16:00") ou **propõe** e
   uma pessoa confirma? O segundo é muito mais barato e se sente quase tão rápido.
2. Que dias e em que horário se atende, e quanto dura uma consulta.
3. O assessor mantém a própria agenda (Google Calendar, Outlook) com outras coisas? Se a
   resposta for sim e o agente fechar horários, vai pisar compromissos que o CRM não vê,
   e há que decidir se se lê o calendário dele ou se se reserva uma faixa fixa para consultas.

---

## Dados do cliente para a demo

O que carregar para a demo parecer real: catálogo de imóveis, lista de serviços com
preços, nomes da equipe. Se não houver nada, usam-se os dados de demonstração
(`npm run seed`), que são inventados e estão marcados como tais.

**Nunca dados reais de pessoas** em seeds, specs nem commits.

---

## Fora de escopo

O que o cliente pediu e se decidiu **não** fazer nesta instância, e por quê. Esta
seção evita a discussão da entrega: fica escrito que se deixou de fora de propósito.

---

## O que acontece depois de colar o brief

1. O Claude pergunta **no máximo três coisas**, todas juntas, e só se faltar algo
   crítico.
2. Escreve `specs/<cliente>/spec.md` e te deixa para revisar.
3. Configura, constrói os módulos, implanta no Coolify e **testa a instância
   implantada** com `probar-instancia`. Não se entrega com checks vermelhos.
4. Te entrega a URL, o acesso de demo, o que se construiu, o que ficou pendente e as
   decisões que tomou sozinho.

O que você não gostar se corrige depois: marca, etapas e campos se mudam em
`config/cliente.ts`, e o prompt do agente em Ajustes → Agente sem tocar em código.
