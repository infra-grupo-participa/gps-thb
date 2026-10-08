import { formatarDataHora } from "@/lib/datas";
import type { AcaoHistoricoAdmin, EventoAdmin } from "@/lib/admins-tipos";

const ROTULO: Record<AcaoHistoricoAdmin, string> = {
  concedido: "Incluído",
  revogado: "Removido",
  reativado: "Reincluído",
};

/**
 * Histórico de inclusões e remoções — `<details>` fechado: é consulta de
 * auditoria, não o trabalho do dia. Erro de leitura aparece como erro, nunca
 * como "nenhuma mudança".
 */
export function HistoricoAdmins({
  eventos,
  erro,
}: {
  eventos: EventoAdmin[] | null;
  erro?: string;
}) {
  return (
    <details className="group">
      <summary className="inline-flex min-h-6 cursor-pointer items-center py-1 corpo-sm font-medium text-foreground">
        Histórico de mudanças
        {eventos ? ` (${eventos.length})` : ""}
      </summary>

      {erro ? (
        <p role="alert" className="mt-2 corpo-sm text-destructive">
          {erro}
        </p>
      ) : !eventos || eventos.length === 0 ? (
        <p className="mt-2 corpo-sm text-muted-foreground">
          Nenhuma mudança registrada.
        </p>
      ) : (
        <ul className="mt-2 divide-y divide-borda-fina rounded-lg border border-borda-fina">
          {eventos.map((ev, i) => (
            <li
              key={`${ev.em}-${ev.alvoEmail}-${i}`}
              className="grid gap-0.5 px-3 py-2 corpo-sm sm:grid-cols-[9rem_6rem_1fr] sm:gap-3"
            >
              <span className="tabular-nums text-muted-foreground">
                {ev.em ? formatarDataHora(ev.em) : "—"}
              </span>
              <span className="font-medium text-foreground">{ROTULO[ev.acao]}</span>
              <span className="min-w-0 text-foreground">
                <span className="break-words">
                  {ev.alvoNome}
                  {ev.alvoEmail && ev.alvoEmail !== ev.alvoNome
                    ? ` (${ev.alvoEmail})`
                    : ""}
                </span>
                <span className="text-muted-foreground">
                  {ev.atorNome ? ` · por ${ev.atorNome}` : ""}
                  {ev.motivo ? ` · ${ev.motivo}` : ""}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
