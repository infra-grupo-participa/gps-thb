"use client";

/**
 * Lista "Alunos ativos" do painel: barra de busca/ordem/filtros, o resumo do
 * lote e os cards.
 *
 * ONDA 3 (09/09/2026) — o arquivo tinha 805 linhas e três assuntos juntos
 * (CD5). Foi cortado POR RESPONSABILIDADE, sem uma linha de lógica nova:
 *
 *   aluno-card.tsx       o card de um ambiente
 *   lista-vazia.tsx      o que dizer quando a busca/filtro não acha ninguém
 *   filtro-checkbox.tsx  um interruptor da barra
 *   ordenacao.ts         dias, filtro e ordem — sem React, TESTÁVEIS
 *   tipos.ts             rótulos e constantes que os quatro dividem
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
 *
 * Recebe os dados já carregados pelo Server Component (uma query no
 * `Promise.all` de `admin/page.tsx`) — busca, ordenação e filtro acontecem em
 * memória, sobre o array recebido, sem segunda ida ao banco.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import type { AlunoGps, AtendimentoDoAluno } from "@/lib/data";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlunoCard } from "./aluno-card";
import { FiltroCheckbox } from "./filtro-checkbox";
import { ListaVazia } from "./lista-vazia";
import { filtrarAlunos, notaRecente, ordenarAlunos, diasSemAcesso } from "./ordenacao";
import {
  DIAS_INATIVO,
  DIAS_NOTA_RECENTE,
  META_CLIENTES,
  ORDENS,
  ROTULO_ORDEM,
  SEM_ATENDIMENTO,
  type OrdemAlunos,
} from "./tipos";

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

  const visiveis = useMemo(
    () =>
      ordenarAlunos(
        filtrarAlunos(
          alunos,
          atendimentoPorAluno,
          {
            somentePendencia,
            somenteListou30,
            somenteInativos,
            somenteNotaRecente,
            somenteSemNota,
            somenteChamado,
            termo,
          },
          agora,
        ),
        ordem,
        atendimentoPorAluno,
      ),
    [
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
    ],
  );

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
      {/* Duas fileiras, não uma sopa: em cima a BUSCA e a ORDEM (o que muda a
          leitura da lista inteira); embaixo os FILTROS (o que tira gente da
          lista). Antes eram seis caixas de seleção nuas espalhadas com a busca
          e o select em duas linhas, e a barra parecia formulário. */}
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

      </div>

      <div className="flex flex-wrap items-center gap-2">
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
        <ListaVazia
          termo={termo}
          buscando={buscando}
          filtrosAtivos={filtrosAtivos}
          setTermo={setTermo}
          limparFiltros={limparFiltros}
          carregarMaisHref={carregarMaisHref}
          carregarMaisQtd={carregarMaisQtd}
        />
      ) : (
        visiveis.map((a) => (
          <AlunoCard
            key={a.alunoId}
            {...a}
            atendimentoDe={atendimentoDe}
            agora={agora}
          />
        ))
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
