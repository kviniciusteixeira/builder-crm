"use client";

import { useEffect, useState } from "react";

/**
 * Papel do membro da sessão, para mostrar ou ocultar o de admin no navegador.
 * É só UI: o servidor volta a verificar o papel em cada rota.
 * null = ainda não se sabe.
 */
export function useEsAdmin(): boolean | null {
  const [esAdmin, setEsAdmin] = useState<boolean | null>(null);
  useEffect(() => {
    let activo = true;
    fetch("/api/team/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { member?: { role?: string } } | null) => {
        if (activo) setEsAdmin(data?.member?.role === "admin");
      })
      .catch(() => {
        if (activo) setEsAdmin(false);
      });
    return () => {
      activo = false;
    };
  }, []);
  return esAdmin;
}
