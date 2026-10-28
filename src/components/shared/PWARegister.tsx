"use client";

import { useEffect } from "react";

/**
 * Registra o service worker. Vai no layout raiz para que rode em toda página.
 *
 * Usa-se a URL absoluta com `window.location.origin`: o iOS recusa o registro se
 * o scope não coincide exatamente com a origem.
 */
export function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    navigator.serviceWorker
      .register(`${window.location.origin}/sw.js`, { scope: "/" })
      .then((registration) => {
        if (cancelled) return;
        // A cada hora se busca uma versão nova do worker, caso o deploy tenha mudado.
        const timer = setInterval(() => registration.update(), 60 * 60 * 1000);
        return () => clearInterval(timer);
      })
      .catch((err) => {
        console.warn("[pwa] no se pudo registrar el service worker", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
