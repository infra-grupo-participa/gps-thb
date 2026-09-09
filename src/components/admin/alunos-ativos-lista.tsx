"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, LifeBuoy, Search, Users } from "lucide-react";
import type { AlunoGps, AtendimentoDoAluno } from "@/lib/data";
import { casaTodosOsTermos, semAcento } from "@/lib/texto";
import { ROTULO_TIPO } from "@/components/admin/diario-labels";
import { FUSO, formatarDataHora, formatarData } from "@/lib/datas";
import { brl, brlCompacto } from "@/lib/moeda";
import { NotaRapida } from "@/components/admin/nota-rapida";
import { Button, buttonVariants } from "@/components/ui/button";
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
  | "ultimo_acesso"
  | "nota_recente"
  | "honorarios";

/**
 * Rótulo de cada ordenação. Existe porque `SelectValue` do Base UI mostra o
 * VALOR selecionado, não o texto do `SelectItem`: sem este mapa (e sem a função
 * passada ao `SelectValue`), o gatilho fechado exibia "recentes"/"ultimo_acesso"
 * — código cru, em inglês misturado, na cara do usuário.
 */
const ROTULO_ORDEM: Record<OrdemAlunos, string> = {
  recentes: "mais recentes",
  nome: "nome",
  progresso: "progresso",
  clientes: "clientes",
  tempo_de_casa: "mais tempo de casa",
  ultimo_acesso: "acesso mais recente",
  nota_recente: "nota mais recente",
  honorarios: "honorários",
};

const ORDENS: OrdemAlunos[] = [
  "recentes",
  "nome",
  "progresso",
  "clientes",
  "tempo_de_casa",
  "ultimo_acesso",
  "nota_recente",
  "honorarios",
];

/** "YYYY-MM-DD" no fuso de Brasília — base para contar dias de CALENDÁRIO.
 *
 * Cliente e servidor formatam no MESMO fuso (`FUSO`, de `@/lib/datas`): sem
 * isto o SSR (UTC) e o navegador (BRT) divergem em toda data depois das 21h e
 * a hidratação quebra. */
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

/**
 * O que o card mostra na coluna de honorários — e o que ele DIZ.
 *
 * 🔑 As colunas nasceram NULL (migração ...090). "R$ 0,00" aqui seria uma
 * afirmação sobre o faturamento de gente real feita em cima de campo recém
 * criado. Por isso ausência é sempre "—", e o `title`/`sr-only` explica QUAL
 * ausência: nenhum contratado, ou contratado sem valor registrado.
 */
function honorariosDoCard(
  total: number | null,
  contratados: number,
  semValor: number,
): { visual: string; descricao: string } {
  if (contratados === 0) {
    return { visual: "—", descricao: "Nenhum cliente contratado" };
  }
  const plural = contratados === 1 ? "contratado" : "contratados";
  if (total === null) {
    return {
      visual: "—",
      descricao: `${contratados} ${plural}, nenhum com honorários registrados`,
    };
  }
  const base = `${brl(total)} em ${contratados} ${plural}`;
  return {
    // Compacto ("R$ 42 mil") é número de COMPARAÇÃO — o exato vai no `title`
    // e no texto do leitor de tela, logo abaixo.
    visual: brlCompacto(total),
    descricao:
      semValor > 0
        ? `${base} · ${semValor} ainda sem valor registrado`
        : base,
  };
}

const DIAS_INATIVO = 30;
const META_CLIENTES = 30;
/** Janela do filtro "com nota nos últimos N dias" — dias de CALENDÁRIO. */
const DIAS_NOTA_RECENTE = 7;

/** Trecho vindo do banco (`left(texto,140)`). Ver `AtendimentoDoAluno`. */
const TAMANHO_RESUMO = 140;

const SEM_ATENDIMENTO: AtendimentoDoAluno = {
  pendenciasAbertas: 0,
  ultimaNotaEm: null,
  ultimaNotaTipo: null,
  ultimaNotaResumo: null,

  chamadosAbertos: 0,
};

/** Nota escrita nos últimos 7 dias de CALENDÁRIO. Sem nota nenhuma = `false`. */
function notaRecente(iso: string | null | undefined, agora: number): boolean {
  return iso ? diasDesde(iso, agora) <= DIAS_NOTA_RECENTE : false;
}

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
 * Lista "Alunos ativos" com busca, ordenação, resumo do Diário no card e
 * filtros. Recebe os dados já carregados pelo Server Component (uma query no
 * `Promise.all` de `admin/page.tsx`) — busca, ordenação e filtro acontecem em
 * memória, sobre o array recebido, sem segunda ida ao banco.
 *
 * 🔴 Esta é uma tela SÓ DE ADMIN. `atendimentoPorAluno` carrega trecho de nota
 * do Diário (`gps.aluno_notas`, exclusiva do admin por LGPD — migração
 * 20260908000001). Não reaproveitar este componente em rota de aluno.
 *
 * 🔑 PAGINAÇÃO (migração 20260909000120): `alunos` é um LOTE, não a base. A
 * busca e os filtros continuam varrendo só o que está em memória — por isso o
 * rodapé é OBRIGADO a dizer quantos foram carregados de quantos existem, e o
 * vazio de busca precisa oferecer "Carregar mais". Sem isso, "nenhum aluno
 * para «Silva»" seria falso para quem está no lote seguinte.
 */
export function AlunosAtivosLista({
  alunos,
  atendimentoPorAluno,
  total,
  carregarMaisHref,
  carregarMaisQtd,
}: {
  alunos: AlunoGps[];
  /**
   * `alunoId` → resumo do Diário (pendências abertas + última nota). Ambiente
   * sem nenhuma nota simplesmente não aparece no mapa.
   */
  atendimentoPorAluno: Record<string, AtendimentoDoAluno>;
  /** Total de ambientes no GPS (`total_ambientes` da RPC), não o do lote. */
  total: number;
  /** URL do próximo lote, ou `null` quando tudo já está na tela. */
  carregarMaisHref: string | null;
  /** Quantos ambientes o próximo lote acrescenta. Só vale com o href acima. */
  carregarMaisQtd: number;
}) {
  // `alunos.length` é o lote carregado; `total`, o universo. Toda frase da
  // tela tem de deixar claro qual dos dois está falando.
  const parcial = alunos.length < total;
  const [somentePendencia, setSomentePendencia] = useState(false);
  const [somenteListou30, setSomenteListou30] = useState(false);
  const [somenteInativos, setSomenteInativos] = useState(false);
  const [somenteNotaRecente, setSomenteNotaRecente] = useState(false);
  const [somenteSemNota, setSomenteSemNota] = useState(false);
  /** PL5 — chamado aberto era invisível no painel, com o dado já na tela. */
  const [somenteChamado, setSomenteChamado] = useState(false);
  const [termo, setTermo] = useState("");
  const [ordem, setOrdem] = useState<OrdemAlunos>("recentes");

  // "Agora" fixado uma vez por montagem: recalcular a cada render faria a
  // lista mudar de conteúdo sem ninguém ter mexido em nada.
  const [agora] = useState(() => Date.now());

  /** Nunca `undefined`: o card sempre tem o que ler, sem `?.` espalhado. */
  const atendimentoDe = (alunoId: string): AtendimentoDoAluno =>
    atendimentoPorAluno[alunoId] ?? SEM_ATENDIMENTO;

  const totalComPendencia = useMemo(
    () =>
      alunos.filter(
        (a) => (atendimentoPorAluno[a.alunoId]?.pendenciasAbertas ?? 0) > 0,
      ).length,
    [alunos, atendimentoPorAluno],
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

  const totalNotaRecente = useMemo(
    () =>
      alunos.filter((a) =>
        notaRecente(atendimentoPorAluno[a.alunoId]?.ultimaNotaEm, agora),
      ).length,
    [alunos, atendimentoPorAluno, agora],
  );

  const totalSemNota = useMemo(
    () =>
      alunos.filter((a) => !atendimentoPorAluno[a.alunoId]?.ultimaNotaEm).length,
    [alunos, atendimentoPorAluno],
  );

  const totalComChamado = useMemo(
    () =>
      alunos.filter(
        (a) => (atendimentoPorAluno[a.alunoId]?.chamadosAbertos ?? 0) > 0,
      ).length,
    [alunos, atendimentoPorAluno],
  );

  const visiveis = useMemo(() => {
    // Os filtros combinam por AND: marcar dois estreita, nunca alarga.
    const filtrados = alunos.filter((a) => {
      if (
        somentePendencia &&
        (atendimentoPorAluno[a.alunoId]?.pendenciasAbertas ?? 0) === 0
      ) {
        return false;
      }
      if (somenteListou30 && a.clientesPreenchidos < META_CLIENTES) return false;
      if (
        somenteInativos &&
        diasSemAcesso(a.ultimoAcesso, agora) < DIAS_INATIVO
      ) {
        return false;
      }
      if (
        somenteNotaRecente &&
        !notaRecente(atendimentoPorAluno[a.alunoId]?.ultimaNotaEm, agora)
      ) {
        return false;
      }
      if (somenteSemNota && atendimentoPorAluno[a.alunoId]?.ultimaNotaEm) {
        return false;
      }
      if (
        somenteChamado &&
        (atendimentoPorAluno[a.alunoId]?.chamadosAbertos ?? 0) === 0
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
      if (ordem === "honorarios") {
        // Maior primeiro; quem não tem valor vai SEMPRE para o fim (não é
        // "R$ 0", é ausência de dado). Desempate por nome, como nas demais.
        const va = a.honorariosContratados;
        const vb = b.honorariosContratados;
        if (va == null && vb == null) return porNome(a, b);
        if (va == null) return 1;
        if (vb == null) return -1;
        return vb - va || porNome(a, b);
      }
      if (ordem === "nota_recente") {
        // Quem não tem nota vai para o fim — é o mesmo `porData`, então
        // "sem nota" nunca se disfarça de "nota antiquíssima".
        return (
          porData(
            atendimentoPorAluno[a.alunoId]?.ultimaNotaEm ?? null,
            atendimentoPorAluno[b.alunoId]?.ultimaNotaEm ?? null,
            "desc",
          ) ?? porNome(a, b)
        );
      }
      return b.clientesPreenchidos - a.clientesPreenchidos || porNome(a, b);
    });
  }, [
    alunos,
    atendimentoPorAluno,
    somentePendencia,
    somenteListou30,
    somenteInativos,
    somenteNotaRecente,
    somenteSemNota,
    somenteChamado,
    agora,
    termo,
    ordem,
  ]);

  const buscando = termo.trim().length > 0;
  const filtrosAtivos = [
    somentePendencia ? "com pendência aberta" : null,
    somenteListou30 ? `já listou os ${META_CLIENTES}` : null,
    somenteInativos ? `sem acessar há ${DIAS_INATIVO}+ dias` : null,
    somenteNotaRecente ? `com nota nos últimos ${DIAS_NOTA_RECENTE} dias` : null,
    somenteSemNota ? "sem nenhuma nota" : null,
    somenteChamado ? "com chamado aberto" : null,
  ].filter((f): f is string => f !== null);

  const limparFiltros = () => {
    setSomentePendencia(false);
    setSomenteListou30(false);
    setSomenteInativos(false);
    setSomenteNotaRecente(false);
    setSomenteSemNota(false);
    setSomenteChamado(false);
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
            <SelectValue>
              {(v: OrdemAlunos) => `Ordenar: ${ROTULO_ORDEM[v]}`}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ORDENS.map((o) => (
              <SelectItem key={o} value={o}>
                Ordenar: {ROTULO_ORDEM[o]}
              </SelectItem>
            ))}
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
        <FiltroCheckbox
          rotulo={`Com nota nos últimos ${DIAS_NOTA_RECENTE} dias`}
          total={totalNotaRecente}
          marcado={somenteNotaRecente}
          onChange={setSomenteNotaRecente}
        />
        <FiltroCheckbox
          rotulo="Sem nenhuma nota"
          total={totalSemNota}
          marcado={somenteSemNota}
          onChange={setSomenteSemNota}
        />
        <FiltroCheckbox
          rotulo="Com chamado aberto"
          total={totalComChamado}
          marcado={somenteChamado}
          onChange={setSomenteChamado}
        />
      </div>

      <p aria-live="polite" className="text-xs text-muted-foreground">
        Mostrando {visiveis.length} de {alunos.length}
        {parcial ? (
          <>
            {" "}
            carregados · {total} no programa. A busca e os filtros valem só
            sobre os {alunos.length} carregados.
            {/* Teto batido e nada mais para carregar: dizer isso é o mínimo.
                Sem esta frase o admin veria "de 1.250" sem botão e concluiria
                que a tela quebrou. É também o sinal de que a busca precisa ir
                para o servidor (Leitura B do bloqueio 2) — hoje são 125
                ambientes e este caminho não acontece. */}
            {carregarMaisHref === null ? (
              <> Este é o teto do painel; para achar quem ficou de fora, a
              busca precisará passar a rodar no servidor.</>
            ) : null}
          </>
        ) : null}
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
              {/* Aqui o botão importa mais do que no fim da lista: quem
                  buscou e não achou precisa saber que ainda há gente fora do
                  lote carregado. */}
              {carregarMaisHref ? (
                <Link
                  href={carregarMaisHref}
                  scroll={false}
                  prefetch={false}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  Carregar mais {carregarMaisQtd}
                </Link>
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
            clientesComDados,
            agendados,
            honorariosContratados,
            contratados,
            contratadosSemValor,
            desde,
            ultimoAcesso,
          }) => {
            const atendimento = atendimentoDe(alunoId);
            const honorarios = honorariosDoCard(
              honorariosContratados,
              contratados,
              contratadosSemValor,
            );
            const pendencias = atendimento.pendenciasAbertas;
            const chamados = atendimento.chamadosAbertos;
            const nome = aluno?.nome ?? "Aluno sem nome";
            return (
              // O card NÃO é mais um `<Link>` por fora: botão dentro de link é
              // HTML inválido, some do Tab e o clique navega em vez de abrir o
              // diálogo. O link virou uma camada absoluta atrás do conteúdo
              // (`z-0`), e todo controle sobe para `z-10` — sem
              // `stopPropagation`, o empilhamento resolve.
              <Card
                key={alunoId}
                className="relative transition hover:border-primary/50 hover:shadow-sm"
              >
                <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                  {/* Foco por `outline` com deslocamento NEGATIVO, não por
                      `ring`: o link ocupa exatamente a caixa do `Card`, que é
                      `overflow-hidden` — um anel desenhado para FORA da caixa
                      é recortado por inteiro e o teclado navega às cegas.
                      Medido no navegador: com `focus-visible:ring-3` não
                      aparecia um pixel. */}
                  <Link
                    href={`/admin/aluno/${alunoId}`}
                    aria-label={`Abrir o ambiente de ${nome}`}
                    className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium">{nome}</span>
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
                        <Badge
                          variant="destructive"
                          className="gap-1 text-[10px]"
                        >
                          <AlertCircle className="size-3" aria-hidden />
                          {pendencias}{" "}
                          {pendencias === 1 ? "pendência" : "pendências"}
                        </Badge>
                      ) : null}
                      {/* PL5 — `chamadosAbertos` já vinha na RPC de
                          atendimento e não aparecia em lugar nenhum: sem a
                          lista de e-mails da equipe preenchida, um chamado
                          novo não avisava ninguém E não era visível. Zero
                          consulta nova — é o mesmo Map do badge acima. */}
                      {chamados > 0 ? (
                        <Badge
                          variant="destructive"
                          className="gap-1 text-[10px]"
                        >
                          <LifeBuoy className="size-3" aria-hidden />
                          {chamados}{" "}
                          {chamados === 1 ? "chamado aberto" : "chamados abertos"}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {aluno?.email}
                    </div>

                    {/* Última nota do Diário — o trecho vem cortado do BANCO
                        (`left(texto,140)`); aqui nunca se corta de novo nem se
                        remonta a nota inteira. O `title` repete o MESMO trecho:
                        inventar tooltip com texto que não veio seria mentir. */}
                    <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs">
                      {atendimento.ultimaNotaEm ? (
                        <>
                          {atendimento.ultimaNotaTipo ? (
                            // Sempre `outline`: daqui não dá para saber se uma
                            // "pendência" já foi resolvida, e pintar de vermelho
                            // uma nota resolvida contradiria o badge de
                            // pendências abertas ao lado.
                            <Badge
                              variant="outline"
                              className="shrink-0 text-[10px]"
                            >
                              {ROTULO_TIPO[atendimento.ultimaNotaTipo]}
                            </Badge>
                          ) : null}
                          <span
                            className="truncate text-muted-foreground"
                            title={atendimento.ultimaNotaResumo ?? undefined}
                          >
                            {atendimento.ultimaNotaResumo}
                            {(atendimento.ultimaNotaResumo?.length ?? 0) >=
                            TAMANHO_RESUMO
                              ? "…"
                              : null}
                          </span>
                          <span className="shrink-0 text-muted-foreground/80">
                            · {formatarDataHora(atendimento.ultimaNotaEm)}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">
                          Sem nota no Diário
                        </span>
                      )}
                    </div>

                    <div className="mt-0.5 truncate text-xs text-muted-foreground/80">
                      {desde ? (
                        <>Entrou em {formatarData(desde)} · </>
                      ) : null}
                      {ultimoAcesso ? (
                        <>
                          {desde ? "último" : "Último"} acesso{" "}
                          {/* "há N dias" depende do relógio: o valor do SSR
                              pode cair num dia diferente do da hidratação. */}
                          <span
                            suppressHydrationWarning
                            title={formatarDataHora(ultimoAcesso)}
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
                    {/* PL3 — o número principal é `clientesComDados` (nome +
                        telefone + nível), que é o que a tarefa 1 cobra e o que
                        a home do aluno mostra. Exibir `clientesPreenchidos`
                        aqui deixava o admin lendo 30/30 enquanto o aluno via
                        cadeado na mesma etapa. O total apenas listado continua
                        visível, ao lado, para a diferença não sumir. */}
                    <div className="text-center">
                      <div className="text-sm font-semibold tabular-nums">
                        {clientesComDados}/{META_CLIENTES}
                      </div>
                      <div className="text-[10px] uppercase text-muted-foreground">
                        <span aria-hidden>
                          completos · {clientesPreenchidos} listados
                        </span>
                        <span className="sr-only">
                          {clientesComDados} clientes com nome, telefone e nível
                          ·{" "}
                          {clientesPreenchidos} listados no total
                        </span>
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-sm font-semibold">{agendados}/15</div>
                      <div className="text-[10px] uppercase text-muted-foreground">
                        reuniões
                      </div>
                    </div>
                    <div className="text-center">
                      <div
                        className="text-sm font-semibold tabular-nums"
                        title={honorarios.descricao}
                      >
                        <span aria-hidden>{honorarios.visual}</span>
                        <span className="sr-only">{honorarios.descricao}</span>
                      </div>
                      <div className="text-[10px] uppercase text-muted-foreground">
                        honorários
                      </div>
                    </div>
                    <div className="w-32">
                      <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
                        <span>Etapa 01</span>
                        <span>{pct}%</span>
                      </div>
                      <Progress value={pct} />
                    </div>
                    {/* `relative z-10`: sobe acima da camada do link, senão o
                        clique abriria o ambiente em vez do diálogo. */}
                    <div className="relative z-10">
                      <NotaRapida alunoId={alunoId} nomeDoAluno={nome} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          },
        )
      )}

      {/* "Mostrar mais" é NAVEGAÇÃO, não estado de cliente: o lote é decidido
          no servidor (`?mais=`), então voltar pelo histórico ou recarregar
          devolve a mesma tela. `scroll={false}` mantém o admin onde ele
          estava; `prefetch={false}` evita que só passar o mouse dispare a
          consulta agregada do painel. */}
      {carregarMaisHref ? (
        <div className="flex justify-center pt-2">
          <Link
            href={carregarMaisHref}
            scroll={false}
            prefetch={false}
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Mostrar mais {carregarMaisQtd}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
