# Spec: fuso horário da instância

**Trilho**: completo — *mexe no esquema de configuração, que é núcleo.*
**Estado**: implementada
**Data**: 2026-10-12
**Escrita antes do código**: sim

## Problema

O CRM não sabe em que fuso horário o negócio vive. Em todo o repositório não há uma única
referência a fuso horário, e o contêiner não define `TZ`, então o servidor roda em
UTC.

Isso já está falhando, sem nenhuma função de agenda no meio: o prompt do agente
inclui `{{fecha}}` ("a data de hoje é ..."), e essa data se calcula com o fuso do
processo. No Chile, das 21:00 até a meia-noite, o agente acha que já é o dia
seguinte. Um cliente que escreve às 22:00 numa quarta e pergunta "atendem amanhã?"
recebe a resposta deslocada um dia. O canal onde isso acontece é o WhatsApp, à noite, que é
justamente quando mais se usa.

O mesmo acontece na tela: `formatDate` e `formatRelativeDate` ("Hoje", "Ontem") resolvem
o dia de calendário com o fuso do processo ao renderizar no servidor e com o do
dispositivo no navegador, então a mesma linha pode dizer duas coisas diferentes.

Nada disso se vê como um erro: não há exceção, não há log, não há check vermelho. Vê-se
como um agente que errou o dia.

## Decisões do dono

- **D1** Adiciona-se só o fuso horário. O agendamento de consultas (janela de atendimento,
  horários disponíveis, reserva, calendário externo) **não** se constrói até que um
  cliente peça, e quando acontecer se constrói como módulo com `crear-modulo`.
- **D2** O fuso horário entra agora, e não quando aparecer o primeiro cliente com consultas,
  porque vive no núcleo: um membro que precisasse dele teria que editar `src/`, que é
  o que o princípio I proíbe, e o patch se quebra em cada atualização.
- **D3** O valor padrão não muda o comportamento das instâncias que já estão
  implantadas.

## Cenários

1. **Configurar** — o membro põe `zonaHoraria: "America/Santiago"` em
   `config/cliente.ts` e a instância usa esse fuso para tudo o que seja dia ou hora.
2. **Errar** — o membro escreve `"America/Santigo"` (com um erro de digitação) e a
   configuração é rejeitada na validação, com o nome do campo e o valor na
   mensagem. Não inicia com um fuso silenciosamente ignorado.
3. **Não configurar** — uma instância que não declara fuso horário continua se comportando
   como hoje (UTC), sem quebrar ao atualizar o núcleo.
4. **Conversar de noite** — um cliente escreve às 22:00 hora local e o agente lhe
   diz o dia correto.
5. **Olhar a ficha** — uma atividade de ontem às 23:00 diz "Ontem" tanto se a página
   foi renderizada no servidor como se foi renderizada no navegador.

## Requisitos

- FR-001 O esquema de configuração DEVE aceitar `zonaHoraria`, um identificador IANA
  (`America/Santiago`, `America/Mexico_City`, `Europe/Madrid`).
- FR-002 O esquema DEVE rejeitar um valor que o ambiente não reconheça como fuso
  horário, com uma mensagem que inclua o valor recebido.
- FR-003 O valor padrão DEVE ser `UTC`, para não mover as datas de uma instância
  já implantada que atualize o núcleo sem tocar na configuração (D3).
- FR-004 `config/cliente.ts` DEVE trazer o fuso declarado explicitamente, para que o
  membro o veja ao adaptar e não fique no default por omissão.
- FR-005 O prompt do agente DEVE calcular `{{fecha}}` no fuso configurado.
- FR-006 `formatDate` e `formatRelativeDate` DEVEM resolver o dia de calendário no fuso
  configurado, de modo que o resultado não dependa de onde foi renderizado.
- FR-007 A validação DEVE poder rodar num componente cliente: o esquema não importa
  nada server-only e isto não muda isso.

## Configuração e módulos

`config/cliente.ts` soma uma chave:

```ts
zonaHoraria: "America/Santiago",
```

`config/plantillas/inmobiliaria.ts` a declara também. Nenhum módulo novo.

## Modelo de dados

Nenhum. As colunas já são `timestamptz`, que guarda o instante; o que faltava era
com que fuso interpretá-lo ao mostrar ou ao nomeá-lo.

## Agente de IA

O placeholder `{{fecha}}` passa a se resolver no fuso da instância. O texto do
prompt padrão não muda, então as instâncias com prompt próprio também não se veem
afetadas: continuam recebendo `{{fecha}}`, agora correta.

Não se adicionam tools nem se dá a hora ao agente (só o dia), porque isso faz parte do
agendamento e está fora de escopo.

## Critérios de aceitação

- CA-001 `npm test` passa com cinco casos novos: aceita um fuso IANA, usa `UTC` por
  padrão, rejeita um fuso mal escrito nomeando-o na mensagem, o prompt nomeia o
  dia do fuso do negócio, e "Hoje"/"Ontem" mudam à meia-noite local.
- CA-002 `npm run typecheck && npm run lint && npm run build` em verde, com `build` sem
  `DATABASE_URL` como o CI roda.
- CA-003 A suíte passa igual com o processo em UTC (`TZ=UTC npm test`) e no fuso
  local. É a única forma de saber que o resultado não depende do relógio do contêiner:
  na máquina de um membro chileno o bug não se reproduz.
- CA-004 Uma configuração sem `zonaHoraria` continua validando, e uma instância que não a
  declara vê as mesmas datas de antes de atualizar.

Os casos foram escritos de modo a não depender do fuso declarado em
`config/cliente.ts`: a expectativa se calcula comparando o dia local, então continuam
corretos na instância de um membro que o mude.

## Constitution Check

- **I. Núcleo intocável**: exceção justificada. É uma mudança do núcleo feita no
  repositório original, não um patch numa instância: é exatamente o caminho que o
  princípio I manda seguir quando uma adaptação precisa de algo genérico (D2).
- **II. Spec antes do código**: cumpre.
- **III. Autoverificação**: cumpre. CA-001 e CA-002 rodam sem base nem rede; o caso da
  noite (CA-003, CA-004) se testa com um instante fixo, não com o relógio.
- **IV. Zero segredos**: não se aplica. Um fuso horário não é uma credencial, e por isso vai
  na configuração e não no ambiente.

## Fora de escopo

- **Agendamento de consultas**: janela de atendimento, horários disponíveis, reserva com
  cadeado, reserva com vencimento, `.ics`, Google Calendar. Constrói-se como módulo
  quando um cliente pedir (D1).
- **Dar a hora ao agente**, não só o dia. Faz falta para responder "atendem
  agora?", mas muda como o agente responde e isso merece a própria decisão.
- **Fuso horário por membro da equipe.** A instância é de um negócio que opera num
  lugar; um assessor em viagem continua vendo a hora do negócio, que é a que importa para
  coordenar.
- **`TZ` no contêiner.** Deixar o processo em UTC e resolver o fuso ao mostrar é o
  correto: uma imagem compartilhada por muitas instâncias não pode ter o fuso gravado nela.
