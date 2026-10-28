// `server-only` existe para que o bundler falhe se um módulo de servidor acabar no
// navegador. Nos testes não há bundler nem navegador: só node, que já é o servidor.
// Sem esta substituição, importar qualquer módulo de servidor (team.ts, auth-correo.ts)
// dispara "This module cannot be imported from a Client Component module".
export {};
