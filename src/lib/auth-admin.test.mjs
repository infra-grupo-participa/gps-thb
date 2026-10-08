// Decisão "quem é admin do GPS" lendo gps.admins (08/10/2026).
// Rodar: node --test src/lib/auth-admin.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// `auth-admin.ts` importa irmãos sem extensão (`./auth-erros`), como o resto do
// repo; o Node puro exige `.ts`. Hook mínimo de resolução, só neste teste.
register(
  "data:text/javascript," +
    encodeURIComponent(String.raw`export async function resolve(spec, ctx, next) {
      if (spec.startsWith("./") && !/\.[a-z]+$/.test(spec)) {
        try { return await next(spec + ".ts", ctx); } catch {}
      }
      return next(spec, ctx);
    }`),
);

const { consultarAdminAtivo } = await import("./auth-admin.ts");
const { SessaoIndeterminadaError } = await import("./auth-erros.ts");

/** Cliente falso que registra a consulta e devolve `resposta`. */
function falso(resposta) {
  const chamadas = {};
  const cliente = {
    schema(s) { chamadas.schema = s; return this; },
    from(t) { chamadas.tabela = t; return this; },
    select(c) { chamadas.colunas = c; return this; },
    eq(c, v) { chamadas.filtro = [c, v]; return this; },
    maybeSingle: async () => resposta,
  };
  return { cliente, chamadas };
}

test("linha ativa → admin (e consulta gps.admins pelo user_id)", async () => {
  const { cliente, chamadas } = falso({ data: { ativo: true }, error: null });
  assert.equal(await consultarAdminAtivo(cliente, "u1"), true);
  assert.deepEqual(chamadas, {
    schema: "gps", tabela: "admins", colunas: "ativo", filtro: ["user_id", "u1"],
  });
});

test("linha com ativo=false → não admin", async () => {
  const { cliente } = falso({ data: { ativo: false }, error: null });
  assert.equal(await consultarAdminAtivo(cliente, "u1"), false);
});

test("ativo nulo → não admin", async () => {
  const { cliente } = falso({ data: { ativo: null }, error: null });
  assert.equal(await consultarAdminAtivo(cliente, "u1"), false);
});

test("sem linha → não admin", async () => {
  const { cliente } = falso({ data: null, error: null });
  assert.equal(await consultarAdminAtivo(cliente, "u1"), false);
});

test("error preenchido → lança SessaoIndeterminadaError (falha fechada)", async () => {
  const { cliente } = falso({ data: null, error: { code: "08006", message: "falha" } });
  await assert.rejects(
    () => consultarAdminAtivo(cliente, "u1"),
    (e) => e instanceof SessaoIndeterminadaError && e.escopo === "admins",
  );
});

test("error com data presente também lança (nunca vira admin)", async () => {
  const { cliente } = falso({ data: { ativo: true }, error: { message: "x" } });
  await assert.rejects(() => consultarAdminAtivo(cliente, "u1"), SessaoIndeterminadaError);
});
