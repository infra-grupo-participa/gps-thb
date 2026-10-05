// Fila do Google Drive do GPS (migration 20261005000347_gps_drive_provisionar.sql).
//
// Lógica + orquestração. `index.ts` só liga isto ao Deno.serve; o teste
// (`provisionar.test.ts`) chama `atender()` com fetch e env falsos.
//
// Contrato com o banco (todas SÓ service_role):
//   gps.drive_tarefa_pegar(p_limite)            → jsonb[] de Tarefa (já 'rodando')
//   gps.drive_pasta_registrar(tarefa, file_id, papel, nome, adotada)
//   gps.drive_parceiro_link_gravar(tarefa, file_id) → url (origem 'equipe')
//   gps.drive_cliente_link_gravar(tarefa, file_id)  → url (cliente_links_drive, equipe)
//   gps.drive_tarefa_concluir(tarefa, resultado, erro, erro_detalhe, aviso)
//     resultado: feito | erro | transitorio | pausa
//   gps.drive_permissao_registrar(tarefa, file_id, permission_id, email, papel)
//   gps.drive_revogacoes_listar(tarefa, limite) → [{id, file_id, permission_id}]
//   gps.drive_revogacao_resultado(tarefa, id, resultado, detalhe)
//     resultado: revogada | ausente | transitorio | erro
//
// 🔴 Adoção de pasta existente (achado ALTO do kirad, 2ª rodada): só em
// provisionar_parceiro pedido por admin, com link de origem 'equipe'; nunca
// pasta com gps_id de outro aluno, nunca a matriz/raiz. O banco confere de
// novo em drive_pasta_registrar (link de outro ambiente, pasta de outro
// parceiro). criar_pasta_cliente NUNCA provisiona o parceiro.
//
// 🔴 NADA do pedido HTTP é usado como dado: nem aluno_id, nem cliente_id, nem
// file_id. O corpo do pg_net traz só o id da tarefa e é ignorado — a edge
// processa o que a fila devolve. O único segredo aceito é o do cron/RPC.
//
// Idempotência mora no Drive: toda pasta/arquivo criado leva
// appProperties.gps_id; antes de criar, procura. Tarefa interrompida
// (tempo, rede, rate limit) retoma do ponto em que parou.

// Deno exige a extensão .ts; o tsc do Next (tsconfig da raiz inclui **/*.ts)
// recusa com TS5097. O ignore vale só para esta linha.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore TS5097 — import com extensão .ts é o padrão do Deno
import { type ArquivoDrive, criarGdrive, ehIdDoDrive, extrairIdDoDrive, type Gdrive, GdriveErro, jaTemAcesso, limparNome, MIME_ATALHO, MIME_PASTA, nomePastaCliente, nomePastaParceiro, normalizarNome } from "../_shared/gdrive.ts";

export const SCHEMA = "gps";
export const HEADER_SEGREDO = "x-drive-segredo";
export const RPC_PEGAR = "drive_tarefa_pegar";
export const RPC_REGISTRAR = "drive_pasta_registrar";
export const RPC_LINK_PARCEIRO = "drive_parceiro_link_gravar";
export const RPC_LINK_CLIENTE = "drive_cliente_link_gravar";
export const RPC_CONCLUIR = "drive_tarefa_concluir";
export const RPC_PERMISSAO = "drive_permissao_registrar";
export const RPC_REVOGACOES = "drive_revogacoes_listar";
export const RPC_REVOGACAO_RESULTADO = "drive_revogacao_resultado";
const LIMITE_REVOGACOES = 50;

/** "Implementação Assistida — Pastas dos Alunos" (Meu Drive do joao@). */
export const RAIZ_PADRAO = "1CRSsOfNm_PO944c3K05Nx0aI2oXehG7N";
/** Matriz copiada para cada parceiro (25 subpastas + 54 arquivos em 05/10/2026). */
export const MATRIZ_PADRAO = "1T-EiOQWQgu_qXK8rtbr7BzByNW_jzm3L";

export const NOME_ARQUIVADOS = "_Arquivados";
export const GPS_ID_ARQUIVADOS = "arquivados";

export const NOME_DOCUMENTOS = "1) DOCUMENTOS";
export const NOME_CLIENTES = "5) CLIENTES";

/** Pasta do cliente: 6 subpastas; a 01 tem 3 filhas. A chave vira parte do gps_id: nunca renomear. */
export const ESTRUTURA_CLIENTE: { chave: string; nome: string; filhas?: { chave: string; nome: string }[] }[] = [
  {
    chave: "01",
    nome: "01 Documentos recebidos",
    filhas: [
      { chave: "01p", nome: "Pessoais" },
      { chave: "01i", nome: "Imóveis" },
      { chave: "01e", nome: "Empresas" },
    ],
  },
  { chave: "02", nome: "02 Viabilidade e Croqui" },
  { chave: "03", nome: "03 Minutas" },
  { chave: "04", nome: "04 ITCMD e ITBI" },
  { chave: "05", nome: "05 Junta Comercial" },
  { chave: "06", nome: "06 Entrega" },
];

export const SEGREDO_MINIMO = 32;
const LIMITE_TAREFAS = 3;
/** Para antes do limite de parede da edge (150 s no plano gratuito). */
export const ORCAMENTO_MS = 110_000;
const MENSAGEM_CONVITE =
  "Sua pasta do Programa de Implementação Assistida (Time Holding Brasil).";

// Frases da tela (gravadas em drive_tarefas.erro). Sem dado de terceiro.
export const FRASE = {
  credencial: "A integração com o Google Drive está sem autorização. Avise a equipe técnica.",
  linkNaoEhPasta: "O link da pasta deste parceiro não abre uma pasta do Drive. Ajuste o link na tela Pasta e tente de novo.",
  linkFora: "A pasta ligada a este parceiro está fora de \"Implementação Assistida — Pastas dos Alunos\". Ajuste o link na tela Pasta e tente de novo.",
  homonimoParceiro: "Já existe uma pasta com o nome deste parceiro em \"Implementação Assistida — Pastas dos Alunos\". Cole o link dela na tela Pasta e tente de novo.",
  homonimoCliente: "Já existe uma pasta com o nome deste cliente em 5) CLIENTES. Cole o link dela na ficha do cliente.",
  clienteSumiu: "Cliente não encontrado.",
  clienteComLink: "Este cliente já tem uma pasta ligada.",
  arquivarInvalido: "Pasta a arquivar inválida.",
  linkNaoConferido:
    "A pasta ligada a este parceiro não foi conferida pela equipe. Salve o link pela equipe na tela Pasta e tente de novo.",
  linkAlheio:
    "A pasta ligada a este parceiro pertence a outro parceiro ou não pode ser usada. Ajuste o link na tela Pasta e tente de novo.",
  parceiroNaoOrganizado: "A pasta do parceiro ainda não foi organizada pela equipe.",
} as const;

export type Tarefa = {
  id: string;
  tipo: "provisionar_parceiro" | "criar_pasta_cliente" | "compartilhar" | "revogar" | "arquivar";
  /** Só em 'arquivar': a pasta a mover para _Arquivados. */
  payload?: { file_id?: string } | null;
  file_id?: string | null;
  /** `null` só em 'revogar'. */
  aluno_id: string | null;
  cliente_id: string | null;
  tentativas: number;
  parceiro_nome: string | null;
  pasta_drive_url: string | null;
  /** 'equipe' | 'parceiro' | null — quem gravou o link do ambiente. */
  pasta_drive_origem?: string | null;
  /** Quem pediu a tarefa é admin ativo (calculado no banco). */
  solicitado_por_admin?: boolean;
  titular_email: string | null;
  cliente_nome: string | null;
  cliente_link_url: string | null;
  pastas: Partial<Record<"raiz_parceiro" | "documentos" | "clientes", { file_id: string; adotada: boolean }>>;
  pasta_cliente: string | null;
};

export type Deps = {
  env: (chave: string) => string | undefined;
  fetch: typeof fetch;
  agora?: () => number;
  dormir?: (ms: number) => Promise<void>;
  /** Roda em segundo plano (EdgeRuntime.waitUntil). Sem ele, a resposta espera. */
  emSegundoPlano?: (p: Promise<unknown>) => void;
};

/** Falha de negócio: erro final, frase pronta para a tela. Não repete. */
export class FalhaDeNegocio extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "FalhaDeNegocio";
  }
}

/** Acabou o tempo da execução: a tarefa volta à fila sem contar tentativa. */
export class Pausa extends Error {
  constructor() {
    super("pausa");
    this.name = "Pausa";
  }
}

// ------------------------------------------------------------- puras

export const gpsIdRaiz = (alunoId: string) => `p:${alunoId}`;
export const gpsIdClientes = (alunoId: string) => `p:${alunoId}:clientes`;
export const gpsIdCopia = (alunoId: string, matrizItemId: string) => `p:${alunoId}:m:${matrizItemId}`;
export const gpsIdCliente = (clienteId: string) => `c:${clienteId}`;
export const gpsIdSubCliente = (clienteId: string, chave: string) => `c:${clienteId}:s:${chave}`;

export const urlDaPasta = (id: string) => `https://drive.google.com/drive/folders/${id}`;

/** O link (de qualquer formato) aponta para esta pasta? */
export function linkApontaPara(url: string | null, fileId: string): boolean {
  return !!url && extrairIdDoDrive(url) === fileId;
}

/** Texto curto de erro técnico: tipo + status + razão, nunca corpo nem token. */
export function textoDetalhe(e: unknown): string {
  if (e instanceof GdriveErro) return limparNome(`gdrive_${e.tipo}: ${e.message}`, 300);
  if (e instanceof Error) return limparNome(`drive: ${e.message}`, 300);
  return "drive: erro desconhecido";
}

export async function segredoConfere(recebido: string, esperado: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(recebido)),
    crypto.subtle.digest("SHA-256", enc.encode(esperado)),
  ]);
  const x = new Uint8Array(a);
  const y = new Uint8Array(b);
  let dif = 0;
  for (let i = 0; i < x.length; i++) dif |= x[i] ^ y[i];
  return dif === 0;
}

// ------------------------------------------------------------- banco

export type Rpc = <T>(nome: string, args: Record<string, unknown>) => Promise<T>;

/** Erro de RPC com a mensagem do `raise` quando é P0001 (frase nossa, sem PII). */
export class ErroRpc extends Error {
  readonly codigo: string;
  constructor(mensagem: string, codigo: string) {
    super(mensagem);
    this.name = "ErroRpc";
    this.codigo = codigo;
  }
}

export function rest(deps: Deps): { rpc: Rpc } {
  const url = (deps.env("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  const chave = deps.env("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!url || !chave) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausente");
  const base = { apikey: chave, Authorization: `Bearer ${chave}` };

  async function rpc<T>(nome: string, args: Record<string, unknown>): Promise<T> {
    const res = await deps.fetch(`${url}/rest/v1/rpc/${nome}`, {
      method: "POST",
      headers: { ...base, "Content-Type": "application/json", "Content-Profile": SCHEMA, "Accept-Profile": SCHEMA },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      let codigo = "";
      let mensagem = "";
      try {
        const j = await res.json();
        codigo = String(j?.code ?? "");
        mensagem = String(j?.message ?? "");
      } catch {
        // corpo não-JSON
      }
      // Só P0001 traz frase de negócio nossa; o resto vira código + status.
      throw new ErroRpc(codigo === "P0001" ? mensagem : `rpc ${nome}: ${res.status} ${codigo}`.trim(), codigo);
    }
    const txt = await res.text();
    return (txt ? JSON.parse(txt) : null) as T;
  }

  return { rpc };
}

// ------------------------------------------------------- orquestração

type Ctx = {
  drive: Gdrive;
  rpc: Rpc;
  raiz: string;
  matriz: string;
  prazo: number;
  agora: () => number;
  /** Listagens da matriz, uma vez por execução. */
  cacheMatriz: Map<string, ArquivoDrive[]>;
  /** Id da pasta _Arquivados (achada/criada uma vez por execução). */
  arquivados?: string;
};

function checarPrazo(ctx: Ctx): void {
  if (ctx.agora() > ctx.prazo) throw new Pausa();
}

async function registrar(ctx: Ctx, t: Tarefa, f: ArquivoDrive, papel: string, adotada = false) {
  await ctx.rpc(RPC_REGISTRAR, {
    p_tarefa_id: t.id,
    p_file_id: f.id,
    p_papel: papel,
    p_nome: f.name,
    p_adotada: adotada,
  });
}

/** Pasta registrada no espelho ainda existe (não lixeira, é pasta)? */
async function pastaViva(ctx: Ctx, id: string | undefined | null): Promise<ArquivoDrive | null> {
  if (!id) return null;
  const f = await ctx.drive.obter(id);
  return f && !f.trashed && f.mimeType === MIME_PASTA ? f : null;
}

/**
 * Copia a árvore da matriz para `destino`, recursivamente, pulando o que já
 * tem o gps_id. Atalho vira atalho novo (o Drive não copia atalho).
 */
async function copiarArvore(ctx: Ctx, t: Tarefa, origem: string, destino: string): Promise<void> {
  checarPrazo(ctx);
  let itens = ctx.cacheMatriz.get(origem);
  if (!itens) {
    itens = await ctx.drive.listarFilhos(origem);
    itens.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    ctx.cacheMatriz.set(origem, itens);
  }
  const existentes = new Map<string, ArquivoDrive>();
  for (const f of await ctx.drive.listarFilhos(destino)) {
    const g = f.appProperties?.gps_id;
    if (g) existentes.set(g, f);
  }
  for (const item of itens) {
    checarPrazo(ctx);
    const gid = gpsIdCopia(alunoDe(t), item.id);
    const ja = existentes.get(gid);
    if (item.mimeType === MIME_PASTA) {
      const pasta = ja ?? (await ctx.drive.criarPasta(destino, item.name, gid));
      await copiarArvore(ctx, t, item.id, pasta.id);
    } else if (!ja) {
      if (item.mimeType === MIME_ATALHO) {
        const alvo = item.shortcutDetails?.targetId;
        if (alvo) await ctx.drive.criarAtalho(destino, item.name, alvo, gid);
      } else {
        await ctx.drive.copiarArquivo(item.id, destino, item.name, gid);
      }
    }
  }
}

type Parceiro = { raiz: ArquivoDrive; clientes: ArquivoDrive; avisos: string[] };

function alunoDe(t: Tarefa): string {
  if (!t.aluno_id) throw new Error("tarefa sem aluno_id");
  return t.aluno_id;
}

/**
 * Pode adotar `f` (pasta que o sistema NÃO criou para este aluno)?
 * Lança FalhaDeNegocio com a frase da tela; nada foi escrito ainda.
 */
function exigirAdocaoPermitida(ctx: Ctx, t: Tarefa, f: ArquivoDrive): void {
  // 1) Só a equipe adota: tarefa provisionar_parceiro, pedida por admin,
  //    com link gravado pela equipe. Link colado pelo parceiro nunca é adotado.
  if (t.tipo !== "provisionar_parceiro" || t.solicitado_por_admin !== true || t.pasta_drive_origem !== "equipe") {
    throw new FalhaDeNegocio(FRASE.linkNaoConferido);
  }
  // 2) Nunca a matriz nem a própria raiz.
  if (f.id === ctx.matriz || f.id === ctx.raiz || f.id === MATRIZ_PADRAO || f.id === RAIZ_PADRAO) {
    throw new FalhaDeNegocio(FRASE.linkAlheio);
  }
  // 3) Nunca pasta marcada pelo sistema para OUTRO aluno (ou item copiado).
  if (f.appProperties?.gps_id) throw new FalhaDeNegocio(FRASE.linkAlheio);
  // 4) Só pasta DIRETAMENTE dentro da raiz. (Link de outro ambiente e pasta
  //    já registrada para outro parceiro: o banco recusa no registrar.)
  if (!(f.parents ?? []).includes(ctx.raiz)) throw new FalhaDeNegocio(FRASE.linkFora);
}

/**
 * Garante a pasta do parceiro: reusa a que o sistema criou, adota a que a
 * equipe ligou (ver exigirAdocaoPermitida) ou cria copiando a matriz;
 * garante 5) CLIENTES; grava o link (origem equipe, só se não havia link);
 * compartilha com o titular e registra cada permissão concedida.
 * Reentrante: rodar de novo não duplica nada.
 */
export async function garantirParceiro(ctx: Ctx, t: Tarefa): Promise<Parceiro> {
  checarPrazo(ctx);
  const aluno = alunoDe(t);
  let raiz: ArquivoDrive | null = await pastaViva(ctx, t.pastas.raiz_parceiro?.file_id);
  let adotada = raiz ? !!t.pastas.raiz_parceiro?.adotada : false;
  const gid = gpsIdRaiz(aluno);

  if (!raiz && t.pasta_drive_url) {
    const id = extrairIdDoDrive(t.pasta_drive_url);
    const f = id ? await ctx.drive.obter(id) : null;
    if (!f || f.trashed || f.mimeType !== MIME_PASTA) throw new FalhaDeNegocio(FRASE.linkNaoEhPasta);
    if (f.appProperties?.gps_id === gid) {
      // Criada pelo sistema para ESTE aluno: não é adoção.
      if (!(f.parents ?? []).includes(ctx.raiz)) throw new FalhaDeNegocio(FRASE.linkFora);
      adotada = false;
    } else {
      exigirAdocaoPermitida(ctx, t, f);
      adotada = true;
    }
    raiz = f;
    await registrar(ctx, t, raiz, "raiz_parceiro", adotada);
  }

  if (!raiz && t.tipo !== "provisionar_parceiro") {
    // 'compartilhar' nunca cria raiz nova.
    throw new FalhaDeNegocio(FRASE.parceiroNaoOrganizado);
  }

  if (!raiz) {
    raiz = await ctx.drive.buscarPorGpsId(ctx.raiz, gid);
    if (!raiz) {
      const nome = nomePastaParceiro(t.parceiro_nome);
      const alvo = normalizarNome(nome);
      const irmas = await ctx.drive.listarFilhos(ctx.raiz, true);
      if (irmas.some((p) => normalizarNome(p.name) === alvo)) {
        throw new FalhaDeNegocio(FRASE.homonimoParceiro);
      }
      raiz = await ctx.drive.criarPasta(ctx.raiz, nome, gid);
    }
    adotada = false;
    await registrar(ctx, t, raiz, "raiz_parceiro", false);
  }

  // Só copia a matriz na pasta que NÓS criamos; a adotada já é uma cópia feita à mão.
  if (!adotada && t.tipo !== "compartilhar") {
    await copiarArvore(ctx, t, ctx.matriz, raiz.id);
  }

  checarPrazo(ctx);
  const subpastas = await ctx.drive.listarFilhos(raiz.id, true);
  const documentos = subpastas.find((p) => normalizarNome(p.name) === normalizarNome(NOME_DOCUMENTOS)) ?? null;
  let clientes =
    subpastas.find((p) => normalizarNome(p.name) === normalizarNome(NOME_CLIENTES)) ??
    subpastas.find((p) => p.appProperties?.gps_id === gpsIdClientes(aluno)) ??
    null;
  if (!clientes) clientes = await ctx.drive.criarPasta(raiz.id, NOME_CLIENTES, gpsIdClientes(aluno));
  if (documentos) await registrar(ctx, t, documentos, "documentos");
  await registrar(ctx, t, clientes, "clientes");

  await ctx.rpc(RPC_LINK_PARCEIRO, { p_tarefa_id: t.id, p_file_id: raiz.id });

  const avisos: string[] = [];
  if (!documentos) avisos.push("documentos_ausente");
  const email = (t.titular_email ?? "").trim().toLowerCase();
  if (!email) {
    avisos.push("sem_login");
  } else {
    const alvos: [ArquivoDrive | null, "reader" | "writer"][] = [
      [raiz, "reader"],
      [documentos, "writer"],
      [clientes, "writer"],
    ];
    for (const [pasta, papel] of alvos) {
      if (!pasta) continue;
      checarPrazo(ctx);
      const perms = await ctx.drive.listarPermissoes(pasta.id);
      if (jaTemAcesso(perms, email, papel)) continue;
      try {
        const perm = await ctx.drive.compartilhar(pasta.id, email, papel, MENSAGEM_CONVITE);
        // Guarda o que o SISTEMA deu, para revogar depois (troca de titular,
        // exclusão, troca de e-mail). O titular é resolvido no banco.
        if (perm?.id) {
          await ctx.rpc(RPC_PERMISSAO, {
            p_tarefa_id: t.id,
            p_file_id: pasta.id,
            p_permission_id: perm.id,
            p_email: email,
            p_papel: papel,
          });
        }
      } catch (e) {
        // "Invalid argument" do Google: e-mail sem conta Google. Não falha a tarefa.
        if (e instanceof GdriveErro && e.tipo === "compartilhamento_recusado") {
          avisos.push("email_nao_google");
          break;
        }
        throw e;
      }
    }
  }

  return { raiz, clientes, avisos };
}

export async function criarPastaDoCliente(ctx: Ctx, t: Tarefa): Promise<string[]> {
  if (!t.cliente_id) throw new FalhaDeNegocio(FRASE.clienteSumiu);
  if (t.cliente_link_url && !(t.pasta_cliente && linkApontaPara(t.cliente_link_url, t.pasta_cliente))) {
    throw new FalhaDeNegocio(FRASE.clienteComLink);
  }

  // 🔴 Nunca provisiona (nem adota) a pasta do parceiro daqui: só usa a raiz
  // e a 5) CLIENTES que a equipe mandou organizar. O banco já recusa o
  // pedido sem elas; aqui cobre a pasta que foi para a lixeira depois.
  const avisos: string[] = [];
  const raizParceiro = await pastaViva(ctx, t.pastas.raiz_parceiro?.file_id);
  const clientes = raizParceiro ? await pastaViva(ctx, t.pastas.clientes?.file_id) : null;
  if (!raizParceiro || !clientes || !(clientes.parents ?? []).includes(raizParceiro.id)) {
    throw new FalhaDeNegocio(FRASE.parceiroNaoOrganizado);
  }

  checarPrazo(ctx);
  const gid = gpsIdCliente(t.cliente_id);
  let pasta: ArquivoDrive | null = await pastaViva(ctx, t.pasta_cliente);
  if (pasta && !(pasta.parents ?? []).includes(clientes.id)) pasta = null;
  if (!pasta) pasta = await ctx.drive.buscarPorGpsId(clientes.id, gid);
  if (!pasta) {
    const nome = nomePastaCliente(t.cliente_nome);
    const alvo = normalizarNome(nome);
    const irmas = await ctx.drive.listarFilhos(clientes.id, true);
    if (irmas.some((p) => normalizarNome(p.name) === alvo)) throw new FalhaDeNegocio(FRASE.homonimoCliente);
    pasta = await ctx.drive.criarPasta(clientes.id, nome, gid);
  }
  await registrar(ctx, t, pasta, "raiz_cliente");

  const garantirSub = async (pai: ArquivoDrive, chave: string, nome: string, mapa: Map<string, ArquivoDrive>) => {
    checarPrazo(ctx);
    const g = gpsIdSubCliente(t.cliente_id as string, chave);
    const f = mapa.get(g) ?? (await ctx.drive.criarPasta(pai.id, nome, g));
    await registrar(ctx, t, f, "sub_cliente");
    return f;
  };
  const porGid = async (pai: ArquivoDrive) => {
    const m = new Map<string, ArquivoDrive>();
    for (const f of await ctx.drive.listarFilhos(pai.id, true)) {
      const g = f.appProperties?.gps_id;
      if (g) m.set(g, f);
    }
    return m;
  };

  const filhas = await porGid(pasta);
  for (const sub of ESTRUTURA_CLIENTE) {
    const f = await garantirSub(pasta, sub.chave, sub.nome, filhas);
    if (sub.filhas?.length) {
      const netas = await porGid(f);
      for (const n of sub.filhas) await garantirSub(f, n.chave, n.nome, netas);
    }
  }

  await ctx.rpc(RPC_LINK_CLIENTE, { p_tarefa_id: t.id, p_file_id: pasta.id });
  return avisos;
}

/**
 * Tarefa 'arquivar': move a pasta para `_Arquivados` (dentro da raiz; criada
 * uma vez, achada por appProperties.gps_id='arquivados'). Idempotente: já
 * está lá, sumiu ou foi para a lixeira = feito. Sem permissão para mover
 * (arquivo de outro dono) = feito com aviso, nunca falha.
 */
export async function arquivarPasta(ctx: Ctx, t: Tarefa): Promise<string[]> {
  const id = (t.payload?.file_id ?? t.file_id ?? "").trim();
  if (!ehIdDoDrive(id)) throw new FalhaDeNegocio(FRASE.arquivarInvalido);
  if (id === ctx.raiz || id === ctx.matriz || id === RAIZ_PADRAO || id === MATRIZ_PADRAO) {
    throw new FalhaDeNegocio(FRASE.arquivarInvalido);
  }
  checarPrazo(ctx);
  const pasta = await ctx.drive.obter(id);
  if (!pasta || pasta.trashed) return ["pasta_ausente"];
  if (pasta.mimeType !== MIME_PASTA) throw new FalhaDeNegocio(FRASE.arquivarInvalido);

  if (!ctx.arquivados) {
    const achada = await ctx.drive.buscarPorGpsId(ctx.raiz, GPS_ID_ARQUIVADOS);
    ctx.arquivados = (achada ?? (await ctx.drive.criarPasta(ctx.raiz, NOME_ARQUIVADOS, GPS_ID_ARQUIVADOS))).id;
  }
  if (id === ctx.arquivados) throw new FalhaDeNegocio(FRASE.arquivarInvalido);

  checarPrazo(ctx);
  try {
    await ctx.drive.moverPara(id, ctx.arquivados);
  } catch (e) {
    if (e instanceof GdriveErro && e.tipo === "nao_encontrado") return ["pasta_ausente"];
    // 403 de pasta de outro dono: só avisa (credencial e rate limit têm outro tipo).
    if (e instanceof GdriveErro && e.tipo === "outro" && e.status === 403) return ["sem_permissao_para_mover"];
    throw e;
  }
  return [];
}

type Revogacao = { id: string; file_id: string; permission_id: string };

/**
 * Tarefa 'revogar': remove no Drive as permissões que o sistema concedeu e
 * que o banco marcou (titular trocado/removido, ambiente excluído, e-mail
 * trocado). Item a item; 404 = já não existia (conta como feito).
 * Devolve `true` se algum item falhou de forma transitória (a tarefa repete).
 */
export async function revogarAcessos(ctx: Ctx, t: Tarefa): Promise<boolean> {
  const itens = (await ctx.rpc<Revogacao[]>(RPC_REVOGACOES, { p_tarefa_id: t.id, p_limite: LIMITE_REVOGACOES })) ?? [];
  let transitorio = false;
  for (const it of itens) {
    checarPrazo(ctx);
    let resultado: "revogada" | "ausente" | "transitorio" | "erro";
    let detalhe: string | null = null;
    try {
      resultado = (await ctx.drive.removerPermissao(it.file_id, it.permission_id)) ? "revogada" : "ausente";
    } catch (e) {
      if (e instanceof GdriveErro && e.tipo === "credencial") throw e;
      resultado = e instanceof GdriveErro && e.tipo === "transitorio" ? "transitorio" : "erro";
      detalhe = textoDetalhe(e);
      if (resultado === "transitorio") transitorio = true;
    }
    await ctx.rpc(RPC_REVOGACAO_RESULTADO, {
      p_tarefa_id: t.id,
      p_id: it.id,
      p_resultado: resultado,
      p_detalhe: detalhe,
    });
  }
  return transitorio;
}

// --------------------------------------------------------------- lote

export type Resumo = { feito: number; erro: number; transitorio: number; pausa: number; falha_registro: number };

export async function executarLote(deps: Deps): Promise<{ status: number; corpo: Record<string, unknown> }> {
  const agora = deps.agora ?? Date.now;
  const inicio = agora();
  const { rpc } = rest(deps);

  const tarefas = (await rpc<Tarefa[]>(RPC_PEGAR, { p_limite: LIMITE_TAREFAS })) ?? [];
  const resumo: Resumo = { feito: 0, erro: 0, transitorio: 0, pausa: 0, falha_registro: 0 };
  if (tarefas.length === 0) return { status: 200, corpo: { tarefas: 0, ...resumo } };

  const drive = criarGdrive({
    clientId: deps.env("GDRIVE_CLIENT_ID") ?? "",
    clientSecret: deps.env("GDRIVE_CLIENT_SECRET") ?? "",
    refreshToken: deps.env("GDRIVE_REFRESH_TOKEN") ?? "",
    fetch: deps.fetch,
    agora,
    dormir: deps.dormir,
  });
  const ctx: Ctx = {
    drive,
    rpc,
    raiz: (deps.env("GDRIVE_RAIZ_ID") ?? "").trim() || RAIZ_PADRAO,
    matriz: (deps.env("GDRIVE_MATRIZ_ID") ?? "").trim() || MATRIZ_PADRAO,
    prazo: inicio + ORCAMENTO_MS,
    agora,
    cacheMatriz: new Map(),
  };

  const concluir = async (t: Tarefa, resultado: keyof Resumo, extra: { erro?: string; detalhe?: string; aviso?: string } = {}) => {
    resumo[resultado]++;
    try {
      await rpc(RPC_CONCLUIR, {
        p_tarefa_id: t.id,
        p_resultado: resultado,
        p_erro: extra.erro ?? null,
        p_erro_detalhe: extra.detalhe ?? null,
        p_aviso: extra.aviso ?? null,
      });
    } catch {
      // Tarefa fica 'rodando'; gps.drive_varrer devolve à fila em 10 min.
      resumo.falha_registro++;
    }
  };

  let credencialMorta: string | null = null;
  for (const t of tarefas) {
    if (credencialMorta) {
      await concluir(t, "transitorio", { detalhe: credencialMorta });
      continue;
    }
    try {
      if (t.tipo === "revogar") {
        const repetir = await revogarAcessos(ctx, t);
        await concluir(t, repetir ? "transitorio" : "feito", repetir ? { detalhe: "revogacao com falha transitoria" } : {});
        continue;
      }
      const avisos =
        t.tipo === "arquivar"
          ? await arquivarPasta(ctx, t)
          : t.tipo === "criar_pasta_cliente"
            ? await criarPastaDoCliente(ctx, t)
            : (await garantirParceiro(ctx, t)).avisos;
      await concluir(t, "feito", { aviso: avisos.length ? [...new Set(avisos)].join(",") : undefined });
    } catch (e) {
      if (e instanceof Pausa) {
        await concluir(t, "pausa");
      } else if (e instanceof FalhaDeNegocio) {
        await concluir(t, "erro", { erro: e.message });
      } else if (e instanceof ErroRpc && e.codigo === "P0001") {
        // Frase de negócio do banco (ex.: "Este cliente já tem uma pasta ligada.").
        await concluir(t, "erro", { erro: e.message });
      } else if (e instanceof GdriveErro && e.tipo === "credencial") {
        credencialMorta = textoDetalhe(e);
        await concluir(t, "erro", { erro: FRASE.credencial, detalhe: credencialMorta });
      } else {
        await concluir(t, "transitorio", { detalhe: textoDetalhe(e) });
      }
    }
  }

  const { escritas, leituras } = drive.contadores();
  console.log(JSON.stringify({ fn: "drive-provisionar", tarefas: tarefas.length, ...resumo, escritas, leituras, ms: agora() - inicio }));
  return { status: credencialMorta ? 503 : 200, corpo: { tarefas: tarefas.length, ...resumo } };
}

// -------------------------------------------------------------- entrada

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function atender(req: Request, deps: Deps): Promise<Response> {
  // Chamado só por cron/pg_net (e pela cutucada das RPCs): POST, sem CORS, sem JWT de usuário.
  if (req.method !== "POST") return json(405, { erro: "método não permitido" });

  const esperado = deps.env("DRIVE_SEGREDO") ?? "";
  if (esperado.length < SEGREDO_MINIMO) return json(503, { erro: "não configurado" });
  const recebido = req.headers.get(HEADER_SEGREDO) ?? "";
  if (!(await segredoConfere(recebido, esperado))) return json(401, { erro: "não autorizado" });
  await req.body?.cancel(); // o corpo não é dado: a fila é a fonte

  const rodar = async () => {
    try {
      return await executarLote(deps);
    } catch (e) {
      // Mensagens daqui são nossas (sem token/segredo); nunca o corpo de resposta.
      console.error("drive-provisionar:", e instanceof Error ? e.message : "erro");
      return { status: 500, corpo: { erro: "falha interna" } };
    }
  };

  if (deps.emSegundoPlano) {
    // O pg_net desiste em 10 s; a cópia da matriz leva ~30–60 s.
    deps.emSegundoPlano(rodar());
    return json(202, { aceito: true });
  }
  const r = await rodar();
  return json(r.status, r.corpo);
}
