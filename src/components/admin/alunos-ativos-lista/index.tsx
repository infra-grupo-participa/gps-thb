"use client";

/**
 * Lista "Alunos ativos" do painel: barra de busca/ordem/filtros, o resumo do
 * lote e os cards.
 *
 * ONDA 3 (09/09/2026) — o arquivo tinha 805 linhas e três assuntos juntos
 * (CD5). Foi cortado POR RESPONSABILIDADE:
 *
 *   aluno-card.tsx       o card de um ambiente
 *   lista-vazia.tsx      o que dizer quando a busca/filtro não acha ninguém
 *   filtro-checkbox.tsx  um interruptor da barra
 *   ordenacao.ts         dias e ordem — sem React, TESTÁVEIS
 *   filtros.ts           o que cada filtro significa e quando ele aparece
 *   estado-na-url.ts     busca/ordem/filtros/aba na URL, com allowlist
 *   ancora.ts            "volte para onde eu parei"
 *   tipos.ts             rótulos e constantes que os outros dividem
 *
 * 🔴 Esta é uma tela SÓ DE ADMIN. `atendimentoPorAluno` carrega trecho de nota
 * do Diário (`gps.aluno_notas`, exclusiva do admin por LGPD, migração
 * 20260908000001). Não reaproveitar este componente em rota de aluno.
 *
 * 🔑 PAGINAÇÃO (migração 20260909000120): `alunos` é um LOTE, não a base. A
 * busca e os filtros continuam varrendo só o que está em memória — por isso o
 * rodapé é OBRIGADO a dizer quantos foram carregados de quantos existem, e o
 * vazio de busca precisa oferecer "Carregar mais".
 *
 * 🔑 PERSISTÊNCIA (10/09/2026): busca, ordem, filtros e aba vivem na **URL**
 * (`estado-na-url.ts`) e "de qual card eu saí" vive numa chave de
 * `sessionStorage` (`ancora.ts`). Recarregar, voltar pelo histórico e mandar o
 * link a um colega devolvem a mesma tela — e voltar do ambiente de um aluno
 * traz de volta o filtro E a posição na lista.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users } from "lucide-react";
import type { AlunoGps, AtendimentoDoAluno } from "@/lib/data";
import { buttonVariants } from "@/components/ui/button";
import { LoteDeAcesso } from "./lote-acesso";
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
import { useAncoraDoPainel } from "./ancora";
import {
  DEFINICAO_DOS_FILTROS,
  filtrarAlunos,
  fraseDoFiltro,
  type ContextoDoFiltro,
} from "./filtros";
import { FILTROS, useEstadoDoPainel, type FiltroId } from "./estado-na-url";
import { ordenarAlunos } from "./ordenacao";
import { ORDENS, ROTULO_ORDEM, SEM_ATENDIMENTO, type OrdemAlunos } from "./tipos";

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
   * sem nota nenhuma simplesmente não aparece no mapa.
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
  const {
    estado,
    alternarFiltro,
    limparFiltros,
    definirTermo,
    definirOrdem,
    hrefComEstado,
  } = useEstadoDoPainel();

  // O href do próximo lote é montado no servidor e não conhece o filtro que o
  // admin marcou aqui. Costurar o estado nele é o que impede "Mostrar mais" de
  // devolver a lista sem filtro nenhum.
  const hrefMais = carregarMaisHref ? hrefComEstado(carregarMaisHref) : null;

  // "Agora" fixado uma vez por montagem: recalcular a cada render faria a
  // lista mudar de conteúdo sem ninguém ter mexido em nada.
  const [agora] = useState(() => Date.now());

  /** Nunca `undefined`: o card sempre tem o que ler, sem `?.` espalhado. */
  const atendimentoDe = (alunoId: string): AtendimentoDoAluno =>
    atendimentoPorAluno[alunoId] ?? SEM_ATENDIMENTO;

  const ctx: ContextoDoFiltro = useMemo(
    () => ({
      atendimento: (id) => atendimentoPorAluno[id] ?? SEM_ATENDIMENTO,
      agora,
    }),
    [atendimentoPorAluno, agora],
  );

  /**
   * Um passe só pela lista: para cada filtro DISPONÍVEL, quantos ele pega.
   * Antes era um `useMemo` por filtro — seis varreduras da mesma lista para
   * seis números que saem da mesma passada.
   *
   * 🔴 Um filtro **marcado** aparece sempre, mesmo quando `disponivel` diz
   * não. Os links do dashboard levam a filtros que hoje não separam ninguém
   * (`?f=onb_ok` com a base inteira em "não iniciado"): sem esta linha, o
   * admin chegaria numa lista vazia com um interruptor invisível e sem jeito
   * de desligá-lo pelo chip.
   */
  const chips = useMemo(
    () =>
      FILTROS.filter(
        (id) =>
          DEFINICAO_DOS_FILTROS[id].disponivel(alunos) || estado.filtros.has(id),
      ).map((id) => ({
        id,
        rotulo: DEFINICAO_DOS_FILTROS[id].rotulo,
        total: alunos.filter((a) => DEFINICAO_DOS_FILTROS[id].predicado(a, ctx))
          .length,
      })),
    [alunos, ctx, estado.filtros],
  );

  const visiveis = useMemo(
    () =>
      ordenarAlunos(
        filtrarAlunos(
          alunos,
          { filtros: estado.filtros, termo: estado.termo },
          ctx,
        ),
        estado.ordem,
        atendimentoPorAluno,
      ),
    [alunos, atendimentoPorAluno, ctx, estado.filtros, estado.termo, estado.ordem],
  );

  // Roda DEPOIS de `visiveis` já estar no DOM: é essa a condição que salvar
  // `scrollY` nunca conseguia satisfazer numa lista filtrada no cliente.
  useAncoraDoPainel();

  /**
   * Seleção em lote — só existe com o filtro "sem login" ligado.
   *
   * 🔑 O checkbox aparece exatamente onde a ação existe. "Criar acesso" não
   * faz sentido para quem já tem login, e uma caixa de seleção em 158 cards
   * que não leva a lugar nenhum é ruído — a lição do chip de filtro que não
   * separa ninguém.
   *
   * 🔴 **A seleção é sempre a INTERSEÇÃO com o que está na tela.** `marcados`
   * guarda ids; quem manda é `visiveis.filter(...)`. Sem isso, marcar cinco
   * pessoas e depois digitar na busca deixaria o botão agindo sobre gente que
   * o admin não está mais vendo — criar acesso para quem ninguém olhou é o
   * erro que este lote não pode cometer. (E é por ser derivado que não existe
   * `useEffect` limpando estado aqui: efeito que chama `setState` no corpo
   * dispara renderização em cascata e some com a seleção em casos que ninguém
   * previu.)
   */
  const emLote = estado.filtros.has("sem_login");
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set());

  const selecionados = useMemo(
    () => visiveis.filter((a) => marcados.has(a.alunoId)),
    [visiveis, marcados],
  );

  const buscando = estado.termo.trim().length > 0;
  const filtrosAtivos = [...estado.filtros].map(fraseDoFiltro);

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
          lista). */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            id="busca-alunos"
            type="search"
            value={estado.termo}
            onChange={(e) => definirTermo(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar aluno por nome ou e-mail"
            className="pl-8"
          />
        </div>

        <Select
          value={estado.ordem}
          onValueChange={(v) => v && definirOrdem(v as OrdemAlunos)}
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
        {chips.map((c) => (
          <FiltroCheckbox
            key={c.id}
            rotulo={c.rotulo}
            total={c.total}
            marcado={estado.filtros.has(c.id)}
            onChange={(v) => alternarFiltro(c.id as FiltroId, v)}
          />
        ))}
      </div>

      {emLote ? (
        <LoteDeAcesso
          selecionados={selecionados}
          candidatos={visiveis}
          onLimpar={() => setMarcados(new Set())}
          onSelecionarAte={(n) =>
            setMarcados(new Set(visiveis.slice(0, n).map((a) => a.alunoId)))
          }
        />
      ) : null}

      <p aria-live="polite" className="text-xs text-muted-foreground">
        Mostrando {visiveis.length} de {alunos.length}
        {parcial ? (
          <>
            {" "}
            carregados · {total} no programa. A busca e os filtros valem só
            sobre os {alunos.length} carregados.
            {/* Teto batido e nada mais para carregar: dizer isso é o mínimo.
                Sem esta frase o admin veria "de 1.250" sem botão e concluiria
                que a tela quebrou. */}
            {carregarMaisHref === null ? (
              <> Este é o teto do painel; para achar quem ficou de fora, a
              busca precisará passar a rodar no servidor.</>
            ) : null}
          </>
        ) : null}
      </p>

      {visiveis.length === 0 ? (
        <ListaVazia
          termo={estado.termo}
          buscando={buscando}
          filtrosAtivos={filtrosAtivos}
          setTermo={definirTermo}
          limparFiltros={limparFiltros}
          carregarMaisHref={hrefMais}
          carregarMaisQtd={carregarMaisQtd}
        />
      ) : (
        visiveis.map((a) => (
          <AlunoCard
            key={a.alunoId}
            {...a}
            atendimentoDe={atendimentoDe}
            agora={agora}
            selecao={
              emLote
                ? {
                    marcado: marcados.has(a.alunoId),
                    onChange: (v) =>
                      setMarcados((s) => {
                        const novo = new Set(s);
                        if (v) novo.add(a.alunoId);
                        else novo.delete(a.alunoId);
                        return novo;
                      }),
                  }
                : undefined
            }
          />
        ))
      )}

      {/* "Mostrar mais" é NAVEGAÇÃO, não estado de cliente: o lote é decidido
          no servidor (`?mais=`), então voltar pelo histórico ou recarregar
          devolve a mesma tela. `scroll={false}` mantém o admin onde ele
          estava; `prefetch={false}` evita que só passar o mouse dispare a
          consulta agregada do painel. */}
      {hrefMais ? (
        <div className="flex justify-center pt-2">
          <Link
            href={hrefMais}
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
