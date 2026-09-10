"use server";

/**
 * Chamados (suporte do portal) — Server Actions do ALUNO.
 *
 * 🔴 Server Action é ENDPOINT HTTP. Nada aqui é a fronteira de segurança: a
 * fronteira são as RPCs `SECURITY DEFINER` (migração `20260909000111`), que
 * derivam o papel no servidor (`gp_is_admin()` → equipe; membro do ambiente →
 * aluno; ninguém mais → 42501), aplicam o interruptor e os limites. As
 * validações daqui existem para o erro chegar em PORTUGUÊS à tela e para não
 * gastar uma ida ao banco com entrada obviamente inválida.
 *
 * 🔑 NUNCA `service_role`. O upload e o download do anexo usam a SESSÃO DO
 * USUÁRIO: quem não passa pela policy de `storage.objects` não consegue nem
 * pedir a URL assinada.
 *
 * 🔑 E-MAIL DEPOIS DO COMMIT, e falha de e-mail NÃO desfaz o chamado. As RPCs
 * devolvem `avisar`/`avisar_equipe` já preenchido só quando o status MUDOU;
 * aqui só se envia o que veio. Resend fora do ar vira `logErro` com contexto
 * (uma linha JSON, `src/lib/log.ts`) — o chamado continua de pé.
 */

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { traduzirErroBanco, type ErroDeBanco } from "@/lib/erros";
import { logErro } from "@/lib/log";
import { listaDeEmails } from "@/lib/texto";
import {
  enviarChamadoAbertoParaEquipe,
  enviarChamadoRespondidoParaAluno,
} from "@/lib/email-chamados";
import {
  ANEXO_PATH_REGEX,
  ANEXO_TAMANHO_MAXIMO,
  BUCKET_CHAMADOS,
  CHAMADO_ASSUNTO_MAXIMO,
  CHAMADO_ASSUNTO_MINIMO,
  CHAMADO_TEXTO_MAXIMO,
  EXTENSAO_POR_MIME,
  ehAnexoMime,
  nomeDeArquivoSeguro,
  type AnexoInput,
  type ResultadoAbrir,
  type ResultadoAcao,
} from "@/lib/chamados-tipos";

/**
 * Tradução dos erros das RPCs de CHAMADO para frase de tela.
 *
 * A chave é a mensagem CRUA das RPCs (sem acento, como elas levantam). O que
 * não estiver aqui cai no mapa comum de `traduzirErroBanco` e, se nem lá
 * estiver, vira frase genérica + `logErro`: `error.message` cru nunca chega
 * ao usuário (pode carregar nome de tabela, de coluna e de constraint).
 *
 * ⚠️ Mora aqui, e não em `FRASES_DO_BANCO`, porque é copy de UM domínio
 * ("abra um chamado novo para continuar o assunto"). O que era duplicata de
 * `src/lib/erros.ts` — ler `error.message`, o mapa por SQLSTATE e o `logErro`
 * — saiu daqui.
 */
const FRASES: Record<string, string> = {
  "sem permissao": "Você não tem acesso a este chamado.",
  "chamado nao encontrado": "Chamado não encontrado.",
  "o suporte por chamado esta temporariamente fechado":
    "O suporte por chamado está temporariamente fechado. Fale com a equipe pelos canais de sempre.",
  "voce ja tem 5 chamados em aberto":
    "Você já tem 5 chamados em aberto. Acompanhe os que existem antes de abrir outro.",
  "este chamado ja tem 20 mensagens":
    "Este chamado já tem 20 mensagens. Abra um chamado novo para continuar o assunto.",
  "este chamado foi fechado ha mais de 7 dias; abra um novo chamado":
    "Este chamado foi fechado há mais de 7 dias. Abra um chamado novo.",
  "escreva uma mensagem": "Escreva uma mensagem antes de enviar.",
  "a mensagem passa de 4.000 caracteres":
    "A mensagem passa de 4.000 caracteres. Encurte e envie de novo.",
  "o assunto precisa ter de 3 a 120 caracteres":
    "O assunto precisa ter de 3 a 120 caracteres.",
  "anexo incompleto": "Não foi possível anexar o arquivo. Tente enviar de novo.",
  "anexo nao pertence a este chamado":
    "Não foi possível anexar o arquivo. Tente enviar de novo.",
  "anexo nao encontrado":
    "O anexo não chegou ao servidor. Envie o arquivo de novo.",
  "nao foi possivel validar o anexo":
    "Não foi possível validar o anexo agora. Tente de novo em instantes.",
  "formato de anexo nao aceito":
    "Formato não aceito. Envie PNG, JPG, WEBP ou PDF.",
  "extensao do anexo nao confere com o tipo do arquivo":
    "Formato não aceito. Envie PNG, JPG, WEBP ou PDF.",
  "anexo maior que 5 MB": "Arquivo maior que 5 MB.",
};

function traduzirErro(escopo: string, error: ErroDeBanco): string {
  return traduzirErroBanco(escopo, error, undefined, FRASES);
}

/**
 * Valida o anexo ANTES de gastar uma ida ao banco. As mesmas três perguntas que
 * o bucket, a policy e a RPC refazem — aqui só para a frase ser boa.
 */
function validarAnexo(anexo: AnexoInput | undefined): string | null {
  if (!anexo) return null;
  if (!ANEXO_PATH_REGEX.test(anexo.path)) {
    return "Não foi possível anexar o arquivo. Tente enviar de novo.";
  }
  if (!ehAnexoMime(anexo.mime)) {
    return "Formato não aceito. Envie PNG, JPG, WEBP ou PDF.";
  }
  if (
    !Number.isInteger(anexo.tamanho) ||
    anexo.tamanho < 1 ||
    anexo.tamanho > ANEXO_TAMANHO_MAXIMO
  ) {
    return "Arquivo maior que 5 MB.";
  }
  if (!nomeDeArquivoSeguro(anexo.nome)) {
    return "Não foi possível anexar o arquivo. Tente enviar de novo.";
  }
  return null;
}

/**
 * URL assinada de UPLOAD, emitida com a sessão do aluno.
 *
 * Por que existe, se a policy de `storage.objects` já decide: o caminho é
 * montado NO SERVIDOR (`<aluno_id>/<uuid>.<ext>`, com a extensão derivada do
 * MIME e não do nome do arquivo) e o MIME/tamanho passam pela allowlist antes
 * de qualquer byte subir. O aluno nunca escolhe onde grava.
 *
 * 🔴 O ADMIN NÃO ANEXA (B5-c): para ele `alunoId` é null e a função recusa —
 * a mesma decisão que a policy `gps.pode_anexar_chamado` impõe no banco.
 */
export async function criarUploadAssinadoDeAnexo(input: {
  nome: string;
  mime: string;
  tamanho: number;
}): Promise<
  | { ok: true; path: string; token: string; nome: string }
  | { ok: false; erro: string }
> {
  const ctx = await getContextoSessao();
  if (!ctx || ctx.papel !== "aluno" || !ctx.alunoId) {
    return { ok: false, erro: "Você não tem acesso ao suporte por chamado." };
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
  if (!nome) {
    return { ok: false, erro: "Nome de arquivo inválido." };
  }

  const path = `${ctx.alunoId}/${randomUUID()}.${EXTENSAO_POR_MIME[input.mime]}`;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET_CHAMADOS)
    .createSignedUploadUrl(path);

  if (error || !data?.token) {
    // 403 aqui é, quase sempre, o INTERRUPTOR fechado: a policy de insert
    // exige gps.chamados_abertos(). A frase reflete isso sem afirmar demais.
    logErro("criarUploadAssinadoDeAnexo", error ?? "createSignedUploadUrl sem token");
    return {
      ok: false,
      erro: "Não foi possível preparar o envio do arquivo. O suporte pode estar fechado no momento.",
    };
  }

  return { ok: true, path, token: data.token, nome };
}

/** Abre um chamado (um INSERT atômico: o arquivo já subiu antes). */
export async function abrirChamado(input: {
  assunto: string;
  texto: string;
  anexo?: AnexoInput;
}): Promise<ResultadoAbrir> {
  const assunto = (input.assunto ?? "").trim();
  const texto = (input.texto ?? "").trim();

  if (
    assunto.length < CHAMADO_ASSUNTO_MINIMO ||
    assunto.length > CHAMADO_ASSUNTO_MAXIMO
  ) {
    return { ok: false, erro: "O assunto precisa ter de 3 a 120 caracteres." };
  }
  if (!texto) return { ok: false, erro: "Escreva uma mensagem antes de enviar." };
  if (texto.length > CHAMADO_TEXTO_MAXIMO) {
    return {
      ok: false,
      erro: "A mensagem passa de 4.000 caracteres. Encurte e envie de novo.",
    };
  }
  const erroAnexo = validarAnexo(input.anexo);
  if (erroAnexo) return { ok: false, erro: erroAnexo };

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("chamado_abrir", {
    p_assunto: assunto,
    p_texto: texto,
    p_anexo_path: input.anexo?.path ?? null,
    p_anexo_nome: input.anexo ? nomeDeArquivoSeguro(input.anexo.nome) : null,
    p_anexo_mime: input.anexo?.mime ?? null,
    p_anexo_tamanho: input.anexo?.tamanho ?? null,
  });

  if (error) return { ok: false, erro: traduzirErro("abrirChamado", error) };

  const linha = ((data ?? []) as { chamado_id: string; avisar_equipe: string | null }[])[0];
  if (!linha?.chamado_id) {
    logErro("abrirChamado", "gps.chamado_abrir nao devolveu chamado_id");
    return { ok: false, erro: "Não foi possível abrir o chamado agora." };
  }

  await avisarEquipe(linha.avisar_equipe, assunto, linha.chamado_id);

  revalidatePath("/chamados", "layout");
  revalidatePath("/admin/chamados");
  return { ok: true, chamadoId: linha.chamado_id };
}

/**
 * Responde na thread. A MESMA action serve aluno e equipe: quem decide o papel
 * é o banco (`gp_is_admin()` → 'equipe'), e o cliente não informa quem é.
 */
export async function responderChamado(input: {
  chamadoId: string;
  texto: string;
  anexo?: AnexoInput;
}): Promise<ResultadoAcao> {
  const texto = (input.texto ?? "").trim();
  if (!input.chamadoId) return { ok: false, erro: "Chamado não encontrado." };
  if (!texto) return { ok: false, erro: "Escreva uma mensagem antes de enviar." };
  if (texto.length > CHAMADO_TEXTO_MAXIMO) {
    return {
      ok: false,
      erro: "A mensagem passa de 4.000 caracteres. Encurte e envie de novo.",
    };
  }
  const erroAnexo = validarAnexo(input.anexo);
  if (erroAnexo) return { ok: false, erro: erroAnexo };

  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("chamado_responder", {
    p_chamado_id: input.chamadoId,
    p_texto: texto,
    p_anexo_path: input.anexo?.path ?? null,
    p_anexo_nome: input.anexo ? nomeDeArquivoSeguro(input.anexo.nome) : null,
    p_anexo_mime: input.anexo?.mime ?? null,
    p_anexo_tamanho: input.anexo?.tamanho ?? null,
  });

  if (error) return { ok: false, erro: traduzirErro("responderChamado", error) };

  const linha = ((data ?? []) as { status_novo: string; avisar: string | null }[])[0];

  // `avisar` só vem preenchido na TRANSIÇÃO de status. Sem ele, ninguém é
  // avisado — é a trava anti-flood, e ela mora no banco.
  if (linha?.avisar) {
    const { data: chamado } = await supabase
      .schema("gps")
      .from("chamados")
      .select("id, aluno_id, assunto")
      .eq("id", input.chamadoId)
      .maybeSingle();

    const assunto = (chamado as { assunto?: string } | null)?.assunto ?? "chamado";

    if (linha.status_novo === "aberto") {
      // Quem escreveu foi o ALUNO: avisa a equipe.
      await avisarEquipe(linha.avisar, assunto, input.chamadoId);
    } else {
      // Quem escreveu foi a EQUIPE: avisa o aluno.
      const r = await enviarChamadoRespondidoParaAluno({
        para: linha.avisar,
        assunto,
        chamadoId: input.chamadoId,
      });
      if (!r.ok) {
        logErro("responderChamado.avisoAluno", r.erro ?? "falha sem detalhe", {
          chamadoId: input.chamadoId,
        });
      }
    }
  }

  revalidatePath("/chamados", "layout");
  revalidatePath(`/chamados/${input.chamadoId}`);
  revalidatePath("/admin/chamados");
  revalidatePath(`/admin/chamados/${input.chamadoId}`);
  return { ok: true };
}

/** Fecha o chamado. Admin ou dono do ambiente; idempotente no banco. */
export async function fecharChamado(chamadoId: string): Promise<ResultadoAcao> {
  if (!chamadoId) return { ok: false, erro: "Chamado não encontrado." };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("chamado_fechar", { p_chamado_id: chamadoId });

  if (error) return { ok: false, erro: traduzirErro("fecharChamado", error) };

  revalidatePath("/chamados", "layout");
  revalidatePath(`/chamados/${chamadoId}`);
  revalidatePath("/admin/chamados");
  revalidatePath(`/admin/chamados/${chamadoId}`);
  return { ok: true };
}

/**
 * Manda o aviso de chamado novo/reaberto para a equipe.
 *
 * Destinatário, nesta ordem: `gps.config.chamados_email_equipe` (a RPC
 * devolve junto) → env `EMAIL_SUPORTE` → `gps.config.chamados_email_fallback`.
 *
 * 🔴 O fallback existe porque em 09/09/2026 as DUAS primeiras estavam vazias.
 * O código tratava bem — registrava o chamado, logava o erro e mostrava o
 * aviso vermelho em `/admin/chamados` —, mas esse aviso só aparece para quem
 * ABRE aquela tela. Na prática, o aluno abriria um chamado e a equipe só
 * descobriria se alguém lembrasse de olhar a fila. Ninguém olhou: a config
 * estava vazia desde que a feature entrou.
 *
 * O fallback NÃO substitui a configuração certa (a equipe preenche em
 * `/admin/chamados`, sem deploy) — ele existe para o chamado nunca ficar
 * SILENCIOSO. Quando as três estiverem vazias, aí sim é `logErro`.
 *
 * `EMAIL_EQUIPE` não existe mais (removida em 08/2026) e a lista de
 * `public.perfis` com cargo dev/admin não serve: são 16 pessoas, e avisar 16
 * por chamado treina o time a ignorar.
 */
async function avisarEquipe(
  avisarDoBanco: string | null,
  assunto: string,
  chamadoId: string,
): Promise<void> {
  let destinatarios = listaDeEmails(
    avisarDoBanco || process.env.EMAIL_SUPORTE || "",
  );

  // Último recurso: `gps.config.chamados_email_fallback`, por RPC.
  //
  // 🔑 NÃO dá para ler `gps.config` direto daqui: a policy é `gp_is_admin()`
  // e quem abre um chamado é o ALUNO — a leitura voltaria vazia em silêncio,
  // que é exatamente a falha que este fallback existe para eliminar. A RPC é
  // SECURITY DEFINER e expõe SÓ esta chave (a tabela guarda a chave da
  // Resend). Uma chamada a mais só quando as duas fontes normais falharam.
  if (destinatarios.length === 0) {
    const supabase = await createClient();
    const { data } = await supabase
      .schema("gps")
      .rpc("chamados_email_fallback");
    destinatarios = listaDeEmails(
      typeof data === "string" ? data : "",
    );
    if (destinatarios.length > 0) {
      logErro(
        "chamados.avisarEquipe",
        "avisando pelo FALLBACK: configure os destinatarios em /admin/chamados",
        { chamadoId },
      );
    }
  }

  if (destinatarios.length === 0) {
    logErro(
      "chamados.avisarEquipe",
      "chamado registrado e NINGUEM foi avisado: chamados_email_equipe, EMAIL_SUPORTE e chamados_email_fallback vazios",
      { chamadoId },
    );
    return;
  }

  // O nome de quem abriu o chamado sai de `thb_alunos` pelo
  // `membroAlunoId` — o `ctx.membroNome` que servia de atalho ficou SEMPRE
  // null em 10/09 (o `ilike` por e-mail saiu do contexto de sessão, porque
  // casar pessoa por e-mail multiplica) e o campo foi removido do tipo. Esta
  // consulta já era o caminho real; agora é o único.
  const ctx = await getContextoSessao();
  let alunoNome: string | null = null;
  if (ctx?.membroAlunoId) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("thb_alunos")
      .select("nome")
      .eq("id", ctx.membroAlunoId)
      .maybeSingle();
    alunoNome = (data as { nome?: string | null } | null)?.nome ?? null;
  }

  const r = await enviarChamadoAbertoParaEquipe({
    para: destinatarios,
    alunoNome: alunoNome ?? "Um aluno",
    assunto,
    chamadoId,
  });
  if (!r.ok) {
    logErro("chamados.avisarEquipe", r.erro ?? "falha sem detalhe", { chamadoId });
  }
}


