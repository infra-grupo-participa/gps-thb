// Junção livres + reservados da grade de sessões.
// Rodar: node --test src/components/sessoes/juntar-grade.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";

const { juntarLivresEReservados } = await import(
  new URL("./juntar-grade.ts", import.meta.url).href
);

const h = (data, hora, resp = "r1") => ({
  responsavel_id: resp,
  responsavel_nome: null,
  data,
  hora_inicio: `${hora}:00`,
  inicio_em: `${data}T${hora}:00+00:00`,
  fim_em: `${data}T${hora}:00+00:00`,
  duracao_min: 150,
});

test("sem reservados → só livres, na ordem", () => {
  const r = juntarLivresEReservados([h("2026-10-12", "09:00"), h("2026-10-12", "14:00")]);
  assert.deepEqual(r.map((i) => [i.horario.hora_inicio, i.reservado]), [
    ["09:00:00", false],
    ["14:00:00", false],
  ]);
});

test("intercala por inicio_em e marca reservado", () => {
  const r = juntarLivresEReservados(
    [h("2026-10-12", "09:00"), h("2026-10-12", "14:00")],
    [h("2026-10-12", "11:30")],
  );
  assert.deepEqual(r.map((i) => [i.horario.hora_inicio, i.reservado]), [
    ["09:00:00", false],
    ["11:30:00", true],
    ["14:00:00", false],
  ]);
});

test("dia só com reservados aparece, em ordem cronológica", () => {
  const r = juntarLivresEReservados(
    [h("2026-10-13", "09:00")],
    [h("2026-10-12", "09:00")],
  );
  assert.deepEqual(r.map((i) => [i.horario.data, i.reservado]), [
    ["2026-10-12", true],
    ["2026-10-13", false],
  ]);
});

test("mesmo inicio_em e mesmo responsável → vale o livre, sem duplicar", () => {
  const r = juntarLivresEReservados([h("2026-10-12", "09:00")], [h("2026-10-12", "09:00")]);
  assert.equal(r.length, 1);
  assert.equal(r[0].reservado, false);
});

test("mesmo inicio_em, responsável diferente → os dois ficam", () => {
  const r = juntarLivresEReservados(
    [h("2026-10-12", "09:00", "r1")],
    [h("2026-10-12", "09:00", "r2")],
  );
  assert.deepEqual(r.map((i) => [i.horario.responsavel_id, i.reservado]), [
    ["r1", false],
    ["r2", true],
  ]);
});

test("reservado repetido entra uma vez", () => {
  const r = juntarLivresEReservados([], [h("2026-10-12", "09:00"), h("2026-10-12", "09:00")]);
  assert.equal(r.length, 1);
});

test("0 livres e N reservados → só reservados", () => {
  const r = juntarLivresEReservados([], [h("2026-10-12", "09:00"), h("2026-10-12", "14:00")]);
  assert.equal(r.length, 2);
  assert.ok(r.every((i) => i.reservado));
});

test("diaPrimeiro leva o dia para o começo", () => {
  const r = juntarLivresEReservados(
    [h("2026-10-12", "09:00"), h("2026-10-14", "09:00")],
    [h("2026-10-13", "09:00")],
    "2026-10-14",
  );
  assert.deepEqual(r.map((i) => i.horario.data), ["2026-10-14", "2026-10-12", "2026-10-13"]);
});

test("reservados indefinido → igual a vazio", () => {
  assert.equal(juntarLivresEReservados([h("2026-10-12", "09:00")], undefined).length, 1);
});
