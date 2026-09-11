"use client";

/**
 * Formulário de criar/editar vídeo — a pré-visualização é o ponto central
 * (pedido do Marcio: "confere que é o vídeo certo antes de publicar").
 *
 * O campo de URL aceita qualquer forma de link do YouTube; assim que
 * `extrairYoutubeId` reconhece, o player aparece embaixo do campo. Link não
 * reconhecido mostra o erro ali mesmo — nunca deixa passar para o banco.
 */

import { useMemo, useState } from "react";
import { extrairYoutubeId } from "@/lib/youtube";
import type { VideoGps } from "@/lib/types";
import {
  VIDEO_DESCRICAO_MAXIMO,
  VIDEO_TITULO_MAXIMO,
  VIDEO_TITULO_MINIMO,
} from "@/lib/videos-tipos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";
import { YoutubePlayer } from "@/components/videos/youtube-player";

const ETAPAS = [1, 2, 3, 4, 5, 6] as const;

/** Valor sentinela do `<Select>` para "vídeo geral, sem etapa" — convertido
 *  para `null` só na hora de montar o payload de `onSalvar`. */
const VALOR_GERAL = "geral";

export interface FormularioVideoValores {
  id?: string;
  titulo: string;
  descricao: string;
  url: string;
  /** `null` = vídeo GERAL, sem amarra a nenhuma etapa. */
  etapa: number | null;
  ordem: number;
}

export function FormularioVideo({
  video,
  etapaPadrao,
  pending,
  onCancelar,
  onSalvar,
}: {
  video?: VideoGps;
  /** Etapa pré-selecionada ao criar (ex.: a aba em que o admin estava). */
  etapaPadrao?: number;
  pending: boolean;
  onCancelar: () => void;
  onSalvar: (form: FormularioVideoValores) => void;
}) {
  const [titulo, setTitulo] = useState(video?.titulo ?? "");
  const [descricao, setDescricao] = useState(video?.descricao ?? "");
  const [url, setUrl] = useState(
    video ? `https://www.youtube.com/watch?v=${video.youtubeId}` : "",
  );
  const [etapaValor, setEtapaValor] = useState<string>(
    video ? (video.etapa != null ? String(video.etapa) : VALOR_GERAL) : String(etapaPadrao ?? 1),
  );
  const [ordem, setOrdem] = useState<number>(video?.ordem ?? 0);

  const etapa = etapaValor === VALOR_GERAL ? null : Number(etapaValor);

  const urlPreenchida = url.trim().length > 0;
  const youtubeId = useMemo(() => extrairYoutubeId(url), [url]);
  const urlInvalida = urlPreenchida && !youtubeId;

  const tituloValido =
    titulo.trim().length >= VIDEO_TITULO_MINIMO && titulo.length <= VIDEO_TITULO_MAXIMO;
  const descricaoValida = descricao.length <= VIDEO_DESCRICAO_MAXIMO;
  const podeSalvar = tituloValido && descricaoValida && Boolean(youtubeId) && !pending;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!podeSalvar) return;
        onSalvar({ id: video?.id, titulo, descricao, url, etapa, ordem });
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="video-titulo">Título</Label>
        <Input
          id="video-titulo"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          required
          minLength={VIDEO_TITULO_MINIMO}
          maxLength={VIDEO_TITULO_MAXIMO}
          disabled={pending}
          aria-describedby="video-titulo-ajuda"
        />
        <p id="video-titulo-ajuda" className="text-xs text-muted-foreground">
          De {VIDEO_TITULO_MINIMO} a {VIDEO_TITULO_MAXIMO} caracteres.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="video-url">Link do YouTube</Label>
        <Input
          id="video-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=... ou https://youtu.be/..."
          required
          disabled={pending}
          aria-invalid={urlInvalida}
          aria-describedby="video-url-ajuda"
        />
        <p
          id="video-url-ajuda"
          className={urlInvalida ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
        >
          {urlInvalida
            ? "Este link não foi reconhecido como um vídeo do YouTube. Cole a URL completa ou só o ID de 11 caracteres."
            : "Aceita o link de assistir, o link curto, o de incorporar, o de \"ao vivo\" ou só o ID do vídeo."}
        </p>
        {youtubeId ? (
          <div className="mt-1">
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Pré-visualização — confira se é o vídeo certo:
            </p>
            <YoutubePlayer youtubeId={youtubeId} titulo={titulo || "Pré-visualização do vídeo"} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="video-descricao">Descrição (opcional)</Label>
        <Textarea
          id="video-descricao"
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          maxLength={VIDEO_DESCRICAO_MAXIMO}
          disabled={pending}
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="video-etapa">Etapa</Label>
          <Select
            value={etapaValor}
            onValueChange={(v) => v && setEtapaValor(v)}
            disabled={pending}
          >
            <SelectTrigger id="video-etapa" className="w-full">
              <SelectValue>
                {() =>
                  etapaValor === VALOR_GERAL
                    ? "Geral (sem etapa)"
                    : `Etapa ${etapaValor.padStart(2, "0")}`
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={VALOR_GERAL}>Geral (sem etapa)</SelectItem>
              {ETAPAS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  Etapa {String(n).padStart(2, "0")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Geral aparece para qualquer aluno, sem depender de etapa liberada.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="video-ordem">Ordem</Label>
          <Input
            id="video-ordem"
            type="number"
            inputMode="numeric"
            min={0}
            value={ordem}
            onChange={(e) => setOrdem(Number(e.target.value) || 0)}
            disabled={pending}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        O vídeo nasce como <strong>rascunho</strong> — só a equipe vê. Publique
        na lista depois de conferir a pré-visualização.
      </p>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancelar} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!podeSalvar}>
          {video ? "Salvar alterações" : "Cadastrar vídeo"}
        </Button>
      </DialogFooter>
    </form>
  );
}
