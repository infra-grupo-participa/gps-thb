"use client";

/**
 * Biblioteca de vídeos — painel do admin (`/admin/videos`, demanda 5,
 * 11/09/2026). Autonomia de publicar sem deploy: listar, criar, editar,
 * publicar/despublicar e excluir. Segue o padrão de `PlantaoMentoras`
 * (Table + Dialog + useTransition + toast + router.refresh).
 *
 * Rascunho (`publicado = false`) fica com badge "Rascunho" e aviso de que o
 * aluno não vê — a trava real é a RPC `gps.videos_do_aluno` (só publicados),
 * isto aqui é honestidade de tela.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  EyeIcon,
  EyeOffIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import type { VideoGps } from "@/lib/types";
import {
  salvarVideo,
  publicarVideo,
  excluirVideo,
  type SalvarVideoInput,
} from "@/app/admin/videos/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FormularioVideo, type FormularioVideoValores } from "./formulario";

type ModoDialog = "novo" | { editando: VideoGps } | null;

export function VideosAdmin({ videos }: { videos: VideoGps[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [videoEmAcao, setVideoEmAcao] = useState<string | null>(null);
  const [modo, setModo] = useState<ModoDialog>(null);
  const [excluindo, setExcluindo] = useState<VideoGps | null>(null);
  const [erroExcluir, setErroExcluir] = useState<string | null>(null);

  // `null` (vídeo GERAL, sem etapa) agrupado à parte, sempre primeiro —
  // mesma ordem de `getVideosAdmin` (`order("etapa", { nullsFirst: true })`).
  const porEtapa = useMemo(() => {
    const mapa = new Map<number | null, VideoGps[]>();
    for (const v of videos) {
      if (!mapa.has(v.etapa)) mapa.set(v.etapa, []);
      mapa.get(v.etapa)!.push(v);
    }
    return [...mapa.entries()].sort((a, b) => {
      if (a[0] === null) return -1;
      if (b[0] === null) return 1;
      return a[0] - b[0];
    });
  }, [videos]);

  function alternarPublicado(v: VideoGps, proximoPublicado: boolean) {
    setVideoEmAcao(v.id);
    startTransition(async () => {
      const res = await publicarVideo(v.id, proximoPublicado);
      setVideoEmAcao(null);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success(proximoPublicado ? "Vídeo publicado." : "Vídeo voltou a rascunho.");
      router.refresh();
    });
  }

  function salvar(form: FormularioVideoValores) {
    const input: SalvarVideoInput = {
      id: form.id,
      titulo: form.titulo,
      descricao: form.descricao,
      url: form.url,
      etapa: form.etapa,
      ordem: form.ordem,
    };
    startTransition(async () => {
      const res = await salvarVideo(input);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success(form.id ? "Vídeo atualizado." : "Vídeo cadastrado como rascunho.");
      router.refresh();
      setModo(null);
    });
  }

  function excluir(v: VideoGps) {
    setErroExcluir(null);
    setVideoEmAcao(v.id);
    startTransition(async () => {
      const res = await excluirVideo(v.id);
      setVideoEmAcao(null);
      if (!res.ok) {
        toast.error(res.erro);
        setErroExcluir(res.erro);
        return;
      }
      setExcluindo(null);
      toast.success("Vídeo excluído.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-end">
        <Button onClick={() => setModo("novo")} disabled={pending}>
          <PlusIcon className="size-4" /> Novo vídeo
        </Button>
      </div>

      {videos.length === 0 ? (
        <EmptyState
          titulo="Nenhum vídeo cadastrado."
          descricao="Cole o link do YouTube (não listado) de uma gravação para começar. Ela nasce como rascunho até você publicar."
        />
      ) : (
        porEtapa.map(([etapa, itens]) => (
          <div key={etapa ?? "geral"}>
            <h2 className="mb-2 text-sm font-semibold">
              {etapa === null ? "Geral (sem etapa)" : `Etapa ${String(etapa).padStart(2, "0")}`}
            </h2>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vídeo</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((v) => {
                  const emAcao = pending && videoEmAcao === v.id;
                  return (
                    <TableRow key={v.id}>
                      <TableCell>
                        <span className="font-medium">{v.titulo}</span>
                      </TableCell>
                      <TableCell>
                        {v.publicado ? (
                          <Badge variant="success">Publicado</Badge>
                        ) : (
                          <Badge variant="neutral" icone={false}>
                            Rascunho — aluno não vê
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={emAcao}
                            onClick={() => setModo({ editando: v })}
                          >
                            <PencilIcon className="size-4" /> Editar
                          </Button>
                          {v.publicado ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={emAcao}
                              onClick={() => alternarPublicado(v, false)}
                            >
                              <EyeOffIcon className="size-4" /> Despublicar
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={emAcao}
                              onClick={() => alternarPublicado(v, true)}
                            >
                              <EyeIcon className="size-4" /> Publicar
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={emAcao}
                            onClick={() => {
                              setErroExcluir(null);
                              setExcluindo(v);
                            }}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2Icon className="size-4" /> Excluir
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ))
      )}

      <Dialog
        open={modo !== null}
        onOpenChange={(v) => {
          if (!v) setModo(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{modo === "novo" ? "Novo vídeo" : "Editar vídeo"}</DialogTitle>
            <DialogDescription>
              Cole o link do YouTube (não listado) — a pré-visualização aparece
              assim que o link é reconhecido.
            </DialogDescription>
          </DialogHeader>
          {modo !== null ? (
            <FormularioVideo
              video={typeof modo === "object" ? modo.editando : undefined}
              pending={pending}
              onCancelar={() => setModo(null)}
              onSalvar={salvar}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {excluindo ? (
        <DialogoConfirmacao
          aberto
          titulo="Excluir este vídeo?"
          descricao={excluindo.titulo}
          consequencia={
            <>
              O vídeo sai da biblioteca <strong>de vez</strong> — não dá para
              desfazer. Quem já tinha o link direto do YouTube continua
              acessando por lá; só some daqui do portal.
            </>
          }
          rotuloConfirmar="Excluir vídeo"
          rotuloConfirmando="Excluindo…"
          confirmando={pending && videoEmAcao === excluindo.id}
          erro={erroExcluir}
          onConfirmar={() => excluir(excluindo)}
          onCancelar={() => {
            if (pending) return;
            setExcluindo(null);
            setErroExcluir(null);
          }}
        />
      ) : null}
    </div>
  );
}
