// Teste das funções puras do sino da equipe.
// Rodar: node --test src/lib/avisos-toast.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rotuloContador,
  novosParaToast,
  enfileirar,
  decidirToast,
  FILA_VAZIA,
  TOAST_INTERVALO_MS,
} from "./avisos-toast.ts";

const item = (id, extra = {}) => ({
  id,
  rotulo: `Rótulo ${id}`,
  resumo: `Resumo ${id}`,
  url: `/admin/x/${id}`,
  ...extra,
});

test("contador: 0 some, 1..99 literal, teto 100 vira 99+", () => {
  assert.equal(rotuloContador(0), null);
  assert.equal(rotuloContador(-3), null);
  assert.equal(rotuloContador(Number.NaN), null);
  assert.equal(rotuloContador(1), "1");
  assert.equal(rotuloContador(99), "99");
  assert.equal(rotuloContador(100), "99+");
});

test("novosParaToast: só id > visto, toast=true e não lido; sem base = nada", () => {
  const itens = [
    { id: 10, toast: true, lido: false },
    { id: 9, toast: true, lido: false },
    { id: 8, toast: true, lido: false },
    { id: 11, toast: false, lido: false },
    { id: 12, toast: true, lido: true },
  ];
  assert.deepEqual(novosParaToast(itens, 8), [9, 10]);
  assert.deepEqual(novosParaToast(itens, null), []);
  assert.deepEqual(novosParaToast(itens, 20), []);
});

test("enfileirar não repete id", () => {
  let f = enfileirar(FILA_VAZIA, [item(1), item(2)]);
  f = enfileirar(f, [item(2), item(3)]);
  assert.deepEqual(f.pendentes.map((i) => i.id), [1, 2, 3]);
  assert.equal(enfileirar(f, [item(1)]), f);
});

test("1 item: mostra o próprio, com url", () => {
  const r = decidirToast(enfileirar(FILA_VAZIA, [item(7)]), 1000, true);
  assert.deepEqual(r.plano, { titulo: "Rótulo 7", descricao: "Resumo 7", url: "/admin/x/7", ids: [7] });
  assert.deepEqual(r.fila, { pendentes: [], ultimoEm: 1000 });
  assert.equal(r.esperarMs, null);
});

test("N itens: agrupa em 'N atualizações novas' sem url", () => {
  const r = decidirToast(enfileirar(FILA_VAZIA, [item(1), item(2), item(3)]), 5, true);
  assert.equal(r.plano.titulo, "3 atualizações novas");
  assert.equal(r.plano.url, null);
  assert.deepEqual(r.plano.ids, [1, 2, 3]);
});

test("no máximo 1 a cada 10 s: o que chega no meio espera e depois agrupa", () => {
  const t0 = 100_000;
  let r = decidirToast(enfileirar(FILA_VAZIA, [item(1)]), t0, true);
  assert.ok(r.plano);
  let fila = enfileirar(r.fila, [item(2)]);
  r = decidirToast(fila, t0 + 3_000, true);
  assert.equal(r.plano, null);
  assert.equal(r.esperarMs, TOAST_INTERVALO_MS - 3_000);
  fila = enfileirar(r.fila, [item(3)]);
  r = decidirToast(fila, t0 + TOAST_INTERVALO_MS, true);
  assert.equal(r.plano.titulo, "2 atualizações novas");
  assert.equal(r.fila.ultimoEm, t0 + TOAST_INTERVALO_MS);
});

test("aba oculta: nunca mostra e descarta o pendente", () => {
  const r = decidirToast(enfileirar(FILA_VAZIA, [item(1), item(2)]), 0, false);
  assert.equal(r.plano, null);
  assert.deepEqual(r.fila.pendentes, []);
  assert.equal(r.esperarMs, null);
});

test("fila vazia: nada a fazer", () => {
  const r = decidirToast(FILA_VAZIA, 0, true);
  assert.equal(r.plano, null);
  assert.equal(r.esperarMs, null);
});
