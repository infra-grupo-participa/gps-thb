// Honorários com a fase calculada pela trajetória (05/10/2026, migração …353).
// Rodar: node --test src/lib/etapa1-honorarios.test.mjs
//
// 🔴 A regra que este arquivo protege: CONCLUIR um cliente (Entrega da pasta)
// não pode derrubar o faturado. `concluido` conta como `contratado` em tudo
// que soma dinheiro. `etapa1.ts` só tem `import type`, então roda sem o
// resolvedor de `@/` (mesmo molde de `trajetoria-tipos.test.mjs`).
import { test } from "node:test";
import assert from "node:assert/strict";

const { faseContaHonorario, resumoHonorarios, progressoFaturamento, FASES_CLIENTE } =
  await import("./etapa1.ts");

const cli = (id, fase, valor) => ({ id, nome: id, fase, valor_honorarios: valor });

test("só Execução (contratado) e Concluído contam honorário", () => {
  assert.equal(faseContaHonorario("contratado"), true);
  assert.equal(faseContaHonorario("concluido"), true);
  assert.equal(faseContaHonorario("fechamento"), false);
  assert.equal(faseContaHonorario("prospeccao"), false);
  assert.equal(faseContaHonorario(null), false);
});

test("as 4 fases, na ordem, com os rótulos de 05/10", () => {
  assert.deepEqual(
    FASES_CLIENTE.map((f) => [f.id, f.rotulo]),
    [
      ["prospeccao", "Prospecção"],
      ["fechamento", "Fechamento"],
      ["contratado", "Execução"],
      ["concluido", "Concluído"],
    ],
  );
});

test("concluir um cliente não derruba o faturado", () => {
  const antes = [cli("a", "contratado", 20000), cli("b", "contratado", 10000), cli("c", "fechamento", 5000)];
  const depois = [cli("a", "concluido", 20000), cli("b", "contratado", 10000), cli("c", "fechamento", 5000)];
  const ra = resumoHonorarios(antes);
  const rd = resumoHonorarios(depois);
  assert.equal(ra.total, 30000);
  assert.equal(rd.total, 30000);
  assert.equal(rd.contratados, 2);
  assert.equal(progressoFaturamento(depois).faturado, progressoFaturamento(antes).faturado);
  assert.equal(progressoFaturamento(depois).contratados, 2);
});

test("concluído sem valor entra no aviso de 'sem valor'", () => {
  const r = resumoHonorarios([cli("a", "concluido", null), cli("b", "contratado", 1000)]);
  assert.equal(r.contratadosSemValor, 1);
  assert.equal(r.total, 1000);
});
