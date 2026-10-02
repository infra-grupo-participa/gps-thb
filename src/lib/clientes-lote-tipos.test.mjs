// Teste da validação do cadastro de clientes em lote (Onda 1.2).
// Rodar: node --test src/lib/clientes-lote-tipos.test.mjs
//
// `node --test`, não vitest: o repo não tem runner de unidade e a regra é
// "sem dependência nova" (mesmo molde de `colar-clientes.test.mjs`). Node 24
// remove os tipos do `.ts` sozinho; o módulo testado importa `@/lib/masks`
// (o único `soDigitos` do repo), então o teste registra um resolvedor mínimo
// que traduz `@/` → `src/` e acrescenta `.ts` — só para esta execução.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const src = new URL("../", import.meta.url).href; // .../src/
register(
  "data:text/javascript," +
    encodeURIComponent(`
      let SRC;
      export function initialize(d) { SRC = d.src; }
      export async function resolve(spec, ctx, next) {
        if (spec.startsWith("@/")) {
          const alvo = SRC + spec.slice(2);
          return next(/\\.[cm]?[jt]s$/.test(alvo) ? alvo : alvo + ".ts", ctx);
        }
        return next(spec, ctx);
      }`),
  { data: { src } },
);

const {
  prepararLoteClientes,
  CLIENTES_LOTE_MAXIMO,
  MOTIVO_LOTE,
} = await import("./clientes-lote-tipos.ts");

const n = (k) => Array.from({ length: k }, (_, i) => ({ nome: `Cliente ${i + 1}` }));

test("teto: 50 passa, 51 recusa a chamada inteira", () => {
  assert.equal(CLIENTES_LOTE_MAXIMO, 50);
  const ok = prepararLoteClientes(n(50));
  assert.equal(ok.ok, true);
  assert.equal(ok.validas.length, 50);
  const nao = prepararLoteClientes(n(51));
  assert.equal(nao.ok, false);
  assert.match(nao.erro, /50/);
});

test("forma: lista vazia e não-lista recusam a chamada", () => {
  assert.equal(prepararLoteClientes([]).ok, false);
  assert.equal(prepararLoteClientes(null).ok, false);
  assert.equal(prepararLoteClientes({ nome: "x" }).ok, false);
  assert.equal(prepararLoteClientes("Maria").ok, false);
});

test("nome vazio ou só espaço vira ignorado com motivo, e o resto segue", () => {
  const r = prepararLoteClientes([
    { nome: "Ana" },
    { nome: "" },
    { nome: "   \t " },
    { telefone: "11999998888" },
    { nome: 123 },
    { nome: "Bia" },
  ]);
  assert.equal(r.ok, true);
  assert.deepEqual(
    r.validas.map((v) => [v.linha, v.nome]),
    [[1, "Ana"], [6, "Bia"]],
  );
  assert.deepEqual(r.ignorados, [
    { linha: 2, motivo: MOTIVO_LOTE.semNome },
    { linha: 3, motivo: MOTIVO_LOTE.semNome },
    { linha: 4, motivo: MOTIVO_LOTE.semNome },
    { linha: 5, motivo: MOTIVO_LOTE.semNome },
  ]);
});

test("nome é aparado; acima de 200 ou com caractere de controle é ignorado", () => {
  const r = prepararLoteClientes([
    { nome: "  Carla Souza \n" },
    { nome: "x".repeat(200) },
    { nome: "x".repeat(201) },
    { nome: "Dani\u0007el" },
  ]);
  assert.equal(r.validas[0].nome, "Carla Souza");
  assert.equal(r.validas[1].nome.length, 200);
  assert.deepEqual(r.ignorados, [
    { linha: 3, motivo: MOTIVO_LOTE.nomeLongo },
    { linha: 4, motivo: MOTIVO_LOTE.nomeInvalido },
  ]);
});

test("telefone normalizado só dígitos; vazio vira null; >15 dígitos ignora", () => {
  const r = prepararLoteClientes([
    { nome: "A", telefone: "(11) 99999-8888" },
    { nome: "B", telefone: "+55 44 99889-3282" },
    { nome: "C", telefone: "" },
    { nome: "D", telefone: "---" },
    { nome: "E" },
    { nome: "F", telefone: "1234567890123456" },
    { nome: "G", telefone: 11999998888 },
  ]);
  assert.deepEqual(
    r.validas.map((v) => [v.nome, v.telefone]),
    [
      ["A", "11999998888"],
      ["B", "5544998893282"],
      ["C", null],
      ["D", null],
      ["E", null],
      ["G", "11999998888"],
    ],
  );
  assert.deepEqual(r.ignorados, [{ linha: 6, motivo: MOTIVO_LOTE.telefoneLongo }]);
});

test("linha que não é objeto vira ignorada, não derruba o lote", () => {
  const r = prepararLoteClientes([null, "Maria", ["x"], { nome: "Ok" }]);
  assert.equal(r.ok, true);
  assert.equal(r.validas.length, 1);
  assert.deepEqual(
    r.ignorados.map((i) => i.linha),
    [1, 2, 3],
  );
});
