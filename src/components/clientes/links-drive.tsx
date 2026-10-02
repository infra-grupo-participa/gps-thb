"use client";

import { useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
        <p className="corpo-sm text-muted-foreground">
          A pasta com os documentos <strong>deste cliente</strong>. A pasta do
          escritório fica na aba Pasta.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3">
        {falhou ? (
          <p role="alert" className="corpo-sm text-risco-foreground">
            Não deu para carregar o link agora. Recarregue a página antes de
            colar um link novo.
          </p>
        ) : atual ? (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <div className="grid min-w-0 gap-0.5">
              <a
                href={atual.url}
                target="_blank"
                rel="noopener noreferrer"
                className="corpo-sm truncate font-medium text-accent-foreground underline underline-offset-2"
              >
                Abrir a pasta no Drive
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
              <span className="text-xs text-muted-foreground">
                por {atual.origem === "equipe" ? "Equipe" : atual.criadoPorNome} ·{" "}
                {formatarData(atual.criadoEm)}
              </span>
            </div>
            {atual.podeRemover && !editando ? (
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={abrirTroca}>
                  Trocar link
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setErroRemover(null);
                    setConfirmarRemocao(true);
                  }}
                >
                  Remover
                </Button>
              </div>
            ) : !atual.podeRemover ? (
              <span className="text-xs text-muted-foreground">
                Colocado pela equipe. Precisa trocar? Fale com a equipe.
              </span>
            ) : null}
          </div>
        ) : (
          <p className="corpo-sm text-muted-foreground">
            Nenhum link ainda. Compartilhe a pasta do cliente com a equipe, copie
            o link no Drive e cole abaixo.
          </p>
        )}

        {mostrarCampo ? (
          <form onSubmit={enviar} noValidate className="grid gap-2">
            {souEquipe ? null : (
              <div className="corpo-sm text-muted-foreground">
                Antes, compartilhe a pasta com a equipe:
                <ul className="mt-0.5 select-all">
                  {EMAILS_EQUIPE_PASTA.map((email) => (
                    <li key={email}>{email}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid gap-1">
              <Label htmlFor={`${id}-url`}>
                {atual ? "Novo link do Drive" : "Link do Drive"}
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id={`${id}-url`}
                  ref={urlRef}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  aria-invalid={erro ? true : undefined}
                  aria-describedby={erro ? `${id}-erro` : undefined}
                  placeholder="drive.google.com/…"
                  autoComplete="off"
                  inputMode="url"
                  disabled={salvando}
                />
                <Button type="submit" size="sm" disabled={salvando}>
                  {salvando ? "Salvando…" : atual ? "Trocar" : "Salvar link"}
                </Button>
                {editando ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
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
                  className="corpo-sm font-medium text-risco-foreground"
                >
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
