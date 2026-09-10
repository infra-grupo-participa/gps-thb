/**
 * Os filtros da barra do painel — rótulo, predicado e disponibilidade, num
 * lugar só.
 *
 * 🔑 Antes cada filtro era um `useState` + um `useMemo` de contagem + um `if`
 * dentro de `filtrarAlunos` + um `<FiltroCheckbox>` + uma linha na frase do
 * vazio: **cinco lugares por filtro**, e o sexto filtro (chamado aberto) já
 * tinha nascido esquecendo um deles. Aqui é uma entrada por filtro, e a barra,
 * a contagem, a filtragem e o texto do vazio saem todos dela.
 *
 * 🔴 `disponivel` é a regra que impede a barra de mentir: filtro cujo dado a
 * RPC ainda não devolve (o chip de onboarding, o contrato enviado) **não
 * aparece**. Ele continua no parse da URL — o link do dashboard tem de
 * funcionar no dia em que o dado chegar —, mas um interruptor que não move
 * nada é pior do que interruptor nenhum.
 */

import type { AlunoGps, AtendimentoDoAluno } from "@/lib/data";
import { casaTodosOsTermos } from "@/lib/texto";

import type { FiltroId } from "./estado-na-url";
import { DIAS_INATIVO, DIAS_NOTA_RECENTE, META_CLIENTES } from "./tipos";
import { diasSemAcesso, notaRecente } from "./ordenacao";

export interface ContextoDoFiltro {
  atendimento: (alunoId: string) => AtendimentoDoAluno;
  agora: number;
}

interface DefinicaoDeFiltro {
  /** Texto do chip. Também vira a frase do estado vazio ("Nenhum aluno …"). */
  rotulo: string;
  /** Frase do vazio, quando o rótulo do chip não cai bem na frase. */
  frase?: string;
  predicado: (a: AlunoGps, ctx: ContextoDoFiltro) => boolean;
  /** O dado existe neste lote? `false` esconde o chip (mas não o parse). */
  disponivel: (alunos: AlunoGps[]) => boolean;
}

const sempre = () => true;
export const DEFINICAO_DOS_FILTROS: Record<FiltroId, DefinicaoDeFiltro> = {
  pendencia: {
    rotulo: "Só com pendência",
    frase: "com pendência aberta",
    predicado: (a, c) => c.atendimento(a.alunoId).pendenciasAbertas > 0,
    disponivel: sempre,
  },
  listou30: {
    rotulo: `Já listou os ${META_CLIENTES}`,
    frase: `já listou os ${META_CLIENTES}`,
    predicado: (a) => a.clientesPreenchidos >= META_CLIENTES,
    disponivel: sempre,
  },
  inativos: {
    rotulo: `Sem acessar há ${DIAS_INATIVO}+ dias`,
    frase: `sem acessar há ${DIAS_INATIVO}+ dias`,
    predicado: (a, c) => diasSemAcesso(a.ultimoAcesso, c.agora) >= DIAS_INATIVO,
    disponivel: sempre,
  },
  nota_recente: {
    rotulo: `Com nota nos últimos ${DIAS_NOTA_RECENTE} dias`,
    frase: `com nota nos últimos ${DIAS_NOTA_RECENTE} dias`,
    predicado: (a, c) => notaRecente(c.atendimento(a.alunoId).ultimaNotaEm, c.agora),
    disponivel: sempre,
  },
  sem_nota: {
    rotulo: "Sem nenhuma nota",
    frase: "sem nenhuma nota",
    predicado: (a, c) => !c.atendimento(a.alunoId).ultimaNotaEm,
    disponivel: sempre,
  },
  chamado: {
    rotulo: "Com chamado aberto",
    frase: "com chamado aberto",
    predicado: (a, c) => c.atendimento(a.alunoId).chamadosAbertos > 0,
    disponivel: sempre,
  },
  sem_login: {
    rotulo: "Sem login",
    frase: "sem login",
    predicado: (a) => !a.temLogin,
    disponivel: sempre,
  },
  tem_fechamento: {
    rotulo: "Com cliente em fechamento",
    frase: "com cliente em fechamento",
    predicado: (a) => a.emFechamento > 0,
    disponivel: sempre,
  },
  /* Os três de onboarding só aparecem quando ALGUÉM já respondeu. Enquanto a
     base inteira está em "não iniciado", o chip "Onboarding não iniciado"
     selecionaria os 158 e os outros dois zerariam a lista — três
     interruptores que não separam ninguém. O parse da URL continua aceitando
     os três, para o link do dashboard funcionar desde o primeiro dia. */
  onb_nao: {
    rotulo: "Onboarding não iniciado",
    frase: "com o onboarding não iniciado",
    predicado: (a) => a.onboardingStatus === "nao_iniciado",
    disponivel: (alunos) => alunos.some((a) => a.onboardingStatus !== "nao_iniciado"),
  },
  onb_andamento: {
    rotulo: "Onboarding em andamento",
    frase: "com o onboarding em andamento",
    predicado: (a) => a.onboardingStatus === "em_andamento",
    disponivel: (alunos) => alunos.some((a) => a.onboardingStatus === "em_andamento"),
  },
  onb_ok: {
    rotulo: "Onboarding concluído",
    frase: "com o onboarding concluído",
    predicado: (a) => a.onboardingStatus === "concluido",
    disponivel: (alunos) => alunos.some((a) => a.onboardingStatus === "concluido"),
  },
  /* 🔒 B-S1: o rótulo NÃO diz valor nenhum do saldo do programa. Diz só o fato
     observável — o contrato de honorários foi enviado. `aptoAoSaldo` é
     derivado no banco (contratado + valor + anexo); a tela não recalcula. */
  contrato_enviado: {
    rotulo: "Com contrato enviado",
    frase: "com contrato de honorários enviado",
    predicado: (a) => a.aptoAoSaldo,
    disponivel: (alunos) => alunos.some((a) => a.aptoAoSaldo),
  },
};

/** Frase de um filtro para o estado vazio ("Nenhum aluno …"). */
export function fraseDoFiltro(id: FiltroId): string {
  const d = DEFINICAO_DOS_FILTROS[id];
  return d.frase ?? d.rotulo.toLowerCase();
}

/**
 * Aplica os filtros marcados e a busca por nome/e-mail. Não ordena.
 *
 * 🔑 Os filtros combinam por **AND**: marcar dois estreita, nunca alarga.
 *
 * Mora aqui, e não em `ordenacao.ts`, para a dependência ficar em uma direção
 * só: filtro conhece a contagem de dias, a contagem de dias não conhece
 * filtro. Import circular entre os dois compila e depois estoura em runtime na
 * ordem errada de avaliação — não vale a economia de um arquivo.
 */
export function filtrarAlunos(
  alunos: AlunoGps[],
  { filtros, termo }: { filtros: Set<FiltroId>; termo: string },
  ctx: ContextoDoFiltro,
): AlunoGps[] {
  const marcados = [...filtros];
  return alunos.filter((a) => {
    for (const id of marcados) {
      if (!DEFINICAO_DOS_FILTROS[id].predicado(a, ctx)) return false;
    }
    const alvo = `${a.aluno?.nome ?? ""} ${a.aluno?.email ?? ""}`;
    return casaTodosOsTermos(alvo, termo);
  });
}
