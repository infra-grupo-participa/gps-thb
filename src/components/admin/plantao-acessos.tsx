"use client";

/**
 * Plantão de Dúvidas — Acelera Holding. Gestão de acesso dos alunos (admin).
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Lista `AlunoPlantaoAdmin` com busca e as ações: revogar, reativar, limpar
 * senha, carregar lote. NUNCA exibe senha nem hash — "limpar senha" só apaga
 * a credencial (o aluno cria uma nova no próximo acesso, como sempre).
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  SearchIcon,
  UserRoundIcon,
  ShieldOffIcon,
  ShieldCheckIcon,
  KeyRoundIcon,
  UploadIcon,
  CircleCheckIcon,
  CircleDashedIcon,
} from "lucide-react";
import type { AlunoPlantaoAdmin } from "@/lib/plantao-tipos";
import {
  revogarAcessoPlantao,
  reativarAcessoPlantao,
  limparSenha,
  liberarPrimeiroAcesso,
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
import { Card, CardContent } from "@/components/ui/card";

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function formatarData(iso: string | null): string {
  if (!iso) return "Nunca";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function PlantaoAcessos({ alunos }: { alunos: AlunoPlantaoAdmin[] }) {
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

  function onLiberar(a: AlunoPlantaoAdmin) {
    if (
      !confirm(
        `Liberar o primeiro acesso de ${a.nome} sem conferir o documento?

` +
          "Confirme a identidade por fora (WhatsApp/e-mail) antes. A liberação " +
          "vale para UM acesso: assim que a senha for criada, ela se encerra.",
      )
    )
      return;
    executar(a.id, () => liberarPrimeiroAcesso(a.id));
  }

  function onLimparSenha(a: AlunoPlantaoAdmin) {
    if (
      !window.confirm(
        `Limpar a senha de ${a.nome}? Ele(a) não conseguirá mais entrar com a senha atual — no próximo acesso, digita uma senha nova e ela vira a credencial dele(a) (como no primeiro acesso).`,
      )
    ) {
      return;
    }
    executar(a.id, () => limparSenha(a.id));
    toast.success("Senha apagada — o aluno cria uma nova no próximo acesso.");
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
        <Button onClick={onCarregarLote} disabled={carregandoLote} variant="outline">
          <UploadIcon className="size-4" />
          {carregandoLote ? "Carregando lote..." : "Carregar lote"}
        </Button>
      </div>

      {filtrados.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Nenhum aluno encontrado.
          </CardContent>
        </Card>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Aluno</TableHead>
              <TableHead>Lote</TableHead>
              <TableHead>Senha</TableHead>
              <TableHead>Último login</TableHead>
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
                    {a.temSenha ? (
                      <span className="inline-flex items-center gap-1 text-xs text-foreground">
                        <CircleCheckIcon className="size-3.5 text-primary" /> Definida
                      </span>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                          <CircleDashedIcon className="size-3.5" /> Ainda não
                        </span>
                        {!a.temDocumento && !a.liberadoSemDocumento ? (
                          <span className="text-[11px] text-destructive">
                            sem documento — precisa de liberação
                          </span>
                        ) : null}
                        {a.liberadoSemDocumento ? (
                          <span className="text-[11px] text-primary">
                            liberado para entrar
                          </span>
                        ) : null}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {formatarData(a.ultimoLoginEm)}
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">{a.inscricoesQtd}</TableCell>
                  <TableCell>
                    <Badge variant={a.ativo ? "secondary" : "destructive"}>
                      {a.ativo ? "Ativo" : "Revogado"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      {!a.temSenha && !a.temDocumento && !a.liberadoSemDocumento ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={emAcao}
                          onClick={() => onLiberar(a)}
                          title="O CSV veio sem documento — libera UM primeiro acesso sem conferência"
                        >
                          <KeyRoundIcon className="size-4" /> Liberar 1º acesso
                        </Button>
                      ) : null}
                      {a.temSenha ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={emAcao}
                          onClick={() => onLimparSenha(a)}
                          title="Apaga a senha atual — o aluno cria uma nova no próximo acesso"
                        >
                          <KeyRoundIcon className="size-4" /> Limpar senha
                        </Button>
                      ) : null}
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
