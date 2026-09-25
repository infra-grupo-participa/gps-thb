/**
 * Plantão de Dúvidas — Acelera Holding. Cartão "você está em intervalo".
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Server Component (sem "use client"): só formata o que `plantao_minha_situacao`
 * (`buscarMinhaSituacao`/`buscarMinhaSituacaoLogado`) já calculou — zero
 * lógica de negócio aqui.
 *
 * Mostrado só quando o aluno NÃO tem inscrição ativa (quem tem inscrição
 * ativa já vê `MinhaInscricaoCard`, e explicar intervalo junto seria
 * redundante — o aluno já sabe que está resolvido).
 */

import { HourglassIcon } from "lucide-react";
import type { SituacaoIntervalo } from "@/lib/plantao-tipos";
import { rotuloData } from "@/lib/plantao";

export function SituacaoIntervaloCard({
  situacao,
}: {
  situacao: SituacaoIntervalo;
}) {
  const verbo = situacao.causaPresente ? "participou" : "se inscreveu";
  const temLibera = situacao.liberaData && situacao.liberaHora;

  return (
    <div
      role="status"
      className="flex items-start gap-2.5 rounded-lg border bg-muted/40 p-3 text-sm text-foreground"
    >
      <HourglassIcon
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        aria-hidden
      />
      <p>
        <strong className="text-accent-foreground">
          Você está em intervalo.
        </strong>{" "}
        Você {verbo} no plantão de {rotuloData(situacao.causaData)} às{" "}
        {situacao.causaHora}. Por isso o plantão de{" "}
        {rotuloData(situacao.bloqueadoData)} às {situacao.bloqueadoHora} fica
        de fora.{" "}
        {temLibera ? (
          <>
            A partir do plantão de {rotuloData(situacao.liberaData!)} às{" "}
            {situacao.liberaHora} você já pode se inscrever.
          </>
        ) : (
          <>Você pode se inscrever no próximo plantão que abrir depois dele.</>
        )}
      </p>
    </div>
  );
}
