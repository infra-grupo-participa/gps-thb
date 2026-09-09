import { History, AlertTriangle } from "lucide-react";
import type { ItemTrilha } from "@/lib/types";
import { FUSO, formatarData } from "@/lib/datas";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Separator } from "@/components/ui/separator";
import { TrilhaItem } from "@/components/admin/trilha-item";

/** "YYYY-MM-DD" (chave estável de agrupamento) → "8 de setembro de 2026". */
function tituloDoDia(diaISO: string): string {
  // `diaISO` já é a data local (America/Sao_Paulo) — monta um Date em UTC
  // meio-dia para não sofrer virada de dia ao formatar (evita depender do
  // fuso do processo Node, mesma lição de `diario-labels.ts`).
  const data = new Date(`${diaISO}T12:00:00Z`);
  const texto = data.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: FUSO,
  });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function diaLocalDoItem(item: ItemTrilha): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(
    new Date(item.ocorrido_em),
  );
}

/**
 * Trilha completa do aluno: log de ações + diário da equipe + ações
 * administrativas, já agregados por `montarTrilha` (`src/lib/log-agregacao.ts`),
 * agrupados por dia local (America/Sao_Paulo), mais recente primeiro.
 *
 * Termina com o marco honesto de corte: a data do evento mais antigo com
 * `origem='backfill'` é quando o log detalhado passou a existir — antes
 * disso só a data de cadastro de cada cliente foi preservada.
 *
 * `truncado` vem de `getEventosDoAluno` (`src/lib/data.ts`) e diz que o teto
 * de 300 cortou DENTRO da janela escolhida. Sem esse aviso, o rodapé do corte
 * de backfill afirmaria uma cobertura que a lista não tem — ele promete "log
 * detalhado a partir de X" enquanto omite tudo entre X e o 300º mais recente.
 *
 * `janelaAtiva` é o rótulo do filtro de período ("30 dias"/"90 dias"), ou
 * `null` em "Tudo": serve para o estado vazio distinguir "nenhum registro
 * neste período" de "nunca houve registro nenhum".
 */
export function TrilhaDoAluno({
  itens,
  alunoId,
  dataCorteBackfill,
  truncado,
  janelaAtiva,
}: {
  itens: ItemTrilha[];
  alunoId: string;
  dataCorteBackfill: string | null;
  /** `true` quando o teto de 300 eventos cortou histórico dentro da janela escolhida. */
  truncado?: boolean;
  /** Rótulo da janela de tempo ativa (ex. "30 dias"), para o estado vazio honesto. `null`/ausente = "Tudo". */
  janelaAtiva?: string | null;
}) {
  if (itens.length === 0) {
    return (
      <EmptyState
        icone={<History />}
        titulo={
          janelaAtiva
            ? `Nenhum registro nos últimos ${janelaAtiva}.`
            : "Nenhum registro na trilha ainda."
        }
        descricao={
          janelaAtiva
            ? "Escolha uma janela maior acima, ou registre uma nota para começar a trilha deste período."
            : "Cada acesso do aluno e cada nota da equipe entram aqui automaticamente."
        }
      />
    );
  }

  const grupos: { dia: string; itens: ItemTrilha[] }[] = [];
  for (const item of itens) {
    const dia = diaLocalDoItem(item);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.dia === dia) ultimo.itens.push(item);
    else grupos.push({ dia, itens: [item] });
  }

  return (
    <div className="grid gap-6">
      {grupos.map((grupo) => (
        <div key={grupo.dia} className="grid gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">
            {tituloDoDia(grupo.dia)}
          </h2>
          <Card>
            <CardContent className="grid divide-y divide-border/60 py-2">
              {grupo.itens.map((item, i) => (
                <div key={`${grupo.dia}-${i}`} className="py-1">
                  <TrilhaItem item={item} alunoId={alunoId} />
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      ))}

      <Separator />

      {truncado ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <p>
            Mostrando apenas os {itens.length} registros mais recentes desta
            janela — há mais histórico não exibido. Reduza o período ou
            considere que esta lista não cobre a janela inteira.
          </p>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {dataCorteBackfill
          ? `Log detalhado a partir de ${formatarData(dataCorteBackfill)}${
              truncado
                ? " — parte deste período não está sendo exibida (ver aviso acima)."
                : "."
            } Antes do início do log, só a data de cadastro de cada cliente foi preservada — as edições anteriores não foram registradas.`
          : truncado
            ? "Log detalhado desde o início do acompanhamento deste aluno — parte deste período não está sendo exibida (ver aviso acima)."
            : "Log detalhado desde o início do acompanhamento deste aluno."}
      </p>
    </div>
  );
}
