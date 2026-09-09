/**
 * Formatação de data/hora do portal — um lugar só.
 *
 * Estava em `src/components/admin/diario-labels.ts`, importado por 5
 * componentes de `components/admin/`. A Fase 6 (chamados) precisa da MESMA
 * formatação em `components/chamados/`, e componente de chamado não pode
 * importar de `components/admin/` — o Diário é dado exclusivo do admin (LGPD)
 * e o acoplamento convidaria a arrastar rótulo de nota para uma tela do aluno.
 *
 * 🔑 `timeZone` SEMPRE explícito: metade destes componentes é Server Component
 * e, sem ele, o horário sai no fuso do processo Node (Hostinger), não no do
 * usuário — mesma lição de `src/lib/plantao.ts`. Sem `"use client"` e sem
 * `server-only`: os dois lados formatam igual.
 */

const FUSO = "America/Sao_Paulo";

/** "09/09/2026 14:32" */
export function formatarDataHora(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO,
  });
}

/** "09/09/2026" — para frase corrida ("fechado em 09/09/2026"). */
export function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: FUSO,
  });
}
