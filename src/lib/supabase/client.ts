import { createBrowserClient } from "@supabase/ssr";
import { leerConfigPublica } from "@/lib/config-publica";

/**
 * Cliente de Supabase para o navegador.
 *
 * A URL e a chave anônima saem do bloco de configuração que o layout escreve em
 * tempo de execução, não das `NEXT_PUBLIC_*` gravadas no build: a mesma imagem
 * serve para instâncias distintas. Ver `src/lib/config-publica.ts`.
 */
export function createClient() {
  const { supabaseUrl, supabaseAnonKey } = leerConfigPublica();
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Falta la configuracion publica de Supabase. Revisa NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en la instancia."
    );
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
