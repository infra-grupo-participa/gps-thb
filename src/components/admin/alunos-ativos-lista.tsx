"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Search } from "lucide-react";
import type { AlunoGps } from "@/lib/data";
import { casaTodosOsTermos, semAcento } from "@/lib/texto";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OrdemAlunos = "recentes" | "nome" | "progresso" | "clientes";

/**
 * Lista "Alunos ativos" com busca, ordenação, badge de pendência do diário e
 * filtro "com pendência". Recebe os dados já carregados pelo Server Component
 * (uma query no `Promise.all` de `admin/page.tsx`) — busca, ordenação e filtro
 * acontecem em memória, sobre o array recebido, sem segunda ida ao banco.
 */
export function AlunosAtivosLista({
  alunos,
  pendenciasPorAluno,
}: {
  alunos: AlunoGps[];
  /** `alunoId` → contagem de pendências abertas. */
  pendenciasPorAluno: Record<string, number>;
}) {
  const [somentePendencia, setSomentePendencia] = useState(false);
  const [termo, setTermo] = useState("");
  const [ordem, setOrdem] = useState<OrdemAlunos>("recentes");

  const totalComPendencia = useMemo(
    () => alunos.filter((a) => (pendenciasPorAluno[a.alunoId] ?? 0) > 0).length,
    [alunos, pendenciasPorAluno],
  );

  const visiveis = useMemo(() => {
    const filtrados = alunos.filter((a) => {
      if (somentePendencia && (pendenciasPorAluno[a.alunoId] ?? 0) === 0) {
        return false;
      }
      const alvo = `${a.aluno?.nome ?? ""} ${a.aluno?.email ?? ""}`;
      return casaTodosOsTermos(alvo, termo);
    });

    // Empate sempre desempatado por nome: sem isso a lista dança entre
    // renders, porque `sort` não é estável para chaves iguais em toda engine.
    const porNome = (a: AlunoGps, b: AlunoGps) =>
      semAcento(a.aluno?.nome ?? "").localeCompare(
        semAcento(b.aluno?.nome ?? ""),
        "pt-BR",
      );

    // "recentes" é a ordem em que o array chegou (mais recente primeiro):
    // não reordenar.
    if (ordem === "recentes") return filtrados;

    return [...filtrados].sort((a, b) => {
      if (ordem === "nome") return porNome(a, b);
      if (ordem === "progresso") return b.pct - a.pct || porNome(a, b);
      return b.clientesPreenchidos - a.clientesPreenchidos || porNome(a, b);
    });
  }, [alunos, pendenciasPorAluno, somentePendencia, termo, ordem]);

  const buscando = termo.trim().length > 0;

  if (alunos.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          Nenhum aluno ativo ainda. Use{" "}
          <span className="font-medium">Criar acesso</span> para começar.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="busca-alunos"
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar aluno por nome ou e-mail"
            className="pl-8"
          />
        </div>

        <Select
          value={ordem}
          onValueChange={(v) => v && setOrdem(v as OrdemAlunos)}
        >
          <SelectTrigger aria-label="Ordenar alunos" className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recentes">Ordenar: mais recentes</SelectItem>
            <SelectItem value="nome">Ordenar: nome</SelectItem>
            <SelectItem value="progresso">Ordenar: progresso</SelectItem>
            <SelectItem value="clientes">Ordenar: clientes</SelectItem>
          </SelectContent>
        </Select>

        {totalComPendencia > 0 ? (
          <label className="flex w-fit items-center gap-2 text-sm">
            <Checkbox
              checked={somentePendencia}
              onCheckedChange={(v) => setSomentePendencia(Boolean(v))}
            />
            <Label className="cursor-pointer font-normal">
              Só com pendência ({totalComPendencia})
            </Label>
          </label>
        ) : null}
      </div>

      <p aria-live="polite" className="text-xs text-muted-foreground">
        Mostrando {visiveis.length} de {alunos.length}
      </p>

      {visiveis.length === 0 ? (
        <Card>
          <CardContent className="grid justify-items-center gap-3 p-10 text-center text-sm text-muted-foreground">
            {buscando ? (
              <>
                <p>
                  Nenhum aluno para{" "}
                  <span className="font-medium text-foreground">
                    «{termo.trim()}»
                  </span>
                  {somentePendencia ? " entre os com pendência aberta" : null}.
                </p>
                <Button variant="outline" size="sm" onClick={() => setTermo("")}>
                  Limpar busca
                </Button>
              </>
            ) : (
              <p>Nenhum aluno com pendência aberta.</p>
            )}
          </CardContent>
        </Card>
      ) : (
        visiveis.map(
          ({
            aluno,
            alunoId,
            temLogin,
            qtdMembros,
            pct,
            clientesPreenchidos,
            agendados,
          }) => {
            const pendencias = pendenciasPorAluno[alunoId] ?? 0;
            return (
              <Link key={alunoId} href={`/admin/aluno/${alunoId}`} className="block">
                <Card className="transition hover:border-primary/50 hover:shadow-sm">
                  <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">
                          {aluno?.nome ?? "Aluno sem nome"}
                        </span>
                        {temLogin ? (
                          <Badge variant="secondary" className="text-[10px]">
                            com login
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">
                            sem login
                          </Badge>
                        )}
                        {qtdMembros > 1 ? (
                          <Badge variant="outline" className="text-[10px]">
                            {qtdMembros} pessoas
                          </Badge>
                        ) : null}
                        {pendencias > 0 ? (
                          <Badge variant="destructive" className="gap-1 text-[10px]">
                            <AlertCircle className="size-3" />
                            {pendencias}{" "}
                            {pendencias === 1 ? "pendência" : "pendências"}
                          </Badge>
                        ) : null}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {aluno?.email}
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-center">
                        <div className="text-sm font-semibold">
                          {clientesPreenchidos}/30
                        </div>
                        <div className="text-[10px] uppercase text-muted-foreground">
                          clientes
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="text-sm font-semibold">
                          {agendados}/15
                        </div>
                        <div className="text-[10px] uppercase text-muted-foreground">
                          reuniões
                        </div>
                      </div>
                      <div className="w-32">
                        <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                          <span>Etapa 01</span>
                          <span>{pct}%</span>
                        </div>
                        <Progress value={pct} />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          },
        )
      )}
    </div>
  );
}
