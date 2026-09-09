"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Aluno, Solicitacao } from "@/lib/types";
import {
  aprovarSolicitacao,
  recusarSolicitacao,
  buscarAlunos,
} from "@/app/admin/actions";
import { formatarDataHora } from "@/lib/datas";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

/** Mesmo teto do campo de motivo do cancelamento do Plantão. */
const MAX_MOTIVO = 300;

export function SolicitacaoCard({
  solicitacao,
  alunoSugerido,
}: {
  solicitacao: Solicitacao;
  alunoSugerido: Aluno | null;
}) {
  const router = useRouter();
  const [selecionado, setSelecionado] = useState<Aluno | null>(alunoSugerido);
  const [buscaAberta, setBuscaAberta] = useState(false);
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Aluno[]>([]);
  const [buscando, setBuscando] = useState(false);
  /** PL4 — diálogo de recusa aberto? O motivo é digitado dentro dele. */
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [erroRecusa, setErroRecusa] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    if (termo.trim().length < 2) return;
    setBuscando(true);
    try {
      setResultados(await buscarAlunos(termo));
    } finally {
      setBuscando(false);
    }
  }

  function aprovar() {
    if (!selecionado) {
      toast.error("Selecione o aluno correspondente antes de aprovar.");
      return;
    }
    startTransition(async () => {
      const res = await aprovarSolicitacao(
        solicitacao.id,
        solicitacao.user_id,
        selecionado.id,
      );
      if (res.erro) {
        toast.error("Erro ao aprovar solicitação.");
        return;
      }
      toast.success("Acesso liberado.");
      router.refresh();
    });
  }

  /**
   * PL4 — `recusarSolicitacao(id, observacao?)` sempre gravou a observação e a
   * home do aluno recusado JÁ a renderiza ("Observação: …"); a tela nunca
   * passava o segundo argumento. Resultado: a pessoa lia "sua solicitação não
   * foi aprovada" e nada mais, num portal onde ela não tem canal de suporte.
   *
   * O motivo continua OPCIONAL (recusa de cadastro duplicado não precisa de
   * texto), mas agora é oferecido — e a confirmação existe porque recusar
   * fecha a porta de alguém.
   */
  function recusar() {
    setErroRecusa(null);
    startTransition(async () => {
      const texto = motivo.trim();
      const res = await recusarSolicitacao(
        solicitacao.id,
        texto === "" ? undefined : texto,
      );
      if (res.erro) {
        setErroRecusa("Erro ao recusar solicitação.");
        toast.error("Erro ao recusar solicitação.");
        return;
      }
      setRecusando(false);
      toast.success(
        texto === ""
          ? "Solicitação recusada."
          : "Solicitação recusada. O motivo aparece para a pessoa.",
      );
      router.refresh();
    });
  }

  return (
    <Card>
      <CardContent className="grid gap-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium">{solicitacao.nome ?? "—"}</div>
            <div className="text-sm text-muted-foreground">
              {solicitacao.email}
              {solicitacao.telefone ? ` · ${solicitacao.telefone}` : ""}
            </div>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatarDataHora(solicitacao.criado_em)}
          </span>
        </div>

        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          {selecionado ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-muted-foreground">Vincular a: </span>
                <span className="font-medium">{selecionado.nome}</span>{" "}
                <span className="text-muted-foreground">
                  ({selecionado.email})
                </span>
                {alunoSugerido && selecionado.id === alunoSugerido.id ? (
                  <Badge variant="secondary" className="ml-2 text-[10px]">
                    match por e-mail
                  </Badge>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setBuscaAberta((v) => !v)}
              >
                Trocar aluno
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-muted-foreground">
                Nenhum aluno correspondente encontrado por e-mail.
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setBuscaAberta((v) => !v)}
              >
                Buscar aluno
              </Button>
            </div>
          )}

          {buscaAberta ? (
            <div className="mt-3 border-t pt-3">
              <form onSubmit={buscar} className="flex gap-2">
                <Input
                  value={termo}
                  onChange={(e) => setTermo(e.target.value)}
                  placeholder="Nome ou e-mail do aluno"
                />
                <Button type="submit" variant="secondary" disabled={buscando}>
                  {buscando ? "..." : "Buscar"}
                </Button>
              </form>
              {resultados.length > 0 ? (
                <ul className="mt-2 divide-y">
                  {resultados.map((a) => (
                    <li
                      key={a.id}
                      className="flex items-center justify-between gap-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">
                          {a.nome}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">
                          {a.email}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelecionado(a);
                          setBuscaAberta(false);
                        }}
                      >
                        Selecionar
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              setErroRecusa(null);
              setRecusando(true);
            }}
            disabled={pending}
          >
            Recusar
          </Button>
          <Button onClick={aprovar} disabled={pending || !selecionado}>
            Aprovar acesso
          </Button>
        </div>
      </CardContent>

      <DialogoConfirmacao
        aberto={recusando}
        titulo="Recusar esta solicitação de acesso?"
        descricao={`${solicitacao.nome ?? "Sem nome"} · ${solicitacao.email}`}
        consequencia={
          <>
            A pessoa passa a ver <strong>&ldquo;sua solicitação não foi
            aprovada&rdquo;</strong> ao entrar no portal, e o motivo abaixo
            aparece para ela. Sem motivo, ela fica sem saber o que fazer — e
            não tem canal de suporte antes de ter acesso.
          </>
        }
        rotuloConfirmar="Recusar solicitação"
        rotuloConfirmando="Recusando…"
        confirmando={pending}
        erro={erroRecusa}
        onConfirmar={recusar}
        onCancelar={() => {
          setRecusando(false);
          setErroRecusa(null);
        }}
      >
        <div className="grid gap-2">
          <Label htmlFor={`motivo-${solicitacao.id}`}>
            Motivo (o aluno vê)
          </Label>
          <Textarea
            id={`motivo-${solicitacao.id}`}
            value={motivo}
            maxLength={MAX_MOTIVO}
            rows={3}
            disabled={pending}
            aria-describedby={`motivo-ajuda-${solicitacao.id}`}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ex.: não encontramos seu CPF na base do programa — responda este e-mail com o número usado na compra."
          />
          <p
            id={`motivo-ajuda-${solicitacao.id}`}
            className="text-xs text-muted-foreground"
          >
            Opcional, mas é a única explicação que a pessoa recebe. Até{" "}
            {MAX_MOTIVO} caracteres ({motivo.length}/{MAX_MOTIVO}).
          </p>
        </div>
      </DialogoConfirmacao>
    </Card>
  );
}
