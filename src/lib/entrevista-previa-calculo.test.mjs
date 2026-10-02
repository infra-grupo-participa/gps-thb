// Requer Node >= 22.15 (usa `registerHooks` de node:module para resolver o alias `@/`).
// DISC da Entrevista Prévia: entrevista antiga (perguntas aposentadas) volta a
// ter letra; entrevista 3.0 não muda. Card 86akrypfm (02/10/2026).
// Rodar: node --test src/lib/entrevista-previa-calculo.test.mjs
//
// O cálculo importa com o alias `@/` do tsconfig; o hook abaixo só o resolve
// para `src/` (Node 24 remove os tipos do `.ts` sozinho). Sem dependência nova.
import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

const SRC = new URL("../", import.meta.url);
registerHooks({
  resolve(especificador, contexto, proximo) {
    if (especificador.startsWith("@/")) {
      return proximo(new URL(especificador.slice(2) + ".ts", SRC).href, contexto);
    }
    return proximo(especificador, contexto);
  },
});

const { calcularDisc, gerarRelatorio, mapearDecisores } = await import("./entrevista-previa-calculo.ts");
const { PERGUNTAS_ENTREVISTA, PERGUNTAS_ATIVAS } = await import("./entrevista-previa-perguntas.ts");
// O cálculo de antes (só ativas): tira das respostas as chaves de perguntas aposentadas.
const ATIVAS_IDS = new Set(PERGUNTAS_ATIVAS.map((p) => p.id));
const semAposentadas = (r) =>
  Object.fromEntries(Object.entries(r).filter(([k]) => ATIVAS_IDS.has(k) || !PERGUNTAS_ENTREVISTA.some((p) => p.id === k)));

// Rascunho começado no 2.0 (ids do roteiro de 24/09) e concluído no 3.0 pulando
// as perguntas novas: é o formato que ficou "DISC não definido".
const ANTIGA = {
  urgencia: "ontem", //                      D2
  ja_tentou: "conversou", //                 (peso só no 2.0)
  composicao: "imoveis",
  decide_sozinho: "sozinho", //              (peso só no 2.0)
  filhos_participam: "opinam",
  consulta_terceiro: "contador", //          C2
  quem_bate_martelo: "eu", //                D2
  estilo_decisao: "rapido", //               D3
  o_que_convence: "resultado", //            D3
  lidar_com_erro: "investiga", //            C3
  temperatura: "morno",
  agendamento_preliminar: "nao_agendou",
};

// Entrevista 3.0 completa (caminho longo).
const NOVA = {
  motivo_busca: "pesquisa", //               C2
  ja_tentou: "pesquisou",
  bens: "imovel_uso|empresa",
  imoveis_qtd: "um_dois",
  titularidade: "tudo_pf",
  instrumento_existente: "nada",
  decide_sozinho: "conjuge_participa",
  filhos_participam: "opinam",
  socios_negocio: "sem_socios",
  presenca_decisores: "todos",
  criterio_valor: "como_funciona", //        C2
  conflito_herdeiros: "tranquila",
  processamento: "gradual", //               S2
  ritmo_conversa: "questionador", //         C3
  obs_comportamento: "cautela|numeros|falou_preco", // S1 C1
  agendamento_preliminar: "agora",
};

test("antiga: hoje (só ativas) dá 'insuficiente'; com as aposentadas, dá letra", () => {
  const antes = calcularDisc(semAposentadas(ANTIGA));
  assert.equal(antes.letra, null, "pré-condição: sem as aposentadas não há ponto nenhum");
  const rel = gerarRelatorio(ANTIGA, antes, mapearDecisores(ANTIGA)).relacionamento;
  assert.match(rel, /^Perfil DISC não definido — respostas insuficientes\./);

  const depois = calcularDisc(ANTIGA);
  assert.deepEqual(depois.pontos, { D: 10, I: 0, S: 0, C: 5 });
  assert.equal(depois.letra, "D");
  assert.equal(depois.secundaria, "C");
  assert.equal(depois.sinais, 6);
  assert.equal(depois.margem, 5);
  assert.equal(depois.confianca, "alta");
});

test("3.0: resultado igual com e sem a mudança (nenhuma chave aposentada)", () => {
  const ids = new Set(PERGUNTAS_ENTREVISTA.filter((p) => p.aposentada).map((p) => p.id));
  assert.equal(Object.keys(NOVA).some((k) => ids.has(k)), false);
  const r = calcularDisc(NOVA);
  assert.deepEqual(r.pontos, { D: 0, I: 0, S: 3, C: 8 });
  assert.equal(r.letra, "C");
  assert.equal(r.secundaria, "S");
  assert.equal(r.sinais, 6);
  assert.equal(r.confianca, "alta");
  assert.deepEqual(r, calcularDisc(semAposentadas(NOVA)));
});

test("3.0 com todas as ativas pesadas no máximo: teto 11 por letra continua", () => {
  for (const [letra, opcoes] of Object.entries({
    D: { motivo_busca: "problema_urgente", criterio_valor: "o_que_fazer", processamento: "panorama", ritmo_conversa: "direto", obs_comportamento: "interrompeu|urgencia_controle" },
    C: { motivo_busca: "pesquisa", criterio_valor: "como_funciona", processamento: "detalhes", ritmo_conversa: "questionador", obs_comportamento: "muitas_perguntas|numeros" },
  })) {
    assert.equal(calcularDisc(opcoes).pontos[letra], 11);
  }
  // Nenhuma ativa ganhou peso por engano: as ativas pesadas são só as 5 da 3.0.
  const ativasComPeso = PERGUNTAS_ATIVAS.filter((p) => p.opcoes.some((o) => o.disc && Object.keys(o.disc).length)).map((p) => p.id);
  assert.deepEqual(ativasComPeso.sort(), ["criterio_valor", "motivo_busca", "obs_comportamento", "processamento", "ritmo_conversa"]);
});

test("aposentada não entra no mapa de decisores (inalterado)", () => {
  const d = mapearDecisores({ quem_bate_martelo: "juntos", decide_investimento: "consulta_conjuge" });
  assert.equal(d.total, 1);
  assert.deepEqual(d.decideJunto, []);
});

