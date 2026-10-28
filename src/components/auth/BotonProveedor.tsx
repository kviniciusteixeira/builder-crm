"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { IconoGoogle, IconoProveedorGenerico } from "@/components/icons/proveedores";

interface Props {
  proveedor: string;
  nombre: string;
  deshabilitado?: boolean;
}

/**
 * Entrar com um provedor externo. O botão só se desenha se o provedor está
 * ligado no servidor de autenticação, então aqui não há nada para configurar.
 */
export function BotonProveedor({ proveedor, nombre, deshabilitado }: Props) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function entrar() {
    setError(null);
    setCargando(true);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: proveedor as "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (err) {
      setError(err.message);
      setCargando(false);
    }
    // Se deu certo, o navegador já foi para o provedor.
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full h-10 cursor-pointer"
        onClick={entrar}
        disabled={cargando || deshabilitado}
      >
        {cargando ? (
          <Loader2 className="h-4 w-4 animate-spin mr-2" />
        ) : proveedor === "google" ? (
          <IconoGoogle className="h-4 w-4 mr-2" />
        ) : (
          <IconoProveedorGenerico className="h-4 w-4 mr-2" />
        )}
        Continuar con {nombre}
      </Button>
      {error && <p className="text-xs text-destructive text-center">{error}</p>}
    </div>
  );
}
