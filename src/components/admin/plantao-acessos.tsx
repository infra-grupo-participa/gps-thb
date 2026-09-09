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
 *
 * `situacaoCompra` (decisão do Marcio, 09/09/2026) é o mapa do histórico de
 * vendas da Hotmart — pago/não pago/devolvido — com filtro por chips e busca.
 * NÃO controla acesso (quem controla é `ativo`/`bloqueadoPorPrograma`); só
 * explica o porquê, e isso é dito em texto no topo da aba.
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
import { semAcento } from "@/lib/texto";
import { formatarDataHora } from "@/lib/datas";

/** Rótulo + variante do `Badge` para cada `situacaoCompra`. */
const SITUACAO_COMPRA_INFO: Record<
  "pago" | "nao_pago" | "devolvido",
  { rotulo: string; variant: "success" | "warning" | "danger" }
> = {
  pago: { rotulo: "Pagou", variant: "success" },
  nao_pago: { rotulo: "Não pagou", variant: "warning" },
  devolvido: { rotulo: "Reembolsado", variant: "danger" },
};

/** Termo de busca por situação — casa "pagou"/"pago", "não pagou", "reembolsado"/"devolvido". */
function termosDeSituacao(s: AlunoPlantaoAdmin["situacaoCompra"]): string {
  switch (s) {
    case "pago":
      return "pago pagou";
    case "nao_pago":
      return "nao pago nao pagou";
    case "devolvido":
      return "devolvido reembolsado reembolso";
    default:
      return "";
  }
}

const FILTROS_SITUACAO = [
  { valor: "pago", rotulo: "Pagou" },
  { valor: "nao_pago", rotulo: "Não pagou" },
  { valor: "devolvido", rotulo: "Reembolsado" },
  { valor: "sem_situacao", rotulo: "Sem situação" },
] as const;

type FiltroSituacao = (typeof FILTROS_SITUACAO)[number]["valor"];

export function PlantaoAcessos({
  alunos,
}: {
  alunos: AlunoPlantaoAdmin[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busca, setBusca] = useState("");
  const [filtroSituacao, setFiltroSituacao] = useState<FiltroSituacao | null>(null);
  const [carregandoLote, setCarregandoLote] = useState(false);
  const [alunoEmAcao, setAlunoEmAcao] = useState<string | null>(null);

  // Maior `situacaoEm` da base — "importado em" do topo. `null` só se
  // NINGUÉM ainda tem situação registrada (ex.: ambiente novo, sem CSV).
  const situacaoImportadaEm = useMemo(() => {
    let maior: string | null = null;
    for (const a of alunos) {
      if (a.situacaoEm && (!maior || a.situacaoEm > maior)) maior = a.situacaoEm;
    }
    return maior;
  }, [alunos]);

  const filtrados = useMemo(() => {
    const termo = semAcento(busca.trim());
    return alunos.filter((a) => {
      if (filtroSituacao) {
        if (filtroSituacao === "sem_situacao") {
          if (a.situacaoCompra !== null) return false;
        } else if (a.situacaoCompra !== filtroSituacao) {
          return false;
        }
      }
      if (!termo) return true;
      return (
        semAcento(a.nome).includes(termo) ||
        semAcento(a.email).includes(termo) ||
        semAcento(a.lote).includes(termo) ||
        semAcento(termosDeSituacao(a.situacaoCompra)).includes(termo)
      );
    });
  }, [alunos, busca, filtroSituacao]);

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
      <div className="rounded-lg border border-borda-fina bg-superficie-afundada px-3 py-2 text-xs text-muted-foreground">
        <p>
          <strong className="font-medium text-foreground">Situação comercial</strong> não é a
          mesma coisa que acesso. Quem controla se a pessoa entra no Plantão é a coluna{" "}
          <strong className="font-medium text-foreground">Status</strong> (Ativo/Revogado) e o
          bloqueio por programa — a situação só explica o porquê. Uma pessoa pode estar
          &ldquo;Pagou&rdquo; e revogada (a equipe tirou o acesso), ou &ldquo;Não pagou&rdquo; e
          ativa (liberação manual).
        </p>
        <p className="mt-1">
          {situacaoImportadaEm
            ? `Situação comercial importada em ${formatarDataHora(situacaoImportadaEm)}.`
            : "Nenhuma situação comercial importada ainda — carregue um lote para começar."}
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full max-w-xs">
          <SearchIcon
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail, lote ou situação"
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

      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por situação de compra">
        {FILTROS_SITUACAO.map((f) => {
          const ativo = filtroSituacao === f.valor;
          return (
            <button
              key={f.valor}
              type="button"
              aria-pressed={ativo}
              onClick={() => setFiltroSituacao(ativo ? null : f.valor)}
              className={
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring " +
                (ativo
                  ? "border-accent-foreground bg-accent-foreground text-white"
                  : "border-borda-forte text-foreground hover:bg-muted")
              }
            >
              {f.rotulo}
            </button>
          );
        })}
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
              <TableHead>Situação</TableHead>
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
                    {a.situacaoCompra ? (
                      <Badge
                        variant={SITUACAO_COMPRA_INFO[a.situacaoCompra].variant}
                        title={
                          a.situacaoDetalhe
                            ? `Status na Hotmart: ${a.situacaoDetalhe}`
                            : undefined
                        }
                      >
                        {SITUACAO_COMPRA_INFO[a.situacaoCompra].rotulo}
                      </Badge>
                    ) : (
                      <span
                        className="text-xs text-muted-foreground"
                        title="Não apareceu no último histórico de vendas importado"
                      >
                        —
                      </span>
                    )}
                  </TableCell>
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
