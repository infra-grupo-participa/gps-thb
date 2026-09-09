import type { AlunoBusca } from "@/app/admin/actions";
import type {
  CandidatoFinanceiro,
  EtapaDiagnostico,
  MembroDiagnostico,
} from "@/lib/data/central";

/**
 * A escrita que está esperando confirmação.
 *
 * União discriminada (e não um punhado de `useState` booleanos) porque a
 * Central tem DEZ escritas e cada uma exige uma frase de consequência
 * diferente. Com um estado só é impossível abrir dois diálogos ao mesmo tempo,
 * e o `switch` do arquivo de confirmações não compila se alguém acrescentar
 * uma ação e esquecer a copy dela.
 *
 * 🔑 A linha/botão que abriu o diálogo **continua montado** atrás dele — é o
 * que devolve o foco ao gatilho quando o admin cancela (regra do
 * `DialogoConfirmacao`). Por isso nada é removido da lista antes da resposta.
 */
export type AcaoPendente =
  | { tipo: "alinhar-email"; deCadastro: string | null; paraLogin: string }
  | { tipo: "vincular-pessoa"; membro: MembroDiagnostico; pessoa: AlunoBusca }
  | { tipo: "trocar-titular"; membro: MembroDiagnostico }
  | { tipo: "mover-membro"; membro: MembroDiagnostico; destino: AlunoBusca }
  | { tipo: "liberar-etapa"; etapa: EtapaDiagnostico }
  | { tipo: "travar-etapa"; etapa: EtapaDiagnostico }
  | { tipo: "voltar-regra-geral"; etapa: EtapaDiagnostico }
  | { tipo: "reabrir-etapa"; etapa: EtapaDiagnostico; concluidas: number }
  | { tipo: "vincular-financeiro"; candidato: CandidatoFinanceiro }
  | {
      tipo: "desvincular-financeiro";
      contatoHmId: string;
      produto: string | null;
    };

/** As quatro ações de trilha exigem motivo de 3 a 300, no servidor E no banco. */
export const MOTIVO_MIN = 3;
export const MOTIVO_MAX = 300;

export function exigeMotivo(acao: AcaoPendente): boolean {
  return (
    acao.tipo === "liberar-etapa" ||
    acao.tipo === "travar-etapa" ||
    acao.tipo === "voltar-regra-geral" ||
    acao.tipo === "reabrir-etapa"
  );
}

/** Contrato de exibição de etapa: "Etapa 03". */
export function rotuloEtapa(n: number): string {
  return `Etapa ${String(n).padStart(2, "0")}`;
}
