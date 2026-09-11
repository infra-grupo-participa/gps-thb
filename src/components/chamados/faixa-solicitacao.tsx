/**
 * A faixa de uma solicitação de troca (cliente ou sócio). Server Component
 * puro — sem estado, sem action. Aparece no topo da thread, ACIMA das
 * mensagens, nas duas visões (aluno e admin).
 *
 * `pendente` = "Pedido em análise"; `aprovada`/`declinada` = o resultado, com
 * o motivo da equipe quando houver (declínio sempre tem; aprovação é
 * opcional).
 *
 * 🔑 Os rótulos (`alvo_atual_rotulo`/`alvo_novo_rotulo`) são CÓPIA do nome no
 * instante do pedido — nunca busca o cliente/sócio de novo. Ele pode ter sido
 * apagado ou trocado entre o pedido e a leitura desta tela.
 *
 * 🔴 EM `troca_socio`, `alvo_novo_id`/`alvo_novo_rotulo` são SEMPRE `NULL`
 * (contrato confirmado em produção): a aprovação REMOVE o sócio atual; quem
 * entra no lugar é convidado depois, pela aba Equipe. Não é "atual → futuro"
 * — é "sair fulano". A faixa muda de forma para esse caso.
 */
import { CircleX, MoveRight, UserMinus } from "lucide-react";
import { formatarDataHora } from "@/lib/datas";
import type { ChamadoSolicitacao } from "@/lib/chamados-tipos";
import { Badge } from "@/components/ui/badge";

export function FaixaSolicitacao({
  solicitacao,
}: {
  solicitacao: ChamadoSolicitacao;
}) {
  const { estado } = solicitacao;
  const atual = solicitacao.alvo_atual_rotulo || "—";
  const novo = solicitacao.alvo_novo_rotulo;
  // `troca_socio` nunca tem "novo" — é remoção, não troca de nome por nome.
  const ehRemocao = solicitacao.tipo === "troca_socio" && !novo;

  return (
    <div className="grid gap-2 rounded-xl border border-borda-fina bg-superficie-afundada p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        {estado === "pendente" ? (
          <Badge variant="warning">Pedido em análise</Badge>
        ) : estado === "aprovada" ? (
          <Badge variant="success">
            {ehRemocao ? "Saída aprovada" : "Troca aprovada"}
          </Badge>
        ) : (
          <Badge variant="danger" icone={CircleX}>
            Pedido declinado
          </Badge>
        )}
        {solicitacao.decidida_em ? (
          <span className="text-xs text-muted-foreground">
            em {formatarDataHora(solicitacao.decidida_em)}
          </span>
        ) : null}
      </div>

      {ehRemocao ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <UserMinus
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span
            className={
              estado === "aprovada"
                ? "text-muted-foreground line-through decoration-1"
                : "font-medium text-foreground"
            }
          >
            {atual}
          </span>
          <span className="text-muted-foreground">sai do ambiente</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className={
              estado === "aprovada"
                ? "text-muted-foreground line-through decoration-1"
                : "font-medium text-foreground"
            }
          >
            {atual}
          </span>
          <MoveRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <span
            className={
              estado === "aprovada"
                ? "font-medium text-sucesso-foreground"
                : "font-medium text-foreground"
            }
          >
            {novo || "—"}
          </span>
        </div>
      )}

      {ehRemocao ? (
        <p className="corpo-sm text-muted-foreground">
          {estado === "aprovada"
            ? "O login deste sócio foi removido. O que ele cadastrou continua no ambiente. O novo sócio é convidado pela aba Equipe."
            : "Ao aprovar, o login deste sócio é removido — o que ele cadastrou continua no ambiente. O novo sócio é convidado depois, pela aba Equipe."}
        </p>
      ) : null}

      {solicitacao.motivo_decisao ? (
        <p className="corpo-sm text-muted-foreground">
          <strong className="text-foreground">
            {estado === "declinada" ? "Motivo da equipe: " : "Nota da equipe: "}
          </strong>
          {solicitacao.motivo_decisao}
        </p>
      ) : null}
    </div>
  );
}
