// Agenda da releitura da pasta do Drive. Rodar: node --test src/lib/atualizar-pasta.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const a = await import("./atualizar-pasta.ts");

test("recuo progressivo 5, 10, 20 e teto de 30 s", () => {
  assert.deepEqual(a.agendaDeIntervalos(), [5000, 10000, 20000, ...Array(18).fill(30000)]);
});

test("nenhum intervalo passa do teto e a soma não passa de 10 min", () => {
  const e = a.agendaDeIntervalos();
  assert.ok(Math.max(...e) <= 30000);
  assert.ok(e.reduce((x, y) => x + y, 0) <= 600000);
});

test("a espera final fecha exatamente os 10 min", () => {
  const soma = a.agendaDeIntervalos().reduce((x, y) => x + y, 0);
  assert.equal(soma + a.esperaFinal(), 600000);
});

test("total pequeno não agenda nada e total zero para na hora", () => {
  assert.deepEqual(a.agendaDeIntervalos(4000), []);
  assert.equal(a.esperaFinal(0), 0);
});
