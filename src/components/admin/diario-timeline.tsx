import { CheckCircle2 } from "lucide-react";
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
 * Seção FIXA de pendências abertas, mais recente primeiro. Server Component.
 *
 * Fase 2: o histórico de notas saiu daqui — ele já aparece na trilha única
 * (`TrilhaDoAluno`, via `montarTrilha`) logo abaixo, na página. Antes esta
 * timeline renderizava as mesmas notas de novo (achado do
 * `fable-orchestrator`: nota duplicada na mesma tela, botão de baixa nos
 * dois lugares). `pendenciasAbertas` continua vindo SEM teto
 * (`getPendenciasAbertasDoAluno`) — pendência que não fecha é o defeito que
 * esta feature existe para consertar; se dependesse do corte de 50 da
 * trilha, uma pendência antiga ficaria contando no badge do painel mas sem
 * botão de baixa visível. Por isso ela é destacada aqui, fixa no topo, e
 * NÃO se repete na trilha abaixo (a `TrilhaDoAluno` mostra a mesma nota,
 * já com o botão — ver comentário lá).
 */
export function DiarioTimeline({
  pendenciasAbertas,
}: {
  pendenciasAbertas: AlunoNotaComAutor[];
}) {
  if (pendenciasAbertas.length === 0) return null;

  return (
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
  );
}
