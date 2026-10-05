// deno test supabase/functions/drive-provisionar/
// Sem rede: o Google Drive e o PostgREST são o falso em memória abaixo.
// Sem import remoto (roda offline e passa no tsc do Next).

import {
  atender,
  type Deps,
  FRASE,
  MATRIZ_PADRAO,
  RAIZ_PADRAO,
  type Tarefa,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore TS5097 — import com extensão .ts é o padrão do Deno
} from "./provisionar.ts";

type DenoTest = { test(nome: string, fn: () => void | Promise<void>): void };
const D = (globalThis as unknown as { Deno: DenoTest }).Deno;

function ok(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}
function igual<T>(a: T, b: T, msg = ""): void {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  if (x !== y) throw new Error(`${msg}\n  obtido:   ${x}\n  esperado: ${y}`);
}

const SEGREDO = "s".repeat(40);
const SB = "https://projeto.supabase.co";
const PASTA = "application/vnd.google-apps.folder";
const ALUNO = "0f8e2a7c-1b3d-4e5f-9a6b-7c8d9e0f1a2b";
const CLIENTE = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

type Arq = {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  trashed?: boolean;
  appProperties?: Record<string, string>;
  shortcutDetails?: { targetId?: string };
};
type Perm = { id: string; type: string; role: string; emailAddress: string };

class Mundo {
  arquivos = new Map<string, Arq>();
  perms = new Map<string, Perm[]>();
  seq = 0;
  escritas = 0;
  fila: Tarefa[] = [];
  registros: { papel: string; file_id: string; adotada: boolean }[] = [];
  links: { rpc: string; file_id: string }[] = [];
  conclusoes: { resultado: string; erro: string | null; aviso: string | null }[] = [];
  linkClienteJaExiste = false;
  /** file_ids que aparecem no link de OUTRO ambiente (o banco recusa registrar). */
  linksDeOutrosAmbientes = new Set<string>();
  permissoesRegistradas: { file_id: string; permission_id: string; email: string; papel: string }[] = [];
  revogacoes: { id: string; file_id: string; permission_id: string }[] = [];
  resultadosRevogacao: { id: string; resultado: string }[] = [];
  falhaNoDelete = false;

  novoId(): string {
    return `F${String(++this.seq).padStart(12, "0")}`;
  }
  add(a: Omit<Arq, "id"> & { id?: string }): Arq {
    const arq = { ...a, id: a.id ?? this.novoId() } as Arq;
    this.arquivos.set(arq.id, arq);
    return arq;
  }
  filhos(pai: string): Arq[] {
    return [...this.arquivos.values()].filter((f) => f.parents.includes(pai) && !f.trashed);
  }

  constructor() {
    this.add({ id: RAIZ_PADRAO, name: "Implementação Assistida — Pastas dos Alunos", mimeType: PASTA, parents: ["root"] });
    this.add({ id: MATRIZ_PADRAO, name: "PASTA PADRÃO", mimeType: PASTA, parents: ["root"] });
    const doc = this.add({ id: "MDOCS000000001", name: "1) DOCUMENTOS ", mimeType: PASTA, parents: [MATRIZ_PADRAO] });
    this.add({ id: "MCLI0000000001", name: "5) CLIENTES", mimeType: PASTA, parents: [MATRIZ_PADRAO] });
    this.add({ id: "MARQ0000000001", name: "Contrato.docx", mimeType: "application/msword", parents: [doc.id] });
    this.add({ id: "MARQ0000000002", name: "Leia-me", mimeType: "application/vnd.google-apps.document", parents: [MATRIZ_PADRAO] });
    this.add({
      id: "MATA0000000001", name: "Aulas", mimeType: "application/vnd.google-apps.shortcut", parents: [MATRIZ_PADRAO],
      shortcutDetails: { targetId: "ALVO0000000001" },
    });
  }
}

function resposta(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });
}

function deps(m: Mundo): Deps {
  const env: Record<string, string> = {
    DRIVE_SEGREDO: SEGREDO,
    SUPABASE_URL: SB,
    SUPABASE_SERVICE_ROLE_KEY: "srk",
    GDRIVE_CLIENT_ID: "c",
    GDRIVE_CLIENT_SECRET: "s",
    GDRIVE_REFRESH_TOKEN: "r",
  };
  const fetchFalso = async (entrada: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(entrada));
    const metodo = init?.method ?? "GET";
    if (url.hostname === "oauth2.googleapis.com") return resposta(200, { access_token: "t", expires_in: 3600 });
    const corpo = init?.body ? JSON.parse(String(init.body)) : {};

    if (url.origin === SB) {
      const nome = url.pathname.split("/").pop();
      if (nome === "drive_tarefa_pegar") {
        const lote = m.fila.splice(0);
        return resposta(200, lote);
      }
      if (nome === "drive_pasta_registrar") {
        // espelho da guarda do banco: pasta no link de outro ambiente
        if (corpo.p_papel === "raiz_parceiro" && m.linksDeOutrosAmbientes.has(corpo.p_file_id)) {
          return resposta(400, { code: "P0001", message: "Esta pasta já pertence a outro parceiro." });
        }
        m.registros.push({ papel: corpo.p_papel, file_id: corpo.p_file_id, adotada: corpo.p_adotada });
        return new Response("", { status: 200 });
      }
      if (nome === "drive_parceiro_link_gravar" || nome === "drive_cliente_link_gravar") {
        if (nome === "drive_cliente_link_gravar" && m.linkClienteJaExiste) {
          return resposta(400, { code: "P0001", message: "Este cliente já tem uma pasta ligada." });
        }
        m.links.push({ rpc: nome, file_id: corpo.p_file_id });
        return resposta(200, `https://drive.google.com/drive/folders/${corpo.p_file_id}`);
      }
      if (nome === "drive_permissao_registrar") {
        m.permissoesRegistradas.push({
          file_id: corpo.p_file_id, permission_id: corpo.p_permission_id, email: corpo.p_email, papel: corpo.p_papel,
        });
        return new Response("", { status: 200 });
      }
      if (nome === "drive_revogacoes_listar") {
        return resposta(200, m.revogacoes.splice(0));
      }
      if (nome === "drive_revogacao_resultado") {
        m.resultadosRevogacao.push({ id: corpo.p_id, resultado: corpo.p_resultado });
        return new Response("", { status: 200 });
      }
      if (nome === "drive_tarefa_concluir") {
        m.conclusoes.push({ resultado: corpo.p_resultado, erro: corpo.p_erro, aviso: corpo.p_aviso });
        return new Response("", { status: 200 });
      }
      return resposta(404, { code: "PGRST202" });
    }

    // Google Drive v3
    const p = url.pathname.replace("/drive/v3", "");
    const partes = p.split("/").filter(Boolean); // files, <id>, copy|permissions
    if (partes[0] !== "files") return resposta(404, {});
    if (partes.length === 1 && metodo === "GET") {
      const q = url.searchParams.get("q") ?? "";
      const pai = /'([^']+)' in parents/.exec(q)?.[1] ?? "";
      const gid = /value='([^']+)'/.exec(q)?.[1];
      const soPastas = q.includes(`mimeType = '${PASTA}'`);
      const files = m.filhos(pai).filter((f) =>
        (!soPastas || f.mimeType === PASTA) && (!gid || f.appProperties?.gps_id === gid)
      );
      return resposta(200, { files });
    }
    if (partes.length === 1 && metodo === "POST") {
      m.escritas++;
      return resposta(200, m.add({ name: corpo.name, mimeType: corpo.mimeType, parents: corpo.parents, appProperties: corpo.appProperties, shortcutDetails: corpo.shortcutDetails }));
    }
    const arq = m.arquivos.get(partes[1]);
    if (!arq) return resposta(404, { error: { errors: [{ reason: "notFound" }] } });
    if (partes.length === 2) return resposta(200, arq);
    if (partes[2] === "copy") {
      m.escritas++;
      return resposta(200, m.add({ name: corpo.name, mimeType: arq.mimeType, parents: corpo.parents, appProperties: corpo.appProperties }));
    }
    if (partes[2] === "permissions" && metodo === "DELETE") {
      m.escritas++;
      if (m.falhaNoDelete) return resposta(503, { error: { errors: [{ reason: "backendError" }] } });
      const lista = m.perms.get(arq.id) ?? [];
      const i = lista.findIndex((x) => x.id === partes[3]);
      if (i < 0) return resposta(404, { error: { errors: [{ reason: "notFound" }] } });
      lista.splice(i, 1);
      return new Response(null, { status: 204 });
    }
    if (partes[2] === "permissions" && metodo === "GET") {
      return resposta(200, { permissions: m.perms.get(arq.id) ?? [] });
    }
    if (partes[2] === "permissions" && metodo === "POST") {
      m.escritas++;
      if (String(corpo.emailAddress).endsWith("@naogoogle.com")) {
        return resposta(400, { error: { errors: [{ reason: "invalidSharingRequest" }] } });
      }
      const lista = m.perms.get(arq.id) ?? [];
      lista.push({ id: `P${lista.length}`, type: "user", role: corpo.role, emailAddress: corpo.emailAddress });
      m.perms.set(arq.id, lista);
      return resposta(200, lista[lista.length - 1]);
    }
    return resposta(400, {});
  };
  let relogio = 0;
  return {
    env: (k) => env[k],
    fetch: fetchFalso as typeof fetch,
    agora: () => relogio,
    dormir: async (ms) => {
      relogio += ms;
    },
  };
}

function tarefa(extra: Partial<Tarefa> = {}): Tarefa {
  return {
    id: "11111111-2222-4333-8444-555555555555",
    tipo: "provisionar_parceiro",
    aluno_id: ALUNO,
    cliente_id: null,
    tentativas: 0,
    parceiro_nome: "Maria Souza",
    pasta_drive_url: null,
    pasta_drive_origem: null,
    solicitado_por_admin: true,
    titular_email: "maria@gmail.com",
    cliente_nome: null,
    cliente_link_url: null,
    pastas: {},
    pasta_cliente: null,
    ...extra,
  };
}

/** Tarefa de cliente com o espelho que o banco devolveria depois do provisionar. */
function tarefaCliente(m: Mundo, extra: Partial<Tarefa> = {}): Tarefa {
  const pastas: Tarefa["pastas"] = {};
  for (const r of m.registros) {
    if (r.papel === "raiz_parceiro" || r.papel === "documentos" || r.papel === "clientes") {
      pastas[r.papel] = { file_id: r.file_id, adotada: r.adotada };
    }
  }
  return tarefa({ tipo: "criar_pasta_cliente", cliente_id: CLIENTE, pastas, ...extra });
}

const chamar = (m: Mundo, segredo = SEGREDO) =>
  atender(
    new Request("https://x/functions/v1/drive-provisionar", {
      method: "POST",
      headers: { "x-drive-segredo": segredo, "Content-Type": "application/json" },
      body: JSON.stringify({ tarefa_id: "ignorado", aluno_id: "forjado" }),
    }),
    deps(m),
  );

D.test("sem o segredo: 401 e nada acontece", async () => {
  const m = new Mundo();
  m.fila.push(tarefa());
  const r = await chamar(m, "errado".repeat(8));
  igual(r.status, 401);
  igual(m.fila.length, 1, "não pegou a fila");
});

D.test("provisionar: cria a raiz, copia a matriz, garante 5) CLIENTES, grava link e compartilha", async () => {
  const m = new Mundo();
  m.fila.push(tarefa());
  const r = await chamar(m);
  igual(r.status, 200);
  igual(m.conclusoes.map((c) => c.resultado), ["feito"]);
  const raiz = m.filhos(RAIZ_PADRAO).find((f) => f.name === "Maria Souza — Implementação Assistida");
  ok(raiz, "raiz criada com o nome padrão");
  igual(raiz!.appProperties?.gps_id, `p:${ALUNO}`);
  const nomes = m.filhos(raiz!.id).map((f) => f.name).sort();
  igual(nomes, ["1) DOCUMENTOS ", "5) CLIENTES", "Aulas", "Leia-me"]);
  const doc = m.filhos(raiz!.id).find((f) => f.name === "1) DOCUMENTOS ")!;
  igual(m.filhos(doc.id).map((f) => f.name), ["Contrato.docx"], "cópia recursiva");
  const atalho = m.filhos(raiz!.id).find((f) => f.name === "Aulas")!;
  igual(atalho.shortcutDetails?.targetId, "ALVO0000000001", "atalho recriado");
  igual(m.registros.map((x) => x.papel).sort(), ["clientes", "documentos", "raiz_parceiro"]);
  igual(m.links, [{ rpc: "drive_parceiro_link_gravar", file_id: raiz!.id }]);
  const cli = m.filhos(raiz!.id).find((f) => f.name === "5) CLIENTES")!;
  igual(m.perms.get(raiz!.id)?.map((p) => p.role), ["reader"]);
  igual(m.perms.get(doc.id)?.map((p) => p.role), ["writer"]);
  igual(m.perms.get(cli.id)?.map((p) => p.role), ["writer"]);
});

D.test("provisionar de novo (retomada): não duplica pasta, arquivo nem convite", async () => {
  const m = new Mundo();
  m.fila.push(tarefa());
  await chamar(m);
  const antes = m.arquivos.size;
  const escritasAntes = m.escritas;
  m.fila.push(tarefa()); // espelho vazio de propósito: a idempotência é o gps_id no Drive
  await chamar(m);
  igual(m.arquivos.size, antes, "nenhum arquivo novo");
  igual(m.escritas, escritasAntes, "nenhuma escrita (nem convite repetido)");
  igual(m.conclusoes.map((c) => c.resultado), ["feito", "feito"]);
});

D.test("adota a pasta já ligada dentro da raiz: não copia a matriz", async () => {
  const m = new Mundo();
  const existente = m.add({ name: "Maria Souza — Implementação Assistida", mimeType: PASTA, parents: [RAIZ_PADRAO] });
  m.add({ name: "1) DOCUMENTOS", mimeType: PASTA, parents: [existente.id] });
  m.fila.push(tarefa({
    pasta_drive_url: `https://drive.google.com/drive/folders/${existente.id}?usp=sharing`,
    pasta_drive_origem: "equipe",
  }));
  await chamar(m);
  igual(m.conclusoes.map((c) => c.resultado), ["feito"]);
  igual(m.registros.find((x) => x.papel === "raiz_parceiro"), { papel: "raiz_parceiro", file_id: existente.id, adotada: true });
  igual(m.filhos(existente.id).map((f) => f.name).sort(), ["1) DOCUMENTOS", "5) CLIENTES"], "só criou 5) CLIENTES");
});

D.test("link fora da raiz: erro claro, nada criado", async () => {
  const m = new Mundo();
  const fora = m.add({ name: "Outra", mimeType: PASTA, parents: ["root"] });
  m.fila.push(tarefa({ pasta_drive_url: `https://drive.google.com/drive/folders/${fora.id}`, pasta_drive_origem: "equipe" }));
  await chamar(m);
  igual(m.conclusoes, [{ resultado: "erro", erro: FRASE.linkFora, aviso: null }]);
  igual(m.escritas, 0);
});

D.test("homônimo sem gps_id na raiz: recusa em vez de duplicar", async () => {
  const m = new Mundo();
  m.add({ name: "Maria Souza — Implementação Assistida ", mimeType: PASTA, parents: [RAIZ_PADRAO] });
  m.fila.push(tarefa());
  await chamar(m);
  igual(m.conclusoes[0].erro, FRASE.homonimoParceiro);
  igual(m.escritas, 0);
});

D.test("e-mail sem conta Google: pasta pronta, tarefa feita com aviso", async () => {
  const m = new Mundo();
  m.fila.push(tarefa({ titular_email: "maria@naogoogle.com" }));
  await chamar(m);
  igual(m.conclusoes, [{ resultado: "feito", erro: null, aviso: "email_nao_google" }]);
  igual(m.links.length, 1, "link gravado mesmo assim");
});

D.test("criar pasta do cliente: dentro da 5) CLIENTES organizada pela equipe, 1 + 6 + 3 pastas", async () => {
  const m = new Mundo();
  m.fila.push(tarefa());
  await chamar(m); // a equipe organizou a pasta do parceiro
  m.fila.push(tarefaCliente(m, { cliente_nome: "João da Silva" }));
  await chamar(m);
  igual(m.conclusoes.map((c) => c.resultado), ["feito", "feito"]);
  const raiz = m.filhos(RAIZ_PADRAO).find((f) => f.appProperties?.gps_id === `p:${ALUNO}`)!;
  const cli = m.filhos(raiz.id).find((f) => f.name === "5) CLIENTES")!;
  const pasta = m.filhos(cli.id).find((f) => f.name === "João da Silva")!;
  ok(pasta, "pasta do cliente em 5) CLIENTES");
  igual(m.filhos(pasta.id).map((f) => f.name).sort(), [
    "01 Documentos recebidos", "02 Viabilidade e Croqui", "03 Minutas",
    "04 ITCMD e ITBI", "05 Junta Comercial", "06 Entrega",
  ]);
  const docs = m.filhos(pasta.id).find((f) => f.name === "01 Documentos recebidos")!;
  igual(m.filhos(docs.id).map((f) => f.name).sort(), ["Empresas", "Imóveis", "Pessoais"]);
  igual(m.registros.filter((x) => x.papel === "sub_cliente").length, 9);
  igual(m.links.map((l) => l.rpc), ["drive_parceiro_link_gravar", "drive_cliente_link_gravar"]);

  // segunda vez: nada novo
  const antes = m.arquivos.size;
  m.fila.push(tarefaCliente(m, { cliente_nome: "João da Silva" }));
  await chamar(m);
  igual(m.arquivos.size, antes, "retomada sem duplicar");
});

D.test("cliente com link colado pelo parceiro: erro claro, nada criado", async () => {
  const m = new Mundo();
  m.fila.push(tarefa({
    tipo: "criar_pasta_cliente", cliente_id: CLIENTE, cliente_nome: "X",
    cliente_link_url: "https://drive.google.com/drive/folders/1XXXXXXXXXXXXXXXXXX",
  }));
  await chamar(m);
  igual(m.conclusoes, [{ resultado: "erro", erro: FRASE.clienteComLink, aviso: null }]);
  igual(m.escritas, 0);
});

D.test("link do cliente apareceu no meio (corrida): o banco recusa e a tarefa vira erro com a frase", async () => {
  const m = new Mundo();
  m.fila.push(tarefa());
  await chamar(m);
  m.linkClienteJaExiste = true;
  m.fila.push(tarefaCliente(m, { cliente_nome: "X" }));
  await chamar(m);
  igual(m.conclusoes.at(-1)?.erro, "Este cliente já tem uma pasta ligada.");
});

D.test("credencial ausente: erro com frase de credencial, 503", async () => {
  const m = new Mundo();
  m.fila.push(tarefa());
  const d = deps(m);
  const semCred: Deps = { ...d, env: (k) => (k.startsWith("GDRIVE_") ? undefined : d.env(k)) };
  const r = await atender(
    new Request("https://x", { method: "POST", headers: { "x-drive-segredo": SEGREDO } }),
    semCred,
  );
  igual(r.status, 503);
  igual(m.conclusoes[0].erro, FRASE.credencial);
});

// ── 2ª rodada: achado ALTO do kirad — parceiro A adota a pasta do parceiro B ──
const ALUNO_B = "9b9b9b9b-1111-4222-8333-444444444444";

function totalPerms(m: Mundo): number {
  return [...m.perms.values()].reduce((n, l) => n + l.length, 0);
}

/** B já tem a pasta criada pelo sistema e compartilhada com ele; contadores zerados. */
async function prepararB(): Promise<{ m: Mundo; pastaB: Arq; permsAntes: number; escritasAntes: number }> {
  const m = new Mundo();
  m.fila.push(tarefa({ aluno_id: ALUNO_B, parceiro_nome: "Bruno Lima", titular_email: "bruno@gmail.com" }));
  await chamar(m);
  const pastaB = m.filhos(RAIZ_PADRAO).find((f) => f.appProperties?.gps_id === `p:${ALUNO_B}`)!;
  ok(pastaB, "pasta de B criada");
  m.conclusoes = [];
  m.registros = [];
  m.links = [];
  m.permissoesRegistradas = [];
  return { m, pastaB, permsAntes: totalPerms(m), escritasAntes: m.escritas };
}

D.test("kirad: A cola o link de B (origem parceiro) e a equipe provisiona A → recusado, 0 shares", async () => {
  const { m, pastaB, permsAntes, escritasAntes } = await prepararB();
  m.fila.push(tarefa({
    pasta_drive_url: `https://drive.google.com/drive/folders/${pastaB.id}`,
    pasta_drive_origem: "parceiro",
  }));
  await chamar(m);
  igual(m.conclusoes, [{ resultado: "erro", erro: FRASE.linkNaoConferido, aviso: null }]);
  igual(totalPerms(m), permsAntes, "nenhum compartilhamento novo");
  igual(m.escritas, escritasAntes, "nenhuma escrita no Drive");
  igual(m.registros.length, 0, "nada registrado para A");
  igual(m.links.length, 0, "link de A não regravado");
  igual(m.permissoesRegistradas.length, 0, "nenhuma permissão registrada");
  ok(![...m.perms.values()].flat().some((p) => p.emailAddress === "maria@gmail.com"), "A sem acesso a nada");
});

D.test("kirad: A cola o link de B e pede pasta de cliente → recusado sem provisionar, 0 shares", async () => {
  const { m, pastaB, permsAntes, escritasAntes } = await prepararB();
  m.fila.push(tarefa({
    tipo: "criar_pasta_cliente", cliente_id: CLIENTE, cliente_nome: "Cliente de A",
    pasta_drive_url: `https://drive.google.com/drive/folders/${pastaB.id}`,
    pasta_drive_origem: "parceiro", solicitado_por_admin: false,
  }));
  await chamar(m);
  igual(m.conclusoes, [{ resultado: "erro", erro: FRASE.parceiroNaoOrganizado, aviso: null }]);
  igual(totalPerms(m), permsAntes);
  igual(m.escritas, escritasAntes);
  igual(m.registros.length + m.links.length, 0);
});

D.test("kirad: link de B salvo como equipe em A, pasta com gps_id de B → recusado, 0 shares", async () => {
  const { m, pastaB, permsAntes, escritasAntes } = await prepararB();
  m.fila.push(tarefa({ pasta_drive_url: `https://drive.google.com/drive/folders/${pastaB.id}`, pasta_drive_origem: "equipe" }));
  await chamar(m);
  igual(m.conclusoes, [{ resultado: "erro", erro: FRASE.linkAlheio, aviso: null }]);
  igual(totalPerms(m), permsAntes);
  igual(m.escritas, escritasAntes);
  igual(m.registros.length, 0);
});

D.test("kirad: pasta manual de B (sem gps_id, no link de B) salva como equipe em A → o banco recusa, 0 shares", async () => {
  const m = new Mundo();
  const manualB = m.add({ name: "Bruno Lima — Implementação Assistida", mimeType: PASTA, parents: [RAIZ_PADRAO] });
  m.add({ name: "1) DOCUMENTOS", mimeType: PASTA, parents: [manualB.id] });
  m.linksDeOutrosAmbientes.add(manualB.id);
  m.fila.push(tarefa({ pasta_drive_url: `https://drive.google.com/drive/folders/${manualB.id}`, pasta_drive_origem: "equipe" }));
  await chamar(m);
  igual(m.conclusoes, [{ resultado: "erro", erro: "Esta pasta já pertence a outro parceiro.", aviso: null }]);
  igual(totalPerms(m), 0);
  igual(m.escritas, 0);
});

D.test("adoção pedida por quem não é admin, ou da matriz: recusada, 0 escritas", async () => {
  const m = new Mundo();
  const existente = m.add({ name: "Maria Souza — Implementação Assistida", mimeType: PASTA, parents: [RAIZ_PADRAO] });
  m.fila.push(tarefa({
    pasta_drive_url: `https://drive.google.com/drive/folders/${existente.id}`,
    pasta_drive_origem: "equipe", solicitado_por_admin: false,
  }));
  await chamar(m);
  m.fila.push(tarefa({ pasta_drive_url: `https://drive.google.com/drive/folders/${MATRIZ_PADRAO}`, pasta_drive_origem: "equipe" }));
  await chamar(m);
  igual(m.conclusoes.map((c) => c.erro), [FRASE.linkNaoConferido, FRASE.linkAlheio]);
  igual(m.escritas, 0);
});

D.test("compartilhar sem raiz organizada: não cria pasta nova", async () => {
  const m = new Mundo();
  m.fila.push(tarefa({ tipo: "compartilhar" }));
  await chamar(m);
  igual(m.conclusoes, [{ resultado: "erro", erro: FRASE.parceiroNaoOrganizado, aviso: null }]);
  igual(m.escritas, 0);
});

// ── 2ª rodada: revogar o que o sistema concedeu ────────────────────────────
D.test("cada permissão concedida é registrada (raiz reader, DOCUMENTOS e CLIENTES writer)", async () => {
  const m = new Mundo();
  m.fila.push(tarefa());
  await chamar(m);
  igual(m.permissoesRegistradas.map((p) => `${p.papel}:${p.email}`).sort(),
    ["reader:maria@gmail.com", "writer:maria@gmail.com", "writer:maria@gmail.com"]);
  ok(m.permissoesRegistradas.every((p) => p.permission_id), "com permission_id");
});

D.test("revogar: remove as permissões marcadas; 404 conta como feito", async () => {
  const m = new Mundo();
  m.fila.push(tarefa());
  await chamar(m);
  const regs = m.permissoesRegistradas;
  igual(totalPerms(m), 3);
  m.revogacoes = [
    ...regs.map((r, i) => ({ id: `r${i}`, file_id: r.file_id, permission_id: r.permission_id })),
    { id: "sumiu", file_id: regs[0].file_id, permission_id: "P99" },
  ];
  m.fila.push(tarefa({ tipo: "revogar", aluno_id: null }));
  await chamar(m);
  igual(totalPerms(m), 0, "acesso removido");
  igual(m.resultadosRevogacao.map((x) => x.resultado), ["revogada", "revogada", "revogada", "ausente"]);
  igual(m.conclusoes.at(-1)?.resultado, "feito");
});

D.test("revogar com falha transitória: item volta e a tarefa repete", async () => {
  const m = new Mundo();
  m.fila.push(tarefa());
  await chamar(m);
  const r = m.permissoesRegistradas[0];
  m.revogacoes = [{ id: "r0", file_id: r.file_id, permission_id: r.permission_id }];
  m.falhaNoDelete = true;
  m.fila.push(tarefa({ tipo: "revogar", aluno_id: null }));
  await chamar(m);
  igual(m.resultadosRevogacao.map((x) => x.resultado), ["transitorio"]);
  igual(m.conclusoes.at(-1)?.resultado, "transitorio");
  igual(totalPerms(m), 3, "nada removido");
});
