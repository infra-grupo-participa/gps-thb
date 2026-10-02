"use server";

/**
 * Minutas da ficha do cliente — as server actions (upload assinado,
 * registrar versão, remover versão, URL de download). Molde literal de
 * `criarUploadAssinadoContratoCliente`/`registrarContratoCliente`/
 * `removerContratoCliente`/`urlDeDownloadDoContratoCliente`
 * (`src/app/clientes/actions.ts`), adaptado a:
 *
 *   - bucket próprio `gps-minutas` (não `gps-onboarding`);
 *   - só PDF, sem escolha de extensão por MIME (é sempre `.pdf`);
 *   - anexar é dono do ambiente OU admin (o contrato usa a mesma regra —
 *     diferente do chamado/onboarding, que são só do aluno);
 *   - N versões: `registrarMinutaCliente` INSERE uma linha nova a cada
 *     chamada, nunca substitui; existe `removerMinutaCliente` para tirar uma
 *     versão específica da lista.
 *
 * Arquivo separado de `clientes/actions.ts` por pedido do plano — mesmo
 * assunto (ficha do cliente), escopo próprio (minutas), sem crescer ainda
 * mais o arquivo principal.
 *
 * 🔴 Nada aqui é a fronteira de segurança. A fronteira são, nesta ordem:
 *   1. o BUCKET `gps-minutas` (privado, 5 MB, só application/pdf);
 *   2. as POLICIES `gps_minutas_insert`/`_select` em `storage.objects`;
 *   3. a RPC `gps.cliente_minuta_anexar`/`_remover` (SECURITY DEFINER);
 *   4. a RLS de `gps.cliente_minutas` (leitura só admin/dono do ambiente).
 * As validações daqui existem para o erro chegar em PORTUGUÊS e para não
 * gastar ida ao banco com entrada obviamente inválida.
 *
 * 🔑 NUNCA `service_role`: upload e download usam a sessão do usuário.
 */

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, getContextoSessao } from "@/lib/auth";
import { ehSessaoIndeterminada } from "@/lib/auth-erros";
import { traduzirErroBanco, MSG_SESSAO_INDETERMINADA } from "@/lib/erros";
import { logErro } from "@/lib/log";
import { UUID_RE } from "@/lib/texto";
import { enviarMinutaRevisadaParaParceiro } from "@/lib/email-minutas";
import {
  BUCKET_MINUTAS,
  MINUTA_CONTEXTO_MAXIMO,
  MINUTA_EXTENSAO,
  MINUTA_NOTA_MAXIMO,
  MINUTA_PARECER_MAXIMO,
  MINUTA_PATH_REGEX,
  MINUTA_TAMANHO_MAXIMO,
  ehMinutaMime,
  ehMinutaStatus,
  nomeDeMinutaSeguro,
} from "@/lib/minutas-tipos";

function revalidarFicha(alunoId: string) {
  revalidatePath("/clientes");
  revalidatePath("/clientes", "layout");
  revalidatePath(`/admin/aluno/${alunoId}`, "layout");
}

/**
 * A ficha do cliente, lida COM A SESSÃO de quem chama — a RLS de
 * `gps.etapa1_clientes` só devolve linha para o dono do ambiente
 * (`gps.aluno_atual()`) ou para o admin. Não há aqui nenhuma comparação com
 * `alunoId` vindo do cliente: o parâmetro é o id do CLIENTE e o ambiente sai
 * da linha. Molde de `fichaDoCliente` em `clientes/actions.ts` — cópia
 * deliberada (campos diferentes: aqui não precisa dos campos de contrato).
 */
async function ambienteDoCliente(
  clienteId: string,
): Promise<{ ok: true; alunoId: string } | { ok: false; erro: string }> {
  if (!clienteId) return { ok: false, erro: "Cliente não informado." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select("id, aluno_id")
    .eq("id", clienteId)
    .maybeSingle();

  if (error) {
    return { ok: false, erro: traduzirErroBanco("ambienteDoCliente", error) };
  }
  if (!data) return { ok: false, erro: "Cliente não encontrado." };
  return { ok: true, alunoId: data.aluno_id as string };
}

/**
 * URL assinada de UPLOAD, emitida com a sessão de quem chama. O caminho é
 * montado NO SERVIDOR — `<aluno_id do AMBIENTE>/<uuid>.pdf` — o usuário
 * nunca escolhe onde grava. Ao contrário do contrato (só o aluno), aqui
 * admin em modo assistência TAMBÉM pode anexar: `gps.pode_anexar_minuta`
 * aceita dono do ambiente OU admin.
 */
export async function criarUploadAssinadoMinutaCliente(input: {
  clienteId: string;
  nome: string;
  mime: string;
  tamanho: number;
}): Promise<
  | { ok: true; bucket: string; path: string; token: string; nome: string }
  | { ok: false; erro: string }
> {
  let ctx;
  try {
    ctx = await getContextoSessao();
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    return { ok: false, erro: MSG_SESSAO_INDETERMINADA };
  }
  if (!ctx || (ctx.papel !== "aluno" && ctx.papel !== "admin")) {
    return { ok: false, erro: "Sem permissão para anexar a minuta." };
  }

  if (!ehMinutaMime(input.mime)) {
    return { ok: false, erro: "Formato não aceito. Envie um arquivo PDF." };
  }
  if (
    !Number.isInteger(input.tamanho) ||
    input.tamanho < 1 ||
    input.tamanho > MINUTA_TAMANHO_MAXIMO
  ) {
    return { ok: false, erro: "Arquivo maior que 5 MB." };
  }
  const nome = nomeDeMinutaSeguro(input.nome);
  if (!nome) return { ok: false, erro: "Nome de arquivo inválido." };

  const ficha = await ambienteDoCliente(input.clienteId);
  if (!ficha.ok) return { ok: false, erro: ficha.erro };

  // Para o aluno, o ambiente da ficha é o próprio ambiente (a RLS não
  // devolveria ficha de outro); para o admin, qualquer ambiente é válido —
  // a igualdade só se aplica a quem não é admin. Quem decide de verdade é a
  // policy do bucket (`gps.pode_anexar_minuta`), lida com a MESMA sessão.
  if (ctx.papel === "aluno" && ficha.alunoId !== ctx.alunoId) {
    return { ok: false, erro: "Cliente não encontrado." };
  }

  const path = `${ficha.alunoId}/${randomUUID()}.${MINUTA_EXTENSAO}`;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET_MINUTAS)
    .createSignedUploadUrl(path);

  if (error || !data?.token) {
    logErro(
      "criarUploadAssinadoMinutaCliente",
      error ?? "createSignedUploadUrl sem token",
      { clienteId: input.clienteId },
    );
    return {
      ok: false,
      erro: "Não foi possível preparar o envio do arquivo. Recarregue a página e tente de novo.",
    };
  }

  return { ok: true, bucket: BUCKET_MINUTAS, path, token: data.token, nome };
}

/**
 * Grava uma VERSÃO NOVA da minuta depois de o arquivo subir. Quem confere
 * que o objeto existe e qual é o MIME/tamanho REAL é a RPC, lendo
 * `storage.objects.metadata` — o que chega daqui é declaração, nunca fonte.
 *
 * Ao contrário do contrato, NÃO substitui: cada chamada bem-sucedida cria
 * uma linha nova em `gps.cliente_minutas`, e as anteriores ficam — é o
 * histórico de versões que o Marcio pediu.
 *
 * Contexto obrigatório (17/09/2026, migração `...273`): `caso`/`oQueFoiFeito`/
 * `pontoDeAjuda` (1ª minuta) e `oQueMudou` (2ª em diante) são repassados à
 * RPC exatamente como vieram — só TAMANHO é validado aqui (mensagem em
 * português mais rápida que ida ao banco). A OBRIGATORIEDADE em si não é
 * replicada: a fronteira é `gps.cliente_minuta_anexar`, que sabe se é a 1ª
 * minuta do cliente e se o interruptor está ligado. Duplicar a regra aqui
 * divergiria no dia em que `minuta_contexto_obrigatorio` mudasse.
 */
export async function registrarMinutaCliente(input: {
  clienteId: string;
  path: string;
  nome: string;
  tamanho: number;
  notas?: string | null;
  caso?: string | null;
  oQueFoiFeito?: string | null;
  pontoDeAjuda?: string | null;
  oQueMudou?: string | null;
}): Promise<{ erro?: string }> {
  if (!MINUTA_PATH_REGEX.test(input.path ?? "")) {
    return { erro: "Não foi possível anexar o arquivo. Tente enviar de novo." };
  }
  if (
    !Number.isInteger(input.tamanho) ||
    input.tamanho < 1 ||
    input.tamanho > MINUTA_TAMANHO_MAXIMO
  ) {
    return { erro: "Arquivo maior que 5 MB." };
  }
  const nome = nomeDeMinutaSeguro(input.nome);
  if (!nome) return { erro: "Nome de arquivo inválido." };

  const notas = (input.notas ?? "").trim();
  if (notas.length > MINUTA_NOTA_MAXIMO) {
    return { erro: "As notas da minuta estão muito longas." };
  }

  const caso = (input.caso ?? "").trim();
  if (caso.length > MINUTA_CONTEXTO_MAXIMO) {
    return { erro: "Descreva o caso para enviar a primeira minuta." };
  }
  const oQueFoiFeito = (input.oQueFoiFeito ?? "").trim();
  if (oQueFoiFeito.length > MINUTA_CONTEXTO_MAXIMO) {
    return { erro: "Informe o que já foi feito no caso." };
  }
  const pontoDeAjuda = (input.pontoDeAjuda ?? "").trim();
  if (pontoDeAjuda.length > MINUTA_CONTEXTO_MAXIMO) {
    return { erro: "Informe o primeiro ponto em que você precisa de ajuda." };
  }
  const oQueMudou = (input.oQueMudou ?? "").trim();
  if (oQueMudou.length > MINUTA_CONTEXTO_MAXIMO) {
    return { erro: "Informe o que foi alterado em relação à minuta anterior." };
  }

  const ficha = await ambienteDoCliente(input.clienteId);
  if (!ficha.ok) return { erro: ficha.erro };

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("cliente_minuta_anexar", {
    p_cliente_id: input.clienteId,
    p_path: input.path,
    p_nome: nome,
    p_tamanho: input.tamanho,
    p_notas: notas === "" ? null : notas,
    p_caso: caso === "" ? null : caso,
    p_o_que_foi_feito: oQueFoiFeito === "" ? null : oQueFoiFeito,
    p_ponto_de_ajuda: pontoDeAjuda === "" ? null : pontoDeAjuda,
    p_o_que_mudou: oQueMudou === "" ? null : oQueMudou,
  });

  if (error) {
    return {
      erro: traduzirErroBanco("registrarMinutaCliente", error, {
        clienteId: input.clienteId,
      }),
    };
  }

  revalidarFicha(ficha.alunoId);
  return {};
}

/**
 * Tira UMA versão da lista. O ARQUIVO continua no bucket até o expurgo do
 * admin — a mesma verdade do contrato e do anexo do questionário.
 *
 * Dono do ambiente OU admin (quem decide é a RPC). A trava do favorito NÃO
 * bloqueia: minuta é ficha, não vínculo.
 */
export async function removerMinutaCliente(
  clienteId: string,
  minutaId: string,
): Promise<{ erro?: string }> {
  const ficha = await ambienteDoCliente(clienteId);
  if (!ficha.ok) return { erro: ficha.erro };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("cliente_minuta_remover", { p_minuta_id: minutaId });

  if (error) {
    return {
      erro: traduzirErroBanco("removerMinutaCliente", error, {
        minutaId,
        clienteId,
      }),
    };
  }

  revalidarFicha(ficha.alunoId);
  return {};
}

/**
 * URL assinada de LEITURA, emitida NO CLIQUE e válida por 60 segundos.
 * `download` sempre — mesma regra do contrato/chamado/onboarding: o MIME de
 * um objeto de storage vem do que o cliente declarou no PUT, não de
 * inspeção de bytes, e servir inline abriria a porta para HTML executando
 * no domínio do Supabase disfarçado de PDF.
 *
 * O `path`/`nome` são lidos DO BANCO pela linha da minuta (RLS de
 * `gps.cliente_minutas`, a mesma que decide se quem chama pode ver essa
 * versão) — nunca aceitos como argumento vindo do cliente, senão um `path`
 * forjado tentaria assinar o objeto de outro ambiente (a policy do bucket
 * recusaria, mas o erro chegaria como falha genérica de storage em vez de
 * "não encontrado").
 */
export async function urlDeDownloadDaMinutaCliente(
  clienteId: string,
  minutaId: string,
): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("cliente_minutas")
    .select("id, cliente_id, path, nome")
    .eq("id", minutaId)
    .eq("cliente_id", clienteId)
    .maybeSingle();

  if (error) {
    logErro("urlDeDownloadDaMinutaCliente", error, { clienteId, minutaId });
    return {
      ok: false,
      erro: "Não foi possível abrir este arquivo agora. Atualize a página e tente de novo.",
    };
  }
  if (!data) return { ok: false, erro: "Minuta não encontrada." };

  const path = data.path as string;
  if (!MINUTA_PATH_REGEX.test(path)) {
    return { ok: false, erro: "Arquivo inválido." };
  }

  const { data: assinada, error: erroAssinatura } = await supabase.storage
    .from(BUCKET_MINUTAS)
    .createSignedUrl(path, 60, {
      download: (data.nome as string) || "minuta.pdf",
    });

  if (erroAssinatura || !assinada?.signedUrl) {
    logErro(
      "urlDeDownloadDaMinutaCliente",
      erroAssinatura ?? "createSignedUrl sem url",
      { clienteId, minutaId },
    );
    return {
      ok: false,
      erro: "Não foi possível abrir este arquivo agora. Atualize a página e tente de novo.",
    };
  }
  return { ok: true, url: assinada.signedUrl };
}

/**
 * Frases de `gps.minuta_registrar_parecer` (…341). Passadas como
 * `frasesExtras` a `traduzirErroBanco` (casamento por igualdade exata) em vez
 * de crescer o mapa global de `erros.ts`.
 */
const FRASES_PARECER: Record<string, string> = {
  "Minuta não informada.":
    "Não foi possível identificar a minuta. Recarregue a página e tente de novo.",
  "Status de minuta inválido.": "Escolha um status válido para a minuta.",
  "O parecer passa de 4000 caracteres.": "O parecer pode ter até 4000 caracteres.",
  "Escreva o parecer para marcar a minuta como revisada.":
    "Escreva o parecer para marcar a minuta como revisada.",
};

/**
 * A EQUIPE registra o status e o parecer de UMA versão de minuta (…341,
 * decisão do João 02/10/2026, card 86akryphf). Sem integração com o gerador
 * de minutas.
 *
 * 🔴 `ehAdmin()` aqui é atalho de mensagem; a fronteira é a RPC
 * (`gp_is_admin()` → 42501). Server Action é endpoint HTTP: esconder o
 * formulário do parceiro não protege nada.
 *
 * E-mail ao parceiro SÓ quando o status gravado é `revisada`, DEPOIS do commit,
 * e a falha dele não desfaz o parecer (molde de `avisarAlunoDaDecisao` nos
 * chamados). O destinatário vem do banco (`avisar`), nunca do cliente.
 * `avisado` diz à tela se o e-mail saiu — sem fingir aviso que não houve.
 */
export async function registrarParecerMinuta(input: {
  minutaId: string;
  status: string;
  parecer?: string | null;
}): Promise<{ erro?: string; avisado?: boolean }> {
  let admin: boolean;
  try {
    admin = await ehAdmin();
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    return { erro: MSG_SESSAO_INDETERMINADA };
  }
  if (!admin) return { erro: "Sem permissão." };

  if (!UUID_RE.test(input.minutaId ?? "")) {
    return { erro: FRASES_PARECER["Minuta não informada."] };
  }
  if (!ehMinutaStatus(input.status)) {
    return { erro: FRASES_PARECER["Status de minuta inválido."] };
  }
  const parecer = (input.parecer ?? "").trim();
  if (parecer.length > MINUTA_PARECER_MAXIMO) {
    return { erro: FRASES_PARECER["O parecer passa de 4000 caracteres."] };
  }
  if (input.status === "revisada" && parecer === "") {
    return { erro: FRASES_PARECER["Escreva o parecer para marcar a minuta como revisada."] };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("minuta_registrar_parecer", {
      p_minuta_id: input.minutaId,
      p_status: input.status,
      p_parecer: parecer === "" ? null : parecer,
    });

  if (error) {
    return {
      erro: traduzirErroBanco(
        "registrarParecerMinuta",
        error,
        { minutaId: input.minutaId, status: input.status },
        FRASES_PARECER,
      ),
    };
  }

  const r = (data ?? {}) as {
    cliente_id?: string | null;
    aluno_id?: string | null;
    cliente_nome?: string | null;
    status?: string | null;
    avisar?: string | null;
  };

  if (r.aluno_id) revalidarFicha(r.aluno_id);

  if (r.status !== "revisada") return {};

  if (!r.avisar || !r.cliente_id) {
    logErro("registrarParecerMinuta", "parecer gravado sem destinatario para o aviso", {
      minutaId: input.minutaId,
    });
    return { avisado: false };
  }
  const envio = await enviarMinutaRevisadaParaParceiro({
    para: r.avisar,
    clienteNome: r.cliente_nome ?? null,
    clienteId: r.cliente_id,
  });
  if (!envio.ok) {
    logErro("registrarParecerMinuta", envio.erro ?? "falha sem detalhe", {
      minutaId: input.minutaId,
    });
  }
  return { avisado: envio.ok };
}
