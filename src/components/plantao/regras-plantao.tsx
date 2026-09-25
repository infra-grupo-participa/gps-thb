/**
 * Plantão de Dúvidas — as regras que recusam inscrição, visíveis ANTES de a
 * pessoa se identificar ou abrir um dia do calendário.
 *
 * Fonte das regras (se mudar no banco, este texto muda junto):
 * - intervalo: `gps.plantao_intervalo` (migração `…315`, decisão do João em
 *   25/09/2026 — depois de cada plantão, o seguinte fica de fora);
 * - prazo: `gps.plantao_prazo_inscricao` (12h da véspera);
 * - uma inscrição ativa por vez: `plantao_inscrever`.
 *
 * Server Component, sem estado.
 */

export function RegrasPlantao() {
  return (
    <section
      aria-labelledby="regras-plantao-titulo"
      className="rounded-lg border bg-card p-3 text-sm"
    >
      <h2 id="regras-plantao-titulo" className="font-semibold">
        Como funciona a inscrição
      </h2>
      <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted-foreground">
        <li>
          <strong className="text-foreground">Um plantão por vez:</strong> você
          escolhe o próximo depois que o atual acontecer.
        </li>
        <li>
          <strong className="text-foreground">Intervalo:</strong> depois de
          cada plantão, o seguinte fica de fora — você volta a partir do outro.
          Ex.: com plantões na segunda, terça e quarta, quem foi na segunda
          pode escolher a quarta em diante.
        </li>
        <li>
          <strong className="text-foreground">Prazo:</strong> as inscrições
          fecham às 12h do dia anterior ao plantão.
        </li>
        <li>Horários em horário de Brasília.</li>
      </ul>
    </section>
  );
}
