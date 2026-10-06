"use client";

/**
 * "Sobre o cliente: X" no detalhe do chamado, com "Trocar cliente" enquanto o
 * chamado não está fechado. Serve parceiro (nome em texto) e equipe (nome é
 * link para a ficha — `hrefFicha` vem calculado do servidor).
 *
 * `cliente_id` preenchido com nome nulo = o cliente não está mais legível:
 * mostra "Cliente indisponível", nunca some.
 */

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { definirClienteDoChamado } from "@/app/chamados/actions";
import type { OpcaoClienteChamado } from "@/lib/chamados-tipos";
import { Button } from "@/components/ui/button";
import { CampoClienteReferencia } from "@/components/chamados/chamado-novo-dialog/campo-cliente-referencia";

export function ClienteDoChamado({
  chamadoId,
  clienteId,
  clienteNome,
  fechado,
  opcoes,
  hrefFicha,
}: {
  chamadoId: string;
  clienteId: string | null;
  clienteNome: string | null;
  fechado: boolean;
  opcoes: OpcaoClienteChamado[];
  /** Só a equipe recebe; parceiro vê o nome em texto. */
  hrefFicha?: string | null;
}) {
  const router = useRouter();
  const uid = useId();
  const [editando, setEditando] = useState(false);
  const [novo, setNovo] = useState<OpcaoClienteChamado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();
  const gatilhoRef = useRef<HTMLButtonElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const idEditor = `${uid}-editor`;

  // Abriu: o foco vai para o primeiro controle do editor.
  useEffect(() => {
    if (editando) {
      editorRef.current
        ?.querySelector<HTMLElement>("input:not(:disabled), button:not(:disabled)")
        ?.focus();
    }
  }, [editando]);

  function fechar() {
    setEditando(false);
    // O gatilho continua montado: o foco volta a ele em vez de cair no body.
    gatilhoRef.current?.focus();
  }

  const temCliente = clienteId !== null;
  if (!temCliente && fechado) return null;

  function abrirEdicao() {
    setNovo(opcoes.find((o) => o.id === clienteId) ?? null);
    setErro(null);
    setEditando(true);
  }

  function salvar() {
    const novoId = novo?.id ?? null;
    if (novoId === clienteId) {
      fechar();
      return;
    }
    setErro(null);
    startTransition(async () => {
      const r = await definirClienteDoChamado({ chamadoId, clienteId: novoId });
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      toast.success(novoId ? "Cliente atualizado." : "Cliente removido do chamado.");
      fechar();
      router.refresh();
    });
  }

  // null com cliente_id = indisponível; vazio = sem nome (igual ao seletor).
  const nomeLimpo = clienteNome === null ? null : clienteNome.trim();
  const nomeExibido =
    nomeLimpo === null
      ? "Cliente indisponível"
      : nomeLimpo === ""
        ? "Cliente sem nome"
        : nomeLimpo;

  return (
    <div className="grid gap-3 text-base">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {temCliente ? (
          <p>
            <span className="text-muted-foreground">Sobre o cliente: </span>
            {hrefFicha && nomeLimpo ? (
              <Link
                href={hrefFicha}
                prefetch={false}
                className="font-medium text-accent-foreground underline-offset-4 hover:underline"
              >
                {nomeExibido}
              </Link>
            ) : (
              <span className="font-medium">{nomeExibido}</span>
            )}
          </p>
        ) : (
          <p className="text-muted-foreground">Nenhum cliente</p>
        )}
        {!fechado ? (
          <Button
            ref={gatilhoRef}
            type="button"
            variant="outline"
            aria-expanded={editando}
            aria-controls={idEditor}
            onClick={editando ? fechar : abrirEdicao}
          >
            {temCliente ? "Trocar cliente" : "Ligar a um cliente"}
          </Button>
        ) : null}
      </div>

      {editando ? (
        <div
          id={idEditor}
          ref={editorRef}
          className="grid gap-3 rounded-lg border border-borda-forte p-3"
        >
          <CampoClienteReferencia
            id={`${uid}-cliente`}
            rotulo="Sobre qual cliente?"
            clientes={opcoes}
            valor={novo}
            onChange={setNovo}
            desabilitado={pendente}
          />
          <p role="alert" className="text-base text-destructive empty:hidden">
            {erro}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={salvar}
              disabled={pendente}
              aria-busy={pendente || undefined}
            >
              {pendente ? "Salvando…" : "Salvar cliente"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={fechar}
              disabled={pendente}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
