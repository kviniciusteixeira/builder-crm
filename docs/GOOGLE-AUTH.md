# Entrar com o Google

Opcional e desligado de fábrica. Se você configurar, aparece o botão **Continuar com
Google** no login; se não, não aparece e ninguém fica sabendo. O CRM não tem nenhuma
variável própria para isso: pergunta ao servidor de autenticação quais provedores
estão ligados, então se configura num só lugar.

## O primeiro ponto, porque muda como se pensa o resto

**Entrar com o Google NÃO dá acesso ao CRM.** Igual a e-mail e senha, quem não
estiver cadastrado em Ajustes -> Equipo com esse mesmo e-mail termina em `/sin-acceso`. O
provedor diz *quem você é*; `team_members` diz *se você entra e com qual papel*. Sem isso,
ligar o Google seria abrir a porta para qualquer um com uma conta do Gmail.

Ordem de trabalho: primeiro você cadastra a pessoa em Ajustes -> Equipo com o e-mail
exato da conta Google dela, **deixando a senha temporária vazia**, e depois ela
entra pelo botão.

## Um cliente OAuth por instância

Cada instância precisa do seu. Não se compartilha entre clientes: a tela de
consentimento do Google mostra o nome do projeto, e a URL de retorno é a
dessa instância concreta.

1. Entre no [Google Cloud Console](https://console.cloud.google.com/) e crie um projeto,
   ou escolha um.
2. **APIs e serviços -> Tela de consentimento OAuth**. Tipo **Externo**. Nome
   do aplicativo e e-mail de contato: os do cliente, não os seus. Enquanto estiver
   em modo de teste só entram os e-mails que você adicionar como usuários de teste; para
   abrir para a equipe do cliente, publique.
3. **Credenciais -> Criar credenciais -> ID do cliente OAuth**, tipo **Aplicativo
   da Web**.
4. Em **URIs de redirecionamento autorizados** vai UMA só, a do seu servidor de
   autenticação:

   ```
   https://auth.seudominio.com/auth/v1/callback
   ```

   Com Supabase cloud é `https://SEU_REF.supabase.co/auth/v1/callback`. Tem que
   coincidir caractere por caractere, inclusive o `https`.
5. Guarde o **ID do cliente** e o **segredo**.

## Ligar

### Auto-hospedado (GoTrue no seu VPS)

Três variáveis no contêiner de autenticação, e reiniciá-lo:

```
GOTRUE_EXTERNAL_GOOGLE_ENABLED=true
GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOTRUE_EXTERNAL_GOOGLE_SECRET=...
GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI=https://auth.seudominio.com/auth/v1/callback
```

Além disso, `GOTRUE_URI_ALLOW_LIST` tem que incluir a URL do CRM, porque é para lá que o
usuário volta depois de entrar:

```
GOTRUE_URI_ALLOW_LIST=https://crm.seudominio.com/**
```

### Supabase cloud

Painel do projeto -> **Authentication -> Providers -> Google**: cole o ID do cliente e
o segredo, e ligue. Em **URL Configuration** adicione `https://crm.seudominio.com/**`
às *Redirect URLs*.

## Conferir

```bash
curl https://auth.seudominio.com/auth/v1/settings -H "apikey: SUA_ANON_KEY"
```

Tem que trazer `"external": { ..., "google": true }`. É exatamente o que o
CRM olha para desenhar o botão, então se sair `true` e você recarregar o login, o botão está lá.

`npm run verificar` também informa, na linha **Formas de entrar**.

## Como funciona por dentro

1. O botão chama `signInWithOAuth` no navegador e manda o usuário para o Google.
2. O Google devolve para o seu servidor de autenticação, que manda para
   `https://crm.seudominio.com/auth/callback` com um código.
3. Essa rota (`src/app/auth/callback/route.ts`) troca o código pela sessão e deixa os
   cookies.
4. O usuário cai no início. Se não estiver em `team_members`, vai para `/sin-acceso`.

## O que quebra e por quê

- **`redirect_uri_mismatch` do Google.** A URI de retorno do passo 4 não coincide com a
  do console. Cuidado com o `https`, com a barra final e com o domínio: vai o do
  **servidor de autenticação**, não o do CRM.
- **Volta ao login sem erro visível.** Costuma ser `GOTRUE_URI_ALLOW_LIST` sem a URL do
  CRM: o provedor se recusa a redirecionar para um destino que não está na lista.
- **Entra e cai em `/sin-acceso`.** É o correto: falta cadastrá-lo em Ajustes ->
  Equipo com esse e-mail. Não é um erro de configuração.
- **O botão não aparece.** O CRM cacheia a resposta de `/auth/v1/settings` por cinco
  minutos. Espere ou implante de novo.
- **A pessoa já tinha conta com senha.** O Google se vincula à conta existente
  se o e-mail for o mesmo e estiver confirmado. As contas que Ajustes -> Equipo
  cria nascem confirmadas, então se vinculam sozinhas.
