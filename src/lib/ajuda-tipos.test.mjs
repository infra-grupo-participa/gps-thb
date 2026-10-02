// Teste das funções puras da Central de ajuda.
// Rodar: node --test src/lib/ajuda-tipos.test.mjs
//
// `node --test`, não vitest (o repo não tem vitest). O `.ts` importado só tem
// `import type`, que o Node remove sozinho — por isso roda direto.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizarTermoAjuda,
  buscaAjudaValida,
  rotaDeAjuda,
  paragrafosDoCorpo,
  problemaNoArtigo,
  ehCategoriaAjuda,
  ehOrigemAjuda,
  ehUuid,
  AJUDA_TERMO_MAXIMO,
} from "./ajuda-tipos.ts";

test("termo: colapsa espaço, tira controle, corta em 120", () => {
  assert.equal(normalizarTermoAjuda("  não   consigo\n\tcadastrar "), "não consigo cadastrar");
  assert.equal(normalizarTermoAjuda("a\u0000b"), "a b");
  assert.equal(normalizarTermoAjuda("x".repeat(500)).length, AJUDA_TERMO_MAXIMO);
  assert.equal(normalizarTermoAjuda(null), "");
});

test("busca válida só com 3+ caracteres úteis", () => {
  assert.equal(buscaAjudaValida("ab"), false);
  assert.equal(buscaAjudaValida("  ab  "), false);
  assert.equal(buscaAjudaValida("abc"), true);
  assert.equal(buscaAjudaValida(undefined), false);
});

test("rota: normaliza como gps.ajuda_normalizar_rota", () => {
  assert.equal(rotaDeAjuda("/Clientes/"), "/clientes");
  assert.equal(rotaDeAjuda("/clientes/abc?x=1#y"), "/clientes/abc");
  assert.equal(rotaDeAjuda("/"), "/");
  assert.equal(rotaDeAjuda(""), null);
  assert.equal(rotaDeAjuda("clientes"), null);
  assert.equal(rotaDeAjuda("/clientes'; drop table x;--"), null);
  assert.equal(rotaDeAjuda("/a b"), null);
});

test("rota: modo assistência vira a rota do parceiro", () => {
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e";
  assert.equal(rotaDeAjuda(`/admin/aluno/${id}/clientes/xyz`), "/clientes/xyz");
  assert.equal(rotaDeAjuda(`/admin/aluno/${id}`), "/");
  assert.equal(rotaDeAjuda("/admin/clientes"), "/admin/clientes");
});

test("parágrafos: linha em branco separa, CRLF aceito, quebra simples junta", () => {
  assert.deepEqual(paragrafosDoCorpo("A\r\nb\r\n\r\nC\n\n\n  \nD"), ["A b", "C", "D"]);
  assert.deepEqual(paragrafosDoCorpo(""), []);
});

test("validação do artigo espelha o banco", () => {
  const base = {
    titulo: "Título ok",
    corpo: "Corpo com dez+",
    rotas: ["/clientes"],
    categorias: ["sistema"],
    ativo: true,
    ordem: 0,
  };
  assert.equal(problemaNoArtigo(base), null);
  assert.match(problemaNoArtigo({ ...base, titulo: "ab" }), /título/);
  assert.match(problemaNoArtigo({ ...base, corpo: "curto" }), /texto/);
  assert.match(problemaNoArtigo({ ...base, rotas: ["clientes"] }), /Rota/);
  assert.match(problemaNoArtigo({ ...base, categorias: ["hack"] }), /Categoria/);
  assert.match(problemaNoArtigo({ ...base, ordem: 1.5 }), /ordem/);
  assert.match(problemaNoArtigo({ ...base, id: "1 or 1=1" }), /não encontrado/);
  assert.equal(problemaNoArtigo({ ...base, id: "0f8fad5b-d9cb-469f-a165-70867728950e" }), null);
});

test("guardas de tipo", () => {
  assert.equal(ehCategoriaAjuda("troca_socio"), true);
  assert.equal(ehCategoriaAjuda("x"), false);
  assert.equal(ehOrigemAjuda("chamado"), true);
  assert.equal(ehOrigemAjuda("tela "), false);
  assert.equal(ehUuid("0f8fad5b-d9cb-469f-a165-70867728950e"), true);
  assert.equal(ehUuid("'; drop"), false);
});
