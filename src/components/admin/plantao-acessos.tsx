"use client";

/**
 * Plantão de Dúvidas — Acelera Holding. Aba "Alunos" do admin.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * A rota pública deixou de ter login (não há mais senha nem sessão própria
 * do plantão) — por isso saíram as colunas "tem senha"/"último acesso" e o
 * botão "Limpar senha". No lugar, mostramos `bloqueadoPorPrograma` e
 * `bloqueioExcecao`: hoje 20 pessoas perderam o acesso ao Plantão por terem
 * migrado para o Programa de Implementação Assistida, e isso não aparecia em
 * NENHUMA tela — só dava para ver rodando SQL direto no banco.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  SearchIcon,
  UserRoundIcon,
  ShieldOffIcon,
  ShieldCheckIcon,
  UploadIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { AlunoPlantaoAdmin } from "@/lib/plantao-tipos";
import {
  revogarAcessoPlantao,
  reativarAcessoPlantao,
  carregarLoteAcelera,
} from "@/app/admin/plantao/actions";
import { Input } from "@/components/ui/input";
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
import { LiberarAlunoPlantao } from "@/components/admin/liberar-aluno-plantao";

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function PlantaoAcessos({
  alunos,
}: {
  alunos: AlunoPlantaoAdmin[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busca, setBusca] = useState("");
  const [carregandoLote, setCarregandoLote] = useState(false);
  const [alunoEmAcao, setAlunoEmAcao] = useState<string | null>(null);

  const filtrados = useMemo(() => {
    const termo = normalizar(busca.trim());
    if (!termo) return alunos;
    return alunos.filter(
      (a) =>
        normalizar(a.nome).includes(termo) ||
        normalizar(a.email).includes(termo) ||
        normalizar(a.lote).includes(termo),
    );
  }, [alunos, busca]);

  function executar(id: string, acao: () => Promise<{ ok: boolean; erro?: string }>) {
    setAlunoEmAcao(id);
    startTransition(async () => {
      const res = await acao();
      setAlunoEmAcao(null);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      router.refresh();
    });
  }

  function onRevogar(a: AlunoPlantaoAdmin) {
    if (
      !window.confirm(
        `Revogar o acesso de ${a.nome} ao plantão? Ele para de conseguir entrar até você reativar.`,
      )
    ) {
      return;
    }
    executar(a.id, () => revogarAcessoPlantao(a.id));
    toast.success("Acesso revogado.");
  }

  function onReativar(a: AlunoPlantaoAdmin) {
    executar(a.id, () => reativarAcessoPlantao(a.id));
    toast.success("Acesso reativado.");
  }

  function onCarregarLote() {
    setCarregandoLote(true);
    startTransition(async () => {
      const res = await carregarLoteAcelera();
      setCarregandoLote(false);
      if (!res.ok) {
        toast.error(res.erro);
        return;
      }
      toast.success(
        `Lote carregado: ${res.inseridos ?? 0} novos, ${res.atualizados ?? 0} atualizados, ${res.inalterados ?? 0} sem mudança.`,
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <SearchIcon
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail ou lote"
            className="pl-8"
            aria-label="Buscar aluno do plantão"
          />
        </div>
        <div className="flex items-center gap-2">
          <LiberarAlunoPlantao />
          <Button onClick={onCarregarLote} disabled={carregandoLote} variant="outline">
            <UploadIcon className="size-4" />
            {carregandoLote ? "Carregando lote..." : "Carregar lote"}
          </Button>
        </div>
      </div>

      {filtrados.length === 0 ? (
        <EmptyState
          titulo="Nenhum aluno encontrado."
          descricao="Ajuste a busca ou carregue um lote de compradores do Acelera para liberar o acesso."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Aluno</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>Bloqueio por programa</TableHead>
              <TableHead>Inscrições</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtrados.map((a) => {
              const emAcao = pending && alunoEmAcao === a.id;
              return (
                <TableRow key={a.id}>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <UserRoundIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0">
                        <div className="truncate font-medium">{a.nome}</div>
                        <div className="truncate text-xs text-muted-foreground">{a.email}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.lote}</TableCell>
                  <TableCell>
                    {!a.bloqueadoPorPrograma ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : a.bloqueioExcecao ? (
                      <span
                        className="inline-flex items-center gap-1 text-xs text-foreground"
                        title="Migrou para o Programa de Implementação, mas a equipe abriu uma exceção manual — continua com acesso ao Plantão."
                      >
                        <TriangleAlertIcon className="size-3.5 text-amber-600" /> Exceção aberta
                      </span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-1 text-xs text-destructive"
                        title="Migrou para o Programa de Implementação Assistida — perdeu o acesso ao Plantão."
                      >
                        <TriangleAlertIcon className="size-3.5" /> Perdeu o acesso
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{a.inscricoesQtd}</TableCell>
                  <TableCell>
                    <Badge variant={a.ativo ? "secondary" : "destructive"}>
                      {a.ativo ? "Ativo" : "Revogado"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {a.ativo ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={emAcao}
                          onClick={() => onRevogar(a)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <ShieldOffIcon className="size-4" /> Revogar
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={emAcao}
                          onClick={() => onReativar(a)}
                        >
                          <ShieldCheckIcon className="size-4" /> Reativar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
