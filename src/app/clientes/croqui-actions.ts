"use server";

/**
 * Croquis da ficha do cliente — as server actions (upload assinado,
 * registrar folha, remover folha, URL de download). Molde literal de
 * `src/app/clientes/minuta-actions.ts`, adaptado a:
 *
 *   - bucket próprio `gps-croquis` (não `gps-minutas`);
 *   - SEM os 4 campos de contexto obrigatório da `…273` (aquilo é da MINUTA);
 *   - campos próprios da versão: `apresentadoEm` (a data do ato daquela
 *     folha) e `observacoes` (texto sobre ESTA folha).
 *
 * 🔴 `"use server"` SÓ EXPORTA `async function`. Os tipos e as constantes
 * moram em `src/lib/croquis-tipos.ts` e entram por import — `export type`,
 * `export interface` ou `export const` aqui passam pelo `tsc` e pelo `next
 * build` e derrubam a rota em runtime (o módulo sai do build com zero
 * exports). Já aconteceu 4 vezes neste produto.
 *
 * 🔴 Nada aqui é a fronteira de segurança. A fronteira são, nesta ordem:
 *   1. o BUCKET `gps-croquis` (privado, 5 MB, só application/pdf);
 *   2. as POLICIES `gps_croquis_insert`/`_select` em `storage.objects`;
 *   3. a RPC `gps.cliente_croqui_anexar`/`_remover` (SECURITY DEFINER), que
 *      lê tamanho e MIME REAIS de `storage.objects.metadata`;
 *   4. a RLS de `gps.cliente_croquis` (leitura só admin/dono do ambiente).
 * As validações daqui existem para o erro chegar em PORTUGUÊS e para não
 * gastar ida ao banco com entrada obviamente inválida.
 *
 * 🔑 NUNCA `service_role`: upload e download usam a sessão do usuário.
 */

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { ehSessaoIndeterminada } from "@/lib/auth-erros";
import { traduzirErroBanco, MSG_SESSAO_INDETERMINADA } from "@/lib/erros";
import { logErro } from "@/lib/log";
import {
  BUCKET_CROQUIS,
  CROQUI_EXTENSAO,
  CROQUI_OBSERVACOES_MAXIMO,
  CROQUI_PATH_REGEX,
  CROQUI_TAMANHO_MAXIMO,
  ehCroquiMime,
  nomeDeCroquiSeguro,
} from "@/lib/croquis-tipos";

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
 * da linha. Cópia deliberada da de `minuta-actions.ts` (mesma forma, escopo
 * próprio) — o croqui não deve depender do módulo da minuta.
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
 * nunca escolhe onde grava. Dono do ambiente OU admin em modo assistência:
 * `gps.pode_anexar_croqui` aceita os dois, como a da minuta.
 */
export async function criarUploadAssinadoCroquiCliente(input: {
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
    return { ok: false, erro: "Sem permissão para anexar o croqui." };
  }

  if (!ehCroquiMime(input.mime)) {
    return { ok: false, erro: "Formato não aceito. Envie um arquivo PDF." };
  }
  if (
    !Number.isInteger(input.tamanho) ||
    input.tamanho < 1 ||
    input.tamanho > CROQUI_TAMANHO_MAXIMO
  ) {
    return { ok: false, erro: "Arquivo maior que 5 MB." };
  }
  const nome = nomeDeCroquiSeguro(input.nome);
  if (!nome) return { ok: false, erro: "Nome de arquivo inválido." };

  const ficha = await ambienteDoCliente(input.clienteId);
  if (!ficha.ok) return { ok: false, erro: ficha.erro };

  // Para o aluno, o ambiente da ficha é o próprio ambiente (a RLS não
  // devolveria ficha de outro); para o admin, qualquer ambiente é válido —
  // a igualdade só se aplica a quem não é admin. Quem decide de verdade é a
  // policy do bucket (`gps.pode_anexar_croqui`), lida com a MESMA sessão.
  if (ctx.papel === "aluno" && ficha.alunoId !== ctx.alunoId) {
    return { ok: false, erro: "Cliente não encontrado." };
  }

  const path = `${ficha.alunoId}/${randomUUID()}.${CROQUI_EXTENSAO}`;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET_CROQUIS)
    .createSignedUploadUrl(path);

  if (error || !data?.token) {
    logErro(
      "criarUploadAssinadoCroquiCliente",
      error ?? "createSignedUploadUrl sem token",
      { clienteId: input.clienteId },
    );
    return {
      ok: false,
      erro: "Não foi possível preparar o envio do arquivo. Recarregue a página e tente de novo.",
    };
  }

  return { ok: true, bucket: BUCKET_CROQUIS, path, token: data.token, nome };
}

/**
 * Grava uma FOLHA NOVA depois de o arquivo subir. Quem confere que o objeto
 * existe e qual é o MIME/tamanho REAL é a RPC, lendo
 * `storage.objects.metadata` — o que chega daqui é declaração, nunca fonte.
 *
 * NÃO substitui: cada chamada bem-sucedida cria uma linha nova em
 * `gps.cliente_croquis`, e as anteriores ficam — é o histórico de folhas.
 *
 * `apresentadoEm` é repassado como veio (formato `YYYY-MM-DD`, a coluna é
 * `date`): 🔴 **não há validação de data futura, e isso é decisão**, não
 * esquecimento — registrar apresentação já agendada é uso válido, e inventar
 * a regra aqui criaria critério de negócio que ninguém definiu. A única
 * conferência é de FORMA, para o erro não chegar como `22007` cru do banco.
 */
export async function registrarCroquiCliente(input: {
  clienteId: string;
  path: string;
  nome: string;
  tamanho: number;
  apresentadoEm?: string | null;
  observacoes?: string | null;
}): Promise<{ erro?: string }> {
  if (!CROQUI_PATH_REGEX.test(input.path ?? "")) {
    return { erro: "Não foi possível anexar o arquivo. Tente enviar de novo." };
  }
  if (
    !Number.isInteger(input.tamanho) ||
    input.tamanho < 1 ||
    input.tamanho > CROQUI_TAMANHO_MAXIMO
  ) {
    return { erro: "Arquivo maior que 5 MB." };
  }
  const nome = nomeDeCroquiSeguro(input.nome);
  if (!nome) return { erro: "Nome de arquivo inválido." };

  const observacoes = (input.observacoes ?? "").trim();
  if (observacoes.length > CROQUI_OBSERVACOES_MAXIMO) {
    return { erro: "As observações do croqui estão muito longas." };
  }

  // Só FORMA (`YYYY-MM-DD`), e só para o erro não vir como 22007 cru. Campo
  // vazio vira `null` = não informado, que é estado legítimo.
  const apresentadoEm = (input.apresentadoEm ?? "").trim();
  if (apresentadoEm !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(apresentadoEm)) {
    return { erro: "Data de apresentação inválida." };
  }

  const ficha = await ambienteDoCliente(input.clienteId);
  if (!ficha.ok) return { erro: ficha.erro };

  const supabase = await createClient();
  const { error } = await supabase.schema("gps").rpc("cliente_croqui_anexar", {
    p_cliente_id: input.clienteId,
    p_path: input.path,
    p_nome: nome,
    p_tamanho: input.tamanho,
    p_apresentado_em: apresentadoEm === "" ? null : apresentadoEm,
    p_observacoes: observacoes === "" ? null : observacoes,
  });

  if (error) {
    return {
      erro: traduzirErroBanco("registrarCroquiCliente", error, {
        clienteId: input.clienteId,
      }),
    };
  }

  revalidarFicha(ficha.alunoId);
  return {};
}

/**
 * Tira UMA folha da lista. O ARQUIVO continua no bucket até o expurgo do
 * admin — a mesma verdade da minuta, do contrato e do anexo do questionário:
 * apagar a linha de `storage.objects` por SQL não apaga o byte.
 *
 * Dono do ambiente OU admin (quem decide é a RPC). A trava do favorito NÃO
 * bloqueia: croqui é ficha, não vínculo.
 */
export async function removerCroquiCliente(
  clienteId: string,
  croquiId: string,
): Promise<{ erro?: string }> {
  const ficha = await ambienteDoCliente(clienteId);
  if (!ficha.ok) return { erro: ficha.erro };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("cliente_croqui_remover", { p_croqui_id: croquiId });

  if (error) {
    return {
      erro: traduzirErroBanco("removerCroquiCliente", error, {
        croquiId,
        clienteId,
      }),
    };
  }

  revalidarFicha(ficha.alunoId);
  return {};
}

/**
 * URL assinada de LEITURA, emitida NO CLIQUE e válida por 60 segundos.
 * `download` sempre — o MIME de um objeto de storage vem do que o cliente
 * declarou no PUT, não de inspeção de bytes, e servir inline abriria a porta
 * para HTML executando no domínio do Supabase disfarçado de PDF.
 *
 * ⚠️ A única exceção do produto a esta regra é a rota de pré-visualização
 * (`src/app/clientes/[clienteId]/documento/…`, fatia 3), que lê os MAGIC
 * BYTES e força o `Content-Type` pelo que os bytes provam ser. Aqui não:
 * esta action emite link direto do Storage, e ali o MIME seria o declarado.
 *
 * O `path`/`nome` são lidos DO BANCO pela linha do croqui (RLS de
 * `gps.cliente_croquis`, a mesma que decide se quem chama pode ver essa
 * folha) — nunca aceitos como argumento vindo do cliente, senão um `path`
 * forjado tentaria assinar o objeto de outro ambiente (a policy do bucket
 * recusaria, mas o erro chegaria como falha genérica de storage em vez de
 * "não encontrado").
 */
export async function urlDeDownloadDoCroquiCliente(
  clienteId: string,
  croquiId: string,
): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("cliente_croquis")
    .select("id, cliente_id, path, nome")
    .eq("id", croquiId)
    .eq("cliente_id", clienteId)
    .maybeSingle();

  if (error) {
    logErro("urlDeDownloadDoCroquiCliente", error, { clienteId, croquiId });
    return {
      ok: false,
      erro: "Não foi possível abrir este arquivo agora. Atualize a página e tente de novo.",
    };
  }
  if (!data) return { ok: false, erro: "Croqui não encontrado." };

  const path = data.path as string;
  if (!CROQUI_PATH_REGEX.test(path)) {
    return { ok: false, erro: "Arquivo inválido." };
  }

  const { data: assinada, error: erroAssinatura } = await supabase.storage
    .from(BUCKET_CROQUIS)
    .createSignedUrl(path, 60, {
      download: (data.nome as string) || "croqui.pdf",
    });

  if (erroAssinatura || !assinada?.signedUrl) {
    logErro(
      "urlDeDownloadDoCroquiCliente",
      erroAssinatura ?? "createSignedUrl sem url",
      { clienteId, croquiId },
    );
    return {
      ok: false,
      erro: "Não foi possível abrir este arquivo agora. Atualize a página e tente de novo.",
    };
  }
  return { ok: true, url: assinada.signedUrl };
}
