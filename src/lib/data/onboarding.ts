import { createClient } from "@/lib/supabase/server";
import { getContextoSessao, ehAdmin } from "@/lib/auth";
import { logErro } from "@/lib/log";
import type {
  FaseCliente1,
  GrauRelacao,
  MeuOnboarding,
  OnboardingAnexo,
  OnboardingDaPessoa,
  OrigemCliente1,
  PapelMembro,
  StatusOnboarding,
  TipoAnexoOnboarding,
} from "@/lib/types";

// ─────────────────────────────────────────────────────────────────────────
// Onboarding — o questionário inicial (migrações 20260910000204 a ...206).
//
// Consulta nova nasce em `src/lib/data/<assunto>.ts`, nunca no `data.ts`
// (fachada). Nenhum `select("*")`: as duas leituras passam por RPC, que já
// devolve o shape exato.
//
// 🔑 O onboarding é da PESSOA. `getMeuOnboarding()` não recebe parâmetro e não
// aceita nenhum: a identidade sai de `gps.pessoa_atual()` DENTRO do banco, do
// JWT da sessão. Nada vindo do cliente escolhe de quem é a resposta.
// ─────────────────────────────────────────────────────────────────────────

/** Linha crua do jsonb de `gps.onboarding_meu()`. */
interface RespostasCruas {
  origem_cliente1?: string | null;
  fase_cliente1?: string | null;
  valor_honorarios?: number | string | null;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  cliente_grau_relacao?: string | null;
  descricao_caso?: string | null;
  ajuda_pronta?: string | null;
  cliente_id?: string | null;
  iniciado_em?: string | null;
  concluido_em?: string | null;
}

interface AnexoCru {
  id?: string;
  tipo?: string;
  nome?: string;
  mime?: string;
  tamanho?: number;
  path?: string;
  criado_em?: string;
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

/**
 * `numeric` do Postgres pode chegar como string em alguns caminhos do
 * PostgREST. O teste de nulidade vem ANTES da conversão de propósito:
 * `Number(null)` é 0, e transformar "não informado" em zero aqui produziria um
 * honorário plausível e falso na tela do aluno.
 */
function numero(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapearAnexos(bruto: unknown): OnboardingAnexo[] {
  if (!Array.isArray(bruto)) return [];
  return (bruto as AnexoCru[])
    .filter((a) => typeof a?.id === "string" && typeof a?.path === "string")
    .map((a) => ({
      id: a.id as string,
      tipo: (a.tipo === "contrato_honorarios"
        ? "contrato_honorarios"
        : "documento") as TipoAnexoOnboarding,
      nome: a.nome ?? "arquivo",
      mime: a.mime ?? "application/octet-stream",
      tamanho: Number(a.tamanho ?? 0),
      path: a.path as string,
      criadoEm: a.criado_em ?? "",
    }));
}

function mapearStatus(v: unknown): StatusOnboarding {
  return v === "concluido" || v === "em_andamento" ? v : "nao_iniciado";
}

const MEU_ONBOARDING_VAZIO: Omit<MeuOnboarding, "precisaTrocarSenha"> = {
  status: "nao_iniciado",
  versao: 1,
  passoAtual: 0,
  respostas: {
    origemCliente1: null,
    faseCliente1: null,
    valorHonorarios: null,
    clienteNome: null,
    clienteTelefone: null,
    clienteGrauRelacao: null,
    descricaoCaso: null,
    ajudaPronta: null,
    clienteId: null,
    iniciadoEm: null,
    concluidoEm: null,
  },
  anexos: [],
  ambienteJaTemFavorito: false,
};

/**
 * O estado do questionário da PESSOA logada.
 *
 * `null` quando não há sessão de aluno — o admin não tem pessoa
 * (`gps.pessoa_atual()` devolve null para ele), e o portal do onboarding não
 * abre em modo assistência nem na prévia "como o aluno vê".
 *
 * `precisaTrocarSenha` sai de `ctx.user.user_metadata.gps_senha_temp_em`:
 * **zero consulta**, o metadata já vem do `getUser()` que a sessão memoizada
 * faz uma vez por requisição.
 */
export async function getMeuOnboarding(): Promise<MeuOnboarding | null> {
  const ctx = await getContextoSessao();
  if (!ctx || ctx.papel !== "aluno") return null;

  const precisaTrocarSenha = Boolean(
    (ctx.user.user_metadata as Record<string, unknown> | undefined)
      ?.gps_senha_temp_em,
  );

  // Sem cadastro vinculado não há questionário a mostrar (a Central resolve
  // com "Vincular pessoa"). Evita uma ida ao banco que voltaria 42501.
  if (!ctx.pessoaAlunoId) {
    return { ...MEU_ONBOARDING_VAZIO, precisaTrocarSenha };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("onboarding_meu");

  if (error) {
    // Falha aqui não pode virar "questionário não iniciado" em silêncio: o
    // pop-up abriria de novo para quem já respondeu. Registra e devolve o
    // estado CONCLUÍDO, que é o único seguro — não incomoda ninguém e não
    // apaga nada. O aluno reencontra o questionário no próximo carregamento.
    logErro("getMeuOnboarding", error, {
      rpc: "gps.onboarding_meu",
      efeito: "assume concluido para nao reabrir o pop-up sobre quem ja respondeu",
    });
    return { ...MEU_ONBOARDING_VAZIO, status: "concluido", precisaTrocarSenha };
  }

  const d = (data ?? {}) as Record<string, unknown>;
  const r = (d.respostas ?? {}) as RespostasCruas;

  return {
    status: mapearStatus(d.status),
    versao: Number(d.versao ?? 1),
    passoAtual: Number(d.passo_atual ?? 0),
    precisaTrocarSenha,
    respostas: {
      origemCliente1: (texto(r.origem_cliente1) as OrigemCliente1 | null) ?? null,
      faseCliente1: (texto(r.fase_cliente1) as FaseCliente1 | null) ?? null,
      valorHonorarios: numero(r.valor_honorarios),
      clienteNome: texto(r.cliente_nome),
      clienteTelefone: texto(r.cliente_telefone),
      clienteGrauRelacao:
        (texto(r.cliente_grau_relacao) as GrauRelacao | null) ?? null,
      descricaoCaso: texto(r.descricao_caso),
      ajudaPronta: texto(r.ajuda_pronta),
      clienteId: texto(r.cliente_id),
      iniciadoEm: texto(r.iniciado_em),
      concluidoEm: texto(r.concluido_em),
    },
    anexos: mapearAnexos(d.anexos),
    ambienteJaTemFavorito: Boolean(d.ambiente_ja_tem_favorito),
  };
}

/** Linha crua do jsonb de `gps.admin_onboarding_do_aluno()`. */
interface PessoaCrua extends RespostasCruas {
  membro_id?: string;
  pessoa_aluno_id?: string | null;
  papel?: string;
  nome?: string | null;
  status?: string;
  versao?: number | null;
  passo_atual?: number | null;
  anexos?: unknown;
}

/**
 * O questionário de TODAS as pessoas de um ambiente — o que a equipe vê na
 * Central. Inclui quem ainda não respondeu: "ninguém respondeu ainda" é um
 * resultado, e sumiria da tela se a função só devolvesse quem respondeu.
 *
 * `ehAdmin()` aqui é conveniência; quem decide é o `gp_is_admin()` da RPC.
 */
export async function getOnboardingDoAluno(
  alunoId: string,
): Promise<OnboardingDaPessoa[]> {
  if (!(await ehAdmin())) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_onboarding_do_aluno", { p_aluno_id: alunoId });

  if (error) {
    logErro("getOnboardingDoAluno", error, {
      rpc: "gps.admin_onboarding_do_aluno",
      alunoId,
      efeito: "Central exibe o bloco de onboarding vazio",
    });
    return [];
  }

  const linhas = Array.isArray(data) ? (data as PessoaCrua[]) : [];
  return linhas.map((p) => ({
    membroId: String(p.membro_id ?? ""),
    pessoaAlunoId: texto(p.pessoa_aluno_id),
    papel: (p.papel === "socio" ? "socio" : "titular") as PapelMembro,
    nome: texto(p.nome),
    status: mapearStatus(p.status),
    versao: p.versao ?? null,
    passoAtual: p.passo_atual ?? null,
    iniciadoEm: texto(p.iniciado_em),
    concluidoEm: texto(p.concluido_em),
    origemCliente1: (texto(p.origem_cliente1) as OrigemCliente1 | null) ?? null,
    faseCliente1: (texto(p.fase_cliente1) as FaseCliente1 | null) ?? null,
    valorHonorarios: numero(p.valor_honorarios),
    clienteId: texto(p.cliente_id),
    clienteNome: texto(p.cliente_nome),
    descricaoCaso: texto(p.descricao_caso),
    ajudaPronta: texto(p.ajuda_pronta),
    anexos: mapearAnexos(p.anexos),
  }));
}

/**
 * URL assinada de LEITURA de um anexo do questionário, com `download=`.
 *
 * 🔴 `download` SEMPRE. O MIME de um objeto de storage vem do que o cliente
 * declarou no PUT, não de inspeção de bytes (MÉDIO documentado no pentest de
 * 09/09): servir inline é o que transformaria um "PNG" num HTML executando no
 * domínio do portal. A trava real do projeto é esta, e não a allowlist.
 *
 * Emitida com a SESSÃO de quem chama — quem não passa na policy
 * `gps_onboarding_anexo_select` não consegue nem pedir a URL. Nada de
 * `service_role`.
 */
export async function urlDoAnexoOnboarding(
  path: string,
  nome: string,
): Promise<string | null> {
  const ctx = await getContextoSessao();
  if (!ctx) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from("gps-onboarding")
    .createSignedUrl(path, 60, { download: nome });

  if (error || !data?.signedUrl) {
    logErro("urlDoAnexoOnboarding", error ?? "createSignedUrl sem url");
    return null;
  }
  return data.signedUrl;
}
