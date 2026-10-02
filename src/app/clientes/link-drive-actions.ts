"use server";

/**
 * Links do Drive na ficha do cliente — server actions (adicionar, remover).
 *
 * 🔴 `"use server"` SÓ EXPORTA `async function`. Tipos e constantes moram em
 * `src/lib/links-drive-tipos.ts`.
 *
 * 🔴 Nada aqui é a fronteira de segurança: quem decide é a RPC
 * (`gps.cliente_link_drive_adicionar`/`_remover`) e a RLS de
 * `gps.cliente_links_drive`. As validações daqui existem para o erro chegar
 * em português sem gastar ida ao banco com entrada obviamente inválida.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { ehSessaoIndeterminada } from "@/lib/auth-erros";
import { traduzirErroBanco, MSG_SESSAO_INDETERMINADA } from "@/lib/erros";
import { normalizarUrlDoDrive } from "@/lib/pasta";
import { UUID_RE } from "@/lib/texto";
import {
  FRASE_LINK_INVALIDO,
  FRASES_LINKS_DRIVE,
  LINK_NOME_MAXIMO,
  type LinkDrive,
  type OrigemLinkDrive,
} from "@/lib/links-drive-tipos";


/**
 * Ficha do parceiro e espelho do admin. A do admin vai pelo PADRÃO da rota
 * (`[alunoId]`) para não gastar uma consulta só para descobrir o ambiente do
 * cliente — revalida a ficha deste cliente em qualquer ambiente.
 */
function revalidarFichas(clienteId: string) {
  revalidatePath(`/clientes/${clienteId}`);
  revalidatePath("/admin/aluno/[alunoId]/clientes/[clienteId]", "page");
}

/** `true` = admin; `false` = aluno; string = recusa pronta para a tela. */
async function papelDeQuemChama(): Promise<boolean | string> {
  let ctx;
  try {
    ctx = await getContextoSessao();
  } catch (e) {
    if (!ehSessaoIndeterminada(e)) throw e;
    return MSG_SESSAO_INDETERMINADA;
  }
  if (!ctx || (ctx.papel !== "aluno" && ctx.papel !== "admin")) {
    return "Sem permissão para alterar os links desta ficha.";
  }
  return ctx.papel === "admin";
}

export async function adicionarLinkDrive(e: {
  clienteId: string;
  nome: string;
  url: string;
}): Promise<{ ok: true; link: LinkDrive } | { ok: false; erro: string }> {
  if (typeof e?.clienteId !== "string" || !UUID_RE.test(e.clienteId)) {
    return { ok: false, erro: "Cliente não encontrado." };
  }
  const nome = typeof e.nome === "string" ? e.nome.trim() : "";
  if (nome.length < 1) return { ok: false, erro: "Dê um nome ao link." };
  if (nome.length > LINK_NOME_MAXIMO) {
    return {
      ok: false,
      erro: `O nome do link tem no máximo ${LINK_NOME_MAXIMO} caracteres.`,
    };
  }
  const url = typeof e.url === "string" ? normalizarUrlDoDrive(e.url) : null;
  if (!url) return { ok: false, erro: FRASE_LINK_INVALIDO };

  const papel = await papelDeQuemChama();
  if (typeof papel === "string") return { ok: false, erro: papel };
  const souEquipe = papel;

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("cliente_link_drive_adicionar", {
      p_cliente_id: e.clienteId,
      p_nome: nome,
      p_url: url,
    });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "adicionarLinkDrive",
        error,
        { clienteId: e.clienteId },
        FRASES_LINKS_DRIVE,
      ),
    };
  }

  const r = data as {
    id: string;
    nome: string;
    url: string;
    criado_em: string;
    criado_por_nome: string | null;
    origem: OrigemLinkDrive;
  };
  revalidarFichas(e.clienteId);
  return {
    ok: true,
    link: {
      id: r.id,
      nome: r.nome,
      url: r.url,
      criadoEm: r.criado_em,
      criadoPorNome: r.criado_por_nome ?? "",
      origem: r.origem,
      podeRemover: souEquipe || r.origem === "parceiro",
    },
  };
}

export async function removerLinkDrive(e: {
  linkId: string;
  clienteId: string;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (typeof e?.linkId !== "string" || !UUID_RE.test(e.linkId)) {
    return { ok: false, erro: "Link não encontrado." };
  }
  if (typeof e.clienteId !== "string" || !UUID_RE.test(e.clienteId)) {
    return { ok: false, erro: "Cliente não encontrado." };
  }

  const papel = await papelDeQuemChama();
  if (typeof papel === "string") return { ok: false, erro: papel };

  const supabase = await createClient();
  const { error } = await supabase
    .schema("gps")
    .rpc("cliente_link_drive_remover", { p_link_id: e.linkId });

  if (error) {
    return {
      ok: false,
      erro: traduzirErroBanco(
        "removerLinkDrive",
        error,
        { linkId: e.linkId, clienteId: e.clienteId },
        FRASES_LINKS_DRIVE,
      ),
    };
  }

  revalidarFichas(e.clienteId);
  return { ok: true };
}
