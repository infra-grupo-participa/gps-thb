// Blindagem das pastas de minutas dos alunos no Google Drive.
//
// Por quê: no Meu Drive uma subpasta não pode ter MENOS acesso que a pasta de
// cima. A "03 Minutas" de cada cliente herda o acesso do aluno (e o link
// "qualquer pessoa" da pasta-mãe). A única forma de blindar só as minutas é
// TIRÁ-LAS da árvore do aluno e colocá-las numa árvore só da equipe:
//
//   Minutas (equipe)/<pasta do cliente>/03 Minutas      ← a pasta ORIGINAL
//   <pasta do cliente>/03 Minutas (restrito à equipe)   ← atalho (o aluno vê, não abre)
//
// O id da pasta NÃO muda (links da equipe, `gps.drive_pastas` e a atividade
// continuam apontando para ela). Nada é apagado: "desfazer" move de volta.
//
// Modos (corpo JSON; o resto do pedido nunca é dado):
//   inventario                só leitura: acha toda pasta "minuta*" e diz quem enxerga.
//   blindar { ids, simular }  move até 25 pastas (cada id é REVALIDADO aqui:
//                             pasta, nome com "minuta", dentro da árvore dos
//                             alunos). `simular` só é falso se vier `false`.
//   varrer { simular }        inventário + blindar das que apareceram na árvore
//                             dos alunos (cron do banco; simular só é falso se vier `false`).
//   desfazer { ids }          devolve ao pai original (achado pelo atalho) e
//                             manda o atalho para a lixeira.
//
// 🔴 Um id vindo do pedido só é movido se, lido do Drive agora, for pasta com
// "minuta" no nome e descendente da raiz dos alunos. Destino fixo.

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TS5097 — import com extensão .ts é o padrão do Deno
import { type ArquivoDrive, criarGdrive, ehIdDoDrive, type Gdrive, GdriveErro, jaTemAcesso, MIME_PASTA, normalizarNome, type PermissaoComHeranca } from "../_shared/gdrive.ts";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TS5097
import { type Deps, HEADER_SEGREDO, ORCAMENTO_MS, RAIZ_PADRAO, SEGREDO_MINIMO, segredoConfere, textoDetalhe } from "../drive-provisionar/provisionar.ts";

export const NOME_RAIZ_EQUIPE = "Minutas (equipe) — não compartilhar com alunos";
export const GPS_ID_RAIZ_EQUIPE = "minutas-equipe";
export const SUFIXO_ATALHO = " (restrito à equipe)";
export const MAX_IDS = 25;
const DOMINIO_EQUIPE = "@advmais.com";
const MAX_NIVEIS = 10;

export const gpsIdAtalho = (pastaId: string) => `minutas-atalho:${pastaId}`;
export const gpsIdContainer = (paiId: string) => `minutas-cli:${paiId}`;

export const ehPastaDeMinutas = (a: Pick<ArquivoDrive, "name" | "mimeType">) =>
  a.mimeType === MIME_PASTA && normalizarNome(a.name).includes("MINUTA");

const ehEquipe = (email?: string) => (email ?? "").toLowerCase().endsWith(DOMINIO_EQUIPE);

type Cache = Map<string, ArquivoDrive | null>;

/** O arquivo e seus ancestrais (do mais próximo ao mais distante). Para no topo ou em MAX_NIVEIS. */
async function cadeia(drive: Gdrive, id: string, cache: Cache): Promise<ArquivoDrive[]> {
  const saida: ArquivoDrive[] = [];
  let atual: string | undefined = id;
  for (let i = 0; atual && i < MAX_NIVEIS; i++) {
    let a = cache.get(atual);
    if (a === undefined) {
      a = await drive.obter(atual);
      cache.set(atual, a);
    }
    if (!a) break;
    saida.push(a);
    atual = a.parents?.[0];
  }
  return saida;
}

type ResumoAcesso = {
  qualquer_pessoa: null | { papel: string; herdado: boolean };
  externos: number;
  equipe: number;
};

/** Permissão DIRETA (não herdada) que dá acesso a quem não é da equipe: sai junto com a blindagem. */
function diretasDeFora(perms: PermissaoComHeranca[]): PermissaoComHeranca[] {
  return perms.filter((p) => {
    if ((p.permissionDetails ?? []).some((d) => d.inherited === true)) return false;
    if (p.role === "owner") return false;
    if (p.type === "anyone" || p.type === "domain") return true;
    return p.type === "user" && !ehEquipe(p.emailAddress);
  });
}

async function resumoDeAcesso(drive: Gdrive, id: string): Promise<ResumoAcesso> {
  const perms = await drive.permissoesComHeranca(id);
  const anyone = perms.find((p) => p.type === "anyone" || p.type === "domain");
  return {
    qualquer_pessoa: anyone
      ? { papel: String(anyone.role), herdado: (anyone.permissionDetails ?? []).some((d) => d.inherited === true) }
      : null,
    externos: perms.filter((p) => p.type === "user" && !ehEquipe(p.emailAddress)).length,
    equipe: perms.filter((p) => p.type === "user" && ehEquipe(p.emailAddress)).length,
  };
}

export type Resultado = { status: number; corpo: Record<string, unknown> };

function criar(deps: Deps) {
  const agora = deps.agora ?? Date.now;
  const drive = criarGdrive({
    clientId: deps.env("GDRIVE_CLIENT_ID") ?? "",
    clientSecret: deps.env("GDRIVE_CLIENT_SECRET") ?? "",
    refreshToken: deps.env("GDRIVE_REFRESH_TOKEN") ?? "",
    fetch: deps.fetch,
    agora,
    dormir: deps.dormir,
  });
  const raiz = (deps.env("GDRIVE_RAIZ_ID") ?? "").trim() || RAIZ_PADRAO;
  const prazo = agora() + ORCAMENTO_MS;
  return { drive, raiz, agora, prazo, cache: new Map() as Cache };
}

async function acharRaizEquipe(drive: Gdrive): Promise<ArquivoDrive | null> {
  const achados = await drive.buscarPorGpsIdEmQualquerLugar(GPS_ID_RAIZ_EQUIPE);
  return achados.find((a) => a.mimeType === MIME_PASTA) ?? null;
}

export async function inventario(deps: Deps, inicio = 0): Promise<Resultado> {
  const { drive, raiz, agora, prazo, cache } = criar(deps);
  const raizEquipe = await acharRaizEquipe(drive);
  const acertos = await drive.buscarPastasPorNome("minuta");
  const candidatos = acertos.filter(ehPastaDeMinutas);
  const ids = new Set(candidatos.map((c) => c.id));

  const dentro: Record<string, unknown>[] = [];
  const emEquipe: Record<string, unknown>[] = [];
  const fora: Record<string, unknown>[] = [];
  const aninhadas: string[] = [];
  let i = inicio;
  let parcial = false;
  for (; i < candidatos.length; i++) {
    if (agora() > prazo) {
      parcial = true;
      break;
    }
    const c = candidatos[i];
    const ca = await cadeia(drive, c.id, cache);
    const ancestrais = ca.slice(1);
    const posRaiz = ca.findIndex((a) => a.id === raiz);
    const caminho = ca
      .slice(0, posRaiz === -1 ? ca.length : posRaiz)
      .map((a) => a.name)
      .reverse()
      .join(" / ");
    if (raizEquipe && ca.some((a) => a.id === raizEquipe.id)) {
      emEquipe.push({ id: c.id, caminho });
      continue;
    }
    if (posRaiz === -1) {
      fora.push({ id: c.id, nome: c.name, caminho });
      continue;
    }
    if (ancestrais.some((a) => ids.has(a.id))) {
      aninhadas.push(c.id); // já viaja junto com a pasta de minutas acima dela
      continue;
    }
    dentro.push({
      id: c.id,
      nome: c.name,
      pai: ca[1]?.name ?? null,
      pai_id: ca[1]?.id ?? null,
      caminho,
      acesso: await resumoDeAcesso(drive, c.id),
    });
  }

  const permsRaiz = await drive.permissoesComHeranca(raiz);
  return {
    status: 200,
    corpo: {
      modo: "inventario",
      raiz_equipe: raizEquipe ? { id: raizEquipe.id } : null,
      raiz_permissoes: permsRaiz.map((p) => ({ tipo: p.type, papel: p.role, equipe: ehEquipe(p.emailAddress) })),
      encontradas: candidatos.length,
      processadas_ate: i,
      parcial,
      dentro_da_arvore_dos_alunos: dentro,
      ja_na_arvore_da_equipe: emEquipe,
      fora_da_arvore: fora,
      aninhadas_ignoradas: aninhadas.length,
      leituras: drive.contadores().leituras,
    },
  };
}

async function garantirRaizEquipe(
  ctx: ReturnType<typeof criar>,
  simular: boolean,
): Promise<{ id: string | null; compartilhar: string[] }> {
  const { drive, raiz } = ctx;
  const existente = await acharRaizEquipe(drive);
  const permsRaiz = await drive.permissoesComHeranca(raiz);
  const equipe = permsRaiz
    .filter((p) => p.type === "user" && ehEquipe(p.emailAddress) && p.role !== "owner")
    .map((p) => String(p.emailAddress).toLowerCase());
  if (simular) return { id: existente?.id ?? null, compartilhar: equipe };
  const pasta = existente ?? (await drive.criarPastaNaRaiz(NOME_RAIZ_EQUIPE, GPS_ID_RAIZ_EQUIPE));
  const atuais = await drive.permissoesComHeranca(pasta.id);
  for (const email of equipe) {
    if (!jaTemAcesso(atuais, email, "writer")) await drive.compartilhar(pasta.id, email, "writer", undefined, false);
  }
  return { id: pasta.id, compartilhar: equipe };
}

function idsDoCorpo(corpo: unknown): string[] {
  const lista = (corpo as { ids?: unknown })?.ids;
  if (!Array.isArray(lista)) return [];
  return [...new Set(lista.filter((x): x is string => typeof x === "string" && ehIdDoDrive(x)))].slice(0, MAX_IDS);
}

export async function blindar(deps: Deps, ids: string[], simular: boolean): Promise<Resultado> {
  const ctx = criar(deps);
  const { drive, raiz, agora, prazo, cache } = ctx;
  if (ids.length === 0) return { status: 400, corpo: { erro: "informe ids" } };

  const equipeRaiz = await garantirRaizEquipe(ctx, simular);
  const itens: Record<string, unknown>[] = [];
  for (const id of ids) {
    if (agora() > prazo) {
      itens.push({ id, estado: "adiado_por_tempo" });
      continue;
    }
    try {
      const ca = await cadeia(drive, id, cache);
      const a = ca[0];
      if (!a || a.trashed) {
        itens.push({ id, estado: "recusado", motivo: "não encontrada" });
        continue;
      }
      if (!ehPastaDeMinutas(a)) {
        itens.push({ id, estado: "recusado", motivo: "não é pasta de minutas" });
        continue;
      }
      if (!ca.some((x) => x.id === raiz)) {
        itens.push({ id, estado: "recusado", motivo: "fora da árvore dos alunos" });
        continue;
      }
      if (equipeRaiz.id && ca.some((x) => x.id === equipeRaiz.id)) {
        itens.push({ id, estado: "ja_blindada" });
        continue;
      }
      const pai = ca[1];
      if (!pai) {
        itens.push({ id, estado: "recusado", motivo: "sem pasta pai" });
        continue;
      }
      if (simular || !equipeRaiz.id) {
        const diretas = diretasDeFora(await drive.permissoesComHeranca(id));
        itens.push({
          id,
          estado: "simulado",
          pai: pai.name,
          diretas_a_remover: diretas.map((p) => ({ tipo: p.type, papel: p.role, email: p.emailAddress ?? null })),
        });
        continue;
      }
      // 1) atalho no lugar de origem (idempotente pelo gps_id)
      let atalho = await drive.buscarPorGpsId(pai.id, gpsIdAtalho(id));
      if (!atalho) atalho = await drive.criarAtalho(pai.id, `${a.name}${SUFIXO_ATALHO}`, id, gpsIdAtalho(id));
      // 2) container do cliente na árvore da equipe
      let container = await drive.buscarPorGpsId(equipeRaiz.id, gpsIdContainer(pai.id));
      if (!container) container = await drive.criarPasta(equipeRaiz.id, pai.name, gpsIdContainer(pai.id));
      // 3) mover a pasta ORIGINAL (o id não muda)
      await drive.moverPara(id, container.id);
      // 4) o que era acesso DIRETO de fora da equipe (aluno, link) não some com a mudança de pai
      const removidas: { tipo?: string; papel?: string; email: string | null }[] = [];
      for (const p of diretasDeFora(await drive.permissoesComHeranca(id))) {
        if (await drive.removerPermissao(id, p.id)) {
          removidas.push({ tipo: p.type, papel: p.role, email: p.emailAddress ?? null });
        }
      }
      const acesso = await resumoDeAcesso(drive, id);
      itens.push({ id, estado: "blindada", pai: pai.name, atalho: atalho.id, removidas, acesso_depois: acesso });
    } catch (e) {
      itens.push({ id, estado: "erro", erro: textoDetalhe(e) });
    }
  }
  return {
    status: 200,
    corpo: { modo: "blindar", simular, raiz_equipe: equipeRaiz.id, equipe_a_compartilhar: equipeRaiz.compartilhar.length, itens },
  };
}

/** Varredura automática: acha as pastas de minutas que voltaram a nascer na árvore dos alunos e as blinda.
 *  Não recebe ids do pedido: o que entra vem do inventário (revalidado de novo dentro de `blindar`). */
export async function varrer(deps: Deps, simular: boolean): Promise<Resultado> {
  const inv = await inventario(deps);
  const dentro = (inv.corpo.dentro_da_arvore_dos_alunos as { id: string }[]) ?? [];
  const ids = dentro.map((d) => d.id).slice(0, MAX_IDS);
  if (ids.length === 0) {
    return { status: 200, corpo: { modo: "varrer", simular, novas: 0, parcial: inv.corpo.parcial, itens: [] } };
  }
  const b = await blindar(deps, ids, simular);
  return {
    status: b.status,
    corpo: { ...b.corpo, modo: "varrer", novas: dentro.length, parcial: inv.corpo.parcial },
  };
}

export async function desfazer(deps: Deps, ids: string[]): Promise<Resultado> {
  const ctx = criar(deps);
  const { drive, agora, prazo } = ctx;
  if (ids.length === 0) return { status: 400, corpo: { erro: "informe ids" } };
  const itens: Record<string, unknown>[] = [];
  for (const id of ids) {
    if (agora() > prazo) {
      itens.push({ id, estado: "adiado_por_tempo" });
      continue;
    }
    try {
      const atalhos = await drive.buscarPorGpsIdEmQualquerLugar(gpsIdAtalho(id));
      const atalho = atalhos.find((x) => x.shortcutDetails?.targetId === id) ?? null;
      const origem = atalho?.parents?.[0];
      if (!atalho || !origem) {
        itens.push({ id, estado: "recusado", motivo: "sem atalho de origem (não foi blindada por aqui)" });
        continue;
      }
      await drive.moverPara(id, origem);
      await drive.lixeira(atalho.id);
      itens.push({ id, estado: "restaurada", pai: origem });
    } catch (e) {
      itens.push({ id, estado: "erro", erro: textoDetalhe(e) });
    }
  }
  return { status: 200, corpo: { modo: "desfazer", itens } };
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

  let corpo: unknown = {};
  try {
    corpo = await req.json();
  } catch {
    corpo = {};
  }
  const modo = (corpo as { modo?: unknown })?.modo;
  try {
    let r: Resultado;
    if (modo === "inventario") {
      const ini = Number((corpo as { inicio?: unknown }).inicio);
      r = await inventario(deps, Number.isInteger(ini) && ini > 0 ? ini : 0);
    } else if (modo === "blindar") {
      r = await blindar(deps, idsDoCorpo(corpo), (corpo as { simular?: unknown }).simular !== false);
    } else if (modo === "varrer") {
      r = await varrer(deps, (corpo as { simular?: unknown }).simular !== false);
    } else if (modo === "desfazer") {
      r = await desfazer(deps, idsDoCorpo(corpo));
    } else {
      return json(400, { erro: "modo inválido" });
    }
    console.log(JSON.stringify({ fn: "drive-minutas", modo, status: r.status }));
    return json(r.status, r.corpo);
  } catch (e) {
    const credencial = e instanceof GdriveErro && e.tipo === "credencial";
    console.error("drive-minutas:", textoDetalhe(e));
    return json(credencial ? 503 : 500, { erro: textoDetalhe(e) });
  }
}
