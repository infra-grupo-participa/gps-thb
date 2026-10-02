// Teste das regras puras do bloco "Hoje no programa" (item 1.6).
// Rodar: node --test src/components/home/hoje-tipos.test.mjs
// `node --test`, sem runner novo (mesmo molde de src/lib/*.test.mjs). Node 24
// remove os tipos do `.ts` sozinho; o módulo não importa `@/`.
import { test } from "node:test";
import assert from "node:assert/strict";

const { validarAtalhos, urlHttpsSegura, estadoDaSala, ATALHOS_MAXIMO } = await import(
  new URL("./hoje-tipos.ts", import.meta.url).href
);

const item = (n, extra = {}) => ({
  rotulo: `Atalho ${n}`,
  url: `https://exemplo.com.br/${n}`,
  descricao: `Descrição ${n}`,
  ...extra,
});

test("chave nascendo '[]' → lista vazia, sem erro", () => {
  assert.deepEqual(validarAtalhos("[]"), {
    atalhos: [],
    descartados: 0,
    cortados: 0,
    invalido: false,
  });
});

test("texto que não é array JSON → inválido", () => {
  for (const bruto of ["", "{", '{"rotulo":"x"}', "null", "42", null, undefined, 7]) {
    const v = validarAtalhos(bruto);
    assert.equal(v.invalido, true, String(bruto));
    assert.equal(v.atalhos.length, 0);
  }
});

test("só https:// passa", () => {
  const casos = [
    ["https://hotmart.com/club", true],
    ["HTTPS://Hotmart.com/club", true],
    ["http://hotmart.com", false],
    ["javascript:alert(1)", false],
    ["//evil.com", false],
    ["/plantao", false],
    ["data:text/html,<b>x</b>", false],
    ["https://user:senha@evil.com", false],
    ["https://exemplo.com/a b", false],
    ["https://exemplo.com\\@evil.com", false],
    ["https://", false],
    ["https://exemplo.com/\n", true], // trim tira a quebra final
    ["https://exemplo.com/\u0007x", false],
    [`https://exemplo.com/${"a".repeat(600)}`, false],
  ];
  for (const [url, ok] of casos) {
    assert.equal(urlHttpsSegura(url) !== null, ok, url);
  }
});

test("rótulo: obrigatório, até 60, sem controle", () => {
  const v = validarAtalhos(
    JSON.stringify([
      item(1, { rotulo: "a".repeat(60) }),
      item(2, { rotulo: "a".repeat(61) }),
      item(3, { rotulo: "   " }),
      item(4, { rotulo: "linha\nquebrada" }),
      item(5, { rotulo: 12 }),
      item(6, { url: "http://x.com" }),
      "texto solto",
      [1, 2],
      null,
    ]),
  );
  assert.equal(v.atalhos.length, 1);
  assert.equal(v.atalhos[0].rotulo.length, 60);
  assert.equal(v.descartados, 8);
});

test("descrição inválida vira null, não derruba o atalho", () => {
  const v = validarAtalhos(
    JSON.stringify([item(1, { descricao: "x".repeat(141) }), item(2, { descricao: undefined })]),
  );
  assert.equal(v.atalhos.length, 2);
  assert.equal(v.atalhos[0].descricao, null);
  assert.equal(v.atalhos[1].descricao, null);
});

test("no máximo 8 itens — o excedente é cortado e contado", () => {
  const v = validarAtalhos(JSON.stringify(Array.from({ length: 11 }, (_, n) => item(n))));
  assert.equal(ATALHOS_MAXIMO, 8);
  assert.equal(v.atalhos.length, 8);
  assert.equal(v.cortados, 3);
  assert.equal(v.atalhos[0].rotulo, "Atalho 0");
});

test("estado da sala: 1h antes abre, fim encerra", () => {
  const inicio = "2026-10-02T17:00:00.000Z";
  const fim = "2026-10-02T19:00:00.000Z";
  const t = (iso) => new Date(iso).getTime();
  assert.equal(estadoDaSala(inicio, fim, t("2026-10-02T15:59:59.999Z")), "aguardando");
  assert.equal(estadoDaSala(inicio, fim, t("2026-10-02T16:00:00.000Z")), "aberta");
  assert.equal(estadoDaSala(inicio, fim, t("2026-10-02T18:59:59.999Z")), "aberta");
  assert.equal(estadoDaSala(inicio, fim, t("2026-10-02T19:00:00.000Z")), "encerrada");
  assert.equal(estadoDaSala("lixo", fim, 0), "aguardando");
});
