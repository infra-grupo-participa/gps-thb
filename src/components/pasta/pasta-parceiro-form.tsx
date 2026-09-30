"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { salvarMinhaPasta } from "@/app/pasta/actions";
import { EMAILS_EQUIPE_PASTA, ehUrlDoDrive } from "@/lib/pasta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoErro } from "@/components/ui/campo-erro";
import type { OrigemPasta } from "@/components/pasta/pasta-view";

/**
 * O campo em que o PARCEIRO (titular ou sócio) cola o link da própria pasta.
 *
 * - Sem link → formulário aberto.
 * - Link do parceiro → "Corrigir link" abre o formulário preenchido e manda
 *   `urlAnterior` (o servidor recusa se outra pessoa trocou no meio-tempo).
 * - Link da equipe (ou procedência desconhecida) → sem formulário: quem troca
 *   o link da equipe é a equipe.
 *
 * Importado SÓ por `app/pasta/page.tsx` (PF4): nada daqui entra no bundle do
 * admin, e nada do admin (`pasta-config-form.tsx`) entra aqui.
 *
 * A validação no cliente é a MESMA função da gravação e do `/pasta/abrir`
 * (`ehUrlDoDrive`) — só poupa a ida ao servidor; a trava é a action.
 *
 * Fica FORA do `PastaView`, irmão dele na página: assim o `router.refresh()`
 * troca o vazio pelo card sem desmontar este componente, e a mensagem
 * "Link salvo." continua na região `aria-live` para ser anunciada.
 */
export function PastaParceiroForm({
  pastaUrl,
  origem,
}: {
  pastaUrl: string | null;
  origem: OrigemPasta | null;
}) {
  const router = useRouter();
  const id = useId();
  const idCampo = `${id}-url`;
  const idErro = `${id}-erro`;
  const idAjuda = `${id}-ajuda`;
  const campoRef = useRef<HTMLInputElement>(null);
  const botaoCorrigirRef = useRef<HTMLButtonElement>(null);

  const [editando, setEditando] = useState(false);
  const [url, setUrl] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Link da equipe, ou link sem procedência (não deveria existir: o backend
  // marca os antigos como 'equipe'). Na dúvida, não oferece troca.
  if (pastaUrl && origem !== "parceiro") {
    return (
      <p className="text-sm text-muted-foreground">
        Definido pela equipe. Precisa trocar? Fale com a equipe.
      </p>
    );
  }

  const mostrarForm = !pastaUrl || editando;

  function falhar(msg: string) {
    setErro(msg);
    setAviso(null);
    campoRef.current?.focus();
  }

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const valor = url.trim();
    if (!valor) {
      falhar("Cole o link da pasta do Drive.");
      return;
    }
    if (!ehUrlDoDrive(valor)) {
      falhar(
        "O link precisa começar com https://drive.google.com/ ou https://docs.google.com/.",
      );
      return;
    }
    setErro(null);
    setAviso(null);
    startTransition(async () => {
      const res = await salvarMinhaPasta(valor, editando ? pastaUrl : null);
      if (res.erro) {
        falhar(res.erro);
        return;
      }
      setEditando(false);
      setAviso("Link salvo.");
      // `revalidatePath` não repinta a página: sem isto o card continuaria
      // vazio com o link já gravado.
      router.refresh();
    });
  }

  function abrirCorrecao() {
    setUrl(pastaUrl ?? "");
    setErro(null);
    setAviso(null);
    setEditando(true);
    requestAnimationFrame(() => campoRef.current?.focus());
  }

  function cancelar() {
    setEditando(false);
    setErro(null);
    requestAnimationFrame(() => botaoCorrigirRef.current?.focus());
  }

  return (
    <section aria-label="Link da pasta do Drive" className="grid gap-2">
      {mostrarForm ? (
        <form onSubmit={enviar} noValidate className="grid gap-2">
          <Label htmlFor={idCampo}>Link da pasta do Drive</Label>
          <div id={idAjuda} className="grid gap-1 text-sm text-muted-foreground">
            <p>
              Antes de colar o link, compartilhe a pasta no Drive (botão
              &ldquo;Compartilhar&rdquo;, acesso de editor) com os e-mails da
              equipe:
            </p>
            <ul className="list-disc pl-5">
              {EMAILS_EQUIPE_PASTA.map((email) => (
                <li key={email} className="select-all font-medium text-foreground">
                  {email}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              ref={campoRef}
              id={idCampo}
              name="url"
              type="url"
              inputMode="url"
              autoComplete="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
              aria-invalid={erro ? true : undefined}
              aria-describedby={erro ? `${idAjuda} ${idErro}` : idAjuda}
              disabled={pending}
            />
            <Button type="submit" disabled={pending}>
              {pending ? "Salvando..." : "Salvar link"}
            </Button>
            {editando ? (
              <Button
                type="button"
                variant="outline"
                onClick={cancelar}
                disabled={pending}
              >
                Cancelar
              </Button>
            ) : null}
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">
            O link está errado ou mudou de pasta?
          </p>
          <Button
            ref={botaoCorrigirRef}
            type="button"
            variant="outline"
            size="sm"
            onClick={abrirCorrecao}
          >
            Corrigir link
          </Button>
        </div>
      )}
      {/* Uma região viva para erro e confirmação. Quem envia com Enter já
          está no campo — mover o foco para onde ele está não anuncia nada. */}
      <div aria-live="polite" aria-atomic="true">
        <CampoErro id={idErro} texto={erro} />
        {aviso ? <p className="text-sm text-muted-foreground">{aviso}</p> : null}
      </div>
    </section>
  );
}
