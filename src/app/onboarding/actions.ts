"use server";

/**
 * Onboarding (questionário inicial) — Server Actions do ALUNO.
 *
 * 🔴 Server Action é ENDPOINT HTTP. Nada aqui é a fronteira de segurança: a
 * fronteira são as RPCs `SECURITY DEFINER` (migração `20260910000206`), que
 * resolvem a PESSOA por `gps.pessoa_atual()` — do JWT, nunca de parâmetro — e
 * aplicam a obrigatoriedade que o João chamou de fundamental ("execução em
 * andamento ⇒ honorários E contrato assinado"). As validações daqui existem
 * para o erro chegar em PORTUGUÊS à tela e para não gastar uma ida ao banco com
 * entrada obviamente inválida.
 *
 * 🔑 NUNCA `service_role`. O upload usa a SESSÃO DO USUÁRIO: quem não passa
 * pela policy `gps_onboarding_anexo_insert` não consegue nem pedir a URL
 * assinada.
 *
 * 🔑 A pasta é `src/app/onboarding/` e **não tem `page.tsx`** — como
 * `src/app/clientes/actions.ts`, é só o módulo de actions. O portal do
 * questionário é um componente montado no layout do aluno, porque o João disse
 * "assim que ele ingressar", e ingressar pode ser em `/clientes` por um link do
 * e-mail. Se um dia esta pasta ficar sem consumidor, ela SAI (a lição de
 * `src/app/agenda/`: Server Actions órfãs continuam compiladas e expostas).
 */

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";
import { MSG_SENHA_MINIMO, SENHA_MINIMO } from "@/lib/senha-regras";
import { logErro } from "@/lib/log";
import {
  ANEXO_PATH_REGEX,
  ANEXO_TAMANHO_MAXIMO,
  EXTENSAO_POR_MIME,
  ehAnexoMime,
  nomeDeArquivoSeguro,
} from "@/lib/chamados-tipos";
import {
  FASES_CLIENTE1,
  GRAUS_RELACAO,
  ORIGENS_CLIENTE1,
  type OnboardingAnexo,
  type TipoAnexoOnboarding,
} from "@/lib/types";
import { PAISES } from "@/components/onboarding/tipos";

/**
 * ⚠️ As constantes de anexo vêm de `chamados-tipos.ts` de propósito: o contrato
 * do anexo é IDÊNTICO byte a byte (mesmos 4 MIMEs, mesmos 5 MB, mesmo formato
 * `<uuid>/<uuid>.<ext>`, mesma derivação de extensão a partir do TIPO e não do
 * nome). Copiá-las criaria um segundo lugar para a allowlist divergir do
 * bucket. O que muda é só o nome do bucket, abaixo.
 */
const BUCKET_ONBOARDING = "gps-onboarding";

const TEXTO_MAXIMO = 4000;

export type ResultadoOnboarding = { erro?: string };

/**
 * O que a tela pode mandar em `salvarPassoOnboarding`. Espelha a ALLOWLIST de
 * `gps.onboarding_salvar_passo` — chave desconhecida ABORTA no banco, aqui e lá.
 */
export interface PatchOnboarding {
  origem_cliente1?: string | null;
  fase_cliente1?: string | null;
  valor_honorarios?: number | null;
  cliente_nome?: string | null;
  cliente_telefone?: string | null;
  cliente_grau_relacao?: string | null;
  cliente_pais?: string | null;
  honorarios_pactuados?: boolean | null;
  descricao_caso?: string | null;
  ajuda_pronta?: string | null;
}

const CHAVES_PATCH_ONBOARDING: ReadonlySet<string> = new Set([
  "origem_cliente1",
  "fase_cliente1",
  "valor_honorarios",
  "cliente_nome",
  "cliente_telefone",
  "cliente_grau_relacao",
  "cliente_pais",
  "honorarios_pactuados",
  "descricao_caso",
  "ajuda_pronta",
]);

/** Aluno logado, com ambiente. O admin NÃO responde questionário. */
async function exigirAluno(): Promise<
  { ok: true; alunoId: string } | { ok: false; erro: string }
> {
  const ctx = await getContextoSessao();
  if (!ctx || ctx.papel !== "aluno" || !ctx.alunoId) {
    return { ok: false, erro: "Você não tem acesso ao questionário inicial." };
  }
  if (!ctx.pessoaAlunoId) {
    return {
      ok: false,
      erro: "Seu cadastro ainda não está vinculado ao programa. Fale com a equipe.",
    };
  }
  return { ok: true, alunoId: ctx.alunoId };
}

/**
 * `"/"` com `"layout"` cobre TODAS as páginas do aluno — o questionário monta
 * no layout, e concluir muda a home (favorito), a Etapa 01 (passos 4–8
 * destravam) e a aba Clientes. `/admin` porque o chip do painel e o dashboard
 * mudam junto.
 */
function revalidar(alunoId: string) {
  revalidatePath("/", "layout");
  revalidatePath("/clientes", "layout");
  revalidatePath("/etapa", "layout");
  revalidatePath(`/admin/aluno/${alunoId}`, "layout");
  revalidatePath("/admin", "layout");
}

// ─────────────────────────────────────────────────────────────────────────
// 1. salvarPassoOnboarding
// ─────────────────────────────────────────────────────────────────────────

export async function salvarPassoOnboarding(
  passo: number,
  dados: PatchOnboarding,
): Promise<ResultadoOnboarding> {
  const guarda = await exigirAluno();
  if (!guarda.ok) return { erro: guarda.erro };

  // Faixa 0..6. Saíram em 10/09/2026: anexo de documentos, tour e a
  // pergunta "descreva o seu caso". O banco refaz esta checagem.
  if (!Number.isInteger(passo) || passo < 0 || passo > 6) {
    return { erro: "Passo inválido." };
  }

  // Allowlist em RUNTIME: o tipo acima só vale em compilação, e uma chamada
  // forjada manda o que quiser. O banco refaz a mesma checagem — aqui é para a
  // frase ser boa e não gastar round-trip.
  const limpo: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(dados ?? {})) {
    if (CHAVES_PATCH_ONBOARDING.has(k)) limpo[k] = v;
  }
  // `{}` é válido: os passos 1 ("Vamos começar") e 7→8 só avançam
  // `passo_atual`, sem dado novo — a RPC aceita objeto vazio e apenas move o
  // ponteiro da retomada. Uma guarda "Nada para salvar" aqui prendia TODO
  // aluno no passo 1 (achado do Fable, 10/09/2026).

  if (
    "origem_cliente1" in limpo &&
    limpo.origem_cliente1 != null &&
    !(ORIGENS_CLIENTE1 as readonly string[]).includes(
      String(limpo.origem_cliente1),
    )
  ) {
    return { erro: "Escolha de onde virá o seu cliente 1." };
  }
  if (
    "fase_cliente1" in limpo &&
    limpo.fase_cliente1 != null &&
    limpo.fase_cliente1 !== "" &&
    !(FASES_CLIENTE1 as readonly string[]).includes(String(limpo.fase_cliente1))
  ) {
    return { erro: "Informe em que fase você está com este cliente." };
  }
  if (
    "cliente_grau_relacao" in limpo &&
    limpo.cliente_grau_relacao != null &&
    limpo.cliente_grau_relacao !== "" &&
    !(GRAUS_RELACAO as readonly string[]).includes(
      String(limpo.cliente_grau_relacao),
    )
  ) {
    return { erro: "Escolha um grau de relação da lista." };
  }
  if (
    "cliente_pais" in limpo &&
    limpo.cliente_pais != null &&
    limpo.cliente_pais !== "" &&
    !PAISES.some((x) => x.id === String(limpo.cliente_pais))
  ) {
    return { erro: "Escolha o país da lista." };
  }
  if (
    "honorarios_pactuados" in limpo &&
    limpo.honorarios_pactuados != null &&
    typeof limpo.honorarios_pactuados !== "boolean"
  ) {
    return { erro: "Responda sim ou não sobre os honorários pactuados." };
  }
  if ("valor_honorarios" in limpo) {
    const v = limpo.valor_honorarios;
    if (v === null || v === undefined || v === "") {
      limpo.valor_honorarios = null;
    } else if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      return { erro: "Informe o valor dos honorários como número." };
    } else if (v > 9_999_999_999.99) {
      return { erro: "Honorários: valor fora do limite permitido." };
    }
  }
  for (const campo of ["descricao_caso", "ajuda_pronta"] as const) {
    const v = limpo[campo];
    if (typeof v === "string" && v.length > TEXTO_MAXIMO) {
      return { erro: "O texto passa de 4.000 caracteres." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("onboarding_salvar_passo", {
    p_passo: passo,
    // `null` viraria "sem chave nenhuma" no jsonb; `{}` é válido e só
    // avança `passo_atual` (passos 1 e 7→8).
    p_dados: limpo,
  });

  if (error) {
    return { erro: traduzirErroBanco("salvarPassoOnboarding", error) };
  }
  return {};
}

// ─────────────────────────────────────────────────────────────────────────
// 2. criarUploadAssinadoOnboarding
// ─────────────────────────────────────────────────────────────────────────
/**
 * URL assinada de UPLOAD, emitida com a sessão do aluno. Molde literal de
 * `criarUploadAssinadoDeAnexo` (`src/app/chamados/actions.ts`).
 *
 * Por que existe, se a policy de `storage.objects` já decide: o caminho é
 * montado NO SERVIDOR (`<ambiente_aluno_id>/<uuid>.<ext>`, com a extensão
 * derivada do MIME e **não** do nome do arquivo) e o MIME/tamanho passam pela
 * allowlist antes de qualquer byte subir. O aluno nunca escolhe onde grava.
 *
 * 🔴 O ADMIN NÃO ANEXA: para ele `papel !== "aluno"` e a função recusa — a mesma
 * decisão que `gps.pode_anexar_onboarding` impõe no banco.
 */
export async function criarUploadAssinadoOnboarding(input: {
  nome: string;
  mime: string;
  tamanho: number;
  tipo: TipoAnexoOnboarding;
}): Promise<
  | { ok: true; path: string; token: string; nome: string }
  | { ok: false; erro: string }
> {
  const guarda = await exigirAluno();
  if (!guarda.ok) return { ok: false, erro: guarda.erro };

  if (input.tipo !== "contrato_honorarios" && input.tipo !== "documento") {
    return { ok: false, erro: "Tipo de anexo inválido." };
  }
  if (!ehAnexoMime(input.mime)) {
    return { ok: false, erro: "Formato não aceito. Envie PNG, JPG, WEBP ou PDF." };
  }
  if (
    !Number.isInteger(input.tamanho) ||
    input.tamanho < 1 ||
    input.tamanho > ANEXO_TAMANHO_MAXIMO
  ) {
    return { ok: false, erro: "Arquivo maior que 5 MB." };
  }
  const nome = nomeDeArquivoSeguro(input.nome);
  if (!nome) return { ok: false, erro: "Nome de arquivo inválido." };

  // O PREFIXO é o AMBIENTE (não a pessoa): mantém as guardas idênticas às do
  // chamado, que já foram auditadas duas vezes.
  const path = `${guarda.alunoId}/${randomUUID()}.${EXTENSAO_POR_MIME[input.mime]}`;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET_ONBOARDING)
    .createSignedUploadUrl(path);

  if (error || !data?.token) {
    // 403 aqui é, quase sempre, o questionário já concluído: a policy de
    // insert exige `concluido_em is null` para aquela pessoa.
    logErro(
      "criarUploadAssinadoOnboarding",
      error ?? "createSignedUploadUrl sem token",
    );
    return {
      ok: false,
      erro: "Não foi possível preparar o envio do arquivo. Recarregue a página e tente de novo.",
    };
  }

  return { ok: true, path, token: data.token, nome };
}

// ─────────────────────────────────────────────────────────────────────────
// 3. registrarAnexoOnboarding
// ─────────────────────────────────────────────────────────────────────────

export async function registrarAnexoOnboarding(input: {
  tipo: TipoAnexoOnboarding;
  path: string;
  nome: string;
  mime: string;
  tamanho: number;
}): Promise<ResultadoOnboarding & { anexo?: OnboardingAnexo }> {
  const guarda = await exigirAluno();
  if (!guarda.ok) return { erro: guarda.erro };

  if (input.tipo !== "contrato_honorarios" && input.tipo !== "documento") {
    return { erro: "Tipo de anexo inválido." };
  }
  if (!ANEXO_PATH_REGEX.test(input.path ?? "")) {
    return { erro: "Não foi possível anexar o arquivo. Tente enviar de novo." };
  }
  if (!ehAnexoMime(input.mime)) {
    return { erro: "Formato não aceito. Envie PNG, JPG, WEBP ou PDF." };
  }
  if (
    !Number.isInteger(input.tamanho) ||
    input.tamanho < 1 ||
    input.tamanho > ANEXO_TAMANHO_MAXIMO
  ) {
    return { erro: "Arquivo maior que 5 MB." };
  }
  const nome = nomeDeArquivoSeguro(input.nome);
  if (!nome) return { erro: "Nome de arquivo inválido." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("onboarding_registrar_anexo", {
      p_tipo: input.tipo,
      p_path: input.path,
      p_nome: nome,
      p_mime: input.mime,
      p_tamanho: input.tamanho,
    });

  if (error) return { erro: traduzirErroBanco("registrarAnexoOnboarding", error) };

  // 🔑 A LINHA GRAVADA volta para a tela. A RPC já devolve
  // `{id, tipo, nome, mime, tamanho, path}` — descartar isso obrigaria a tela
  // a inventar um `id` para poder remover o anexo depois, ou a refazer a
  // leitura inteira do questionário só para descobrir o que ela mesma acabou
  // de mandar gravar. O `id` e o `mime` são os do BANCO (o MIME sai de
  // `storage.objects.metadata`), não os que o cliente declarou.
  const d = (data ?? {}) as Record<string, unknown>;
  if (!d.id) {
    return {
      erro: "Não foi possível registrar o arquivo. Tente enviar de novo.",
    };
  }
  return {
    anexo: {
      id: String(d.id),
      tipo: (d.tipo as TipoAnexoOnboarding) ?? input.tipo,
      nome: String(d.nome ?? nome),
      mime: String(d.mime ?? input.mime),
      tamanho: Number(d.tamanho ?? input.tamanho),
      path: String(d.path ?? input.path),
      criadoEm: new Date().toISOString(),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 4. removerAnexoOnboarding
// ─────────────────────────────────────────────────────────────────────────
/**
 * ⚠️ Tira a LINHA da lista. O arquivo continua no bucket até o expurgo do admin
 * (B-R1): a Storage API exige sessão, a policy de DELETE é só de admin e o GPS
 * não usa `service_role`. A tela precisa dizer isso — fingir que o arquivo
 * sumiu seria mentira, e é a lição do expurgo de chamados.
 */
export async function removerAnexoOnboarding(
  id: string,
): Promise<ResultadoOnboarding> {
  const guarda = await exigirAluno();
  if (!guarda.ok) return { erro: guarda.erro };
  if (!id) return { erro: "Anexo não informado." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("onboarding_remover_anexo", { p_id: id });

  if (error) return { erro: traduzirErroBanco("removerAnexoOnboarding", error) };
  return {};
}

// ─────────────────────────────────────────────────────────────────────────
// 5. concluirOnboarding
// ─────────────────────────────────────────────────────────────────────────
/**
 * Fecha o questionário. É ATÔMICA no banco: valida a obrigatoriedade, cria o
 * cliente 1, favorita (só se o ambiente ainda não tiver favorito) e carimba a
 * conclusão — tudo ou nada.
 *
 * `favoritado: false` num ambiente que já tem favorito **não é falha**: é a
 * regra, e a tela diz "A equipe já acompanha <Nome>. Este cliente entrou na sua
 * lista de clientes."
 */
export async function concluirOnboarding(): Promise<
  ResultadoOnboarding & { clienteId?: string | null; favoritado?: boolean }
> {
  const guarda = await exigirAluno();
  if (!guarda.ok) return { erro: guarda.erro };

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("onboarding_concluir");

  if (error) return { erro: traduzirErroBanco("concluirOnboarding", error) };

  revalidar(guarda.alunoId);
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    clienteId: (d.cliente_id as string | null) ?? null,
    favoritado: Boolean(d.favoritado),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 6. trocarSenhaObrigatoria — o passo 0
// ─────────────────────────────────────────────────────────────────────────
/**
 * Troca a senha usando a SESSÃO ATIVA (não depende de token de e-mail) e limpa
 * a marca `gps_senha_temp_em` no mesmo `updateUser`.
 *
 * ⚠️ A senha vale para TODOS os portais do grupo — `auth.users` é compartilhado
 * por 7 sistemas. A tela é obrigada a dizer isso, como o card de `/perfil` já diz.
 *
 * ⚠️ E isto é UX, não fronteira de segurança: o próprio usuário pode limpar o
 * metadata pelo GoTrue e pular o passo. Está escrito de propósito — a marca não
 * concede nada, nenhuma guarda a lê.
 */
export async function trocarSenhaObrigatoria(
  nova: string,
): Promise<ResultadoOnboarding> {
  const guarda = await exigirAluno();
  if (!guarda.ok) return { erro: guarda.erro };

  const senha = (nova ?? "").trim();
  if (senha.length < SENHA_MINIMO) {
    return { erro: MSG_SENHA_MINIMO };
  }
  if (senha.length > 72) {
    // bcrypt trunca em 72 bytes: aceitar mais é aceitar uma senha que o GoTrue
    // não vai guardar inteira, e o usuário não teria como saber.
    return { erro: "A senha passa de 72 caracteres." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    password: senha,
    data: { gps_senha_temp_em: null },
  });

  if (error) {
    // GoTrue, não Postgres: `traduzirErroBanco` não serve. As duas causas
    // reais precisam chegar ao usuário com o que fazer.
    //
    // 🔴 CLASSIFICA POR `error.code`, NUNCA POR `error.message`. Este passo é
    // obrigatório para todo aluno com senha temporária, e repetir a senha
    // atual é o erro mais comum dele: o GoTrue devolve `same_password` com a
    // mensagem "New password should be different from the old password", que
    // casa com `/password/i`. Com o teste de mensagem primeiro, a tela acusava
    // "Senha fraca" — juízo errado sobre a senha da pessoa.
    const codigo = error.code ?? null;
    logErro("trocarSenhaObrigatoria", error, { code: codigo });
    if (codigo === "same_password") {
      return { erro: "Escolha uma senha diferente da atual." };
    }
    if (codigo === "weak_password") {
      return { erro: "Senha fraca: escolha uma senha mais forte." };
    }
    // Fallback SÓ quando o GoTrue não mandou `code` (versões antigas do
    // servidor de auth). Mesmo aqui, "senha igual" é testada antes de "senha
    // fraca" — a frase específica vem primeiro, a genérica depois.
    if (!codigo) {
      const msg = error.message ?? "";
      if (/different from the old password/i.test(msg)) {
        return { erro: "Escolha uma senha diferente da atual." };
      }
      if (/password/i.test(msg)) {
        return { erro: "Senha fraca: escolha uma senha mais forte." };
      }
    }
    return { erro: "Não foi possível trocar a senha agora. Tente de novo." };
  }

  revalidar(guarda.alunoId);
  return {};
}
