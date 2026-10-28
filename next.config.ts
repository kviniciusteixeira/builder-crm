import type { NextConfig } from "next";
import path from "node:path";
import { readFileSync } from "node:fs";
import { generarRegistroModulos } from "./scripts/generar-registro-modulos.mjs";

const pkg = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")) as { version: string };

// Registro de módulos ativos (config/modulos.json -> src/lib/modules/*.generated.ts).
// Regenera-se aqui para que dev, build e a imagem Docker compilem os mesmos módulos.
generarRegistroModulos(process.cwd());

const nextConfig: NextConfig = {
  // Standalone: a imagem Docker copia só .next/standalone + static + public.
  // No Windows desativa-se porque o tracing usa symlinks que ali falham.
  output: process.platform === "win32" ? undefined : "standalone",
  // `postgres` é o driver de produção. `@electric-sql/pglite` é o Postgres
  // embutido do modo local e tem que ficar fora do bundle de qualquer jeito: resolve as
  // extensões a partir do caminho do próprio arquivo, e o compilador o reescreve
  // para um marcador (`file:///ROOT/...`) com o qual não encontra nada.
  serverExternalPackages: ["postgres", "@electric-sql/pglite"],
  turbopack: {
    root: path.resolve("."),
  },
  // Cabeçalhos de segurança, só em produção (em desenvolvimento HSTS sobre localhost
  // obriga https e quebra `npm run dev`).
  //
  // O HSTS fecha a janela da PRIMEIRA visita: sem ele, um `http://crm.cliente.com`
  // escrito à mão sai em claro uma vez, e ali viaja o cookie de sessão. A Vercel o
  // coloca sozinha; um VPS com Coolify não necessariamente.
  async headers() {
    if (process.env.NODE_ENV !== "production") return [];
    return [
      {
        source: "/:ruta*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
  env: {
    // Versão congelada ao construir; commit só se o build o recebeu (SOURCE_COMMIT).
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_BUILD_COMMIT: process.env.SOURCE_COMMIT ?? "",
  },
};

export default nextConfig;
