import {
  KeyRound,
  LifeBuoy,
  Receipt,
  Route,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { VerificacaoDiagnostico } from "@/lib/data/central";

/**
 * O catálogo da Central de resolução: para cada uma das 20 chaves que
 * `gps.admin_diagnostico_ambiente` devolve, o rótulo em português, a seção em
 * que ela mora e — quando o servidor manda `ok: false` — se aquilo é um
 * **problema** (o aluno está travado) ou um **aviso** (é informação que a
 * equipe precisa ver, mas ninguém está preso).
 *
 * 🔑 A cor NUNCA sai do texto. `ok` vem do servidor com três valores
 * (`true` / `false` / `null`) e é o único juízo; o catálogo só decide, para o
 * `false`, entre âmbar e vermelho. Deduzir estado a partir de `valor`/`detalhe`
 * seria uma segunda fonte de verdade dentro da tela — o defeito que já custou
 * caro nos painéis do CNHF.
 *
 * ⚠️ A ORDEM da tela é a ordem do array que o banco devolve, não a deste
 * arquivo. As seções nascem por agrupamento de chaves CONTÍGUAS (ver
 * `agruparPorSecao`): se o backend inserir uma chave nova no meio, ela aparece
 * no lugar certo em vez de sumir.
 */

export type EstadoLinha = "ok" | "atencao" | "problema" | "informacao";

export type SecaoChave =
  | "acesso"
  | "pessoas"
  | "situacao"
  | "financeiro"
  | "trilha"
  | "atendimento"
  | "outras";

export const SECOES: Record<
  SecaoChave,
  { titulo: string; descricao: string; icone: LucideIcon }
> = {
  acesso: {
    titulo: "Acesso",
    descricao: "Sem login nada mais importa — é por aqui que o socorro começa.",
    icone: KeyRound,
  },
  pessoas: {
    titulo: "Pessoas do ambiente",
    descricao: "Quem é titular, quem é sócio e quem está sem cadastro ligado.",
    icone: Users,
  },
  situacao: {
    titulo: "Situação no programa",
    descricao: "Último acesso, pedidos na fila e direito ao programa.",
    icone: ShieldCheck,
  },
  financeiro: {
    titulo: "Financeiro",
    descricao:
      "O contrato vem do sistema de origem. Lacuna aqui é cadastro, não dívida.",
    icone: Receipt,
  },
  trilha: {
    titulo: "Trilha",
    descricao: "Clientes, cliente da equipe, tarefas e liberação de etapa.",
    icone: Route,
  },
  atendimento: {
    titulo: "Atendimento",
    descricao: "O que está esperando resposta da equipe.",
    icone: LifeBuoy,
  },
  outras: {
    titulo: "Outras conferências",
    descricao: "Conferências que o diagnóstico passou a devolver.",
    icone: ShieldCheck,
  },
};

interface DefinicaoVerificacao {
  secao: SecaoChave;
  rotulo: string;
  /** O que `ok: false` significa nesta linha. `ok: null` é sempre informação. */
  seFalhar: "problema" | "atencao";
}

const CATALOGO: Record<string, DefinicaoVerificacao> = {
  login: {
    secao: "acesso",
    rotulo: "Login para entrar no portal",
    seFalhar: "problema",
  },
  senha: { secao: "acesso", rotulo: "Senha definida", seFalhar: "problema" },
  email_confirmado: {
    secao: "acesso",
    rotulo: "E-mail confirmado",
    seFalhar: "problema",
  },
  email_bate: {
    secao: "acesso",
    rotulo: "E-mail do cadastro igual ao do login",
    seFalhar: "atencao",
  },
  vinculo_programa: {
    secao: "pessoas",
    rotulo: "Ambiente no programa",
    seFalhar: "problema",
  },
  titular: {
    secao: "pessoas",
    rotulo: "Ambiente com titular",
    seFalhar: "problema",
  },
  membros_com_pessoa: {
    secao: "pessoas",
    rotulo: "Pessoas com cadastro vinculado",
    seFalhar: "problema",
  },
  membros_com_login: {
    secao: "pessoas",
    rotulo: "Pessoas com login",
    seFalhar: "problema",
  },
  ultimo_acesso: {
    secao: "situacao",
    rotulo: "Último acesso",
    seFalhar: "atencao",
  },
  solicitacao_pendente: {
    secao: "situacao",
    rotulo: "Pedidos de acesso na fila",
    seFalhar: "atencao",
  },
  direito_ao_acesso: {
    secao: "situacao",
    rotulo: "Direito ao acesso",
    seFalhar: "atencao",
  },
  financeiro_contrato: {
    secao: "financeiro",
    rotulo: "Contrato ligado a este cadastro",
    seFalhar: "problema",
  },
  financeiro_candidatos: {
    secao: "financeiro",
    rotulo: "Contratos livres que casam com este cadastro",
    seFalhar: "atencao",
  },
  clientes: {
    secao: "trilha",
    rotulo: "Clientes listados com dados",
    seFalhar: "atencao",
  },
  cliente_favorito: {
    secao: "trilha",
    rotulo: "Cliente acompanhado pela equipe",
    seFalhar: "atencao",
  },
  tarefa_atual: {
    secao: "trilha",
    rotulo: "Tarefas concluídas",
    seFalhar: "atencao",
  },
  etapas: {
    secao: "trilha",
    rotulo: "Etapas com regra própria",
    seFalhar: "atencao",
  },
  chamados_abertos: {
    secao: "atendimento",
    rotulo: "Chamados abertos",
    seFalhar: "atencao",
  },
  pendencias_diario: {
    secao: "atendimento",
    rotulo: "Pendências no Diário",
    seFalhar: "atencao",
  },
  pasta_drive: {
    secao: "atendimento",
    rotulo: "Pasta do Drive",
    seFalhar: "atencao",
  },
};

/**
 * Chave sem entrada no catálogo (o backend acrescentou uma conferência) vira
 * linha em "Outras conferências", com a chave crua como rótulo. Sumir com ela
 * seria a tela saber mais do que mostra.
 */
export function definicaoDaChave(chave: string): DefinicaoVerificacao {
  return (
    CATALOGO[chave] ?? {
      secao: "outras",
      rotulo: chave.replaceAll("_", " "),
      seFalhar: "atencao",
    }
  );
}

export function estadoDaLinha(v: VerificacaoDiagnostico): EstadoLinha {
  if (v.ok === null) return "informacao";
  if (v.ok) return "ok";
  return definicaoDaChave(v.chave).seFalhar;
}

export interface GrupoDeSecao {
  secao: SecaoChave;
  itens: VerificacaoDiagnostico[];
}

/**
 * Agrupa preservando a ordem do servidor: um grupo novo começa sempre que a
 * seção muda. Como as 20 chaves já vêm contíguas por assunto, o resultado são
 * as 6 seções da tela — e uma chave fora de lugar aparece onde o banco a pôs,
 * em vez de ser realocada em silêncio.
 */
export function agruparPorSecao(
  verificacoes: VerificacaoDiagnostico[],
): GrupoDeSecao[] {
  const grupos: GrupoDeSecao[] = [];
  for (const v of verificacoes) {
    const secao = definicaoDaChave(v.chave).secao;
    const ultimo = grupos.at(-1);
    if (ultimo && ultimo.secao === secao) ultimo.itens.push(v);
    else grupos.push({ secao, itens: [v] });
  }
  return grupos;
}

/** Contagem do cabeçalho. As quatro somam o total de conferências. */
export function contarEstados(verificacoes: VerificacaoDiagnostico[]) {
  let problemas = 0;
  let avisos = 0;
  let ok = 0;
  let informacoes = 0;
  for (const v of verificacoes) {
    const estado = estadoDaLinha(v);
    if (estado === "problema") problemas += 1;
    else if (estado === "atencao") avisos += 1;
    else if (estado === "ok") ok += 1;
    else informacoes += 1;
  }
  return { problemas, avisos, ok, informacoes, total: verificacoes.length };
}
