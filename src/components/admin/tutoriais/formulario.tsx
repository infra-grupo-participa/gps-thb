"use client";

/**
 * Formulário de criar/editar tutorial — molde `admin/videos/formulario.tsx`.
 *
 * Duas diferenças do molde de vídeo: (1) o link do YouTube é OPCIONAL aqui
 * (o tutorial pode ser só passo a passo em texto); (2) existe uma lista de
 * passos editável (add/remove/reordenar). A validação de "vídeo OU ao menos
 * 1 passo" espelha o CHECK do banco — a mensagem amigável é responsabilidade
 * do cliente, o banco recusa de novo se algo escapar.
 */

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { extrairYoutubeId } from "@/lib/youtube";
import type { TutorialGps } from "@/lib/types";
import { SECOES_TUTORIAL, type SecaoTutorial } from "@/lib/tutoriais-tipos";
import {
  TUTORIAL_TITULO_MINIMO,
  TUTORIAL_TITULO_MAXIMO,
  TUTORIAL_RESUMO_MAXIMO,
  TUTORIAL_PASSOS_MAXIMO,
  TUTORIAL_PASSO_MAXIMO,
} from "@/lib/tutoriais-tipos";
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

export interface FormularioTutorialValores {
  id?: string;
  titulo: string;
  resumo: string;
  secao: SecaoTutorial;
  url: string;
  passos: string[];
  ordem: number;
}

export function FormularioTutorial({
  tutorial,
  secaoPadrao,
  pending,
  onCancelar,
  onSalvar,
}: {
  tutorial?: TutorialGps;
  /** Seção pré-selecionada ao criar (ex.: o filtro em que o admin estava). */
  secaoPadrao?: SecaoTutorial;
  pending: boolean;
  onCancelar: () => void;
  onSalvar: (form: FormularioTutorialValores) => void;
}) {
  const [titulo, setTitulo] = useState(tutorial?.titulo ?? "");
  const [resumo, setResumo] = useState(tutorial?.resumo ?? "");
  const [secao, setSecao] = useState<SecaoTutorial>(
    tutorial?.secao ?? secaoPadrao ?? SECOES_TUTORIAL[0].id,
  );
  const [url, setUrl] = useState(
    tutorial?.youtubeId ? `https://www.youtube.com/watch?v=${tutorial.youtubeId}` : "",
  );
  const [passos, setPassos] = useState<string[]>(
    tutorial?.passos && tutorial.passos.length > 0 ? tutorial.passos : [],
  );
  const [ordem, setOrdem] = useState<number>(tutorial?.ordem ?? 0);

  const urlPreenchida = url.trim().length > 0;
  const youtubeId = useMemo(() => extrairYoutubeId(url), [url]);
  const urlInvalida = urlPreenchida && !youtubeId;

  const tituloValido =
    titulo.trim().length >= TUTORIAL_TITULO_MINIMO && titulo.length <= TUTORIAL_TITULO_MAXIMO;
  const resumoValido = resumo.length <= TUTORIAL_RESUMO_MAXIMO;
  const passosValidos =
    passos.length <= TUTORIAL_PASSOS_MAXIMO &&
    passos.every((p) => p.length <= TUTORIAL_PASSO_MAXIMO);
  // Espelha o CHECK do banco: precisa de vídeo OU ao menos 1 passo (não vazio).
  const passosPreenchidos = passos.filter((p) => p.trim().length > 0);
  const temConteudo = Boolean(youtubeId) || passosPreenchidos.length > 0;

  const podeSalvar =
    tituloValido && resumoValido && passosValidos && temConteudo && !urlInvalida && !pending;

  function adicionarPasso() {
    if (passos.length >= TUTORIAL_PASSOS_MAXIMO) return;
    setPassos((p) => [...p, ""]);
  }

  function removerPasso(i: number) {
    setPassos((p) => p.filter((_, idx) => idx !== i));
  }

  function moverPasso(i: number, direcao: -1 | 1) {
    setPassos((p) => {
      const j = i + direcao;
      if (j < 0 || j >= p.length) return p;
      const copia = [...p];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  function editarPasso(i: number, valor: string) {
    setPassos((p) => p.map((v, idx) => (idx === i ? valor : v)));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!podeSalvar) return;
        onSalvar({
          id: tutorial?.id,
          titulo,
          resumo,
          secao,
          url,
          passos: passosPreenchidos,
          ordem,
        });
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="tutorial-titulo">Título</Label>
        <Input
          id="tutorial-titulo"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          required
          minLength={TUTORIAL_TITULO_MINIMO}
          maxLength={TUTORIAL_TITULO_MAXIMO}
          disabled={pending}
          aria-describedby="tutorial-titulo-ajuda"
        />
        <p id="tutorial-titulo-ajuda" className="text-xs text-muted-foreground">
          De {TUTORIAL_TITULO_MINIMO} a {TUTORIAL_TITULO_MAXIMO} caracteres.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tutorial-resumo">Resumo (opcional)</Label>
        <Textarea
          id="tutorial-resumo"
          value={resumo}
          onChange={(e) => setResumo(e.target.value)}
          maxLength={TUTORIAL_RESUMO_MAXIMO}
          disabled={pending}
          rows={2}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tutorial-secao">Seção</Label>
        <Select value={secao} onValueChange={(v) => v && setSecao(v as SecaoTutorial)} disabled={pending}>
          <SelectTrigger id="tutorial-secao" className="w-full">
            <SelectValue>
              {() => SECOES_TUTORIAL.find((s) => s.id === secao)?.rotulo ?? secao}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {SECOES_TUTORIAL.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tutorial-url">Link do YouTube (opcional)</Label>
        <Input
          id="tutorial-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=... ou https://youtu.be/..."
          disabled={pending}
          aria-invalid={urlInvalida}
          aria-describedby="tutorial-url-ajuda"
        />
        <p
          id="tutorial-url-ajuda"
          className={urlInvalida ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
        >
          {urlInvalida
            ? "Este link não foi reconhecido como um vídeo do YouTube. Cole a URL completa ou só o ID de 11 caracteres."
            : "Deixe em branco se o tutorial for só passo a passo em texto."}
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
        <div className="flex items-center justify-between">
          <Label>Passo a passo (opcional)</Label>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={adicionarPasso}
            disabled={pending || passos.length >= TUTORIAL_PASSOS_MAXIMO}
          >
            <Plus className="size-4" /> Adicionar passo
          </Button>
        </div>
        {passos.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhum passo adicionado. Precisa de vídeo ou ao menos 1 passo.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {passos.map((passo, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-2 w-5 shrink-0 text-right text-xs text-muted-foreground">
                  {i + 1}.
                </span>
                <Textarea
                  value={passo}
                  onChange={(e) => editarPasso(i, e.target.value)}
                  maxLength={TUTORIAL_PASSO_MAXIMO}
                  disabled={pending}
                  rows={1}
                  aria-label={`Passo ${i + 1}`}
                  className="flex-1"
                />
                <div className="flex shrink-0 flex-col gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending || i === 0}
                    onClick={() => moverPasso(i, -1)}
                    aria-label={`Mover passo ${i + 1} para cima`}
                  >
                    <ArrowUp className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending || i === passos.length - 1}
                    onClick={() => moverPasso(i, 1)}
                    aria-label={`Mover passo ${i + 1} para baixo`}
                  >
                    <ArrowDown className="size-3.5" />
                  </Button>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => removerPasso(i)}
                  aria-label={`Remover passo ${i + 1}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ol>
        )}
        {!temConteudo ? (
          <p role="alert" className="text-xs text-destructive">
            Adicione um vídeo do YouTube ou pelo menos um passo preenchido.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="tutorial-ordem">Ordem dentro da seção</Label>
        <Input
          id="tutorial-ordem"
          type="number"
          inputMode="numeric"
          min={0}
          value={ordem}
          onChange={(e) => setOrdem(Number(e.target.value) || 0)}
          disabled={pending}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        O tutorial nasce como <strong>rascunho</strong> — só a equipe vê. Publique
        na lista depois de conferir.
      </p>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancelar} disabled={pending}>
          Cancelar
        </Button>
        <Button type="submit" disabled={!podeSalvar}>
          {tutorial ? "Salvar alterações" : "Cadastrar tutorial"}
        </Button>
      </DialogFooter>
    </form>
  );
}
