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
  LINK_NOME_MAXIMO,
  LINKS_DRIVE_MAXIMO,
  FRASE_LINK_INVALIDO,
  type LinkDrive,
} from "@/lib/links-drive-tipos";
import { EMAILS_EQUIPE_PASTA, normalizarUrlDoDrive } from "@/lib/pasta";


const ERRO_NOME = `Dê um nome ao link (até ${LINK_NOME_MAXIMO} letras).`;

/**
 * Links do Drive dos documentos DESTE cliente (não a pasta do escritório, que
 * fica na aba Pasta). Adicionar/remover grava pela action e faz
 * `router.refresh()`; o toast só aparece no sucesso, o erro fica em
 * `role="alert"` ao lado do campo.
 */
export function LinksDrive({
  clienteId,
  links,
  souEquipe,
}: {
  clienteId: string;
  /** `null` = a leitura falhou no servidor. */
  links: LinkDrive[] | null;
  souEquipe: boolean;
}) {
  const router = useRouter();
  const id = useId();
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("");
  const [erroNome, setErroNome] = useState<string | null>(null);
  const [erroUrl, setErroUrl] = useState<string | null>(null);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [aRemover, setARemover] = useState<LinkDrive | null>(null);
  const [erroRemover, setErroRemover] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();
  const [removendo, remover] = useTransition();
  const nomeRef = useRef<HTMLInputElement>(null);
  const urlRef = useRef<HTMLInputElement>(null);
  const tituloRef = useRef<HTMLDivElement>(null);

  const falhou = links === null;
  const lista = links ?? [];
  const noTeto = lista.length >= LINKS_DRIVE_MAXIMO;

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErroEnvio(null);
    const nomeLimpo = nome.trim();
    if (nomeLimpo.length < 1 || nomeLimpo.length > LINK_NOME_MAXIMO) {
      setErroNome(ERRO_NOME);
      setErroUrl(null);
      nomeRef.current?.focus();
      return;
    }
    setErroNome(null);
    const normalizada = normalizarUrlDoDrive(url);
    if (!normalizada) {
      setErroUrl(FRASE_LINK_INVALIDO);
      urlRef.current?.focus();
      return;
    }
    setErroUrl(null);
    salvar(async () => {
      const res = await adicionarLinkDrive({
        clienteId,
        nome: nomeLimpo,
        url: normalizada,
      });
      if (!res.ok) {
        setErroEnvio(res.erro);
        urlRef.current?.focus();
        return;
      }
      setNome("");
      setUrl("");
      toast.success(`Link "${res.link.nome}" adicionado.`);
      router.refresh();
      nomeRef.current?.focus();
    });
  }

  function confirmarRemocao() {
    if (!aRemover) return;
    const alvo = aRemover;
    setErroRemover(null);
    remover(async () => {
      const res = await removerLinkDrive({ linkId: alvo.id, clienteId });
      if (!res.ok) {
        setErroRemover(res.erro);
        return;
      }
      setARemover(null);
      toast.success(`Link "${alvo.nome}" removido.`);
      router.refresh();
      // O botão que abriu o diálogo sumiu com a linha: o foco vai ao título.
      requestAnimationFrame(() => tituloRef.current?.focus());
    });
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
          Links do Drive deste cliente
        </CardTitle>
        <p className="corpo-sm text-muted-foreground">
          Documentos <strong>deste cliente</strong> (contratos, certidões,
          fotos). A pasta do escritório fica na aba Pasta.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3">
        {falhou ? (
          <p role="alert" className="corpo-sm text-risco-foreground">
            Não deu para carregar os links agora. Recarregue a página antes de
            colar um link novo.
          </p>
        ) : lista.length === 0 ? (
          <p className="corpo-sm text-muted-foreground">
            Nenhum link ainda. Compartilhe o documento com a equipe, copie o
            link no Drive e cole abaixo.
          </p>
        ) : (
          <ul className="grid divide-y divide-borda-fina border-y border-borda-fina">
            {lista.map((l) => (
              <li
                key={l.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2"
              >
                <div className="grid min-w-0 gap-0.5">
                  <a
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="corpo-sm truncate font-medium text-accent-foreground underline underline-offset-2"
                  >
                    {l.nome}
                    <span className="sr-only"> (abre em nova aba)</span>
                  </a>
                  <span className="text-xs text-muted-foreground">
                    por {l.origem === "equipe" ? "Equipe" : l.criadoPorNome} ·{" "}
                    {formatarData(l.criadoEm)}
                  </span>
                </div>
                {l.podeRemover ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remover o link ${l.nome}`}
                    onClick={() => {
                      setErroRemover(null);
                      setARemover(l);
                    }}
                  >
                    Remover
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {falhou ? null : noTeto ? (
          <p className="corpo-sm text-muted-foreground">
            Este cliente já tem {LINKS_DRIVE_MAXIMO} links, o máximo. Para
            adicionar outro, remova um que não precise mais.
          </p>
        ) : (
          <form onSubmit={enviar} noValidate className="grid gap-2">
            {souEquipe ? null : (
              <div className="corpo-sm text-muted-foreground">
                Antes, compartilhe a pasta ou o documento com a equipe:
                <ul className="mt-0.5 select-all">
                  {EMAILS_EQUIPE_PASTA.map((email) => (
                    <li key={email}>{email}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="grid gap-1">
              <Label htmlFor={`${id}-nome`}>Nome</Label>
              <Input
                id={`${id}-nome`}
                ref={nomeRef}
                value={nome}
                maxLength={LINK_NOME_MAXIMO}
                onChange={(e) => setNome(e.target.value)}
                aria-invalid={erroNome ? true : undefined}
                aria-describedby={erroNome ? `${id}-erro-nome` : undefined}
                placeholder="Ex.: Contrato social"
                autoComplete="off"
              />
              {erroNome ? (
                <p
                  id={`${id}-erro-nome`}
                  role="alert"
                  className="corpo-sm font-medium text-risco-foreground"
                >
                  {erroNome}
                </p>
              ) : null}
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`${id}-url`}>Link do Drive</Label>
              <Input
                id={`${id}-url`}
                ref={urlRef}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                aria-invalid={erroUrl || erroEnvio ? true : undefined}
                aria-describedby={
                  erroUrl || erroEnvio ? `${id}-erro-url` : undefined
                }
                placeholder="drive.google.com/…"
                autoComplete="off"
                inputMode="url"
              />
              {erroUrl || erroEnvio ? (
                <p
                  id={`${id}-erro-url`}
                  role="alert"
                  className="corpo-sm font-medium text-risco-foreground"
                >
                  {erroUrl ?? erroEnvio}
                </p>
              ) : null}
            </div>
            <div>
              <Button type="submit" size="sm" disabled={salvando}>
                {salvando ? "Salvando…" : "Adicionar link"}
              </Button>
            </div>
          </form>
        )}
      </CardContent>

      <DialogoConfirmacao
        aberto={aRemover !== null}
        titulo="Remover link"
        descricao={aRemover ? `“${aRemover.nome}”` : undefined}
        consequencia={
          aRemover
            ? `O link “${aRemover.nome}” sai da ficha deste cliente. O arquivo no Drive não é apagado.`
            : ""
        }
        rotuloConfirmar="Remover link"
        rotuloConfirmando="Removendo…"
        confirmando={removendo}
        erro={erroRemover}
        onConfirmar={confirmarRemocao}
        onCancelar={() => {
          if (!removendo) setARemover(null);
        }}
      />
    </Card>
  );
}
