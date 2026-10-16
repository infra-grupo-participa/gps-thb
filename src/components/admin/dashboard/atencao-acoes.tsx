"use client";

/**
 * **Precisa de atenção — painel de AÇÃO** (João, 16/10/2026).
 *
 * Quatro cards com o PERCENTUAL da base inteira; clicar num card abre a lista
 * de quem está nele logo abaixo (sem ir para outra tela procurar); clicar num
 * parceiro abre o painel dele: contato, favorito (fase, estágio, própria
 * holding), situação da agenda, chamados e a próxima ação sugerida.
 *
 * Dois botões de extração para a rotina da equipe:
 *   · **CSV** (Excel) do grupo aberto, com telefone — fica com a equipe;
 *   · **Relatório** (Markdown) da base inteira, para colar no Claude e cruzar
 *     com o que foi conversado fora do sistema. Sem telefone.
 *
 * Tudo o que se DECIDE sobre uma linha mora em `@/lib/atencao-acoes` (puro e
 * testado). Este arquivo só desenha. Dados chegam por prop do servidor
 * (`gps.admin_atencao_acoes`, …392); trocar de card não busca nada.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { Download, FileText, Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { montarCsv, nomeDoArquivo } from "@/lib/csv";
import { formatarDataHora, formatarHaQuanto } from "@/lib/datas";
import {
  COLUNAS_EXPORTACAO,
  GRUPOS_ATENCAO,
  ROTULO_ESTAGIO,
  SITUACOES,
  ehPropriaHolding,
  estaNoGrupo,
  estagioDoFavorito,
  exportarLinha,
  montarRelatorio,
  percentual,
  proximaAcao,
  rotuloFase,
  rotuloGrau,
  rotuloSituacao,
  situacaoDe,
  type GrupoAtencao,
  type LinhaAtencao,
  type Situacao,
} from "@/lib/atencao-acoes";
import { cn } from "@/lib/utils";

function baixar(conteudo: string, tipo: string, nome: string) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  // Revogar no próximo tick: antes do clique processar cancela o download.
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 0);
}

/** "11 99999-0000" → link do WhatsApp com DDI 55 quando faltar. */
function linkWhatsApp(telefone: string | null): string | null {
  const d = (telefone ?? "").replace(/\D/g, "");
  if (d.length < 10) return null;
  return `https://wa.me/${d.startsWith("55") && d.length >= 12 ? d : `55${d}`}`;
}

export function AtencaoAcoes({
  linhas,
  agora,
  apuradoEm,
}: {
  linhas: LinhaAtencao[];
  /** `Date.now()` do SERVIDOR: a mesma conta no servidor e na hidratação. */
  agora: number;
  /** Já formatado no servidor (fuso de São Paulo). */
  apuradoEm: string;
}) {
  const [grupo, setGrupo] = useState<GrupoAtencao>("sem_cliente");
  const [situacao, setSituacao] = useState<Situacao | null>(null);
  const [aberto, setAberto] = useState<LinhaAtencao | null>(null);
  const [copiado, setCopiado] = useState(false);

  const total = linhas.length;
  const contagem = useMemo(
    () =>
      Object.fromEntries(
        GRUPOS_ATENCAO.map((g) => [g.id, linhas.filter((l) => estaNoGrupo(l, g.id)).length]),
      ) as Record<GrupoAtencao, number>,
    [linhas],
  );

  const doGrupo = useMemo(
    () => linhas.filter((l) => estaNoGrupo(l, grupo)),
    [linhas, grupo],
  );
  const situacoesDoGrupo = useMemo(() => {
    const m = new Map<Situacao, number>();
    for (const l of doGrupo) {
      if (!l.favorito) continue;
      const s = situacaoDe(l, agora);
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return m;
  }, [doGrupo, agora]);
  const visiveis = situacao
    ? doGrupo.filter((l) => l.favorito && situacaoDe(l, agora) === situacao)
    : doGrupo;

  const grupoAtual = GRUPOS_ATENCAO.find((g) => g.id === grupo)!;

  function escolherGrupo(g: GrupoAtencao) {
    setGrupo(g);
    setSituacao(null);
  }

  function exportarCsv() {
    const csv = montarCsv(
      visiveis.map((l) => exportarLinha(l, agora)),
      COLUNAS_EXPORTACAO.map((c) => ({ cabecalho: c.cabecalho, valor: (e) => e[c.chave] })),
    );
    baixar(
      csv,
      "text/csv;charset=utf-8;",
      nomeDoArquivo(`atencao-${grupo}${situacao ? `-${situacao}` : ""}-${visiveis.length}`),
    );
  }

  function relatorio(): string {
    return montarRelatorio(linhas, agora, apuradoEm);
  }

  async function copiarRelatorio() {
    try {
      await navigator.clipboard.writeText(relatorio());
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Sem permissão de área de transferência: cai para o download.
      baixar(relatorio(), "text/markdown;charset=utf-8;", nomeDoArquivo("relatorio-acoes", "md"));
    }
  }

  return (
    <section aria-labelledby="atencao-acoes" className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-borda-fina pb-1">
        <div className="flex items-baseline gap-3">
          <h3 id="atencao-acoes" className="rotulo text-foreground">
            Onde agir
          </h3>
          <p className="corpo-sm text-muted-foreground">de {total} parceiros</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={copiarRelatorio}>
            {copiado ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copiado ? "Relatório copiado" : "Copiar relatório"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              baixar(relatorio(), "text/markdown;charset=utf-8;", nomeDoArquivo("relatorio-acoes", "md"))
            }
          >
            <FileText aria-hidden />
            Baixar relatório
          </Button>
        </div>
      </div>

      {/* Os 4 cards. `aria-pressed`: são filtros da lista abaixo, não links. */}
      <div role="group" aria-label="Grupos para ação" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
        {GRUPOS_ATENCAO.map((g) => {
          const n = contagem[g.id];
          const ativo = g.id === grupo;
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={ativo}
              onClick={() => escolherGrupo(g.id)}
              className={cn(
                "foco-visivel grid content-start gap-1 rounded-lg border px-4 py-3 text-left transition-colors",
                ativo
                  ? "border-accent bg-superficie-afundada"
                  : "border-borda-fina hover:bg-superficie-afundada",
              )}
            >
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="numero numero-lg font-semibold tabular-nums">
                  {percentual(n, total)}%
                </span>
                <span className="corpo-sm tabular-nums text-muted-foreground">{n} parceiros</span>
              </span>
              <span className="corpo-sm font-medium text-foreground">{g.rotulo}</span>
              <span className="corpo-sm text-muted-foreground">{g.regra}</span>
            </button>
          );
        })}
      </div>

      {/* A lista do card escolhido. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-3 rounded-lg border border-borda-fina px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="corpo font-medium text-foreground">
            {grupoAtual.rotulo}{" "}
            <span className="tabular-nums text-muted-foreground">({visiveis.length})</span>
          </h4>
          <Button variant="outline" size="sm" onClick={exportarCsv} disabled={visiveis.length === 0}>
            <Download aria-hidden />
            Exportar esta lista (CSV)
          </Button>
        </div>

        {/* Situação da agenda — só para quem tem favorito no grupo. */}
        {situacoesDoGrupo.size > 0 ? (
          <div role="group" aria-label="Filtrar pela situação da agenda" className="flex flex-wrap gap-1.5">
            <ChipSituacao ativo={situacao === null} onClick={() => setSituacao(null)}>
              Todas
            </ChipSituacao>
            {SITUACOES.filter((s) => situacoesDoGrupo.has(s.id)).map((s) => (
              <ChipSituacao
                key={s.id}
                ativo={situacao === s.id}
                destaque={s.daEquipe}
                onClick={() => setSituacao(s.id)}
              >
                {s.rotulo} <span className="tabular-nums">{situacoesDoGrupo.get(s.id)}</span>
              </ChipSituacao>
            ))}
          </div>
        ) : null}

        {visiveis.length === 0 ? (
          <p className="corpo-sm text-muted-foreground">Ninguém neste grupo agora.</p>
        ) : (
          <ul className="grid divide-y divide-borda-fina">
            {visiveis.map((l) => (
              <li key={l.alunoId}>
                <button
                  type="button"
                  onClick={() => setAberto(l)}
                  className="foco-visivel -mx-2 grid w-[calc(100%+1rem)] gap-1 rounded-md px-2 py-2.5 text-left hover:bg-superficie-afundada sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.6fr)] sm:items-baseline sm:gap-4"
                >
                  <span className="grid min-w-0">
                    <span className="corpo truncate font-medium text-foreground">
                      {l.nome ?? "(sem nome)"}
                    </span>
                    <span className="corpo-sm text-muted-foreground">
                      {l.clientes} cliente{l.clientes === 1 ? "" : "s"} ·{" "}
                      {l.ultimoAcesso
                        ? `entrou ${formatarHaQuanto(l.ultimoAcesso, agora) ?? ""}`
                        : "nunca entrou"}
                    </span>
                  </span>
                  <span className="corpo-sm min-w-0 text-muted-foreground">
                    {l.favorito ? (
                      <>
                        <span className="text-foreground">{l.favorito.nome ?? "Favorito"}</span>
                        {" · "}
                        {ROTULO_ESTAGIO[estagioDoFavorito(l.favorito)]}
                        {ehPropriaHolding(l) ? " · própria holding" : ""}
                        <br />
                        {rotuloSituacao(situacaoDe(l, agora))}
                      </>
                    ) : (
                      "sem favorito"
                    )}
                  </span>
                  <span className="corpo-sm min-w-0 text-foreground">{proximaAcao(l, agora)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog open={aberto !== null} onOpenChange={(v) => (v ? null : setAberto(null))}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          {aberto ? <PainelDoParceiro l={aberto} agora={agora} /> : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ChipSituacao({
  ativo,
  destaque = false,
  onClick,
  children,
}: {
  ativo: boolean;
  destaque?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        "foco-visivel min-h-8 rounded-full border px-3 py-1 corpo-sm",
        ativo
          ? "border-accent bg-superficie-afundada font-medium text-foreground"
          : "border-borda-fina text-muted-foreground hover:bg-superficie-afundada",
        destaque && !ativo && "text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-2">
      <dt className="corpo-sm text-muted-foreground">{rotulo}</dt>
      <dd className="corpo-sm text-foreground">{children}</dd>
    </div>
  );
}

const ROTULO_ESTADO: Record<string, string> = {
  agendado: "marcada",
  realizado: "realizada",
  cancelado: "cancelada",
  falta: "falta",
};

function PainelDoParceiro({ l, agora }: { l: LinhaAtencao; agora: number }) {
  const zap = linkWhatsApp(l.telefone);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{l.nome ?? "(sem nome)"}</DialogTitle>
        <DialogDescription>{proximaAcao(l, agora)}</DialogDescription>
      </DialogHeader>

      <dl className="grid gap-1.5">
        <Linha rotulo="E-mail">{l.email ?? "—"}</Linha>
        <Linha rotulo="Telefone">
          {l.telefone ?? "—"}
          {zap ? (
            <>
              {" · "}
              <a
                href={zap}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-foreground underline underline-offset-4"
              >
                WhatsApp
              </a>
            </>
          ) : null}
        </Linha>
        <Linha rotulo="Acesso">
          {l.temLogin
            ? l.ultimoAcesso
              ? `último em ${formatarDataHora(l.ultimoAcesso)}`
              : "tem login, nunca entrou"
            : "sem login"}
        </Linha>
        <Linha rotulo="Clientes">
          {l.clientes} cadastrados · {l.clientesComDados} com telefone
        </Linha>
      </dl>

      <div className="grid gap-1.5 border-t border-borda-fina pt-3">
        <h3 className="rotulo text-muted-foreground">Cliente favorito</h3>
        {l.favorito ? (
          <dl className="grid gap-1.5">
            <Linha rotulo="Cliente">{l.favorito.nome ?? "—"}</Linha>
            <Linha rotulo="Relação">
              {ehPropriaHolding(l) ? "Própria holding" : rotuloGrau(l.favorito.grau)}
            </Linha>
            <Linha rotulo="Estágio">
              {ROTULO_ESTAGIO[estagioDoFavorito(l.favorito)]} · fase {rotuloFase(l.favorito.fase)}
            </Linha>
            <Linha rotulo="Agenda">{rotuloSituacao(situacaoDe(l, agora))}</Linha>
          </dl>
        ) : (
          <p className="corpo-sm text-muted-foreground">Ainda não escolheu.</p>
        )}
      </div>

      <div className="grid gap-1.5 border-t border-borda-fina pt-3">
        <h3 className="rotulo text-muted-foreground">Sessões</h3>
        {l.sessoes.length === 0 ? (
          <p className="corpo-sm text-muted-foreground">Nenhuma sessão no sistema.</p>
        ) : (
          <ul className="grid gap-1">
            {l.sessoes.map((s) => (
              <li key={`${s.tipoId}-${s.inicioEm}`} className="corpo-sm">
                <span className="text-foreground">{s.tipo}</span>
                {" · "}
                {formatarDataHora(s.inicioEm)}
                {" · "}
                <span className={s.estado === "agendado" && Date.parse(s.inicioEm) <= agora ? "font-medium text-foreground" : "text-muted-foreground"}>
                  {s.estado === "agendado" && Date.parse(s.inicioEm) <= agora
                    ? "passou sem registro"
                    : (ROTULO_ESTADO[s.estado] ?? s.estado)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-1.5 border-t border-borda-fina pt-3">
        <h3 className="rotulo text-muted-foreground">Com a equipe</h3>
        <dl className="grid gap-1.5">
          <Linha rotulo="Chamados">
            {l.chamadosAbertos} aguardando a equipe · {l.chamadosRespondidos} respondidos
          </Linha>
          <Linha rotulo="Solicitações">{l.solicitacoesPendentes} pendentes</Linha>
          <Linha rotulo="Diário">{l.pendenciasDiario} pendências/combinados em aberto</Linha>
        </dl>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-borda-fina pt-3">
        <Link
          href={`/admin/aluno/${l.alunoId}`}
          prefetch={false}
          className="corpo-sm font-medium text-accent-foreground underline-offset-4 hover:underline"
        >
          Abrir a ficha do parceiro
        </Link>
        {l.chamadosAbertos + l.chamadosRespondidos > 0 ? (
          <Link
            href="/admin/chamados"
            prefetch={false}
            className="corpo-sm font-medium text-accent-foreground underline-offset-4 hover:underline"
          >
            Chamados
          </Link>
        ) : null}
        {l.sessoes.length > 0 ? (
          <Link
            href="/admin/sessoes"
            prefetch={false}
            className="corpo-sm font-medium text-accent-foreground underline-offset-4 hover:underline"
          >
            Agenda de sessões
          </Link>
        ) : null}
      </div>
    </>
  );
}
