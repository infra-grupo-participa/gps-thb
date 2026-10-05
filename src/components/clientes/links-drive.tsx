"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, ExternalLink, Trash2 } from "lucide-react";

import {
  adicionarLinkDrive,
  removerLinkDrive,
} from "@/app/clientes/link-drive-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatarData } from "@/lib/datas";
import {
  FRASE_LINK_INVALIDO,
  NOME_LINK_DRIVE_PADRAO,
  type LinkDrive,
} from "@/lib/links-drive-tipos";
import { EMAILS_EQUIPE_PASTA, normalizarUrlDoDrive } from "@/lib/pasta";

// Público mais velho: texto em 16 px e botão com 44 px de altura.
// (`corpo` é 15 px; por isso `text-base`.)
const BOTAO = "h-11 px-4 text-base";

/**
 * O link do Drive DESTE cliente — UM por cliente (João, 02/10/2026: "é um link
 * de drive só"). Não é a pasta do escritório, que fica na aba Pasta.
 *
 * - Sem link → campo para colar.
 * - Com link → mostra o link; "Trocar link" abre o campo (a RPC troca na mesma
 *   transação) e "Remover" pede confirmação. O parceiro não troca nem remove
 *   link posto pela equipe (`podeRemover`, mesma regra do banco).
 *
 * Grava pela action e faz `router.refresh()`; toast só no sucesso, erro em
 * `role="alert"` ao lado do campo.
 */
export function LinksDrive({
  clienteId,
  links,
  souEquipe,
}: {
  clienteId: string;
  /** `null` = a leitura falhou no servidor. Com a regra de 1 por cliente, 0 ou 1 item. */
  links: LinkDrive[] | null;
  souEquipe: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [url, setUrl] = useState("");
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [confirmarRemocao, setConfirmarRemocao] = useState(false);
  const [erroRemover, setErroRemover] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();
  const [removendo, remover] = useTransition();
  const urlRef = useRef<HTMLInputElement>(null);
  const tituloRef = useRef<HTMLDivElement>(null);

  const falhou = links === null;
  const atual = links?.[0] ?? null;
  const mostrarCampo = !falhou && (!atual || editando);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const normalizada = normalizarUrlDoDrive(url);
    if (!normalizada) {
      setErro(FRASE_LINK_INVALIDO);
      urlRef.current?.focus();
      return;
    }
    setErro(null);
    salvar(async () => {
      const res = await adicionarLinkDrive({
        clienteId,
        nome: NOME_LINK_DRIVE_PADRAO,
        url: normalizada,
      });
      if (!res.ok) {
        setErro(res.erro);
        urlRef.current?.focus();
        return;
      }
      setUrl("");
      setEditando(false);
      toast.success(atual ? "Link do Drive trocado." : "Link do Drive salvo.");
      router.refresh();
      requestAnimationFrame(() => tituloRef.current?.focus());
    });
  }

  function removerAtual() {
    if (!atual) return;
    setErroRemover(null);
    remover(async () => {
      const res = await removerLinkDrive({ linkId: atual.id, clienteId });
      if (!res.ok) {
        setErroRemover(res.erro);
        return;
      }
      setConfirmarRemocao(false);
      toast.success("Link do Drive removido.");
      router.refresh();
      requestAnimationFrame(() => tituloRef.current?.focus());
    });
  }

  function abrirTroca() {
    setErro(null);
    setUrl("");
    setEditando(true);
    requestAnimationFrame(() => urlRef.current?.focus());
  }

  return (
    <Card size="sm" role="region" aria-labelledby={`${id}-titulo`}>
      <CardHeader>
        <CardTitle
          id={`${id}-titulo`}
          ref={tituloRef}
          tabIndex={-1}
          className="outline-none"
        >
          Link do Drive deste cliente
        </CardTitle>
        <p className="text-base leading-snug text-muted-foreground">
          A pasta com os documentos <strong>deste cliente</strong>. A pasta do
          escritório fica na aba Pasta. Este botão salva à parte: não precisa
          clicar em &quot;Salvar ficha&quot;.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3">
        {falhou ? (
          <p
            role="alert"
            className="flex items-start gap-1.5 text-base font-medium text-risco-foreground"
          >
            <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
            Não deu para carregar o link. Recarregue a página antes de colar um
            link novo.
          </p>
        ) : atual ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="grid min-w-0 gap-0.5">
              <a
                href={atual.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 text-base font-semibold text-accent-foreground underline underline-offset-2"
              >
                <ExternalLink aria-hidden className="size-5 shrink-0" />
                Abrir a pasta no Drive
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
              <span className="text-base text-muted-foreground">
                por {atual.origem === "equipe" ? "Equipe" : atual.criadoPorNome} ·{" "}
                {formatarData(atual.criadoEm)}
              </span>
            </div>
            {atual.podeRemover && !editando ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className={BOTAO}
                  onClick={abrirTroca}
                >
                  Trocar link
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={BOTAO}
                  onClick={() => {
                    setErroRemover(null);
                    setConfirmarRemocao(true);
                  }}
                >
                  <Trash2 aria-hidden />
                  Remover
                </Button>
              </div>
            ) : !atual.podeRemover ? (
              <span className="text-base text-muted-foreground">
                Link colocado pela equipe. Para trocar, fale com a equipe.
              </span>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-1.5">
            <p className="text-base font-medium">Nenhum link ainda. Faça assim:</p>
            <ol className="grid list-decimal gap-1.5 pl-6 text-base leading-snug">
              {souEquipe ? null : (
                <li>
                  No Drive, compartilhe a pasta do cliente com estes e-mails:
                  <ul className="mt-1 select-all">
                    {EMAILS_EQUIPE_PASTA.map((email) => (
                      <li key={email} className="font-medium">
                        {email}
                      </li>
                    ))}
                  </ul>
                </li>
              )}
              <li>No Drive, copie o link da pasta.</li>
              <li>Cole o link abaixo e clique em &quot;Salvar link&quot;.</li>
            </ol>
          </div>
        )}

        {mostrarCampo ? (
          <form onSubmit={enviar} noValidate className="grid gap-2">
            {souEquipe || !atual ? null : (
              <div className="text-base leading-snug text-muted-foreground">
                Antes, compartilhe a pasta com a equipe:
                <ul className="mt-0.5 select-all">
                  {EMAILS_EQUIPE_PASTA.map((email) => (
                    <li key={email}>{email}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid gap-1">
              <Label htmlFor={`${id}-url`} className="text-base leading-snug">
                {atual ? "Novo link do Drive" : "Link do Drive"} (obrigatório)
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id={`${id}-url`}
                  ref={urlRef}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  aria-invalid={erro ? true : undefined}
                  aria-describedby={erro ? `${id}-erro` : undefined}
                  className="h-11 text-base md:text-base"
                  placeholder="Ex.: https://drive.google.com/drive/folders/…"
                  autoComplete="off"
                  inputMode="url"
                  disabled={salvando}
                />
                <Button type="submit" className={BOTAO} disabled={salvando}>
                  {salvando ? "Salvando…" : atual ? "Salvar novo link" : "Salvar link"}
                </Button>
                {editando ? (
                  <Button
                    type="button"
                    variant="outline"
                    className={BOTAO}
                    disabled={salvando}
                    onClick={() => {
                      setEditando(false);
                      setErro(null);
                    }}
                  >
                    Cancelar
                  </Button>
                ) : null}
              </div>
              {erro ? (
                <p
                  id={`${id}-erro`}
                  role="alert"
                  className="flex items-start gap-1.5 text-base font-medium text-risco-foreground"
                >
                  <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {erro}
                </p>
              ) : null}
            </div>
          </form>
        ) : null}
      </CardContent>

      <DialogoConfirmacao
        aberto={confirmarRemocao}
        titulo="Remover link do Drive"
        consequencia="O link sai da ficha deste cliente. A pasta no Drive não é apagada."
        rotuloConfirmar="Remover link"
        rotuloConfirmando="Removendo…"
        confirmando={removendo}
        erro={erroRemover}
        onConfirmar={removerAtual}
        onCancelar={() => {
          if (!removendo) setConfirmarRemocao(false);
        }}
      />
    </Card>
  );
}
