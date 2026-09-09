import { createClient } from "@/lib/supabase/server";
import { ehAdmin, getContextoSessao } from "@/lib/auth";
import { logErro } from "@/lib/log";
import { traduzirErroBanco } from "@/lib/erros";
import type { OverridesLiberacao } from "@/lib/etapas";
import type { StatusAcesso, MembroAcesso } from "@/app/admin/senha-actions";

// ─────────────────────────────────────────────────────────────────────────
// Central de resolução — as LEITURAS.
//
// Duas funções, dois públicos:
//   getDiagnosticoAmbiente(alunoId)  → SÓ ADMIN. Um jsonb com tudo que
//     responde "por que este aluno não anda", vindo de UMA RPC
//     (gps.admin_diagnostico_ambiente), que por sua vez REUSA
//     admin_status_acesso e admin_direito_ao_acesso em vez de copiá-las.
//   getEtapasLiberadasPara(alunoId)  → admin E o próprio aluno. O override de
//     liberação de etapa daquele ambiente (gps.etapa_liberacao_aluno), que
//     `etapasComLiberacaoDoAluno` (src/lib/etapas.ts) aplica sobre getEtapas().
//
// Regra do P6 (egress é teto DA ORGANIZAÇÃO, dividido com o sip): consulta
// nova declara colunas, nunca `select("*")`.
// ─────────────────────────────────────────────────────────────────────────

/** Uma linha do checklist. `ok: null` = informação, sem juízo (nem verde nem
 *  vermelho) — a cor vem do servidor, não de heurística sobre o texto. */
export interface VerificacaoDiagnostico {
  chave: string;
  ok: boolean | null;
  valor: string | null;
  detalhe: string | null;
}

export interface MembroDiagnostico {
  membroId: string;
  papel: string;
  userId: string | null;
  emailLogin: string | null;
  temLogin: boolean;
  temSenha: boolean;
  emailConfirmado: boolean;
  ultimoAcesso: string | null;
  /** `gps.membros.pessoa_aluno_id` — null é a lacuna, não um erro de leitura. */
  pessoaAlunoId: string | null;
  pessoaNome: string | null;
  pessoaEmail: string | null;
  /** null quando falta o e-mail do login ou o do cadastro: "não dá para saber"
   *  não é "não bate". */
  emailBate: boolean | null;
}

export interface EtapaDiagnostico {
  etapa: number;
  nome: string;
  /** Já resolvida: `coalesce(override, global)`. */
  liberada: boolean;
  /** O que `gps.etapas.liberada` diz para todo mundo. */
  global: boolean;
  origem: "global" | "liberada_para_este_aluno" | "travada_para_este_aluno";
  motivo: string | null;
  em: string | null;
}

export interface CandidatoFinanceiro {
  contatoHmId: string;
  produto: string | null;
  plano: string | null;
  turma: string | null;
  valorTotal: number | null;
  criadoEm: string | null;
  /** "e-mail" ou "documento" — por onde o comprador casou com o cadastro. */
  casouPor: string;
  email: string | null;
  /** Só os 4 últimos dígitos do documento do comprador. */
  documentoFinal: string | null;
}

export interface SolicitacaoPendenteDiagnostico {
  id: string;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  criadoEm: string;
}

export interface DiagnosticoAmbiente {
  alunoId: string;
  nome: string | null;
  emailCadastro: string | null;
  geradoEm: string;
  /** O mesmo tipo de `statusAcessoAluno` — não é uma segunda verdade. */
  acesso: StatusAcesso;
  direito: { temDireito: boolean; motivo: string | null };
  verificacoes: VerificacaoDiagnostico[];
  membros: MembroDiagnostico[];
  etapas: EtapaDiagnostico[];
  progresso: { etapa: number; concluidas: number }[];
  candidatosFinanceiro: CandidatoFinanceiro[];
  solicitacoesPendentes: SolicitacaoPendenteDiagnostico[];
}

type Json = Record<string, unknown>;

const texto = (v: unknown): string | null =>
  typeof v === "string" ? v : v == null ? null : String(v);
const numero = (v: unknown): number | null =>
  v == null || v === "" ? null : Number(v);
const booleanoOuNulo = (v: unknown): boolean | null =>
  v == null ? null : Boolean(v);

/**
 * `gps.admin_status_acesso` → `StatusAcesso`.
 *
 * Mora aqui (e não em `senha-actions.ts`) porque um módulo `"use server"` só
 * pode exportar função async: um mapeador puro não cabe lá. `statusAcessoAluno`
 * passou a chamar este — a mesma RPC não pode ter dois mapeamentos.
 */
export function mapearStatusAcesso(bruto: unknown): StatusAcesso {
  const d = (bruto ?? {}) as Json;
  const membrosRaw = (d.membros as Json[]) ?? [];
  const membros: MembroAcesso[] = membrosRaw.map((m) => ({
    membroId: String(m.membro_id),
    papel: (m.papel as MembroAcesso["papel"]) ?? "socio",
    userId: texto(m.user_id),
    email: texto(m.email),
    temSenha: Boolean(m.tem_senha),
    emailConfirmado: Boolean(m.email_confirmado),
    ultimoAcesso: texto(m.ultimo_acesso),
  }));

  return {
    temLogin: Boolean(d.tem_login),
    emailCadastro: texto(d.email_cadastro),
    emailLogin: texto(d.email_login),
    emailBate: Boolean(d.email_bate),
    emailConfirmado: Boolean(d.email_confirmado),
    temSenha: Boolean(d.tem_senha),
    ultimoAcesso: texto(d.ultimo_acesso),
    noGps: Boolean(d.no_gps),
    vinculoCompleto: Boolean(d.vinculo_completo),
    solicitacaoPendente: Boolean(d.solicitacao_pendente),
    qtdMembros: Number(d.qtd_membros ?? membros.length),
    membros,
  };
}

/**
 * O diagnóstico do ambiente — UMA ida ao banco, SÓ ADMIN.
 *
 * A guarda `ehAdmin()` aqui não é a fronteira (a fronteira é o
 * `public.gp_is_admin()` na primeira linha da RPC, que devolve 42501 sem JWT):
 * ela evita uma viagem ao banco à toa e devolve erro cedo. Esta função é
 * importada por `data.ts`, que também é usado por páginas do ALUNO — não é
 * seguro confiar que todo chamador vai lembrar de checar antes.
 */
export async function getDiagnosticoAmbiente(
  alunoId: string,
): Promise<{ erro?: string; diagnostico?: DiagnosticoAmbiente }> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };
  if (!alunoId) return { erro: "Aluno não informado." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_diagnostico_ambiente", { p_aluno_id: alunoId });

  if (error) {
    return {
      erro: traduzirErroBanco("central/getDiagnosticoAmbiente", error, {
        alunoId,
      }),
    };
  }

  const d = (data ?? {}) as Json;
  const direito = (d.direito ?? {}) as Json;

  return {
    diagnostico: {
      alunoId: String(d.aluno_id ?? alunoId),
      nome: texto(d.nome),
      emailCadastro: texto(d.email_cadastro),
      geradoEm: String(d.gerado_em ?? ""),
      acesso: mapearStatusAcesso(d.acesso),
      direito: {
        temDireito: Boolean(direito.tem_direito),
        motivo: texto(direito.motivo),
      },
      verificacoes: (((d.verificacoes as Json[]) ?? []).map((v) => ({
        chave: String(v.chave),
        ok: booleanoOuNulo(v.ok),
        valor: texto(v.valor),
        detalhe: texto(v.detalhe),
      })) satisfies VerificacaoDiagnostico[]),
      membros: ((d.membros as Json[]) ?? []).map((m) => ({
        membroId: String(m.membro_id),
        papel: String(m.papel ?? "socio"),
        userId: texto(m.user_id),
        emailLogin: texto(m.email_login),
        temLogin: Boolean(m.tem_login),
        temSenha: Boolean(m.tem_senha),
        emailConfirmado: Boolean(m.email_confirmado),
        ultimoAcesso: texto(m.ultimo_acesso),
        pessoaAlunoId: texto(m.pessoa_aluno_id),
        pessoaNome: texto(m.pessoa_nome),
        pessoaEmail: texto(m.pessoa_email),
        emailBate: booleanoOuNulo(m.email_bate),
      })),
      etapas: ((d.etapas as Json[]) ?? []).map((e) => ({
        etapa: Number(e.etapa),
        nome: String(e.nome ?? ""),
        liberada: Boolean(e.liberada),
        global: Boolean(e.global),
        origem: (e.origem as EtapaDiagnostico["origem"]) ?? "global",
        motivo: texto(e.motivo),
        em: texto(e.em),
      })),
      progresso: ((d.progresso as Json[]) ?? []).map((p) => ({
        etapa: Number(p.etapa),
        concluidas: Number(p.concluidas ?? 0),
      })),
      candidatosFinanceiro: ((d.candidatos_financeiro as Json[]) ?? []).map(
        (c) => ({
          contatoHmId: String(c.contato_hm_id),
          produto: texto(c.produto),
          plano: texto(c.plano),
          turma: texto(c.turma),
          valorTotal: numero(c.valor_total),
          criadoEm: texto(c.criado_em),
          casouPor: String(c.casou_por ?? "documento"),
          email: texto(c.email),
          documentoFinal: texto(c.documento_final),
        }),
      ),
      solicitacoesPendentes: ((d.solicitacoes_pendentes as Json[]) ?? []).map(
        (s) => ({
          id: String(s.id),
          nome: texto(s.nome),
          email: texto(s.email),
          telefone: texto(s.telefone),
          criadoEm: String(s.criado_em ?? ""),
        }),
      ),
    },
  };
}

/**
 * Os overrides de liberação de etapa DESTE ambiente, prontos para
 * `etapasComLiberacaoDoAluno(await getEtapas(), overrides)`.
 *
 * 🔑 Guarda explícita (admin OU o próprio ambiente da sessão) mesmo com a RLS
 * de `gps.etapa_liberacao_aluno` no lugar. Sem ela, uma página que passasse o
 * `alunoId` errado receberia ZERO LINHAS (a linha alheia é invisível) e o aluno
 * cairia no global — o que, no caso de uma etapa TRAVADA para ele, abriria a
 * etapa em silêncio. Falha silenciosa que ABRE acesso é o pior tipo; aqui ela
 * vira lista vazia + `logErro`, e o caso é impossível pelas páginas atuais
 * (elas passam `ctx.alunoId`).
 *
 * Nunca lança: liberação de etapa é caminho de renderização de página do aluno,
 * e derrubar a home por causa do override seria trocar um problema pequeno por
 * um grande. Sem overrides, vale o global — o comportamento de antes da feature.
 */
export async function getEtapasLiberadasPara(
  alunoId: string,
): Promise<OverridesLiberacao> {
  if (!alunoId) return {};

  const ctx = await getContextoSessao();
  if (!ctx) return {};
  if (ctx.papel !== "admin" && ctx.alunoId !== alunoId) {
    logErro("central/getEtapasLiberadasPara", {
      code: "42501",
      message: "aluno da sessao diferente do ambiente pedido",
    });
    return {};
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("etapa_liberacao_aluno")
    .select("etapa, liberada, motivo")
    .eq("aluno_id", alunoId);

  if (error) {
    logErro("central/getEtapasLiberadasPara", error, { alunoId });
    return {};
  }

  const out: OverridesLiberacao = {};
  for (const r of (data ?? []) as {
    etapa: number;
    liberada: boolean;
    motivo: string;
  }[]) {
    out[r.etapa] = { liberada: r.liberada, motivo: r.motivo };
  }
  return out;
}
