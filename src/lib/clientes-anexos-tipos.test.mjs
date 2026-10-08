// Contrato TS × SQL dos anexos na lista de clientes (…378).
// Rodar: node --test src/lib/clientes-anexos-tipos.test.mjs
//
// `tsc` e `build` não leem SQL: este teste lê o TEXTO da migração e confere
// que os catálogos do TypeScript são os mesmos do banco. Mudou um lado sem o
// outro → vermelho aqui, não um 22023 na tela.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  FILTROS_ANEXO,
  SITUACOES_ANEXO,
  STATUS_ANEXO,
  TIPOS_ANEXO,
  ehFiltroAnexo,
  statusAnexo,
} from "./clientes-anexos-tipos.ts";
import { CROQUI_STATUS, CROQUI_PARECER_MAXIMO } from "./croquis-tipos.ts";

const raiz = new URL("../../", import.meta.url);
const sql = readFileSync(
  fileURLToPath(new URL("supabase/migrations/20261008000378_gps_croqui_revisao_e_anexos_na_lista.sql", raiz)),
  "utf8",
);
const dataTs = readFileSync(fileURLToPath(new URL("src/lib/data/clientes-admin.ts", raiz)), "utf8");

/** `'a', 'b'` → ["a","b"] */
const literais = (trecho) => [...trecho.matchAll(/'([^']*)'/g)].map((m) => m[1]);

test("p_anexo: catálogo da RPC = FILTROS_ANEXO, na mesma ordem", () => {
  const m = sql.match(/p_anexo not in \(([^)]*)\)/);
  assert.ok(m, "IF do catálogo de p_anexo não encontrado na migração");
  assert.deepEqual(literais(m[1]), [...FILTROS_ANEXO]);
});

test("cada filtro tem o seu ramo no WHERE da lista", () => {
  for (const f of FILTROS_ANEXO) {
    assert.ok(sql.includes(`p_anexo = '${f}'`), `ramo de ${f} ausente`);
  }
});

test("KPIs: 6 linhas = TIPOS_ANEXO × SITUACOES_ANEXO, na ordem", () => {
  const m = sql.match(/from \(values ([\s\S]*?)\)\s*as g\(t, s, ordem\)/);
  assert.ok(m, "bloco values dos KPIs não encontrado");
  const pares = [...m[1].matchAll(/\('([a-z_]+)', '([a-z_]+)', (\d+)\)/g)].map((x) => [x[1], x[2], Number(x[3])]);
  const esperado = TIPOS_ANEXO.flatMap((t) => SITUACOES_ANEXO.map((s) => [t, s]));
  assert.deepEqual(pares.map(([t, s]) => [t, s]), esperado);
  assert.deepEqual(pares.map((p) => p[2]), [1, 2, 3, 4, 5, 6]);
});

test("pendente = enviada ou em_analise, igual na lista e nos KPIs", () => {
  const ocorrencias = sql.match(/in \('enviada', 'em_analise'\)/g) ?? [];
  // 2 ramos *_pendente da lista + 1 join dos KPIs
  assert.equal(ocorrencias.length, 3);
});

test("status da RPC de parecer = STATUS_ANEXO = CROQUI_STATUS", () => {
  const m = sql.match(/v_status not in \(([^)]*)\)/);
  assert.ok(m);
  assert.deepEqual(literais(m[1]), [...STATUS_ANEXO]);
  assert.deepEqual([...CROQUI_STATUS], [...STATUS_ANEXO]);
  assert.ok(sql.includes(`char_length(v_parecer) > ${CROQUI_PARECER_MAXIMO}`));
});

test("RETURNS TABLE da lista termina nas 6 colunas novas e o TS lê cada uma", () => {
  const m = sql.match(/CREATE FUNCTION gps\.admin_clientes_lista\([^\n]*\n RETURNS TABLE\(([^\n]*)\)\n/);
  assert.ok(m, "RETURNS TABLE da lista não encontrado");
  const cols = m[1].split(/,\s*/).map((c) => c.trim().split(/\s+/)[0]);
  const novas = ["mn_status", "mn_em", "mn_por_equipe", "cq_pdf_status", "cq_pdf_em", "cq_pdf_por_equipe"];
  assert.deepEqual(cols.slice(-6), novas);
  assert.equal(cols.length, 28);
  for (const c of novas) assert.ok(dataTs.includes(`d.${c}`), `mapearLinha não lê ${c}`);
});

test("p_anexo é o ÚLTIMO parâmetro e tem default (compatível com quem não o passa)", () => {
  assert.match(sql, /p_agenda text DEFAULT NULL::text, p_anexo text DEFAULT NULL::text\)\n RETURNS TABLE/);
});

test("guardas TS", () => {
  assert.equal(ehFiltroAnexo("minuta_pendente"), true);
  assert.equal(ehFiltroAnexo("MINUTA_PENDENTE"), false);
  assert.equal(ehFiltroAnexo(""), false);
  assert.equal(ehFiltroAnexo(null), false);
  assert.equal(statusAnexo("revisada"), "revisada");
  assert.equal(statusAnexo(null), null);
  assert.equal(statusAnexo("x"), null);
});
