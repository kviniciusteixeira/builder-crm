import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente com a service role key. SÓ no servidor e SÓ para o que o cliente
 * normal não pode fazer: criar usuários de Auth em Ajustes -> Equipo sem passar pelo
 * signup público.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY (Supabase -> Settings -> API -> service_role)."
    );
  }
  return createSupabaseClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
