// Service worker mínimo: só avisos (Web Push) da equipe. Sem handler de
// `fetch` de propósito — nada é cacheado nem interceptado.
//
// Payload (edge push-enviar): { titulo, corpo, url, tag }. Desde a …379 vale
// para todo aviso da equipe (chamado, minuta, croqui, sessão cancelada), não
// só chamado: o clique aceita qualquer caminho DENTRO de /admin.

// Caminho relativo dentro de /admin: segmentos só [A-Za-z0-9_-]. Recusa "//",
// "\", esquema (https:, javascript:), URL absoluta, "..", query e fragmento.
// Mesma regra do CHECK de gps.equipe_avisos.url e de urlInterna() na edge.
const CAMINHO_ADMIN = /^\/admin(\/[A-Za-z0-9_-]+)*$/;

function destinoSeguro(pedida) {
  if (typeof pedida !== "string" || !CAMINHO_ADMIN.test(pedida)) return "/admin";
  // Segunda cerca: resolvido contra a própria origem, tem de continuar nela.
  try {
    const u = new URL(pedida, self.location.origin);
    if (u.origin !== self.location.origin || u.pathname !== pedida) return "/admin";
  } catch {
    return "/admin";
  }
  return pedida;
}

self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = {};
  }
  const titulo = typeof d.titulo === "string" && d.titulo ? d.titulo : "GPS";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: typeof d.corpo === "string" ? d.corpo : "",
      tag: typeof d.tag === "string" && d.tag ? d.tag : "gps-aviso",
      renotify: true,
      data: { url: destinoSeguro(d.url) },
      icon: "/logo-thb.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = destinoSeguro(event.notification.data && event.notification.data.url);
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
