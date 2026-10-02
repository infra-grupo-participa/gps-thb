// Teste do parser de "Colar lista" de clientes.
// Rodar: node --test src/lib/colar-clientes.test.mjs
//
// 🔑 `node --test`, não vitest: o repo não tem vitest instalado e a regra da
// tarefa é "sem dependência nova". Node 24 remove os tipos do `.ts` sozinho, e
// o arquivo testado não tem import nenhum — é por isso que roda direto.
// `.mjs` e não `.ts`: o `tsconfig` não inclui `.mjs`, então o `tsc` não cobra
// a extensão `.ts` no import abaixo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { analisarListaColada, TETO_LOTE } from "./colar-clientes.ts";

test("só nome", () => {
  const r = analisarListaColada("Maria da Silva");
  assert.deepEqual(r.paraEnviar, [{ nome: "Maria da Silva" }]);
  assert.equal(r.linhas[0].valida, true);
  assert.equal(r.linhas[0].telefone, null);
});

test("separadores: hífen, travessão, ponto e vírgula, vírgula, tab e espaço", () => {
  const texto = [
    "Ana - 11 98888-7777",
    "Bruno – (21) 3333-4444",
    "Carla; 31988887777",
    "Davi, +55 41 99999-0000",
    "Eva\t(51) 97777-6666\tobs ignorada",
    "Fábio 61988887777",
  ].join("\n");
  const r = analisarListaColada(texto);
  assert.deepEqual(r.paraEnviar, [
    { nome: "Ana", telefone: "(11) 98888-7777" },
    { nome: "Bruno", telefone: "(21) 3333-4444" },
    { nome: "Carla", telefone: "(31) 98888-7777" },
    { nome: "Davi", telefone: "(41) 99999-0000" },
    { nome: "Eva", telefone: "(51) 97777-6666" },
    { nome: "Fábio", telefone: "(61) 98888-7777" },
  ]);
});

test("hífen dentro do nome e vírgula sem telefone não dividem", () => {
  const r = analisarListaColada("Maria-José Souza\nSouza, Ana");
  assert.deepEqual(r.paraEnviar, [
    { nome: "Maria-José Souza" },
    { nome: "Souza, Ana" },
  ]);
});

test("linhas vazias somem e a numeração segue o texto colado", () => {
  const r = analisarListaColada("\n  \nAna\n\n\t\nBeto\r\n");
  assert.equal(r.linhas.length, 2);
  assert.deepEqual(
    r.linhas.map((l) => [l.linha, l.nome]),
    [
      [3, "Ana"],
      [6, "Beto"],
    ],
  );
});

test("só telefone é recusado com motivo", () => {
  const r = analisarListaColada("11 98888-7777\n; 11988887777");
  assert.equal(r.paraEnviar.length, 0);
  assert.match(r.linhas[0].motivo, /falta o nome/i);
  assert.match(r.linhas[1].motivo, /falta o nome/i);
});

test("telefone incompleto e texto que não é telefone", () => {
  const r = analisarListaColada("Ana; 98888-7777\nBeto; amigo da igreja");
  assert.equal(r.paraEnviar.length, 0);
  assert.match(r.linhas[0].motivo, /incompleto/);
  assert.match(r.linhas[1].motivo, /não parece telefone/);
});

test("cabeçalho de planilha na 1ª linha é ignorado", () => {
  const r = analisarListaColada("Nome\tTelefone\nAna\t11988887777");
  assert.deepEqual(r.paraEnviar, [{ nome: "Ana", telefone: "(11) 98888-7777" }]);
});

test("repetido na mesma colagem entra uma vez só", () => {
  const r = analisarListaColada("Ana; 11988887777\nana ;11 98888-7777");
  assert.equal(r.paraEnviar.length, 1);
  assert.match(r.linhas[1].motivo, /Repetido/);
});

test(`acima de ${TETO_LOTE}: corta no teto e avisa quantas ficaram de fora`, () => {
  const texto = Array.from({ length: 53 }, (_, i) => `Pessoa ${i + 1}`).join("\n");
  const r = analisarListaColada(texto);
  assert.equal(r.paraEnviar.length, TETO_LOTE);
  assert.equal(r.acimaDoTeto, 3);
  assert.equal(r.linhas.length, 53);
  assert.equal(r.linhas[50].valida, false);
  assert.match(r.linhas[50].motivo, /limite de 50/);
  // Inválidas não ocupam vaga no teto.
  const comInvalidas = ["11988887777", ...Array.from({ length: 50 }, (_, i) => `P${i}`)].join("\n");
  const r2 = analisarListaColada(comInvalidas);
  assert.equal(r2.paraEnviar.length, 50);
  assert.equal(r2.acimaDoTeto, 0);
});

test("nome longo demais", () => {
  const r = analisarListaColada("A".repeat(201));
  assert.equal(r.paraEnviar.length, 0);
  assert.match(r.linhas[0].motivo, /longo demais/);
});
