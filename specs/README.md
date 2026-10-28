# specs/

Especificações do Builder CRM. Uma spec é escrita **antes** do código
(constituição, princípio II). Se foi escrita depois, isso consta no cabeçalho.

| Pasta | O que há |
|---|---|
| `CONSTITUICAO.md` | Os quatro princípios inegociáveis e a governança. |
| `_brief.md` | O que perguntar ao cliente antes de começar. Copia-se para `<cliente>/brief.md` e é a entrada de `adaptar-a-cliente`. |
| `_modelo.md` | Modelo de spec. Copia-se para `<cliente>/spec.md` ou `nucleo/NN-nome.md`. |
| `nucleo/` | Specs do núcleo (relatórios, configuração, módulos, conectores, agente, simulador, base implantável, modelo imobiliário, entrar com um provedor externo, e-mails de acesso, modo local, fuso horário). As de provedor externo, e-mails de acesso e modo local foram escritas **depois** do código e dizem isso no cabeçalho. |
| `inmobiliaria/` | Exemplo completo: a spec do modelo imobiliário, como ficaria a de um cliente desse nicho. |
| `<cliente>/` | A spec de cada adaptação (criada por `adaptar-a-cliente`). Não é versionada no repositório original: vive no repositório de cada cliente. |

## Trilhos

- **Completo**: mexe no modelo de dados, num contrato público (API, webhook, interface
  de conector ou de módulo) ou no núcleo. Leva todas as seções do modelo.
- **Leve**: configuração, um módulo ou UI. Bastam problema, cenários,
  requisitos, configuração/módulos e critérios de aceitação.

Cada spec termina com um **Constitution Check** (uma linha por princípio) e uma
seção **Fora de escopo** com o que se decidiu não fazer e por quê.
