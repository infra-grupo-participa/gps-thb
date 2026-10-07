// Service worker mínimo: só avisos (Web Push) da equipe. Sem handler de
// `fetch` de propósito — nada é cacheado nem interceptado.
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = {};
  }
  const titulo = d.titulo || "Chamado novo";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: d.corpo || "",
      tag: d.tag || "chamado",
      renotify: true,
      data: { url: d.url || "/admin/chamados" },
      icon: "/logo-thb.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const pedida = event.notification.data && event.notification.data.url;
  const url =
    typeof pedida === "string" && pedida.startsWith("/admin/chamados/")
      ? pedida
      : "/admin/chamados";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((janelas) => {
        const alvo = new URL(url, self.location.origin).href;
        for (const j of janelas) {
          if (j.url === alvo && "focus" in j) return j.focus();
        }
        return self.clients.openWindow(url);
      }),
  );
});
