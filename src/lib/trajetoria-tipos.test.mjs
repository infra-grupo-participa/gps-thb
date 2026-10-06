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
  comFunilOrigem,
  ehCodigoEtapaCliente,
  FASE_DA_ETAPA,
  FASES_DA_TRAJETORIA,
  faseDaEtapa,
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

// ── Fase de exibição (espelho de `cliente_etapa_tipos.fase`, …353) ───────

test("FASE_DA_ETAPA: os 11 códigos, cada um na fase do banco", () => {
  assert.deepEqual(
    { ...FASE_DA_ETAPA },
    {
      prospeccao: "prospeccao",
      reuniao_preliminar: "fechamento",
      sessao_viabilidade: "fechamento",
      croqui_estrutural: "fechamento",
      execucao: "contratado",
      reuniao_inicial_execucao: "contratado",
      elaboracao_minutas: "contratado",
      processamento_itcmd: "contratado",
      processamento_itbi: "contratado",
      junta_comercial: "contratado",
      entrega_pasta: "concluido",
    },
  );
  // Nenhum código do catálogo sem fase, nenhuma fase fora das 4.
  for (const e of cat) {
    assert.ok(FASES_DA_TRAJETORIA.includes(FASE_DA_ETAPA[e.codigo]), e.codigo);
  }
  assert.equal(Object.keys(FASE_DA_ETAPA).length, cat.length);
});

test("faseDaEtapa: código fora do espelho devolve null", () => {
  assert.equal(faseDaEtapa("entrega_pasta"), "concluido");
  assert.equal(faseDaEtapa("nao_existe"), null);
  assert.equal(faseDaEtapa(""), null);
});

// ── Funil de origem na regra de pendente ──────────────────────────────────

test("entrou pela Viabilidade: Reunião Preliminar nunca é pendente", () => {
  assert.deepEqual(
    calcularPendentes(cat, ["croqui_estrutural"], "sessao_viabilidade"),
    ["prospeccao", "sessao_viabilidade"],
  );
  assert.deepEqual(
    calcularPendentes(cat, ["sessao_viabilidade", "prospeccao"], "sessao_viabilidade"),
    [],
  );
  assert.deepEqual(
    calcularPendentes(cat, ["junta_comercial"], "sessao_viabilidade"),
    ["prospeccao", "sessao_viabilidade", "croqui_estrutural"],
  );
});

test("entrou pela Preliminar, null ou ausente: regra de sempre", () => {
  const esperado = ["prospeccao", "reuniao_preliminar", "sessao_viabilidade"];
  assert.deepEqual(calcularPendentes(cat, ["croqui_estrutural"], "reuniao_preliminar"), esperado);
  assert.deepEqual(calcularPendentes(cat, ["croqui_estrutural"], null), esperado);
  assert.deepEqual(calcularPendentes(cat, ["croqui_estrutural"], undefined), esperado);
  assert.deepEqual(calcularPendentes(cat, ["croqui_estrutural"], "lixo"), esperado);
});

test("comFunilOrigem: recalcula pendentes e o flag de cada nó", () => {
  const no = (e, marcadas) => ({
    codigo: e.codigo,
    nome: e.nome,
    paiCodigo: e.paiCodigo,
    ordem: e.ordem,
    ativo: true,
    marcada: marcadas.includes(e.codigo),
    marcadoEm: null,
    pendente: false,
    filhas: [],
  });
  const marcadas = ["croqui_estrutural"];
  const mapa = new Map(cat.map((e) => [e.codigo, no(e, marcadas)]));
  for (const e of cat) if (e.paiCodigo) mapa.get(e.paiCodigo).filhas.push(mapa.get(e.codigo));
  const t = {
    etapas: cat.filter((e) => e.paiCodigo === null).map((e) => mapa.get(e.codigo)),
    marcadas,
    pendentes: [],
  };
  const r = comFunilOrigem(t, "sessao_viabilidade");
  assert.deepEqual(r.pendentes, ["prospeccao", "sessao_viabilidade"]);
  const rp = r.etapas.find((e) => e.codigo === "reuniao_preliminar");
  const sv = r.etapas.find((e) => e.codigo === "sessao_viabilidade");
  assert.equal(rp.pendente, false);
  assert.equal(sv.pendente, true);
  assert.deepEqual(comFunilOrigem(t, null).pendentes, [
    "prospeccao",
    "reuniao_preliminar",
    "sessao_viabilidade",
  ]);
  // Não muta a entrada.
  assert.deepEqual(t.pendentes, []);
});
