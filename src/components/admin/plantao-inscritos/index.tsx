"use client";

/**
 * Plantão de Dúvidas — Acelera Holding. Lista de inscritos de UM slot (admin),
 * agora EDITÁVEL (09/09/2026): marcar/desmarcar presença, corrigir o nome
 * exibido, cancelar a inscrição e inscrever alguém direto pelo painel.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * A lista chega PRONTA por prop (carregada no Server Component
 * `src/app/admin/plantao/page.tsx`, via `getInscritosDoSlot`) — este
 * componente não busca dado; as 4 mutações vêm de
 * `src/app/admin/plantao/inscritos-actions.ts` (RPC `security definer`, regra
 * de negócio no banco).
 *
 * Virou pasta (era 1 arquivo, ficaria > 350 linhas): `linha.tsx` é a linha da
 * tabela (nome/editar, presença com confirmação ao desmarcar, cancelar) e
 * `inscrever-form.tsx` é o formulário do rodapé.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SearchIcon } from "lucide-react";
import type { InscritoAdmin } from "@/lib/plantao-tipos";
import { semAcento } from "@/lib/texto";
import {
  marcarPresencaInscrito,
  editarNomeInscricao,
  cancelarInscricaoPeloAdmin,
} from "@/app/admin/plantao/inscritos-actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DialogoConfirmacao } from "@/components/ui/dialogo-confirmacao";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
} from "@/components/ui/table";
import { LinhaInscrito } from "./linha";
import { InscreverForm } from "./inscrever-form";

/** Só mostra a busca com mais de 8 inscritos — abaixo disso a lista já é curta. */
const LIMIAR_BUSCA = 8;

export function PlantaoInscritos({
  slotId,
  inscritos,
  totalInscritos,
}: {
  slotId: string;
  inscritos: InscritoAdmin[];
  /** Total REAL no banco — pode ser maior que `inscritos.length` (teto de 500). */
  totalInscritos: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busca, setBusca] = useState("");
  const [inscritoEmAcao, setInscritoEmAcao] = useState<string | null>(null);

  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [desmarcando, setDesmarcando] = useState<InscritoAdmin | null>(null);
  const [cancelando, setCancelando] = useState<InscritoAdmin | null>(null);
  const [erroDialogo, setErroDialogo] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim());
    if (!termo) return inscritos;
    return inscritos.filter(
      (i) => semAcento(i.nome).includes(termo) || semAcento(i.email).includes(termo),
    );
  }, [inscritos, busca]);

  function executar(
    id: string,
    acao: () => Promise<{ ok: boolean; erro?: string }>,
    aoTerminar?: (ok: boolean) => void,
  ) {
    setInscritoEmAcao(id);
    startTransition(async () => {
      const res = await acao();
      setInscritoEmAcao(null);
      if (!res.ok) {
        toast.error(res.erro);
        aoTerminar?.(false);
        return;
      }
      router.refresh();
      aoTerminar?.(true);
    });
  }

  function onMarcarPresente(i: InscritoAdmin) {
    executar(i.inscricaoId, () => marcarPresencaInscrito(i.inscricaoId, true), (ok) => {
      if (ok) toast.success(`Presença de ${i.nome} marcada.`);
    });
  }

  function pedirDesmarcar(i: InscritoAdmin) {
    setErroDialogo(null);
    setDesmarcando(i);
  }

  function confirmarDesmarcar() {
    if (!desmarcando) return;
    const alvo = desmarcando;
    setInscritoEmAcao(alvo.inscricaoId);
    startTransition(async () => {
      const res = await marcarPresencaInscrito(alvo.inscricaoId, false);
      setInscritoEmAcao(null);
      if (!res.ok) {
        setErroDialogo(res.erro);
        return;
      }
      toast.success(`Presença de ${alvo.nome} desmarcada.`);
      router.refresh();
      setDesmarcando(null);
    });
  }

  function salvarNome(i: InscritoAdmin, nome: string) {
    executar(i.inscricaoId, () => editarNomeInscricao(i.inscricaoId, nome), (ok) => {
      if (ok) {
        toast.success("Nome atualizado nesta inscrição.");
        setEditandoId(null);
      }
    });
  }

  function pedirCancelar(i: InscritoAdmin) {
    setErroDialogo(null);
    setCancelando(i);
  }

  function confirmarCancelar(motivo: string) {
    if (!cancelando) return;
    const alvo = cancelando;
    setInscritoEmAcao(alvo.inscricaoId);
    startTransition(async () => {
      const res = await cancelarInscricaoPeloAdmin(alvo.inscricaoId, motivo);
      setInscritoEmAcao(null);
      if (!res.ok) {
        setErroDialogo(res.erro);
        return;
      }
      toast.success(`Inscrição de ${alvo.nome} cancelada.`);
      router.refresh();
      setCancelando(null);
    });
  }

  if (inscritos.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Nenhum inscrito neste plantão ainda.
        </p>
        <InscreverForm slotId={slotId} />
      </div>
    );
  }

  const buscaVisivel = inscritos.length > LIMIAR_BUSCA;
  const cortadoPeloTeto = totalInscritos > inscritos.length;

  return (
    <div className="flex flex-col gap-3">
      {buscaVisivel ? (
        <div className="relative w-full max-w-xs">
          <SearchIcon
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Label htmlFor="busca-inscritos" className="sr-only">
            Buscar inscrito por nome ou e-mail
          </Label>
          <Input
            id="busca-inscritos"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            className="pl-8"
          />
        </div>
      ) : null}

      {/* Cabeçalho `sticky`: diálogo do admin (não é `/p/*`), rolagem própria
          via `overflow-y-auto` do container em `dialogo-inscritos.tsx`. Com
          23 linhas a referência das colunas se perdia ao rolar. */}
      <div className="max-h-[60vh] overflow-y-auto rounded-md border">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-background">
            <TableRow>
              <TableHead>Aluno</TableHead>
              <TableHead>Presença</TableHead>
              <TableHead>NPS</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.map((i) => (
              <LinhaInscrito
                key={i.inscricaoId}
                inscrito={i}
                emAcao={pending && inscritoEmAcao === i.inscricaoId}
                editando={editandoId === i.inscricaoId}
                onEditar={() => setEditandoId(i.inscricaoId)}
                onCancelarEdicao={() => setEditandoId(null)}
                onSalvarNome={(nome) => salvarNome(i, nome)}
                onMarcarPresente={() => onMarcarPresente(i)}
                onPedirDesmarcar={() => pedirDesmarcar(i)}
                onPedirCancelar={() => pedirCancelar(i)}
              />
            ))}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        {buscaVisivel && filtrados.length !== inscritos.length
          ? `Mostrando ${filtrados.length} de ${inscritos.length} carregados`
          : `Mostrando ${inscritos.length}`}
        {cortadoPeloTeto ? ` de ${totalInscritos} inscritos` : ""}.
        {cortadoPeloTeto ? " O teto de 500 cortou o restante." : ""}
      </p>

      <InscreverForm slotId={slotId} />

      <DialogoConfirmacao
        aberto={desmarcando !== null}
        titulo="Desmarcar presença?"
        descricao={desmarcando?.nome}
        consequencia={
          <>
            A presença de {desmarcando?.nome} deixa de constar neste plantão.
            {desmarcando?.presencaOrigem === "portal"
              ? " Se ela tinha sido registrada pelo portal (a pessoa clicou para entrar na sala), esse registro se perde."
              : ""}
          </>
        }
        rotuloConfirmar="Desmarcar presença"
        rotuloConfirmando="Desmarcando..."
        destrutivo
        confirmando={pending && inscritoEmAcao === desmarcando?.inscricaoId}
        erro={erroDialogo}
        onConfirmar={confirmarDesmarcar}
        onCancelar={() => setDesmarcando(null)}
      />

      {cancelando ? (
        <DialogoCancelarInscricao
          inscrito={cancelando}
          confirmando={pending && inscritoEmAcao === cancelando.inscricaoId}
          erro={erroDialogo}
          onConfirmar={confirmarCancelar}
          onCancelar={() => setCancelando(null)}
        />
      ) : null}
    </div>
  );
}

/** Extraído só para isolar o estado do campo "Motivo" do cancelamento. */
function DialogoCancelarInscricao({
  inscrito,
  confirmando,
  erro,
  onConfirmar,
  onCancelar,
}: {
  inscrito: InscritoAdmin;
  confirmando: boolean;
  erro: string | null;
  onConfirmar: (motivo: string) => void;
  onCancelar: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  return (
    <DialogoConfirmacao
      aberto
      titulo="Cancelar inscrição"
      descricao={inscrito.nome}
      consequencia={
        <>
          {inscrito.nome} deixa de constar neste plantão e volta a poder se
          inscrever em outro. A inscrição fica no histórico, não é apagada.{" "}
          <strong>Ela não recebe aviso</strong> — quem precisar saber tem de
          ser avisado por fora.
        </>
      }
      rotuloConfirmar="Cancelar inscrição"
      rotuloConfirmando="Cancelando..."
      destrutivo
      confirmando={confirmando}
      erro={erro}
      onConfirmar={() => onConfirmar(motivo.trim())}
      onCancelar={onCancelar}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="cancelar-inscricao-motivo">Motivo (opcional)</Label>
        <Input
          id="cancelar-inscricao-motivo"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          maxLength={300}
          disabled={confirmando}
          placeholder="Ex.: pediu para sair, trocou de data por fora"
        />
      </div>
    </DialogoConfirmacao>
  );
}
