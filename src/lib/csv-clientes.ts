import type { ColunaCsv } from "@/lib/csv";
import { formatarData, formatarDataSoDia } from "@/lib/datas";
import { FASES_CLIENTE, GRAUS_RELACAO_UI } from "@/lib/etapa1";
import type { ClienteDoPrograma } from "@/lib/data/clientes-admin";

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
  { cabecalho: "Telefone", valor: (c) => c.telefone ?? "" },
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
  { cabecalho: "Aderiu", valor: (c) => (c.aderiuReuniao ? "Sim" : "Não") },
  {
    cabecalho: "Acompanhado pela equipe",
    valor: (c) => (c.acompanhadoEquipe ? "Sim" : "Não"),
  },
  { cabecalho: "Cadastrado em", valor: (c) => formatarData(c.criadoEm) },
];
