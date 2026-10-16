/**
 * "Precisa de atenção" como painel de AÇÃO (João, 16/10/2026).
 *
 * Regras PURAS (sem rede, sem sessão): o servidor busca as linhas em
 * `gps.admin_atencao_acoes()` (…392) e tudo o que se decide sobre elas —
 * grupo, situação da agenda, estágio do favorito, próxima ação sugerida, CSV
 * e relatório para o Claude — mora aqui. Testável com `node --test`
 * (`atencao-acoes.test.mjs`).
 *
 * 🔴 Denominador ÚNICO: a base inteira de parceiros (a RPC devolve todos, não
 * o lote de 200 do painel). Os quatro cards são recortes que se sobrepõem de
 * propósito — "30 ou mais" pode também estar "sem favorito" — e por isso
 * NUNCA se somam.
 */
import { FASES_CLIENTE, GRAUS_RELACAO_UI, META_CLIENTES } from "@/lib/etapa1";
import { FUSO } from "@/lib/datas";
import type { FaseCliente, GrauRelacao } from "@/lib/types";

// ── O que vem do banco ─────────────────────────────────────────────────────

export interface SessaoResumo {
  tipoId: number;
  tipo: string;
  estado: "agendado" | "realizado" | "cancelado" | "falta" | string;
  inicioEm: string;
  cliente: string | null;
}

/** Etapa da agenda do favorito (`gps.cliente_agenda_resumo().etapa_agenda`). */
export type EtapaAgenda = "sem" | "entrevista" | "preliminar" | "croqui" | "execucao";

export interface LinhaAtencao {
  alunoId: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  temLogin: boolean;
  ultimoAcesso: string | null;
  clientes: number;
  clientesComDados: number;
  favorito: {
    id: string;
    nome: string | null;
    fase: FaseCliente | null;
    grau: GrauRelacao | null;
    etapa: EtapaAgenda;
  } | null;
  /** Mais recente primeiro (até 12). */
  sessoes: SessaoResumo[];
  chamadosAbertos: number;
  chamadosRespondidos: number;
  chamadoUltimaEm: string | null;
  solicitacoesPendentes: number;
  pendenciasDiario: number;
}

const ETAPAS: readonly EtapaAgenda[] = ["sem", "entrevista", "preliminar", "croqui", "execucao"];

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
function inteiro(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

/** Linha crua da RPC → `LinhaAtencao`. Valor desconhecido vira o neutro, nunca some. */
export function mapearLinhaAtencao(r: Record<string, unknown>): LinhaAtencao {
  const sessoesCruas = Array.isArray(r.sessoes) ? (r.sessoes as Record<string, unknown>[]) : [];
  const etapa = texto(r.favorito_etapa);
  return {
    alunoId: String(r.aluno_id),
    nome: texto(r.nome),
    email: texto(r.email),
    telefone: texto(r.telefone),
    temLogin: r.tem_login === true,
    ultimoAcesso: texto(r.ultimo_acesso),
    clientes: inteiro(r.clientes),
    clientesComDados: inteiro(r.clientes_com_dados),
    favorito: texto(r.favorito_id)
      ? {
          id: String(r.favorito_id),
          nome: texto(r.favorito_nome),
          fase: (texto(r.favorito_fase) as FaseCliente | null) ?? null,
          grau: (texto(r.favorito_grau) as GrauRelacao | null) ?? null,
          etapa: (ETAPAS as readonly string[]).includes(etapa ?? "")
            ? (etapa as EtapaAgenda)
            : "sem",
        }
      : null,
    sessoes: sessoesCruas.map((s) => ({
      tipoId: inteiro(s.tipo_id),
      tipo: texto(s.tipo) ?? "Sessão",
      estado: texto(s.estado) ?? "agendado",
      inicioEm: String(s.inicio_em),
      cliente: texto(s.cliente),
    })),
    chamadosAbertos: inteiro(r.chamados_abertos),
    chamadosRespondidos: inteiro(r.chamados_respondidos),
    chamadoUltimaEm: texto(r.chamado_ultima_em),
    solicitacoesPendentes: inteiro(r.solicitacoes_pendentes),
    pendenciasDiario: inteiro(r.pendencias_diario),
  };
}

// ── Os quatro cards ────────────────────────────────────────────────────────

export type GrupoAtencao = "sem_cliente" | "trinta_ou_mais" | "sem_favorito" | "com_favorito";

export const GRUPOS_ATENCAO: {
  id: GrupoAtencao;
  rotulo: string;
  /** Uma linha: quem entra. */
  regra: string;
}[] = [
  {
    id: "sem_cliente",
    rotulo: "Não cadastraram nenhum cliente",
    regra: "Nenhum cliente com nome na lista.",
  },
  {
    id: "trinta_ou_mais",
    rotulo: `Cadastraram ${META_CLIENTES} ou mais`,
    regra: `Bateram a meta de ${META_CLIENTES} clientes cadastrados.`,
  },
  {
    id: "sem_favorito",
    rotulo: "Sem favorito",
    regra: "Têm cliente cadastrado, mas não escolheram o que a equipe acompanha.",
  },
  {
    id: "com_favorito",
    rotulo: "Cadastraram e favoritaram",
    regra: "Já escolheram o cliente que a equipe acompanha. Veja se agendaram.",
  },
];

export function estaNoGrupo(l: LinhaAtencao, g: GrupoAtencao): boolean {
  switch (g) {
    case "sem_cliente":
      return l.clientes === 0;
    case "trinta_ou_mais":
      return l.clientes >= META_CLIENTES;
    case "sem_favorito":
      return l.clientes > 0 && l.favorito === null;
    case "com_favorito":
      return l.favorito !== null;
  }
}

/** Percentual inteiro, sem dividir por zero. */
export function percentual(parte: number, total: number): number {
  return total > 0 ? Math.round((parte / total) * 100) : 0;
}

// ── Situação da agenda ─────────────────────────────────────────────────────

export type Situacao =
  | "aguardando_equipe"
  | "sem_desfecho"
  | "agendou"
  | "equipe_respondeu"
  | "fez_sessao"
  | "nao_agendou";

/** A ordem é de PRIORIDADE: a primeira que vale é a situação do parceiro. */
export const SITUACOES: { id: Situacao; rotulo: string; daEquipe: boolean }[] = [
  { id: "aguardando_equipe", rotulo: "Aguardando a equipe", daEquipe: true },
  { id: "sem_desfecho", rotulo: "Sessão passada sem registro", daEquipe: true },
  { id: "agendou", rotulo: "Agendou", daEquipe: false },
  { id: "equipe_respondeu", rotulo: "Equipe respondeu, falta o parceiro", daEquipe: false },
  { id: "fez_sessao", rotulo: "Fez sessão, sem a próxima marcada", daEquipe: false },
  { id: "nao_agendou", rotulo: "Não agendou", daEquipe: false },
];

export function rotuloSituacao(s: Situacao): string {
  return SITUACOES.find((x) => x.id === s)?.rotulo ?? s;
}

/** A próxima sessão marcada (a mais cedo no futuro), se houver. */
export function proximaSessao(l: LinhaAtencao, agora: number): SessaoResumo | null {
  let melhor: SessaoResumo | null = null;
  for (const s of l.sessoes) {
    if (s.estado !== "agendado") continue;
    const t = Date.parse(s.inicioEm);
    if (!(t > agora)) continue;
    if (!melhor || t < Date.parse(melhor.inicioEm)) melhor = s;
  }
  return melhor;
}

export function situacaoDe(l: LinhaAtencao, agora: number): Situacao {
  if (l.chamadosAbertos > 0 || l.solicitacoesPendentes > 0) return "aguardando_equipe";
  if (l.sessoes.some((s) => s.estado === "agendado" && Date.parse(s.inicioEm) <= agora)) {
    return "sem_desfecho";
  }
  if (proximaSessao(l, agora)) return "agendou";
  if (l.chamadosRespondidos > 0) return "equipe_respondeu";
  if (l.sessoes.some((s) => s.estado === "realizado")) return "fez_sessao";
  return "nao_agendou";
}

// ── Estágio do favorito ────────────────────────────────────────────────────

export type Estagio = "inicial" | "intermediario" | "avancado";

export const ROTULO_ESTAGIO: Record<Estagio, string> = {
  inicial: "Estágio inicial",
  intermediario: "Intermediário",
  avancado: "Avançado",
};

/**
 * Pela agenda (a etapa mais adiantada com sessão viva) e pela fase do cliente:
 * contratado/concluído é avançado mesmo sem sessão no sistema.
 */
export function estagioDoFavorito(f: NonNullable<LinhaAtencao["favorito"]>): Estagio {
  if (f.fase === "contratado" || f.fase === "concluido") return "avancado";
  if (f.etapa === "croqui" || f.etapa === "execucao") return "avancado";
  if (f.etapa === "preliminar" || f.fase === "fechamento") return "intermediario";
  return "inicial";
}

export function ehPropriaHolding(l: LinhaAtencao): boolean {
  return l.favorito?.grau === "eu_mesmo";
}

export function rotuloGrau(g: GrauRelacao | null): string {
  if (!g) return "não informado";
  return GRAUS_RELACAO_UI.find((x) => x.id === g)?.rotulo ?? g;
}

export function rotuloFase(f: FaseCliente | null): string {
  if (!f) return "sem fase";
  return FASES_CLIENTE.find((x) => x.id === f)?.rotulo ?? f;
}

// ── Próxima ação sugerida ──────────────────────────────────────────────────

/**
 * Qual sessão o favorito deve marcar a seguir, pela ordem do programa
 * (Preliminar → Viabilidade → Croqui → Minuta, …390). Própria holding começa
 * pelo Croqui.
 */
export function proximaEtapaSugerida(l: LinhaAtencao): string {
  const f = l.favorito;
  if (!f) return "Entrevista Prévia";
  const vivas = new Set(
    l.sessoes
      .filter((s) => s.estado === "agendado" || s.estado === "realizado")
      .map((s) => s.tipoId),
  );
  if (f.etapa === "execucao") return "acompanhar a execução";
  if (f.etapa === "croqui" || vivas.has(4)) return "Apresentação da Minuta";
  if (ehPropriaHolding(l)) return "Croqui Estrutural";
  if (vivas.has(3)) return "Croqui Estrutural";
  if (f.etapa === "preliminar" || vivas.has(2)) return "Sessão de Viabilidade";
  if (f.etapa === "entrevista" || vivas.has(1)) return "Reunião Preliminar";
  return "Entrevista Prévia";
}

function diaCurto(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: FUSO,
  });
}

export function proximaAcao(l: LinhaAtencao, agora: number): string {
  // Login só trava quem não cadastrou nada: quem tem cliente já entrou (ou
  // um sócio do mesmo ambiente entrou por ele).
  if (l.clientes === 0) {
    return l.temLogin
      ? "Ligar e ajudar a cadastrar os primeiros clientes."
      : "Ajudar a entrar no portal: ainda não fez o primeiro login.";
  }
  if (!l.favorito) return "Pedir para escolher o cliente que a equipe vai acompanhar.";
  const s = situacaoDe(l, agora);
  if (s === "aguardando_equipe") {
    return l.solicitacoesPendentes > 0
      ? "Decidir a solicitação pendente do parceiro."
      : "Responder o chamado aberto do parceiro.";
  }
  if (s === "sem_desfecho") return "Registrar presença ou falta da sessão que já passou (Sessões).";
  if (s === "agendou") {
    const p = proximaSessao(l, agora);
    return p ? `Nada a cobrar: ${p.tipo} marcada para ${diaCurto(p.inicioEm)}.` : "Sessão marcada.";
  }
  if (s === "equipe_respondeu") return "Cobrar o retorno do parceiro ao chamado respondido.";
  const etapa = proximaEtapaSugerida(l);
  return etapa === "acompanhar a execução"
    ? "Acompanhar a execução do cliente."
    : `Convidar a marcar a ${etapa}.`;
}

// ── Exportação ─────────────────────────────────────────────────────────────

/** Uma linha "achatada" — a mesma para o CSV e para o relatório. */
export interface LinhaExportada {
  grupos: string;
  parceiro: string;
  email: string;
  telefone: string;
  login: string;
  ultimoAcesso: string;
  clientes: number;
  favorito: string;
  propriaHolding: string;
  estagio: string;
  faseFavorito: string;
  situacao: string;
  ultimaSessao: string;
  proximaSessao: string;
  chamados: string;
  proximaAcao: string;
}

export function exportarLinha(l: LinhaAtencao, agora: number): LinhaExportada {
  const grupos = GRUPOS_ATENCAO.filter((g) => estaNoGrupo(l, g.id)).map((g) => g.rotulo);
  const passada = l.sessoes.find((s) => Date.parse(s.inicioEm) <= agora);
  const prox = proximaSessao(l, agora);
  return {
    grupos: grupos.join(" | "),
    parceiro: l.nome ?? "(sem nome)",
    email: l.email ?? "",
    telefone: l.telefone ?? "",
    login: l.temLogin ? "sim" : "não",
    ultimoAcesso: l.ultimoAcesso ? diaCurto(l.ultimoAcesso) : "nunca",
    clientes: l.clientes,
    favorito: l.favorito?.nome ?? "",
    propriaHolding: ehPropriaHolding(l) ? "sim" : "",
    estagio: l.favorito ? ROTULO_ESTAGIO[estagioDoFavorito(l.favorito)] : "",
    faseFavorito: l.favorito ? rotuloFase(l.favorito.fase) : "",
    situacao: l.favorito ? rotuloSituacao(situacaoDe(l, agora)) : "",
    ultimaSessao: passada ? `${passada.tipo} ${diaCurto(passada.inicioEm)} (${passada.estado})` : "",
    proximaSessao: prox ? `${prox.tipo} ${diaCurto(prox.inicioEm)}` : "",
    chamados:
      [
        l.chamadosAbertos ? `${l.chamadosAbertos} aberto(s)` : "",
        l.chamadosRespondidos ? `${l.chamadosRespondidos} respondido(s)` : "",
        l.solicitacoesPendentes ? `${l.solicitacoesPendentes} solicitação(ões)` : "",
      ]
        .filter(Boolean)
        .join(", "),
    proximaAcao: proximaAcao(l, agora),
  };
}

export const COLUNAS_EXPORTACAO: { cabecalho: string; chave: keyof LinhaExportada }[] = [
  { cabecalho: "Grupo", chave: "grupos" },
  { cabecalho: "Parceiro", chave: "parceiro" },
  { cabecalho: "E-mail", chave: "email" },
  { cabecalho: "Telefone", chave: "telefone" },
  { cabecalho: "Login", chave: "login" },
  { cabecalho: "Último acesso", chave: "ultimoAcesso" },
  { cabecalho: "Clientes", chave: "clientes" },
  { cabecalho: "Favorito", chave: "favorito" },
  { cabecalho: "Própria holding", chave: "propriaHolding" },
  { cabecalho: "Estágio", chave: "estagio" },
  { cabecalho: "Fase do favorito", chave: "faseFavorito" },
  { cabecalho: "Situação da agenda", chave: "situacao" },
  { cabecalho: "Última sessão", chave: "ultimaSessao" },
  { cabecalho: "Próxima sessão", chave: "proximaSessao" },
  { cabecalho: "Chamados", chave: "chamados" },
  { cabecalho: "Próxima ação", chave: "proximaAcao" },
];

/** Célula de tabela Markdown: sem quebra de linha nem barra vertical. */
function md(v: string | number): string {
  return String(v).replace(/[\r\n]+/g, " ").replace(/\|/g, "/");
}

/**
 * O relatório para colar no Claude (ou em outra ferramenta): retrato do dia,
 * números dos quatro grupos e, por grupo, quem está nele e a ação sugerida.
 *
 * 🔴 Sem telefone: o relatório viaja para fora do sistema; o CSV (que fica
 * com a equipe) é que leva o contato completo.
 */
export function montarRelatorio(
  linhas: LinhaAtencao[],
  agora: number,
  apuradoEm: string,
): string {
  const total = linhas.length;
  const partes: string[] = [];
  partes.push(`# Relatório de ações pendentes — GPS`);
  partes.push("");
  partes.push(`Apurado em ${apuradoEm}. Base: ${total} parceiros.`);
  partes.push(
    "Os grupos se sobrepõem (um parceiro pode estar em mais de um); os percentuais são sobre a base inteira e não se somam.",
  );
  partes.push("");
  partes.push("## Resumo");
  partes.push("");
  partes.push("| Grupo | Parceiros | % da base |");
  partes.push("|---|---:|---:|");
  for (const g of GRUPOS_ATENCAO) {
    const n = linhas.filter((l) => estaNoGrupo(l, g.id)).length;
    partes.push(`| ${g.rotulo} | ${n} | ${percentual(n, total)}% |`);
  }
  const comFav = linhas.filter((l) => l.favorito);
  partes.push("");
  partes.push(`### Situação da agenda de quem favoritou (${comFav.length})`);
  partes.push("");
  partes.push("| Situação | Parceiros |");
  partes.push("|---|---:|");
  for (const s of SITUACOES) {
    const n = comFav.filter((l) => situacaoDe(l, agora) === s.id).length;
    partes.push(`| ${s.rotulo} | ${n} |`);
  }

  for (const g of GRUPOS_ATENCAO) {
    const doGrupo = linhas.filter((l) => estaNoGrupo(l, g.id));
    partes.push("");
    partes.push(`## ${g.rotulo} (${doGrupo.length})`);
    partes.push("");
    partes.push(g.regra);
    if (doGrupo.length === 0) continue;
    partes.push("");
    partes.push("| Parceiro | E-mail | Clientes | Favorito | Estágio | Situação | Último acesso | Próxima ação |");
    partes.push("|---|---|---:|---|---|---|---|---|");
    for (const l of doGrupo) {
      const e = exportarLinha(l, agora);
      const fav = e.favorito ? `${e.favorito}${e.propriaHolding ? " (própria holding)" : ""}` : "—";
      partes.push(
        `| ${md(e.parceiro)} | ${md(e.email || "—")} | ${e.clientes} | ${md(fav)} | ${md(e.estagio || "—")} | ${md(e.situacao || "—")} | ${md(e.ultimoAcesso)} | ${md(e.proximaAcao)} |`,
      );
    }
  }
  partes.push("");
  return partes.join("\n");
}
