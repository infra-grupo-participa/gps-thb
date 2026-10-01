import Link from "next/link";

import { FormularioEntrevistaPrevia } from "@/components/clientes/entrevista-previa/formulario";
import {
  dataCombinadaFutura,
  getPreliminarViva,
} from "@/components/clientes/entrevista-previa/preliminar-viva";
import { buttonVariants } from "@/components/ui/button";
import { formatarData, hojeSaoPaulo } from "@/lib/datas";
import { getEntrevistasDoCliente } from "@/lib/data/entrevista-previa";
import { NOME_DA_LETRA, type RespostasEntrevista } from "@/lib/entrevista-previa-calculo";

/**
 * O miolo das duas rotas da Entrevista Prévia (parceiro e espelho do admin).
 *
 * 🔴 SÓ LEITURA (01/10/2026). Antes, as páginas chamavam
 * `iniciarEntrevistaPrevia` no render: cada GET — inclusive o prefetch do
 * `<Link>` — podia abrir uma linha. Agora:
 *   • há uma em aberto  → o formulário retoma nela;
 *   • a última está concluída (e não veio `?nova=1`) → resumo + "Nova entrevista";
 *   • nenhuma, ou `?nova=1` → abertura; só o "Começar" cria a linha.
 */
export async function ConducaoDaEntrevista({
  alunoId,
  clienteId,
  clienteNome,
  dataReuniaoPreliminar,
  conduzidoPor,
  voltarHref,
  nova,
}: {
  alunoId: string;
  clienteId: string;
  clienteNome: string | null;
  dataReuniaoPreliminar: string | null;
  conduzidoPor: "parceiro" | "admin";
  voltarHref: string;
  /** `?nova=1`: o usuário pediu outra entrevista depois de uma concluída. */
  nova: boolean;
}) {
  const [entrevistas, viva] = await Promise.all([
    getEntrevistasDoCliente(clienteId),
    getPreliminarViva(alunoId),
  ]);
  const emAberto = entrevistas.find((e) => !e.concluida_em) ?? null;
  const ultima = entrevistas[0] ?? null;

  if (!emAberto && ultima?.concluida_em && !nova) {
    const letra =
      ultima.perfil_disc && ultima.perfil_disc in NOME_DA_LETRA
        ? (ultima.perfil_disc as keyof typeof NOME_DA_LETRA)
        : null;
    return (
      <div className="grid gap-4">
        <div className="border border-borda-fina px-4 py-4 corpo-sm">
          <p className="rotulo text-muted-foreground">
            Última entrevista concluída em {formatarData(ultima.concluida_em)}
          </p>
          <p className="numero-lg mt-1">
            {letra ? `Perfil ${letra} — ${NOME_DA_LETRA[letra]}` : "Perfil não definido"}
          </p>
          <p className="mt-1 text-muted-foreground">
            O relatório completo está na ficha de {clienteNome ?? "o cliente"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="?nova=1" prefetch={false} className={buttonVariants({ variant: "outline" })}>
            Nova entrevista
          </Link>
          <Link href={voltarHref} className={buttonVariants({ variant: "outline" })}>
            Voltar para a ficha
          </Link>
        </div>
      </div>
    );
  }

  return (
    <FormularioEntrevistaPrevia
      entrevistaId={emAberto?.id ?? null}
      clienteId={clienteId}
      clienteNome={clienteNome ?? "o cliente"}
      entrevistado={clienteNome ?? null}
      respostasIniciais={(emAberto?.respostas ?? {}) as RespostasEntrevista}
      preliminarViva={
        viva.sessao
          ? { inicioEm: viva.sessao.inicio_em, desteCliente: viva.sessao.cliente_id === clienteId }
          : null
      }
      dataCombinada={dataCombinadaFutura(dataReuniaoPreliminar, hojeSaoPaulo())}
      conduzidoPor={conduzidoPor}
      voltarHref={voltarHref}
    />
  );
}
