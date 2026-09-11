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
import { enviarChamadoRespondidoParaAluno } from "@/lib/email-chamados";
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
 * Frases das RPCs `gps.chamado_aprovar_solicitacao`/`_declinar_solicitacao` —
 * REAIS, conferidas em produção (não são mais palpite). Note que estas têm
 * ACENTO e TRAVESSÃO (ao contrário das de `chamado_abrir`, que são o padrão
 * antigo sem acento): o match é por igualdade EXATA nos dois casos.
 *
 * Mesma DUPLICAÇÃO deliberada de `src/app/chamados/actions.ts` (comentário lá:
 * "mora em FRASES, e não em erros.ts, porque é copy de UM domínio"): as duas
 * actions de chamado não importam uma da outra para não acoplar dois módulos
 * `"use server"` distintos por um mapa pequeno.
 */
const FRASES_SOLICITACAO: Record<string, string> = {
  "Sem permissão.": "Sem permissão para esta ação.",
  "Escreva o motivo — a trilha deste aluno vai registrar.":
    "Escreva o motivo — ele fica no histórico deste parceiro.",
  "Escreva o motivo — o aluno vai ver esta frase.":
    "Escreva o motivo — o parceiro vai ver esta frase.",
  "O motivo passa de 300 caracteres.": "O motivo passa de 300 caracteres.",
  "Este chamado não tem uma solicitação estruturada.":
    "Este chamado não tem uma solicitação estruturada.",
  "Esta solicitação já foi decidida.": "Esta solicitação já foi decidida.",
  "Chamado não encontrado.": "Chamado não encontrado.",
  "O cliente escolhido não existe mais neste ambiente.":
    "O cliente escolhido não existe mais neste ambiente. Decline e peça para o parceiro abrir de novo.",
  "Este ambiente não tem mais cliente acompanhado — não há o que trocar.":
    "Este ambiente não tem mais cliente acompanhado — não há o que trocar. Decline o pedido.",
  "O cliente escolhido já é o cliente acompanhado.":
    "O cliente escolhido já é o cliente acompanhado.",
  "O sócio indicado já não está mais neste ambiente.":
    "O sócio indicado já não está mais neste ambiente.",
};

function traduzirErroSolicitacao(escopo: string, error: ErroDeBanco): string {
  return traduzirErroBanco(escopo, error, undefined, FRASES_SOLICITACAO);
}

/** Retorno real de `chamado_aprovar_solicitacao`/`_declinar_solicitacao`. */
interface RetornoDecisaoSolicitacao {
  chamado_id: string;
  tipo: string;
  /** `null` = ninguém a avisar (aluno sem e-mail, ou a RPC não achou). */
  avisar_email: string | null;
}

/**
 * O aviso por e-mail é DEPOIS do commit, e falha de e-mail nunca desfaz a
 * decisão — mesmo padrão de `avisarEquipe`/`enviarChamadoRespondidoParaAluno`
 * em `src/app/chamados/actions.ts`. O parceiro sempre vê a decisão no
 * portal; o e-mail é só o aviso.
 */
async function avisarAlunoDaDecisao(
  avisarEmail: string | null,
  chamadoId: string,
  assunto: string,
  escopo: string,
): Promise<void> {
  if (!avisarEmail) return;
  const r = await enviarChamadoRespondidoParaAluno({
    para: avisarEmail,
    assunto,
    chamadoId,
  });
  if (!r.ok) {
    logErro(escopo, r.erro ?? "falha sem detalhe", { chamadoId });
  }
}

/**
 * Aprovar EXECUTA a troca (decisão do Marcio, briefing 11/09): a RPC muda o
 * cliente acompanhado (ou remove o sócio, em `troca_socio`) e fecha a
 * solicitação num só passo — não há segunda confirmação depois desta. O
 * diálogo que chama esta action (`DialogoConfirmacao`) é quem tem de deixar
 * isso claro, nomeando os dois lados da troca (ou "sai fulano", na remoção
 * de sócio).
 *
 * Motivo é OBRIGATÓRIO (3..300) nas duas ações — contrato confirmado: a RPC
 * recusa aprovar sem motivo com a mesma frase de "a trilha vai registrar".
 *
 * `alunoId`/`assuntoChamado` só servem para revalidar as rotas certas e
 * compor o e-mail de aviso — quem autoriza é `gp_is_admin()` dentro da RPC.
 */
export async function aprovarSolicitacaoChamado(
  chamadoId: string,
  alunoId: string,
  motivo: string,
  assuntoChamado: string,
): Promise<ResultadoAcao> {
  if (!(await ehAdmin())) return { ok: false, erro: "Ação restrita à equipe." };
  if (!chamadoId) return { ok: false, erro: "Chamado não encontrado." };

  const texto = (motivo ?? "").trim();
  if (texto.length < SOLICITACAO_MOTIVO_MINIMO) {
    return {
      ok: false,
      erro: `Escreva o motivo — ele fica no histórico deste parceiro (mínimo de ${SOLICITACAO_MOTIVO_MINIMO} caracteres).`,
    };
  }
  if (texto.length > SOLICITACAO_MOTIVO_MAXIMO) {
    return { ok: false, erro: `O motivo passa de ${SOLICITACAO_MOTIVO_MAXIMO} caracteres.` };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("chamado_aprovar_solicitacao", {
      p_chamado_id: chamadoId,
      p_motivo: texto,
    });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroSolicitacao("aprovarSolicitacaoChamado", error),
    };
  }

  const retorno = data as RetornoDecisaoSolicitacao | null;
  await avisarAlunoDaDecisao(
    retorno?.avisar_email ?? null,
    chamadoId,
    assuntoChamado,
    "aprovarSolicitacaoChamado.avisoAluno",
  );

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
  assuntoChamado: string,
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
  const { data, error } = await supabase
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

  const retorno = data as RetornoDecisaoSolicitacao | null;
  await avisarAlunoDaDecisao(
    retorno?.avisar_email ?? null,
    chamadoId,
    assuntoChamado,
    "declinarSolicitacaoChamado.avisoAluno",
  );

  // `alunoId` não muda nada de negócio no declínio, mas mantém a assinatura
  // simétrica à de aprovar — o componente que chama as duas não precisa
  // ramificar por causa disso.
  void alunoId;

  revalidatePath("/admin/chamados");
  revalidatePath(`/admin/chamados/${chamadoId}`);
  revalidatePath("/chamados", "layout");
  return { ok: true };
}
