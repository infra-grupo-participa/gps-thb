import type { ColunaCsv } from "@/lib/csv";
import { formatarData, formatarDataHora, formatarDataSoDia } from "@/lib/datas";
import { FASES_CLIENTE, GRAUS_RELACAO_UI } from "@/lib/etapa1";
import type { ClienteDoPrograma, EstadoReuniao, EtapaAgenda } from "@/lib/data/clientes-admin";
import { mascaraTelefone } from "@/lib/masks";

/** Situação do documento na revisão da equipe. Vazio = sem anexo.
 * Gênero por tipo: "Revisada" (minuta) × "Revisado" (croqui). */
function situacaoAnexoCsv(
  status: ClienteDoPrograma["mnStatus"],
  revisada: "Revisada" | "Revisado",
): string {
  if (status === "enviada") return "A revisar";
  if (status === "em_analise") return "Em análise";
  if (status === "revisada") return revisada;
  return "";
}

const ROTULO_ESTADO_CSV: Record<EstadoReuniao, string> = {
  agendada: "agendada",
  pendente: "pendente (não registrada)",
  realizada: "realizada",
  faltou: "faltou",
};

const ROTULO_ETAPA_CSV: Record<EtapaAgenda, string> = {
  sem: "Sem reunião",
  entrevista: "Entrevista Prévia",
  preliminar: "Reunião Preliminar",
  croqui: "Croqui",
  execucao: "Reunião Inicial de Execução",
};

/**
 * Data de reunião da agenda (…355) → "dd/mm/aaaa hh:mm · estado".
 * Vem como `timestamptz`: a sessão com a hora real, ou a data DIGITADA (ficha /
 * croqui) à meia-noite de São Paulo — nesse caso a hora "00:00" seria inventada,
 * então sai só o dia. Os dois formatadores já usam o FUSO (não é o caso do
 * `date` puro, que vai por `formatarDataSoDia`). Vazio = nada marcado.
 */
function reuniaoCsv(em: string | null, estado: EstadoReuniao | null): string {
  if (!em) return "";
  const comHora = formatarDataHora(em);
  const quando = comHora.endsWith("00:00") ? formatarData(em) : comHora;
  return estado ? `${quando} · ${ROTULO_ESTADO_CSV[estado]}` : quando;
}

/**
 * Colunas do CSV da lista consolidada de clientes do programa
 * (`/admin/clientes`, item 3 dos 9, 14/09/2026).
 *
 * 🔴 SEM `registro_contato`, SEM CPF/documento — mesma regra do export de
 * parceiros (`exportar-csv.tsx`) e a decisão de LGPD do Marcio: os 1.214
 * clientes são terceiros, e `gps.admin_clientes_lista` já não devolve essas
 * colunas (não é "esconder no CSV", o dado nunca chega até aqui).
 *
 * Reusa `ColunaCsv<T>`/`montarCsv` de `src/lib/csv.ts` — NÃO é um segundo
 * gerador: aquele já resolve BOM, `;`, aspas e injeção de fórmula, testado.
 */
export const COLUNAS_CSV_CLIENTES: ColunaCsv<ClienteDoPrograma>[] = [
  { cabecalho: "Cliente", valor: (c) => c.clienteNome },
  { cabecalho: "Parceiro", valor: (c) => c.parceiroNome },
  {
    cabecalho: "Fase",
    valor: (c) => FASES_CLIENTE.find((f) => f.id === c.fase)?.rotulo ?? c.fase,
  },
  // `telefone` tem duas formas na base: a ficha grava com máscara e o lote
  // (…335) só dígitos. Toda leitura passa por mascaraTelefone.
  { cabecalho: "Telefone", valor: (c) => (c.telefone ? mascaraTelefone(c.telefone) : "") },
  {
    cabecalho: "Grau de relação",
    // `null` nunca vira um rótulo inventado — "Não informado", nunca "Lead"
    // ou vazio (célula vazia lê como dado faltando, não como resposta).
    valor: (c) =>
      c.grauRelacao
        ? (GRAUS_RELACAO_UI.find((g) => g.id === c.grauRelacao)?.rotulo ??
          c.grauRelacao)
        : "Não informado",
  },
  { cabecalho: "Perfil DISC", valor: (c) => c.perfilDisc ?? "" },
  {
    cabecalho: "Reunião preliminar",
    // `date` puro (sem hora) — `formatarDataSoDia` (recorte de string), NUNCA
    // `formatarData`: `new Date("2026-08-11")` é meia-noite UTC e formatado em
    // São Paulo volta um dia (bug já documentado em src/lib/datas.ts).
    valor: (c) => formatarDataSoDia(c.dataReuniaoPreliminar) ?? "",
  },
  { cabecalho: "Etapa na agenda", valor: (c) => ROTULO_ETAPA_CSV[c.etapaAgenda] },
  { cabecalho: "Entrevista Prévia", valor: (c) => reuniaoCsv(c.epEm, c.epEstado) },
  // "Reunião Preliminar (agenda)" ≠ a coluna "Reunião preliminar" acima, que é
  // a data DIGITADA na ficha. Esta é a regra da agenda (sessão manda).
  { cabecalho: "Reunião Preliminar (agenda)", valor: (c) => reuniaoCsv(c.rpEm, c.rpEstado) },
  { cabecalho: "Reunião do croqui", valor: (c) => reuniaoCsv(c.cqEm, c.cqEstado) },
  { cabecalho: "Reunião Inicial de Execução", valor: (c) => reuniaoCsv(c.exEm, c.exEstado) },
  { cabecalho: "Aderiu", valor: (c) => (c.aderiuReuniao ? "Sim" : "Não") },
  {
    cabecalho: "Acompanhado pela equipe",
    valor: (c) => (c.acompanhadoEquipe ? "Sim" : "Não"),
  },
  {
    cabecalho: "Croqui PDF (situação)",
    valor: (c) => situacaoAnexoCsv(c.cqPdfStatus, "Revisado"),
  },
  { cabecalho: "Minuta (situação)", valor: (c) => situacaoAnexoCsv(c.mnStatus, "Revisada") },
  { cabecalho: "Cadastrado em", valor: (c) => formatarData(c.criadoEm) },
];
