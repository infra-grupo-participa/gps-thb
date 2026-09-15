/**
 * Papel de operador + dossiê do cliente (Fatia 5, ÚLTIMA da esteira, migração
 * `…264`, 15/09/2026, decisão do Marcio).
 *
 * POR QUE ESTE ARQUIVO EXISTE SEPARADO
 *   `src/app/admin/operador-actions.ts` leva `"use server"`, e um módulo com
 *   essa diretiva SÓ pode exportar `async function` — `export type`/`export
 *   const`/`export interface` passam no `tsc` e no `next build`, e quebram em
 *   RUNTIME (já derrubou `/admin` e `/admin/videos` em 10 e 11/09/2026). Os
 *   tipos moram aqui, importados por `import type` dos dois lados.
 *
 * 🔑 UM PAPEL SÓ: "equipe da esteira". Quem está em `gps.operadores` (ativo)
 * vê a fila de ligações E o dossiê do cliente — o advogado que conduz a
 * reunião preliminar e o operador que faz as ligações são a mesma pessoa,
 * decisão do Marcio para simplificar.
 *
 * 🔴 NÃO é `public.perfis`/admin: aquele dá acesso nos 7 sistemas do grupo
 * (`auth.users` compartilhado). NÃO é `gps.membros.papel`: aquele é o papel
 * DENTRO de um ambiente (titular/sócio). Operador é transversal, tabela
 * própria (`gps.operadores`), guarda própria (`gps.eh_equipe()` no banco).
 */

/** Uma pessoa com o papel "equipe da esteira" (`gps.operadores`). */
export interface Operador {
  userId: string;
  nome: string;
  ativo: boolean;
  criadoEm: string;
}

/** Retorno comum das actions desta fatia. */
export interface OperadorResultado {
  ok: boolean;
  erro?: string;
}

/**
 * O dossiê de UM cliente (`gps.dossie_do_cliente`), para o advogado da
 * reunião preliminar / operador que liga.
 *
 * 🔴 NÃO leva `registro_contato`, CPF/documento, `valor_honorarios`,
 * `contrato_*` nem nada do Diário do parceiro (`gps.aluno_notas`) — mesmas
 * exclusões de LGPD já decididas nas migrations `…255`/`…259`/`…262`. Nunca
 * serializar este tipo num payload de LISTA — é sempre UM cliente por vez, e
 * cada leitura grava trilha em `gps.acessos_log` (`dossie_acessado`).
 */
export interface DossieDoCliente {
  clienteId: string;
  alunoId: string;
  parceiroNome: string | null;
  clienteNome: string;
  telefone: string | null;
  grauRelacao: string | null;
  fase: string;
  perfilDisc: string | null;
  acompanhadoEquipe: boolean;
  selecionadoEntrevista: boolean;
  entrevista: {
    resultado: string | null;
    observacoes: string | null;
    em: string | null;
    por: string | null;
  };
  decisores: DossieDecisor[];
  reuniao: {
    dataAceita: string | null;
    aderiu: boolean;
    propostaVivaId: string | null;
    propostaVivaData: string | null;
    propostas: DossiePropostaReuniao[];
  };
}

/** Um decisor no dossiê (subconjunto de `Decisor`, ver `entrevista-tipos.ts`). */
export interface DossieDecisor {
  id: string;
  nome: string;
  papelNoNegocio: string | null;
  principal: boolean;
}

/** Uma proposta de reunião no histórico do dossiê (subconjunto de `PropostaReuniao`). */
export interface DossiePropostaReuniao {
  id: string;
  dataProposta: string;
  propostaEm: string;
  estado: string;
  respostaEm: string | null;
  contestacaoMotivo: string | null;
}
