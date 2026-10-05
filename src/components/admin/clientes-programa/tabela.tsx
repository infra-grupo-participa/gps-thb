/**
 * Tabela da lista consolidada de clientes — SOMENTE LEITURA.
 *
 * 🔴 TABELA NOVA, separada de `clientes-manager/clientes-tabela.tsx` de
 * propósito: aquela tem um `<Select>` do Base UI POR LINHA (troca de fase) e
 * foi desenhada para o CRM do aluno, com no máximo ~30 clientes por ambiente.
 * Aqui a página inteira já pode ter 100 linhas — 100 instâncias de um
 * componente com portal (`Select` do Base UI monta um portal fora da árvore)
 * travariam a aba. Zero componente Radix/Base UI por linha aqui.
 *
 * Server Component: a tela não escreve nada, só lê.
 *
 * 🔴 SEM ROLAGEM LATERAL (03/10/2026, cobrança do João): a versão anterior era
 * uma `<Table min-w-[56rem]>` dentro de `overflow-x-auto` — no notebook e no
 * celular o telefone, o DISC e a reunião ficavam atrás de um "arraste para o
 * lado". Agora é uma lista em grade: em tela larga, colunas; no estreito, o
 * mesmo item vira cartão de três linhas. Nenhum dado depende de rolar.
 */

import { Fragment } from "react";
import Link from "next/link";
import { Star, TriangleAlert } from "lucide-react";
import type { ClienteDoPrograma } from "@/lib/data/clientes-admin";
import { FASES_CLIENTE, GRAUS_RELACAO_UI } from "@/lib/etapa1";
import { formatarDataSoDia, hojeSaoPaulo } from "@/lib/datas";
import { mascaraTelefone } from "@/lib/masks";
import { CopiarContato } from "@/components/admin/copiar-contato";
import { cn } from "@/lib/utils";
import { formatarNome } from "@/lib/nomes";

/** `cliente.id` → texto pronto ("há 2 h") + data completa para o `title`. */
export type PastaPorCliente = Record<string, { rotulo: string; titulo: string }>;

export function TabelaClientesPrograma({
  linhas,
  pasta,
}: {
  linhas: ClienteDoPrograma[];
  pasta?: PastaPorCliente;
}) {
  // Mesmo corte de "vencida" da RPC (`data < hoje`): comparação de string
  // YYYY-MM-DD, sem `Date` no meio (ver `datas.ts`). Uma vez, fora do loop.
  const hoje = hojeSaoPaulo();
  // 🔑 (28/09/2026, Marcio) Estrela primeiro — a RPC já devolve os com estrela
  // no topo (`…318`). Aqui só se marca a FRONTEIRA: uma faixa antes de cada
  // grupo, e só quando os dois grupos aparecem na mesma página.
  const comFaixas =
    linhas.some((l) => l.acompanhadoEquipe) && linhas.some((l) => !l.acompanhadoEquipe);
  return (
    <div className="rounded-xl border bg-card">
      <div
        aria-hidden
        className={cn(
          GRADE,
          "hidden border-b px-4 py-2 text-xs font-medium text-muted-foreground lg:grid",
        )}
      >
        <span>Cliente</span>
        <span>Parceiro</span>
        <span>Fase</span>
        <span>Telefone</span>
        <span>Grau · DISC</span>
        <span>Reunião</span>
        <span>Pasta</span>
      </div>
      <ul className="divide-y">
        {linhas.map((c, i) => {
          const faixa =
            comFaixas && (i === 0 || linhas[i - 1].acompanhadoEquipe !== c.acompanhadoEquipe)
              ? c.acompanhadoEquipe
                ? "Com estrela — prioridade da equipe"
                : "Sem estrela — menor prioridade"
              : null;
          const fase = FASES_CLIENTE.find((f) => f.id === c.fase);
          const grau = c.grauRelacao
            ? GRAUS_RELACAO_UI.find((g) => g.id === c.grauRelacao)?.rotulo
            : null;
          const dataReuniao = formatarDataSoDia(c.dataReuniaoPreliminar);
          const reuniaoVencida = Boolean(
            c.dataReuniaoPreliminar && c.dataReuniaoPreliminar < hoje,
          );
          const nome = formatarNome(c.clienteNome) || "Sem nome";
          return (
            <Fragment key={c.id}>
            {faixa ? (
              <li className="rotulo bg-superficie-afundada px-4 py-1.5 text-muted-foreground">
                {faixa}
              </li>
            ) : null}
            {/* Com estrela: fundo de marca + filete à esquerda + nome em
                negrito. Sem estrela: texto no tom apagado (token
                `muted-foreground`, contraste AA medido — nunca `opacity`). */}
            <li
              className={cn(
                "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm",
                GRADE_LG,
                c.acompanhadoEquipe
                  ? "bg-primary/5 shadow-[inset_3px_0_0_var(--color-primary)]"
                  : "text-muted-foreground",
              )}
            >
              {/* Cliente — estrela = acompanhado pela equipe (mesmo desenho de
                  `aluno-card.tsx`); o nome ao lado continua sendo a pista. */}
              <div
                className={cn(
                  "flex min-w-0 items-center gap-1.5",
                  c.acompanhadoEquipe ? "font-semibold text-foreground" : "font-normal",
                )}
              >
                {c.acompanhadoEquipe ? (
                  <Star
                    aria-label="Acompanhado pela equipe"
                    className="size-3.5 shrink-0 fill-primary text-primary"
                  />
                ) : null}
                <span className="truncate" title={nome}>
                  {nome}
                </span>
              </div>

              {/* No estreito a fase sobe para a direita do nome. */}
              <span
                className={cn(
                  "justify-self-end rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap lg:order-3 lg:justify-self-start",
                  fase?.cor ?? "bg-neutro text-neutro-foreground",
                )}
              >
                {fase?.rotulo ?? c.fase}
              </span>

              <Link
                href={`/admin/aluno/${c.alunoId}`}
                className="min-w-0 truncate text-muted-foreground hover:text-accent-foreground hover:underline lg:order-2 lg:text-foreground"
                title={c.parceiroNome ?? undefined}
              >
                <span className="sr-only">Parceiro: </span>
                {formatarNome(c.parceiroNome) || "—"}
              </Link>

              <span
                className={cn(
                  "justify-self-end whitespace-nowrap lg:order-6 lg:justify-self-start",
                  reuniaoVencida ? "text-destructive" : "text-muted-foreground lg:text-foreground",
                )}
              >
                {dataReuniao ? (
                  <span className="inline-flex items-center gap-1">
                    {reuniaoVencida ? (
                      <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
                    ) : null}
                    <span className="sr-only">Reunião: </span>
                    {dataReuniao}
                    {reuniaoVencida ? <span className="sr-only"> (vencida)</span> : null}
                  </span>
                ) : (
                  <span aria-hidden>—</span>
                )}
              </span>

              <span className="whitespace-nowrap lg:order-4">
                {c.telefone ? (
                  <CopiarContato
                    valor={c.telefone}
                    rotuloAcessivel={`Copiar telefone de ${nome}`}
                    formatar={mascaraTelefone}
                  />
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </span>

              <span className="justify-self-end text-xs text-muted-foreground lg:order-5 lg:justify-self-start lg:text-sm lg:text-foreground">
                {[grau, c.perfilDisc].filter(Boolean).join(" · ") || "—"}
              </span>

              <span
                className="whitespace-nowrap text-xs text-muted-foreground lg:order-7 lg:text-sm"
                title={pasta?.[c.id]?.titulo}
              >
                <span className="sr-only">Pasta: </span>
                {pasta?.[c.id]?.rotulo ?? "—"}
              </span>
            </li>
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}

/** As sete colunas em tela larga — o cabeçalho e cada linha usam a mesma. */
const COLUNAS =
  "lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_7rem_10rem_minmax(0,1fr)_6.5rem_5.5rem]";
const GRADE = cn("grid gap-x-3", COLUNAS);
const GRADE_LG = COLUNAS;
