"use server";

/**
 * Chamados (suporte do portal) — Server Actions da EQUIPE.
 *
 * Responder e fechar NÃO estão aqui: são as MESMAS actions do aluno
 * (`src/app/chamados/actions.ts`), porque quem decide o papel é o banco
 * (`gp_is_admin()` → 'equipe'). Duplicar aqui criaria um segundo lugar para a
 * regra de transição de status e de e-mail.
 *
 * O que é só-admin: o interruptor, a lista de e-mails da equipe e o EXPURGO.
 *
 * 🔴 O EXPURGO É O MOTIVO DESTE ARQUIVO EXISTIR. Apagar a linha de
 * `storage.objects` por SQL não apaga o arquivo no object store — um cron SQL
 * reportaria sucesso e deixaria os bytes. A Storage API exige uma sessão, o GPS
 * não usa `service_role`, e a sessão do admin no navegador é a única credencial
 * legítima disponível. Por isso o expurgo é um botão, e não um job.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ehAdmin, getContextoSessao } from "@/lib/auth";
import { traduzirErroBanco, type ErroDeBanco } from "@/lib/erros";
import { logErro } from "@/lib/log";
import { emailValido } from "@/lib/texto";
import {
  ANEXO_PATH_REGEX,
  BUCKET_CHAMADOS,
  SOLICITACAO_MOTIVO_MAXIMO,
  SOLICITACAO_MOTIVO_MINIMO,
  type ResultadoAcao,
} from "@/lib/chamados-tipos";

/** Teto de endereços na lista da equipe. Avisar 16 pessoas por chamado treina
 *  o time a ignorar o aviso — alerta é fila, não informação. */
const MAX_EMAILS_EQUIPE = 10;

async function gravarConfig(
  chave: string,
  valor: string,
): Promise<ResultadoAcao> {
  const ctx = await getContextoSessao();
  if (!ctx || ctx.papel !== "admin") {
    return { ok: false, erro: "Ação restrita à equipe." };
  }

  const supabase = await createClient();
  // Upsert: a linha já nasce na migração ...110, mas um `insert` que dependa
  // disso quebraria se alguém a apagasse na reversão.
  const { error } = await supabase
    .schema("gps")
    .from("config")
    .upsert(
      { chave, valor, atualizado_por: ctx.user.id, atualizado_em: new Date().toISOString() },
      { onConflict: "chave" },
    );

  if (error) {
    logErro("gravarConfig", error, { chave });
    return {
      ok: false,
      erro: "Não foi possível salvar a configuração agora. Tente de novo.",
    };
  }

  revalidatePath("/admin/chamados");
  revalidatePath("/chamados", "layout");
  return { ok: true };
}

/**
 * Liga/desliga a ENTRADA do suporte.
 *
 * Fechar impede o aluno de abrir e de responder (e de anexar — a policy de
 * insert do bucket consulta o mesmo interruptor). A equipe continua respondendo
 * e fechando os que existem: desligar não pode deixar ninguém no meio do
 * caminho sem resposta.
 */
export async function definirChamadosAbertos(
  aberto: boolean,
): Promise<ResultadoAcao> {
  return gravarConfig("chamados_aberto", aberto ? "true" : "false");
}

/**
 * Quem recebe o aviso de chamado novo.
 *
 * Aceita a lista separada por vírgula, ponto e vírgula ou espaço. Endereço
 * inválido NÃO é descartado em silêncio — a action recusa e diz qual é, senão a
 * equipe salva "fulano@" e descobre semanas depois que ninguém era avisado.
 *
 * CR/LF nunca chega ao banco (o CHECK de `gps.config.valor` recusa) nem ao
 * cabeçalho do e-mail (`emailValido` não deixa passar espaço em branco nem
 * `<`, `>`, `"` ou `'`).
 */
export async function definirEmailEquipeChamados(
  lista: string,
): Promise<ResultadoAcao> {
  const bruto = (lista ?? "").trim();
  if (!bruto) return gravarConfig("chamados_email_equipe", "");

  const partes = bruto
    .split(/[;,\s]+/)
    .map((e) => e.trim())
    .filter(Boolean);

  const invalidos = partes.filter((e) => !emailValido(e));
  if (invalidos.length > 0) {
    return {
      ok: false,
      erro: `Endereço inválido: ${invalidos.slice(0, 3).join(", ")}.`,
    };
  }
  if (partes.length > MAX_EMAILS_EQUIPE) {
    return {
      ok: false,
      erro: `No máximo ${MAX_EMAILS_EQUIPE} endereços. Use uma lista de distribuição se precisar de mais.`,
    };
  }

  const unicos = [...new Set(partes.map((e) => e.toLowerCase()))];
  return gravarConfig("chamados_email_equipe", unicos.join(", "));
}

/**
 * Apaga UM anexo do bucket e carimba a mensagem.
 *
 * 🔴 ORDEM: `storage.remove` PRIMEIRO, `chamado_anexo_marcar_expurgado` DEPOIS.
 * Carimbar antes e falhar o delete deixaria o arquivo vivo com a tela dizendo
 * que sumiu — a mentira mais cara possível numa rotina de retenção.
 *
 * `mensagemId` nulo = órfão (arquivo sem mensagem): apaga e não há o que
 * carimbar.
 *
 * A policy `gps_chamados_anexo_delete_admin` é a fronteira; o `ehAdmin()` daqui
 * é defesa em profundidade. O caminho é conferido contra o formato
 * `<uuid>/<uuid>.<ext>` antes de qualquer chamada: `path` vem da tela, e a
 * Storage API não é lugar para receber `../` de ninguém.
 */
export async function expurgarAnexo(item: {
  path: string;
  mensagemId: string | null;
}): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Ação restrita à equipe." };

  if (!item?.path || !ANEXO_PATH_REGEX.test(item.path)) {
    return { ok: false, erro: "Caminho de anexo inválido." };
  }

  const supabase = await createClient();

  const { error: erroStorage } = await supabase.storage
    .from(BUCKET_CHAMADOS)
    .remove([item.path]);

  if (erroStorage) {
    logErro("expurgarAnexo.storageRemove", erroStorage, { path: item.path });
    return {
      ok: false,
      erro: "Não foi possível apagar o arquivo. Nada foi marcado como expurgado.",
    };
  }

  if (item.mensagemId) {
    const { error } = await supabase
      .schema("gps")
      .rpc("chamado_anexo_marcar_expurgado", { p_mensagem_id: item.mensagemId });

    if (error) {
      // O arquivo JÁ foi apagado. Não dá para desfazer, então o que resta é
      // gritar: sem o carimbo, a tela vai continuar oferecendo download de um
      // arquivo que não existe mais e o item volta na lista de expurgo.
      logErro("expurgarAnexo.carimbo", error, {
        path: item.path,
        mensagemId: item.mensagemId,
        arquivoJaApagado: true,
      });
      return {
        ok: false,
        erro: "O arquivo foi apagado, mas o registro não foi atualizado. Rode o expurgo de novo.",
      };
    }
  }

  revalidatePath("/admin/chamados");
  return { ok: true };
}

/**
 * Frases das RPCs `gps.chamado_aprovar_solicitacao`/`_declinar_solicitacao`.
 *
 * Mesma DUPLICAÇÃO deliberada de `src/app/chamados/actions.ts` (comentário lá:
 * "mora em FRASES, e não em erros.ts, porque é copy de UM domínio"): as duas
 * actions de chamado não importam uma da outra para não acoplar dois módulos
 * `"use server"` distintos por um mapa de 6 linhas.
 *
 * ⚠️ A confirmar contra o texto EXATO que o banco levanta (ver relatório: "as
 * frases de erro que espera do banco"). Match por igualdade exata.
 */
const FRASES_SOLICITACAO: Record<string, string> = {
  "sem permissao": "Sem permissão para esta ação.",
  "solicitacao nao encontrada": "Solicitação não encontrada.",
  "esta solicitacao ja foi decidida": "Esta solicitação já foi decidida.",
  "escreva o motivo do declinio":
    "Escreva o motivo — o parceiro vai ver por que o pedido não foi aceito.",
  "o motivo passa de 300 caracteres": "O motivo passa de 300 caracteres.",
  "cliente novo nao encontrado neste ambiente":
    "O cliente novo não existe mais neste ambiente. Decline e peça para o parceiro abrir de novo.",
};

function traduzirErroSolicitacao(escopo: string, error: ErroDeBanco): string {
  return traduzirErroBanco(escopo, error, undefined, FRASES_SOLICITACAO);
}

/**
 * Aprovar EXECUTA a troca (decisão do Marcio, briefing 11/09): a RPC muda o
 * cliente/sócio acompanhado e fecha a solicitação num só passo — não há
 * segunda confirmação depois desta. O diálogo que chama esta action
 * (`DialogoConfirmacao`) é quem tem de deixar isso claro, nomeando os dois
 * lados da troca.
 *
 * `alunoId` só serve para revalidar as rotas certas — quem autoriza é
 * `gp_is_admin()` dentro da RPC.
 */
export async function aprovarSolicitacaoChamado(
  chamadoId: string,
  alunoId: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Ação restrita à equipe." };
  if (!chamadoId) return { ok: false, erro: "Chamado não encontrado." };

  const texto = (motivo ?? "").trim();
  // O motivo é OPCIONAL em aprovar (a decisão já está no clique do botão
  // nomeado); quando vier, respeita o mesmo teto de 300 do declínio.
  if (texto.length > SOLICITACAO_MOTIVO_MAXIMO) {
    return { ok: false, erro: `O motivo passa de ${SOLICITACAO_MOTIVO_MAXIMO} caracteres.` };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("chamado_aprovar_solicitacao", {
      p_chamado_id: chamadoId,
      p_motivo: texto || null,
    });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroSolicitacao("aprovarSolicitacaoChamado", error),
    };
  }

  revalidatePath("/admin/chamados");
  revalidatePath(`/admin/chamados/${chamadoId}`);
  revalidatePath("/chamados", "layout");
  if (alunoId) {
    revalidatePath(`/admin/aluno/${alunoId}`, "layout");
    revalidatePath("/clientes", "layout");
    revalidatePath("/equipe", "layout");
  }
  return { ok: true };
}

/**
 * Declinar NÃO muda cliente/sócio nenhum — só fecha a solicitação com o
 * motivo, que o parceiro lê na thread do chamado. A conversa por mensagem
 * continua podendo acontecer antes ou depois.
 */
export async function declinarSolicitacaoChamado(
  chamadoId: string,
  alunoId: string,
  motivo: string,
): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Ação restrita à equipe." };
  if (!chamadoId) return { ok: false, erro: "Chamado não encontrado." };

  const texto = (motivo ?? "").trim();
  if (texto.length < SOLICITACAO_MOTIVO_MINIMO) {
    return {
      ok: false,
      erro: `Escreva o motivo — o parceiro vai ver por que o pedido não foi aceito (mínimo de ${SOLICITACAO_MOTIVO_MINIMO} caracteres).`,
    };
  }
  if (texto.length > SOLICITACAO_MOTIVO_MAXIMO) {
    return { ok: false, erro: `O motivo passa de ${SOLICITACAO_MOTIVO_MAXIMO} caracteres.` };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("chamado_declinar_solicitacao", {
      p_chamado_id: chamadoId,
      p_motivo: texto,
    });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroSolicitacao("declinarSolicitacaoChamado", error),
    };
  }

  revalidatePath("/admin/chamados");
  revalidatePath(`/admin/chamados/${chamadoId}`);
  revalidatePath("/chamados", "layout");
  return { ok: true };
}
