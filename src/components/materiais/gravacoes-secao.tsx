"use client";

/**
 * Gravações de reuniões (demanda 5, 11/09/2026) — seção própria dentro de
 * `/materiais`, ACIMA da grade de aulas/modelos existente. Não entra no
 * `Material`/`listarMateriais` (que é 100% estático, vindo de
 * `src/lib/etapa*.ts`): vídeo é dado de BANCO, com a própria RPC
 * (`gps.videos_do_aluno`) e o próprio corte de etapa liberada. Misturar os
 * dois shapes ia forçar `Material.tarefaNum`/`tarefaTitulo` em algo que não
 * tem tarefa associada.
 *
 * Player embutido no PRÓPRIO card (não abre em nova aba, ao contrário de
 * aula/modelo) — "assistir dentro do sistema" é o pedido explícito do
 * Marcio. Card fechado mostra a miniatura só quando expandido, para não
 * carregar N iframes de uma vez na mesma página.
 */

import { useState } from "react";
import { PlayCircle, Video } from "lucide-react";
import type { VideoDoAluno } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { YoutubePlayer } from "@/components/videos/youtube-player";

export function GravacoesSecao({
  videos,
  etapaNomes,
}: {
  /** Já filtrados por publicado + etapa liberada (feito no servidor). */
  videos: VideoDoAluno[];
  etapaNomes: Record<number, string>;
}) {
  if (videos.length === 0) {
    // Estado vazio com instrução, não card em branco (regra da casa): a
    // seção está LIGADA (`gps.videos_ativo() = true`) mas ainda sem vídeo
    // publicado que valha para este aluno (nenhum, ou nenhum na etapa dele
    // liberada). Nunca silenciar — sumir com a seção pareceria bug.
    return (
      <div className="grid gap-2">
        <h2 className="text-sm font-semibold">Gravações de reuniões</h2>
        <EmptyState
          icone={<Video aria-hidden />}
          titulo="Nenhuma gravação publicada ainda."
          descricao="Assim que a equipe publicar uma gravação da sua etapa, ela aparece aqui."
        />
      </div>
    );
  }

  // `null` = vídeo GERAL, sem amarra a etapa — agrupado à parte, sempre
  // primeiro (mesma ordem devolvida por `gps.videos_do_aluno`: `nulls first`).
  const porEtapa = new Map<number | null, VideoDoAluno[]>();
  for (const v of videos) {
    if (!porEtapa.has(v.etapa)) porEtapa.set(v.etapa, []);
    porEtapa.get(v.etapa)!.push(v);
  }
  const grupos = [...porEtapa.entries()].sort((a, b) => {
    if (a[0] === null) return -1;
    if (b[0] === null) return 1;
    return a[0] - b[0];
  });

  return (
    <div className="grid gap-5">
      <h2 className="text-sm font-semibold">Gravações de reuniões</h2>
      {grupos.map(([etapa, itens]) => (
        <div key={etapa ?? "geral"}>
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            {etapa === null
              ? "Geral"
              : `Etapa ${String(etapa).padStart(2, "0")} — ${etapaNomes[etapa] ?? ""}`}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {itens.map((v) => (
              <GravacaoCard key={v.id} video={v} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function GravacaoCard({ video }: { video: VideoDoAluno }) {
  const [aberto, setAberto] = useState(false);

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-3">
        {aberto ? (
          <YoutubePlayer youtubeId={video.youtubeId} titulo={video.titulo} />
        ) : (
          <button
            type="button"
            onClick={() => setAberto(true)}
            className="flex aspect-video w-full items-center justify-center gap-2 rounded-lg bg-muted text-sm font-medium text-muted-foreground transition hover:bg-superficie-afundada focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            <PlayCircle className="size-5" aria-hidden />
            Assistir
          </button>
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={video.titulo}>
              {video.titulo}
            </p>
            {video.descricao ? (
              <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                {video.descricao}
              </p>
            ) : null}
          </div>
          <Badge variant="secondary" className="shrink-0 text-[10px] capitalize">
            gravação
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
