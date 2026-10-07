/**
 * Passo ANTES do logout: desliga os avisos push deste navegador (computador
 * compartilhado não pode continuar recebendo aviso depois de sair).
 *
 * Nunca bloqueia nem lança: teto de ~1,5 s, erro ignorado. Sem inscrição no
 * navegador (todo aluno/sócio) não importa a action nem faz chamada nenhuma.
 * A action tem `ehAdmin()` de guarda; quem não é admin nem chega a ter inscrição.
 */
export async function desligarPushAoSair(): Promise<void> {
  const trabalho = (async () => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    const [{ desativarAvisosPush }, { chamarAcao }] = await Promise.all([
      import("@/app/admin/chamados/push-actions"),
      import("@/lib/acao-no-navegador"),
    ]);
    await chamarAcao(() => desativarAvisosPush(sub.endpoint));
    await sub.unsubscribe();
  })().catch(() => undefined);
  await Promise.race([
    trabalho,
    new Promise<void>((r) => setTimeout(r, 1500)),
  ]);
}
