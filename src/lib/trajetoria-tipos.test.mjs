// Teste de `calcularPendentes` (trajetória do cliente, migração …345).
// Rodar: node --test src/lib/trajetoria-tipos.test.mjs
//
// `node --test`, não vitest: o repo não tem runner de unidade (mesmo molde de
// `clientes-lote-tipos.test.mjs`). O módulo não importa `@/`, então não precisa
// do resolvedor.
import { test } from "node:test";
import assert from "node:assert/strict";

const {
  calcularPendentes,
  CATALOGO_TRAJETORIA,
  ehCodigoEtapaCliente,
} = await import("./trajetoria-tipos.ts");

const cat = CATALOGO_TRAJETORIA;

test("catálogo espelha as 11 linhas da migração", () => {
  assert.equal(cat.length, 11);
  assert.equal(cat.filter((e) => e.paiCodigo === null).length, 5);
  assert.equal(cat.filter((e) => e.paiCodigo === "execucao").length, 4);
  assert.equal(cat.filter((e) => e.paiCodigo === "elaboracao_minutas").length, 2);
});

test("nada marcado: nada pendente", () => {
  assert.deepEqual(calcularPendentes(cat, []), []);
});

test("só a primeira marcada: nada pendente", () => {
  assert.deepEqual(calcularPendentes(cat, ["prospeccao"]), []);
});

test("pula etapas: as anteriores à mais avançada viram pendentes, na ordem do topo", () => {
  assert.deepEqual(calcularPendentes(cat, ["croqui_estrutural"]), [
    "prospeccao",
    "reuniao_preliminar",
    "sessao_viabilidade",
  ]);
  assert.deepEqual(
    calcularPendentes(cat, ["sessao_viabilidade", "prospeccao"]),
    ["reuniao_preliminar"],
  );
});

test("subetapa conta pelo topo dela, sem marcar a mãe e sem a mãe virar pendente", () => {
  const p = calcularPendentes(cat, ["processamento_itbi"]);
  assert.deepEqual(p, [
    "prospeccao",
    "reuniao_preliminar",
    "sessao_viabilidade",
    "croqui_estrutural",
  ]);
  assert.ok(!p.includes("execucao"));
  assert.ok(!p.includes("elaboracao_minutas"));
});

test("subetapas nunca são pendentes", () => {
  const p = calcularPendentes(cat, ["prospeccao", "reuniao_preliminar", "sessao_viabilidade", "croqui_estrutural", "entrega_pasta"]);
  assert.deepEqual(p, []);
});

test("topo alcançado por filha não é pendente quando há etapa mais adiante", () => {
  const c = [
    { codigo: "a", paiCodigo: null, ordem: 1 },
    { codigo: "b", paiCodigo: null, ordem: 2 },
    { codigo: "b1", paiCodigo: "b", ordem: 1 },
    { codigo: "c", paiCodigo: null, ordem: 3 },
  ];
  assert.deepEqual(calcularPendentes(c, ["b1", "c"]), ["a"]);
});

test("etapa inativa nunca é pendente; código desconhecido é ignorado", () => {
  const c = cat.map((e) => (e.codigo === "reuniao_preliminar" ? { ...e, ativo: false } : e));
  assert.deepEqual(calcularPendentes(c, ["sessao_viabilidade"]), ["prospeccao"]);
  assert.deepEqual(calcularPendentes(cat, ["nao_existe"]), []);
});

test("catálogo com ciclo não trava", () => {
  const c = [
    { codigo: "x", paiCodigo: "y", ordem: 1 },
    { codigo: "y", paiCodigo: "x", ordem: 1 },
    { codigo: "z", paiCodigo: null, ordem: 1 },
  ];
  assert.deepEqual(calcularPendentes(c, ["x"]), []);
});

test("ehCodigoEtapaCliente: allowlist de runtime", () => {
  assert.equal(ehCodigoEtapaCliente("junta_comercial"), true);
  assert.equal(ehCodigoEtapaCliente("JUNTA_COMERCIAL"), false);
  assert.equal(ehCodigoEtapaCliente(""), false);
  assert.equal(ehCodigoEtapaCliente(null), false);
  assert.equal(ehCodigoEtapaCliente("prospeccao' or 1=1"), false);
});
