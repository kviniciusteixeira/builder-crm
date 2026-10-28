import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { createRequire } from "node:module";
import { join } from "node:path";
import * as schema from "./schema";
import { CARPETA_BASE_LOCAL, modoLocal } from "@/lib/modo-local";

/**
 * Cliente de base PREGUIÇOSO.
 *
 * `next build` importa cada route handler para coletar metadados, então se este
 * módulo lesse DATABASE_URL ao ser importado, o build pediria credenciais de base. E
 * não deve: no Dockerfile só as NEXT_PUBLIC_* são build args; DATABASE_URL é de
 * runtime, porque a base de cada instância se conhece ao implantar, não ao compilar.
 *
 * Por isso `db` é um proxy: a conexão se monta no primeiro uso real. Se falta a
 * variável, o erro aparece ali (com a mesma mensagem de sempre) e não durante o build.
 * O driver `postgres` também não abre socket até a primeira consulta.
 *
 * Em MODO LOCAL (ver src/lib/modo-local.ts) não há base pela rede: usa-se um Postgres
 * embutido guardado em `.local/db`. É o mesmo Postgres e as mesmas migrações, só
 * que compilado para WebAssembly e rodando dentro do processo do Node.
 */

type BaseDeDatos = ReturnType<typeof crearCliente>;

/**
 * O pacote do Postgres embutido se carrega à mão e só se fizer falta.
 *
 * É uma devDependency: não está na imagem de produção e não deve entrar no bundle.
 * O nome vai numa variável de propósito, para que o compilador do Next não o
 * resolva em tempo de build e o arraste.
 */
function crearClienteLocal() {
  const requerir = createRequire(import.meta.url);
  const nombrePglite = "@electric-sql/pglite";
  const nombreContrib = "@electric-sql/pglite/contrib/pgcrypto";
  const nombreDrizzle = "drizzle-orm/pglite";

  let PGlite: new (opciones: unknown) => unknown;
  let pgcrypto: unknown;
  let drizzleLocal: (cliente: unknown, opciones: unknown) => BaseDeDatos;
  try {
    ({ PGlite } = requerir(nombrePglite));
    ({ pgcrypto } = requerir(nombreContrib));
    ({ drizzle: drizzleLocal } = requerir(nombreDrizzle));
  } catch {
    throw new Error(
      "Modo local: falta el paquete del Postgres embebido. Corre `npm install` y volve a `npm run local`."
    );
  }

  const cliente = new PGlite({
    dataDir: join(process.cwd(), CARPETA_BASE_LOCAL),
    extensions: { pgcrypto },
  });
  return drizzleLocal(cliente, { schema });
}

function crearCliente() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL no esta seteada. Configurala en .env.local (Supabase: Settings -> Database -> Connection string).\n" +
        "Para probar el CRM sin crear nada: npm run local"
    );
  }

  const client = postgres(connectionString, {
    prepare: false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    // TLS obrigatório salvo que se diga o contrário à mão.
    //
    // postgres-js deixa `ssl` em false se a URL não traz `sslmode`, e nem a que se copia e
    // cola do Supabase nem o modelo de .env.example o trazem: sem isso, cada consulta
    // (contatos, conversas inteiras de WhatsApp, telefones) cruza a rede em claro
    // entre o VPS e a base. Nada falha nem se nota: só viaja legível.
    //
    // `DATABASE_SSL=off` existe para um Postgres na mesma máquina ou na rede
    // interna do Docker, onde não há certificado e não há rede pública para cruzar.
    ssl: process.env.DATABASE_SSL === "off" ? false : "require",
  });

  return drizzle(client, { schema });
}

/**
 * No modo local a instância vive em globalThis. `next dev` recarrega os módulos a
 * quente e a base embutida é um arquivo com um só dono: uma segunda instância
 * sobre a mesma pasta não abre.
 */
const almacen = globalThis as unknown as { __dbBuilderCrm?: BaseDeDatos };
let instancia: BaseDeDatos | null = null;

function obtenerCliente(): BaseDeDatos {
  if (modoLocal()) {
    almacen.__dbBuilderCrm ??= crearClienteLocal();
    return almacen.__dbBuilderCrm;
  }
  instancia ??= crearCliente();
  return instancia;
}

/**
 * `db.execute(sql...)` devolve coisas distintas conforme o driver: `postgres` devolve o
 * array de linhas e o embutido devolve `{ rows, fields }`. Meia dúzia de lugares
 * (relatórios, equipe, automações, seed) fazem `resultado[0]` sobre isso.
 *
 * Se não se normalizasse, no modo local nada quebra à vista: as consultas cruas
 * devolveriam `undefined` e os relatórios sairiam em zero, sem um único erro. Por isso se
 * iguala aqui e não em cada lugar que o usa.
 */
function normalizarExecute(real: Record<string | symbol, unknown>) {
  const original = real.execute as (...args: unknown[]) => Promise<unknown>;
  return async (...args: unknown[]) => {
    const resultado = (await original.apply(real, args)) as { rows?: unknown[] };
    return Array.isArray(resultado) ? resultado : (resultado?.rows ?? []);
  };
}

export const db = new Proxy({} as BaseDeDatos, {
  get(_destino, propiedad) {
    const real = obtenerCliente() as unknown as Record<string | symbol, unknown>;
    if (propiedad === "execute" && modoLocal()) return normalizarExecute(real);
    const valor = real[propiedad];
    return typeof valor === "function" ? valor.bind(real) : valor;
  },
  has(_destino, propiedad) {
    return propiedad in (obtenerCliente() as object);
  },
});
