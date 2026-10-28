/* Service worker do CRM.
 *
 * Faz UMA coisa: receber push e mostrar a notificação. De propósito NÃO tem handler
 * de `fetch`: interceptar as requests é o que quebra as PWA no iOS Safari (tela
 * em branco ao reabrir, sessão perdida). Não há cache offline: o CRM precisa de rede.
 */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = { title: "CRM", body: "", url: "/", tag: undefined };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data) data.body = event.data.text();
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-96.png",
      tag: data.tag,
      renotify: Boolean(data.tag),
      data: { url: data.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      // Se o CRM já está aberto, focá-lo e navegar; se não, abrir uma janela.
      for (const client of list) {
        if ("focus" in client) {
          client.focus();
          if ("navigate" in client) return client.navigate(url);
          return;
        }
      }
      return self.clients.openWindow(url);
    })
  );
});

/* O navegador rotaciona a inscrição (acontece sobretudo no iOS). Reinscrevemos com a
 * mesma chave e avisamos o servidor qual era o endpoint antigo para substituí-lo. */
self.addEventListener("pushsubscriptionchange", (event) => {
  const old = event.oldSubscription;
  const key = old && old.options ? old.options.applicationServerKey : undefined;
  if (!key) return;

  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: key })
      .then((sub) =>
        fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...sub.toJSON(), oldEndpoint: old.endpoint }),
        })
      )
      .catch(() => {})
  );
});
