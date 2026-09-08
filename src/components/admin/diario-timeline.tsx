import { NotebookPen, CheckCircle2 } from "lucide-react";
import type { AlunoNotaComAutor } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  ROTULO_VOZ,
  ROTULO_TIPO,
  ROTULO_ORIGEM,
  variantePorTipo,
  formatarDataHora,
} from "@/components/admin/diario-labels";
import { DiarioBaixaButton } from "@/components/admin/diario-baixa-button";

function NotaCard({ nota }: { nota: AlunoNotaComAutor }) {
  const pendenciaAberta = nota.tipo === "pendencia" && !nota.resolvido_em;
  const pendenciaResolvida = nota.tipo === "pendencia" && nota.resolvido_em;

  return (
    <Card
      className={pendenciaAberta ? "ring-1 ring-destructive/40" : undefined}
    >
      <CardContent className="grid gap-2 py-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline" className="text-[10px]">
            {ROTULO_VOZ[nota.voz]}
          </Badge>
          <Badge
            variant={variantePorTipo(nota.tipo, Boolean(nota.resolvido_em))}
            className="text-[10px]"
          >
            {ROTULO_TIPO[nota.tipo]}
          </Badge>
          <Badge variant="secondary" className="text-[10px]">
            {ROTULO_ORIGEM[nota.origem]}
          </Badge>
          <span className="ml-auto text-xs text-muted-foreground">
            {formatarDataHora(nota.criado_em)}
          </span>
        </div>

        {/* `break-words`: a nota é texto colado de e-mail/WhatsApp e
            pode trazer URL ou palavra longa sem espaço — sem isso, ela
            estoura a largura do card (a maior nota real tem 5.100
            caracteres). */}
        <p className="whitespace-pre-wrap break-words text-sm">
          {nota.texto}
        </p>

        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{nota.autor_nome ?? "Equipe"}</span>

          {pendenciaAberta ? <DiarioBaixaButton notaId={nota.id} /> : null}

          {pendenciaResolvida ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" />
              Baixa dada por {nota.resolvido_por_nome ?? "equipe"} em{" "}
              {formatarDataHora(nota.resolvido_em as string)}
            </span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Timeline do diário, mais recente primeiro. Server Component.
 *
 * Recebe DUAS listas de propósito: `notas` é a timeline com teto de 50
 * (`getDiarioDoAluno`) e `pendenciasAbertas` vem SEM teto
 * (`getPendenciasAbertasDoAluno`). Pendência que não fecha é o defeito que
 * esta feature existe para consertar — se ela dependesse do corte de 50, uma
 * pendência antiga ficaria contando no badge do painel mas sem botão de baixa
 * na tela. Por isso as abertas saem todas numa seção fixa no topo, e o
 * histórico abaixo mostra o resto sem repeti-las.
 */
export function DiarioTimeline({
  notas,
  pendenciasAbertas,
}: {
  notas: AlunoNotaComAutor[];
  pendenciasAbertas: AlunoNotaComAutor[];
}) {
  if (notas.length === 0 && pendenciasAbertas.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center text-sm text-muted-foreground">
          <NotebookPen className="size-6" />
          Nenhuma nota registrada ainda. Use o formulário acima para começar.
        </CardContent>
      </Card>
    );
  }

  // O histórico não repete o que já está na seção de pendências abertas.
  const idsAbertas = new Set(pendenciasAbertas.map((n) => n.id));
  const demaisNotas = notas.filter((n) => !idsAbertas.has(n.id));

  return (
    <div className="grid gap-6">
      {pendenciasAbertas.length > 0 ? (
        <div className="grid gap-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            Pendências abertas ({pendenciasAbertas.length})
          </h2>
          <div className="grid gap-3">
            {pendenciasAbertas.map((nota) => (
              <NotaCard key={nota.id} nota={nota} />
            ))}
          </div>
        </div>
      ) : null}

      <div className="grid gap-3">
        {pendenciasAbertas.length > 0 && demaisNotas.length > 0 ? (
          <h2 className="text-sm font-semibold text-muted-foreground">
            Histórico
          </h2>
        ) : null}
        {demaisNotas.map((nota) => (
          <NotaCard key={nota.id} nota={nota} />
        ))}
      </div>
    </div>
  );
}
