// Teste da atividade da pasta do cliente (view …349) e do "há quanto" por extenso.
// Rodar: node --test src/lib/drive-atividade-tipos.test.mjs
//
// `node --test`, não vitest (o repo não tem runner de unidade). O módulo
// importa `@/lib/trajetoria-tipos`, então registra o mesmo resolvedor mínimo
// de `clientes-lote-tipos.test.mjs` (`@/` → `src/` + `.ts`), só nesta execução.
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
          return next(/\.[cm]?[jt]s$/.test(alvo) ? alvo : alvo + ".ts", ctx);
        }
        return next(spec, ctx);
      }`),
  { data: { src } },
);

const a = await import("./drive-atividade-tipos.ts");
const { formatarHaQuanto } = await import("./datas.ts");

const linha = (o) => ({
  subpasta: "01",
  arquivos: 0,
  ultima_modificacao_em: null,
  ultima_modificacao_por: null,
  ultima_alteracao_03_em: null,
  sugere_etapa: null,
  ...o,
});

test("view vazia: nada na pasta, sem minuta, sem sugestão", () => {
  const r = a.montarAtividade([], 1);
  assert.deepEqual(r.subpastas, []);
  assert.equal(r.ultimaMinuta, null);
  assert.deepEqual(r.sugestoes, []);
  assert.equal(r.lidoEm, 1);
});

test("minuta: data por cliente (qualquer linha), autor só da linha 03", () => {
  const r = a.montarAtividade(
    [
      linha({
        subpasta: "01",
        ultima_alteracao_03_em: "2026-10-05T10:00:00Z",
        ultima_modificacao_por: "Outro",
      }),
      linha({
        subpasta: "03",
        arquivos: 2,
        ultima_alteracao_03_em: "2026-10-05T10:00:00Z",
        ultima_modificacao_por: "Fulano",
      }),
    ],
    0,
  );
  assert.deepEqual(r.ultimaMinuta, {
    em: "2026-10-05T10:00:00Z",
    por: "Fulano",
  });
});

test("minuta removida (sem linha 03): data sem autor", () => {
  const r = a.montarAtividade(
    [
      linha({
        subpasta: "01",
        ultima_alteracao_03_em: "2026-10-05T10:00:00Z",
        ultima_modificacao_por: "Outro",
      }),
    ],
    0,
  );
  assert.deepEqual(r.ultimaMinuta, { em: "2026-10-05T10:00:00Z", por: null });
});

test("sugestões: só código conhecido, sem repetir, na ordem da view", () => {
  const r = a.montarAtividade(
    [
      linha({ subpasta: "03", sugere_etapa: "elaboracao_minutas" }),
      linha({ subpasta: "05", sugere_etapa: "junta_comercial" }),
      linha({ subpasta: "06", sugere_etapa: "inventada" }),
      linha({ subpasta: "raiz", sugere_etapa: "junta_comercial" }),
    ],
    0,
  );
  assert.deepEqual(r.sugestoes, ["elaboracao_minutas", "junta_comercial"]);
});

test("lista sempre com as 6 subpastas, na ordem; raiz fica de fora", () => {
  const l = a.listarSubpastas([
    { subpasta: "raiz", arquivos: 9, ultimaEm: "x", ultimoPor: null },
    {
      subpasta: "05",
      arquivos: 3,
      ultimaEm: "2026-10-01T12:00:00Z",
      ultimoPor: "F",
    },
  ]);
  assert.deepEqual(
    l.map((s) => s.rotulo),
    [
      "01 Documentos recebidos",
      "02 Viabilidade e Croqui",
      "03 Minutas",
      "04 ITCMD e ITBI",
      "05 Junta Comercial",
      "06 Entrega",
    ],
  );
  assert.equal(l[4].arquivos, 3);
  assert.equal(l[4].ultimaEm, "2026-10-01T12:00:00Z");
  assert.equal(l[0].arquivos, 0);
  assert.equal(l[0].ultimaEm, null);
});

test("rótulo de arquivos", () => {
  assert.equal(a.rotuloArquivos(0), "sem movimento recente");
  assert.equal(a.rotuloArquivos(1), "1 arquivo novo ou alterado");
  assert.equal(a.rotuloArquivos(4), "4 arquivos novos ou alterados");
});

test("frase da sugestão nomeia a subpasta e a etapa", () => {
  assert.equal(
    a.fraseSugestao("junta_comercial"),
    "Apareceu arquivo em 05 Junta Comercial. Marcar a etapa Junta Comercial?",
  );
  assert.equal(
    a.fraseSugestao("elaboracao_minutas"),
    "Apareceu arquivo em 03 Minutas. Marcar a etapa Elaboração das Minutas?",
  );
  assert.equal(
    a.fraseSugestao("entrega_pasta"),
    "Apareceu arquivo em 06 Entrega. Marcar a etapa Entrega da pasta?",
  );
});

test("formatarHaQuanto: abreviado continua igual; extenso escreve a unidade", () => {
  const agora = Date.parse("2026-10-05T12:00:00Z");
  const antes = (min) => new Date(agora - min * 60_000).toISOString();
  assert.equal(formatarHaQuanto(antes(5), agora), "há 5 min");
  assert.equal(formatarHaQuanto(antes(120), agora), "há 2 h");
  assert.equal(
    formatarHaQuanto(antes(1), agora, { extenso: true }),
    "há 1 minuto",
  );
  assert.equal(
    formatarHaQuanto(antes(5), agora, { extenso: true }),
    "há 5 minutos",
  );
  assert.equal(
    formatarHaQuanto(antes(60), agora, { extenso: true }),
    "há 1 hora",
  );
  assert.equal(
    formatarHaQuanto(antes(120), agora, { extenso: true }),
    "há 2 horas",
  );
  assert.equal(
    formatarHaQuanto(antes(60 * 24 * 3), agora, { extenso: true }),
    "há 3 dias",
  );
  assert.equal(formatarHaQuanto(antes(-10), agora, { extenso: true }), "agora");
  assert.equal(formatarHaQuanto("lixo", agora, { extenso: true }), null);
});
