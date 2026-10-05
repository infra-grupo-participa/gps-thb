// Edge Function drive-atividade: lê o feed de mudanças do Google Drive
// (changes.list) e aplica no banco por página, avançando o cursor a cada uma.
//
// Contrato com o banco (só service_role; migrations da Fase 2 do Drive):
//   gps.drive_atividade_pegar()
//     → null                       travado por outra execução, ou desligado
//     → { page_token: text|null }  page_token null = 1ª vez (sem cursor ainda)
//   gps.drive_atividade_aplicar(p_itens jsonb, p_token_lido text, p_token_novo text)
//     aplica os itens E move o cursor de p_token_lido para p_token_novo na mesma
//     transação. Com p_erro preenchido (e itens/tokens null) só grava o erro. Cursor diferente de p_token_lido = P0001 (conflito otimista:
//     outra execução andou). 1ª vez: p_itens = [], p_token_lido = null.
//
// Como o cursor avança por página, uma execução interrompida (orçamento,
// rede, erro) retoma da última página aplicada: não há fila nem reenfileiramento.
//
// 🔴 Nada do pedido HTTP é dado: o corpo é ignorado; só o segredo é aceito.
// Erro (credencial, 5xx, rede, changes.*): `drive_atividade_aplicar` com `p_erro`
// grava `drive_cursor.ultimo_erro` e solta a trava, sem validar nem mover o cursor.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TS5097 — import com extensão .ts é o padrão do Deno
import { criarGdrive, GdriveErro, type MudancaDrive, MIME_PASTA } from "../_shared/gdrive.ts";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TS5097
import { type Deps, ErroRpc, HEADER_SEGREDO, ORCAMENTO_MS, rest, SEGREDO_MINIMO, segredoConfere, textoDetalhe } from "../drive-provisionar/provisionar.ts";

export const RPC_PEGAR = "drive_atividade_pegar";
export const RPC_APLICAR = "drive_atividade_aplicar";
/** Trava contra token que nunca fecha (1000 itens × 500 = 500 mil mudanças). */
export const MAX_PAGINAS = 500;

export type ItemAtividade = {
  file_id: string;
  nome: string | null;
  mime: string | null;
  eh_pasta: boolean | null;
  parent_id: string | null;
  modificado_em: string | null;
  modificado_por_nome: string | null;
  trashed: boolean;
  removed: boolean;
};

/**
 * Item do Google → formato de `p_itens`. `parent_id` = primeiro de `parents`.
 * Sem `file` (removido, ou acesso perdido) vira `removed: true` com o resto
 * nulo: o banco não recebe valor inventado. Sem fileId nem file.id: descarta.
 */
export function mapearMudanca(c: MudancaDrive): ItemAtividade | null {
  const id = c.fileId ?? c.file?.id;
  if (typeof id !== "string" || !id) return null;
  const f = c.file;
  if (!f) {
    return {
      file_id: id,
      nome: null,
      mime: null,
      eh_pasta: null,
      parent_id: null,
      modificado_em: null,
      modificado_por_nome: null,
      trashed: false,
      removed: true,
    };
  }
  return {
    file_id: id,
    nome: f.name ?? null,
    mime: f.mimeType ?? null,
    eh_pasta: f.mimeType === undefined ? null : f.mimeType === MIME_PASTA,
    parent_id: f.parents?.[0] ?? null,
    modificado_em: f.modifiedTime ?? null,
    modificado_por_nome: f.lastModifyingUser?.displayName ?? null,
    trashed: f.trashed === true,
    removed: c.removed === true,
  };
}

export type ResultadoAtividade = {
  /** 'sem_cursor' = desligado/travado; 'primeira_vez'; 'completo'; 'orcamento'; 'conflito'; 'erro'. */
  estado: "pulado" | "primeira_vez" | "completo" | "orcamento" | "conflito" | "erro";
  paginas: number;
  itens: number;
  erro?: string;
};

export async function executarAtividade(deps: Deps): Promise<{ status: number; corpo: ResultadoAtividade }> {
  const agora = deps.agora ?? Date.now;
  const prazo = agora() + ORCAMENTO_MS;
  const { rpc } = rest(deps);
  const r: ResultadoAtividade = { estado: "pulado", paginas: 0, itens: 0 };

  const pegou = await rpc<{ page_token: string | null } | null>(RPC_PEGAR, {});
  if (!pegou) return { status: 200, corpo: r };

  const drive = criarGdrive({
    clientId: deps.env("GDRIVE_CLIENT_ID") ?? "",
    clientSecret: deps.env("GDRIVE_CLIENT_SECRET") ?? "",
    refreshToken: deps.env("GDRIVE_REFRESH_TOKEN") ?? "",
    fetch: deps.fetch,
    agora,
    dormir: deps.dormir,
  });

  try {
    if (!pegou.page_token) {
      // 1ª vez: só marca o ponto de partida; o que já existia não é "atividade".
      const inicial = await drive.obterTokenInicial();
      await rpc(RPC_APLICAR, { p_itens: [], p_token_lido: null, p_token_novo: inicial });
      r.estado = "primeira_vez";
      return { status: 200, corpo: r };
    }

    let token = pegou.page_token;
    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
      if (agora() > prazo) {
        r.estado = "orcamento";
        return { status: 200, corpo: r };
      }
      const p = await drive.listarMudancas(token);
      const itens = p.mudancas.map(mapearMudanca).filter((x): x is ItemAtividade => x !== null);
      const novo = p.nextPageToken ?? p.newStartPageToken;
      if (!novo) throw new GdriveErro("outro", 0, "changes.list: página sem token de continuação");
      await rpc(RPC_APLICAR, { p_itens: itens, p_token_lido: token, p_token_novo: novo });
      r.paginas++;
      r.itens += itens.length;
      if (!p.nextPageToken) {
        r.estado = "completo";
        return { status: 200, corpo: r };
      }
      token = novo;
    }
    r.estado = "orcamento"; // MAX_PAGINAS: a próxima execução continua do cursor
    return { status: 200, corpo: r };
  } catch (e) {
    if (e instanceof ErroRpc && e.codigo === "P0001") {
      // Conflito otimista: outra execução avançou o cursor. Não repete.
      r.estado = "conflito";
      return { status: 200, corpo: r };
    }
    r.estado = "erro";
    r.erro = textoDetalhe(e);
    try {
      await rpc(RPC_APLICAR, { p_itens: null, p_token_lido: null, p_token_novo: null, p_erro: r.erro });
    } catch (e2) {
      console.error("drive-atividade: falha ao gravar ultimo_erro:", e2 instanceof Error ? e2.message : "erro");
    }
    const credencial = e instanceof GdriveErro && e.tipo === "credencial";
    return { status: credencial ? 503 : 500, corpo: r };
  }
}

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function atender(req: Request, deps: Deps): Promise<Response> {
  if (req.method !== "POST") return json(405, { erro: "método não permitido" });

  const esperado = deps.env("DRIVE_SEGREDO") ?? "";
  if (esperado.length < SEGREDO_MINIMO) return json(503, { erro: "não configurado" });
  const recebido = req.headers.get(HEADER_SEGREDO) ?? "";
  if (!(await segredoConfere(recebido, esperado))) return json(401, { erro: "não autorizado" });
  await req.body?.cancel(); // o corpo não é dado

  const inicio = (deps.agora ?? Date.now)();
  const rodar = async () => {
    try {
      const r = await executarAtividade(deps);
      console.log(JSON.stringify({ fn: "drive-atividade", ...r.corpo, ms: (deps.agora ?? Date.now)() - inicio }));
      return r;
    } catch (e) {
      console.error("drive-atividade:", e instanceof Error ? e.message : "erro");
      return { status: 500, corpo: { erro: "falha interna" } };
    }
  };

  if (deps.emSegundoPlano) {
    deps.emSegundoPlano(rodar());
    return json(202, { aceito: true });
  }
  const r = await rodar();
  return json(r.status, r.corpo);
}
