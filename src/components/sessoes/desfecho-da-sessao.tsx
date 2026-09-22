import { formatarDataHora } from "@/lib/datas";
import { LinhaDaFicha as Linha } from "@/components/sessoes/disc-do-cliente";
import type { SessaoAgendamento } from "@/lib/sessoes-tipos";

/**
 * Como a sessão terminou — para o parceiro, nunca o texto do resumo.
 *
 * PRD: `docs/specs/2026-09-23-sessoes-disc-link-resumo-PRD.md`, Fatia H, §4 P4.
 *
 * 🔴 `resumo` (o TEXTO) não existe em `SessaoAgendamento` de propósito
 * (P4/LGPD): o aluno vê QUE houve resumo, nunca o CONTEÚDO. Quem lê o texto
 * usa `gps.sessao_resumo_ler`, que recusa o aluno com 42501. Não adicionar
 * busca desse texto aqui.
 *
 * Denso e chapado: mais linhas da MESMA `<dl>` que `MinhaSessao` já monta
 * (`LinhaDaFicha`, a mesma peça que `DiscDoCliente` usa) — nunca um card novo.
 *
 * Server Component: só lê props, sem estado e sem action.
 */
export function DesfechoDaSessao({
  sessao,
}: {
  sessao: Pick<
    SessaoAgendamento,
    | "estado"
    | "resumo_em"
    | "cancelado_em"
    | "cancelado_por"
    | "cancelado_motivo"
  >;
}) {
  // `agendado` não tem desfecho ainda — o bloco inteiro não aparece.
  if (sessao.estado === "agendado") return null;

  if (sessao.estado === "cancelado") {
    // O motivo já é exibido em `minha-sessao.tsx` hoje (o `DialogoConfirmacao`
    // de cancelamento e o texto abaixo dele) — não duplicar aqui. Esta linha
    // cobre só "quem cancelou e quando".
    return (
      <Linha rotulo="Desfecho">
        Sessão cancelada
        {sessao.cancelado_em
          ? ` em ${formatarDataHora(sessao.cancelado_em)}`
          : null}
        .
      </Linha>
    );
  }

  if (sessao.estado === "falta") {
    // Estado mais delicado da tela: fato, sem adjetivo, sem acusação.
    return (
      <Linha rotulo="Desfecho">
        Falta registrada pela equipe.
      </Linha>
    );
  }

  // estado === "realizado"
  if (sessao.resumo_em) {
    return (
      <Linha rotulo="Desfecho">
        Sessão realizada. A equipe registrou o resumo em{" "}
        {formatarDataHora(sessao.resumo_em)}.
      </Linha>
    );
  }

  // Sem `resumo_em`: a equipe pode escrever depois. Não é problema do aluno,
  // então não se diz "pendente".
  return <Linha rotulo="Desfecho">Sessão realizada.</Linha>;
}
