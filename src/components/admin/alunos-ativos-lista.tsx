"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, Search, Users } from "lucide-react";
import type { AlunoGps } from "@/lib/data";
import { casaTodosOsTermos, semAcento } from "@/lib/texto";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OrdemAlunos =
  | "recentes"
  | "nome"
  | "progresso"
  | "clientes"
  | "tempo_de_casa"
  | "ultimo_acesso";

/** Cliente e servidor formatam no MESMO fuso: sem isto o SSR (UTC) e o
 * navegador (BRT) divergem em toda data depois das 21h e a hidratação quebra. */
const FUSO = "America/Sao_Paulo";

const fmtData = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const fmtDataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  dateStyle: "short",
  timeStyle: "short",
});

/** "YYYY-MM-DD" no fuso de Brasília — base para contar dias de CALENDÁRIO. */
const fmtDiaIso = new Intl.DateTimeFormat("en-CA", {
  timeZone: FUSO,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Número do dia (epoch/86400s) no fuso de Brasília. */
function diaLocal(data: Date): number {
  const [ano, mes, dia] = fmtDiaIso.format(data).split("-").map(Number);
  return Date.UTC(ano, mes - 1, dia) / 86_400_000;
}

/**
 * Dias de calendário entre `iso` e `agora`, em Brasília. Conta DIA, não 24h:
 * um acesso às 23h de ontem é "ontem", nunca "hoje".
 */
function diasDesde(iso: string, agora: number): number {
  return diaLocal(new Date(agora)) - diaLocal(new Date(iso));
}

/** `null` = nunca entrou. Nunca "—", nunca a data de cadastro no lugar. */
function descreverAcesso(iso: string | null, agora: number): string {
  if (!iso) return "nunca entrou";
  const dias = diasDesde(iso, agora);
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

/** Dias sem acessar; `null` (nunca entrou) conta como infinito. */
function diasSemAcesso(iso: string | null, agora: number): number {
  return iso ? diasDesde(iso, agora) : Number.POSITIVE_INFINITY;
}

const DIAS_INATIVO = 30;
const META_CLIENTES = 30;

/** Um filtro da barra: só aparece quando há alguém para filtrar. */
function FiltroCheckbox({
  rotulo,
  total,
  marcado,
  onChange,
}: {
  rotulo: string;
  total: number;
  marcado: boolean;
  onChange: (v: boolean) => void;
}) {
  if (total === 0) return null;
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
      <Checkbox
        checked={marcado}
        onCheckedChange={(v) => onChange(Boolean(v))}
        aria-label={`${rotulo} (${total})`}
      />
      <span className="font-normal leading-none">
        {rotulo} ({total})
      </span>
    </label>
  );
}

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
  const [somenteListou30, setSomenteListou30] = useState(false);
  const [somenteInativos, setSomenteInativos] = useState(false);
  const [termo, setTermo] = useState("");
  const [ordem, setOrdem] = useState<OrdemAlunos>("recentes");

  // "Agora" fixado uma vez por montagem: recalcular a cada render faria a
  // lista mudar de conteúdo sem ninguém ter mexido em nada.
  const [agora] = useState(() => Date.now());

  const totalComPendencia = useMemo(
    () => alunos.filter((a) => (pendenciasPorAluno[a.alunoId] ?? 0) > 0).length,
    [alunos, pendenciasPorAluno],
  );

  const totalListou30 = useMemo(
    () => alunos.filter((a) => a.clientesPreenchidos >= META_CLIENTES).length,
    [alunos],
  );

  const totalInativos = useMemo(
    () =>
      alunos.filter((a) => diasSemAcesso(a.ultimoAcesso, agora) >= DIAS_INATIVO)
        .length,
    [alunos, agora],
  );

  const visiveis = useMemo(() => {
    // Os filtros combinam por AND: marcar dois estreita, nunca alarga.
    const filtrados = alunos.filter((a) => {
      if (somentePendencia && (pendenciasPorAluno[a.alunoId] ?? 0) === 0) {
        return false;
      }
      if (somenteListou30 && a.clientesPreenchidos < META_CLIENTES) return false;
      if (
        somenteInativos &&
        diasSemAcesso(a.ultimoAcesso, agora) < DIAS_INATIVO
      ) {
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

    // Quem não tem data vai SEMPRE para o fim, nas duas direções: ausência de
    // dado não é "o mais antigo" nem "o mais recente".
    const porData = (
      a: string | null,
      b: string | null,
      direcao: "asc" | "desc",
    ): number | null => {
      if (!a && !b) return null;
      if (!a) return 1;
      if (!b) return -1;
      const ta = Date.parse(a);
      const tb = Date.parse(b);
      if (ta === tb) return null;
      return direcao === "asc" ? ta - tb : tb - ta;
    };

    // "recentes" é a ordem em que o array chegou (mais recente primeiro):
    // não reordenar.
    if (ordem === "recentes") return filtrados;

    return [...filtrados].sort((a, b) => {
      if (ordem === "nome") return porNome(a, b);
      if (ordem === "progresso") return b.pct - a.pct || porNome(a, b);
      if (ordem === "tempo_de_casa") {
        // Mais tempo de casa = entrou antes = `desde` crescente.
        return porData(a.desde, b.desde, "asc") ?? porNome(a, b);
      }
      if (ordem === "ultimo_acesso") {
        return porData(a.ultimoAcesso, b.ultimoAcesso, "desc") ?? porNome(a, b);
      }
      return b.clientesPreenchidos - a.clientesPreenchidos || porNome(a, b);
    });
  }, [
    alunos,
    pendenciasPorAluno,
    somentePendencia,
    somenteListou30,
    somenteInativos,
    agora,
    termo,
    ordem,
  ]);

  const buscando = termo.trim().length > 0;
  const filtrosAtivos = [
    somentePendencia ? "com pendência aberta" : null,
    somenteListou30 ? `já listou os ${META_CLIENTES}` : null,
    somenteInativos ? `sem acessar há ${DIAS_INATIVO}+ dias` : null,
  ].filter((f): f is string => f !== null);

  const limparFiltros = () => {
    setSomentePendencia(false);
    setSomenteListou30(false);
    setSomenteInativos(false);
  };

  if (alunos.length === 0) {
    return (
      <EmptyState
        icone={<Users />}
        titulo="Nenhum aluno no programa ainda"
        descricao="Use “Criar acesso”, no topo da página, para colocar o primeiro aluno em implementação assistida."
      />
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
          <SelectTrigger aria-label="Ordenar alunos" className="w-[240px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recentes">Ordenar: mais recentes</SelectItem>
            <SelectItem value="nome">Ordenar: nome</SelectItem>
            <SelectItem value="progresso">Ordenar: progresso</SelectItem>
            <SelectItem value="clientes">Ordenar: clientes</SelectItem>
            <SelectItem value="tempo_de_casa">
              Ordenar: mais tempo de casa
            </SelectItem>
            <SelectItem value="ultimo_acesso">
              Ordenar: acesso mais recente
            </SelectItem>
          </SelectContent>
        </Select>

        <FiltroCheckbox
          rotulo="Só com pendência"
          total={totalComPendencia}
          marcado={somentePendencia}
          onChange={setSomentePendencia}
        />
        <FiltroCheckbox
          rotulo={`Já listou os ${META_CLIENTES}`}
          total={totalListou30}
          marcado={somenteListou30}
          onChange={setSomenteListou30}
        />
        <FiltroCheckbox
          rotulo={`Sem acessar há ${DIAS_INATIVO}+ dias`}
          total={totalInativos}
          marcado={somenteInativos}
          onChange={setSomenteInativos}
        />
      </div>

      <p aria-live="polite" className="text-xs text-muted-foreground">
        Mostrando {visiveis.length} de {alunos.length}
      </p>

      {visiveis.length === 0 ? (
        <EmptyState
          icone={<Search />}
          titulo={
            buscando
              ? `Nenhum aluno para «${termo.trim()}»`
              : filtrosAtivos.length > 0
                ? `Nenhum aluno ${filtrosAtivos.join(" e ")}.`
                : "Nenhum aluno para exibir."
          }
          descricao={
            buscando && filtrosAtivos.length > 0
              ? `A busca foi feita só entre os alunos filtrados por ${filtrosAtivos.join(
                  " e ",
                )}. Limpe os filtros para procurar na lista inteira.`
              : buscando
                ? "Confira a grafia ou procure por parte do e-mail — a busca ignora acentos e a ordem das palavras."
                : undefined
          }
          acao={
            <>
              {buscando ? (
                <Button variant="outline" size="sm" onClick={() => setTermo("")}>
                  Limpar busca
                </Button>
              ) : null}
              {filtrosAtivos.length > 0 ? (
                <Button variant="outline" size="sm" onClick={limparFiltros}>
                  Limpar filtros
                </Button>
              ) : null}
            </>
          }
        />
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
            desde,
            ultimoAcesso,
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
                      <div className="mt-0.5 truncate text-xs text-muted-foreground/80">
                        {desde ? (
                          <>Entrou em {fmtData.format(new Date(desde))} · </>
                        ) : null}
                        {ultimoAcesso ? (
                          <>
                            {desde ? "último" : "Último"} acesso{" "}
                            {/* "há N dias" depende do relógio: o valor do SSR
                                pode cair num dia diferente do da hidratação. */}
                            <span
                              suppressHydrationWarning
                              title={fmtDataHora.format(new Date(ultimoAcesso))}
                            >
                              {descreverAcesso(ultimoAcesso, agora)}
                            </span>
                          </>
                        ) : (
                          <span>{desde ? "nunca entrou" : "Nunca entrou"}</span>
                        )}
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
