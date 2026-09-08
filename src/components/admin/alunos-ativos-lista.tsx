"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import type { AlunoGps } from "@/lib/data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

/**
 * Lista "Alunos ativos" com badge de pendência do diário e filtro "com
 * pendência". Recebe os dados já carregados pelo Server Component (uma
 * query no `Promise.all` de `admin/page.tsx`) — o filtro é só em memória,
 * sem segunda ida ao banco.
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

  const totalComPendencia = useMemo(
    () => alunos.filter((a) => (pendenciasPorAluno[a.alunoId] ?? 0) > 0).length,
    [alunos, pendenciasPorAluno],
  );

  const visiveis = somentePendencia
    ? alunos.filter((a) => (pendenciasPorAluno[a.alunoId] ?? 0) > 0)
    : alunos;

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

      {visiveis.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground">
            Nenhum aluno com pendência aberta.
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
