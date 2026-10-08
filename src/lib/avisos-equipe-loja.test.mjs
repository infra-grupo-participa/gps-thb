// Prova de contagem de rede da loja do sino (cliente falso, relógio falso).
// Rodar: node --test src/lib/avisos-equipe-loja.test.mjs
//
// O que prova: quantas vezes `avisos_contar` é chamado quando o sino DESMONTA e
// REMONTA (é o que acontece a cada troca de página: o `AppHeader` é por página),
// o polling sempre ligado (120 s sem canal, 300 s com canal, parado com a aba
// oculta, relê 1× ao voltar) e o pop-up uma vez só entre duas abas.
// O que NÃO prova: o ciclo de montagem do React/Next no navegador.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// A loja importa irmãos sem extensão (padrão do Next); o Node exige `.ts`.
registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (spec.startsWith(".") && !/\.[cm]?[jt]s(\?.*)?$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});

// ── ambiente de navegador mínimo ───────────────────────────────────────────
const ouvintesDoc = new Set();
globalThis.document = {
  visibilityState: "visible",
  addEventListener: (_t, f) => ouvintesDoc.add(f),
  removeEventListener: (_t, f) => ouvintesDoc.delete(f),
};
globalThis.window = { localStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
function mudarVisibilidade(v) {
  document.visibilityState = v;
  for (const f of [...ouvintesDoc]) f();
}

const esvaziar = async (n = 20) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r));
};

function clienteFalso(respostas) {
  const cont = {};
  const canal = { status: null, sinal: null };
  const sb = {
    schema: () => ({
      rpc: async (nome) => {
        cont[nome] = (cont[nome] ?? 0) + 1;
        return { data: respostas[nome](), error: null };
      },
    }),
    channel: () => {
      const ch = {
        on: (_t, _f, h) => ((canal.sinal = h), ch),
        subscribe: (cb) => ((canal.status = cb), ch),
      };
      return ch;
    },
    removeChannel: async () => {},
  };
  return { sb, cont, canal };
}

const contagem = { avisos_contar: () => ({ ativo: true, nao_lidos: 2, ultimo_id: 10 }) };

test("navegação: 1 avisos_contar por carregamento, 0 por troca de página; polling sempre ligado", async () => {
  mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1_000_000 });
  try {
    const loja = await import("./avisos-equipe-loja.ts?navegacao");
    const { sb, cont, canal } = clienteFalso(contagem);
    loja.definirClienteParaTeste(sb);

    let soltar = loja.assinar(() => {}, "qa@advmais.com");
    await esvaziar();
    assert.equal(cont.avisos_contar, 1, "carregamento da aba");
    assert.equal(loja.lerEstado().naoLidos, 2);

    // 10 trocas de página: desmonta, 150 ms depois monta o sino da página nova.
    for (let i = 0; i < 10; i++) {
      soltar();
      mock.timers.tick(150);
      soltar = loja.assinar(() => {}, "qa@advmais.com");
      await esvaziar();
    }
    assert.equal(cont.avisos_contar, 1, "10 navegações = 0 chamadas a mais");

    // Canal assinado: o polling NÃO para, só vai a 300 s.
    canal.status("SUBSCRIBED");
    mock.timers.tick(299_000);
    await esvaziar();
    assert.equal(cont.avisos_contar, 1);
    mock.timers.tick(1_000);
    await esvaziar();
    assert.equal(cont.avisos_contar, 2, "poll de 300 s com canal saudável");

    // Canal caiu: 120 s.
    canal.status("CHANNEL_ERROR");
    mock.timers.tick(120_000);
    await esvaziar();
    assert.equal(cont.avisos_contar, 3, "poll de 120 s sem canal");

    // Aba oculta: nenhuma chamada em 1 h.
    mudarVisibilidade("hidden");
    mock.timers.tick(3_600_000);
    await esvaziar();
    assert.equal(cont.avisos_contar, 3, "parado com a aba oculta");
    // Voltou: relê 1× na hora.
    mudarVisibilidade("visible");
    await esvaziar();
    assert.equal(cont.avisos_contar, 4, "relê 1× ao reabrir a aba");

    // Saiu das telas de admin por > 5 s e voltou: relê 1×.
    soltar();
    mock.timers.tick(5_000);
    await esvaziar();
    soltar = loja.assinar(() => {}, "qa@advmais.com");
    await esvaziar();
    assert.equal(cont.avisos_contar, 5);
    soltar();
    mock.timers.tick(5_000);
    await esvaziar();
  } finally {
    mock.timers.reset();
  }
});

test("duas abas do mesmo admin: o aviso vira pop-up em UMA só", async () => {
  if (typeof BroadcastChannel === "undefined") return;
  const resp = {
    ...contagem,
    avisos_listar: () => ({
      ativo: true,
      nao_lidos: 3,
      lido_ate: 0,
      ultimo_id: 11,
      itens: [
        { id: 11, tipo: "chamado_aberto", rotulo: "Chamado aberto", toast: true, aluno_id: null,
          entidade_id: null, url: "/admin/chamados/1", resumo: "Ana abriu um chamado",
          criado_em: new Date().toISOString(), lido: false },
      ],
    }),
  };
  const abas = [];
  for (const q of ["aba1", "aba2"]) {
    const loja = await import(`./avisos-equipe-loja.ts?${q}`);
    const f = clienteFalso(resp);
    loja.definirClienteParaTeste(f.sb);
    const toasts = [];
    loja.registrarToast((p) => toasts.push(p));
    const soltar = loja.assinar(() => {}, "qa@advmais.com");
    abas.push({ loja, f, toasts, soltar });
  }
  await esvaziar();
  // O mesmo INSERT chega às duas abas.
  for (const a of abas) a.f.canal.sinal();
  await new Promise((r) => setTimeout(r, 1_600)); // junta sinais (1 s) + disputa (400 ms)
  await esvaziar();
  const total = abas.reduce((s, a) => s + a.toasts.length, 0);
  assert.equal(total, 1, `pop-ups mostrados nas duas abas: ${total}`);
  for (const a of abas) a.soltar();
  await new Promise((r) => setTimeout(r, 5_200)); // desmonte fecha canal e BroadcastChannel
});
