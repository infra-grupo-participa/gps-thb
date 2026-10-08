// Teste de `definirAdminDoPrograma` (admins do programa, 08/10/2026).
// Rodar: node --test src/app/admin/admins-actions.test.mjs
//
// `node --test`, não vitest: o repo não tem runner de unidade e a regra é "sem
// dependência nova" (mesmo molde de `src/lib/clientes-lote-tipos.test.mjs`).
// Testa o ARQUIVO REAL da action: o resolvedor abaixo traduz `@/` → `src/` e
// troca só as 3 bordas com efeito externo — sessão (`@/lib/auth`), banco
// (`@/lib/supabase/server`) e cache do Next (`next/cache`) — por dublês que
// leem `globalThis.__dubles`. `erros.ts`, `texto.ts` e `admins-tipos.ts` são
// os de verdade.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const dubles = {
  "@/lib/auth": `
    export const ehAdmin = async () => globalThis.__dubles.admin;
    export const getContextoSessao = async () => ({ user: { email: globalThis.__dubles.meuEmail } });`,
  "@/lib/supabase/server": `
    export async function createClient() {
      return { schema: () => ({ rpc: async (nome, args) => {
        globalThis.__dubles.chamadas.push({ nome, args });
        return globalThis.__dubles.resposta;
      } }) };
    }`,
  "next/cache": `
    export function revalidatePath(p) { globalThis.__dubles.revalidados.push(p); }`,
};

const src = new URL("../../", import.meta.url).href; // .../src/
register(
  "data:text/javascript," +
    encodeURIComponent(`
      let SRC, DUBLES;
      export function initialize(d) { SRC = d.src; DUBLES = d.dubles; }
      export async function resolve(spec, ctx, next) {
        if (DUBLES[spec]) {
          return { url: "data:text/javascript," + encodeURIComponent(DUBLES[spec]), shortCircuit: true };
        }
        if (spec.startsWith("@/")) {
          const alvo = SRC + spec.slice(2);
          return next(/\\.[cm]?[jt]s$/.test(alvo) ? alvo : alvo + ".ts", ctx);
        }
        return next(spec, ctx);
      }`),
  { data: { src, dubles } },
);

const { definirAdminDoPrograma } = await import("./admins-actions.ts");
const T = await import("../../lib/admins-tipos.ts");

beforeEach(() => {
  globalThis.__dubles = {
    admin: true,
    meuEmail: "eu@advmais.com",
    resposta: { data: { mudou: true }, error: null },
    chamadas: [],
    revalidados: [],
  };
  // `logErro` escreve no console; silencia para a saída do teste ficar limpa.
  console.error = () => {};
});

const valido = { email: "pessoa@advmais.com", ativo: true, motivo: "entrou na equipe" };

test("não admin → Sem permissão, sem chamar a RPC", async () => {
  globalThis.__dubles.admin = false;
  const r = await definirAdminDoPrograma(valido);
  assert.deepEqual(r, { ok: false, erro: "Sem permissão." });
  assert.equal(globalThis.__dubles.chamadas.length, 0);
});

test("motivo curto → frase do motivo, sem chamar a RPC", async () => {
  const r = await definirAdminDoPrograma({ ...valido, motivo: "  ab  " });
  assert.deepEqual(r, { ok: false, erro: T.FRASE_ADMIN_MOTIVO });
  assert.equal(globalThis.__dubles.chamadas.length, 0);
});

test("motivo acima de 300 → recusa sem chamar a RPC", async () => {
  const r = await definirAdminDoPrograma({ ...valido, motivo: "x".repeat(301) });
  assert.equal(r.erro, T.FRASE_ADMIN_MOTIVO);
  assert.equal(globalThis.__dubles.chamadas.length, 0);
});

test("e-mail fora de @advmais.com → recusa sem chamar a RPC", async () => {
  const r = await definirAdminDoPrograma({ ...valido, email: "pessoa@gmail.com" });
  assert.equal(r.erro, T.FRASE_ADMIN_SO_EQUIPE);
  assert.equal(globalThis.__dubles.chamadas.length, 0);
});

test("remover a si mesmo → frase própria, sem chamar a RPC", async () => {
  const r = await definirAdminDoPrograma({ ...valido, email: "EU@advmais.com", ativo: false });
  assert.equal(r.erro, T.FRASE_ADMIN_SI_MESMO);
  assert.equal(globalThis.__dubles.chamadas.length, 0);
});

test("P0001 do banco → frase do último admin (nunca a mensagem crua)", async () => {
  globalThis.__dubles.resposta = {
    data: null,
    error: { code: "P0001", message: "texto interno qualquer do raise" },
  };
  const r = await definirAdminDoPrograma({ ...valido, ativo: false });
  assert.deepEqual(r, { ok: false, erro: T.FRASE_ADMIN_ULTIMO });
  assert.equal(globalThis.__dubles.revalidados.length, 0);
});

test("P0002 do banco → 'Não existe login com este e-mail.'", async () => {
  globalThis.__dubles.resposta = { data: null, error: { code: "P0002", message: "x" } };
  const r = await definirAdminDoPrograma(valido);
  assert.equal(r.erro, "Não existe login com este e-mail.");
});

test("P0001 fora deste escopo continua genérico (o mapa por escopo não vaza)", async () => {
  const { traduzirErroBanco } = await import("../../lib/erros.ts");
  const f = traduzirErroBanco("outraAcao", { code: "P0001", message: "x" });
  assert.notEqual(f, T.FRASE_ADMIN_ULTIMO);
});

test("sucesso → chama gps.admin_definir normalizado e revalida a página", async () => {
  const r = await definirAdminDoPrograma({ ...valido, email: " Pessoa@AdvMais.com ", motivo: " entrou na equipe " });
  assert.deepEqual(r, { ok: true, mudou: true, simulado: false, criadoEm: null, ultimoLogin: null });
  assert.deepEqual(globalThis.__dubles.chamadas, [
    {
      nome: "admin_definir",
      args: {
        p_email: "pessoa@advmais.com",
        p_ativo: true,
        p_motivo: "entrou na equipe",
        p_simular: false,
      },
    },
  ]);
  assert.deepEqual(globalThis.__dubles.revalidados, ["/admin/operadores"]);
});

test("mudou=false do banco chega à tela", async () => {
  globalThis.__dubles.resposta = { data: { mudou: false }, error: null };
  const r = await definirAdminDoPrograma(valido);
  assert.equal(r.mudou, false);
});

test("simular → repassa p_simular=true, lê `mudaria` e criado_em/ultimo_login, não revalida", async () => {
  globalThis.__dubles.resposta = {
    data: {
      user_id: "u1",
      email: "pessoa@advmais.com",
      ativo: true,
      mudaria: true,
      criado_em: "2025-03-10T12:00:00+00:00",
      ultimo_login: null,
    },
    error: null,
  };
  const r = await definirAdminDoPrograma({ ...valido, simular: true });
  assert.deepEqual(r, {
    ok: true,
    mudou: true,
    simulado: true,
    criadoEm: "2025-03-10T12:00:00+00:00",
    ultimoLogin: null,
  });
  assert.equal(globalThis.__dubles.chamadas[0].args.p_simular, true);
  assert.deepEqual(globalThis.__dubles.revalidados, []);
});

test("simular com mudaria=false (já é admin) → mudou=false", async () => {
  globalThis.__dubles.resposta = { data: { mudaria: false, criado_em: null }, error: null };
  const r = await definirAdminDoPrograma({ ...valido, simular: true });
  assert.equal(r.mudou, false);
});

test("22023 do banco (conta de aluno / formato) → frase genérica do escopo", async () => {
  globalThis.__dubles.resposta = { data: null, error: { code: "22023", message: "texto qualquer" } };
  const r = await definirAdminDoPrograma(valido);
  assert.equal(r.erro, T.FRASE_ADMIN_CONTA_RECUSADA);
});
