// Regras do painel "Precisa de atenção" (…392, João 16/10/2026).
// Rodar: node --test src/lib/atencao-acoes.test.mjs
// Mesmo molde de `clientes-lote-tipos.test.mjs`: resolvedor mínimo `@/` → `src/`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

const src = new URL("../", import.meta.url).href;
register(
  "data:text/javascript," +
    encodeURIComponent(`
      let SRC;
      export function initialize(d) { SRC = d.src; }
      export async function resolve(spec, ctx, next) {
        if (spec.startsWith("@/")) {
          const alvo = SRC + spec.slice(2);
          return next(/\\.[cm]?[jt]s$/.test(alvo) ? alvo : alvo + ".ts", ctx);
        }
        return next(spec, ctx);
      }`),
  { data: { src } },
);

const m = await import("./atencao-acoes.ts");

const AGORA = Date.parse("2026-10-16T20:00:00Z");
const ontem = "2026-10-15T13:00:00Z";
const semana = "2026-10-23T13:00:00Z";

function linha(extra = {}) {
  return m.mapearLinhaAtencao({
    aluno_id: "a1",
    nome: "Fulana",
    email: "f@x.com",
    telefone: "11999990000",
    tem_login: true,
    ultimo_acesso: ontem,
    clientes: 10,
    clientes_com_dados: 10,
    favorito_id: "c1",
    favorito_nome: "Cliente A",
    favorito_fase: "prospeccao",
    favorito_grau: "amigo",
    favorito_etapa: "sem",
    sessoes: [],
    chamados_abertos: 0,
    chamados_respondidos: 0,
    solicitacoes_pendentes: 0,
    pendencias_diario: 0,
    ...extra,
  });
}

test("grupos: os quatro recortes e a sobreposição", () => {
  const sem = linha({ clientes: 0, favorito_id: null });
  assert.equal(m.estaNoGrupo(sem, "sem_cliente"), true);
  assert.equal(m.estaNoGrupo(sem, "sem_favorito"), false, "sem cliente não é 'sem favorito'");

  const trinta = linha({ clientes: 30, favorito_id: null });
  assert.equal(m.estaNoGrupo(trinta, "trinta_ou_mais"), true);
  assert.equal(m.estaNoGrupo(trinta, "sem_favorito"), true, "30+ sem favorito cai nos dois");

  const fav = linha();
  assert.equal(m.estaNoGrupo(fav, "com_favorito"), true);
  assert.equal(m.estaNoGrupo(fav, "sem_favorito"), false);
});

test("percentual não divide por zero", () => {
  assert.equal(m.percentual(83, 190), 44);
  assert.equal(m.percentual(1, 0), 0);
});

test("situação: prioridade da equipe primeiro", () => {
  assert.equal(m.situacaoDe(linha(), AGORA), "nao_agendou");
  assert.equal(
    m.situacaoDe(linha({ sessoes: [{ tipo_id: 1, tipo: "Entrevista Prévia", estado: "agendado", inicio_em: semana }] }), AGORA),
    "agendou",
  );
  assert.equal(
    m.situacaoDe(linha({ sessoes: [{ tipo_id: 2, tipo: "Reunião Preliminar", estado: "agendado", inicio_em: ontem }] }), AGORA),
    "sem_desfecho",
  );
  assert.equal(
    m.situacaoDe(
      linha({
        chamados_abertos: 1,
        sessoes: [{ tipo_id: 1, tipo: "Entrevista Prévia", estado: "agendado", inicio_em: semana }],
      }),
      AGORA,
    ),
    "aguardando_equipe",
    "chamado aberto vence 'agendou'",
  );
  assert.equal(m.situacaoDe(linha({ chamados_respondidos: 1 }), AGORA), "equipe_respondeu");
  assert.equal(
    m.situacaoDe(linha({ sessoes: [{ tipo_id: 1, tipo: "Entrevista Prévia", estado: "realizado", inicio_em: ontem }] }), AGORA),
    "fez_sessao",
  );
});

test("estágio e própria holding", () => {
  assert.equal(m.estagioDoFavorito(linha().favorito), "inicial");
  assert.equal(m.estagioDoFavorito(linha({ favorito_etapa: "preliminar" }).favorito), "intermediario");
  assert.equal(m.estagioDoFavorito(linha({ favorito_etapa: "croqui" }).favorito), "avancado");
  assert.equal(m.estagioDoFavorito(linha({ favorito_fase: "contratado" }).favorito), "avancado");
  assert.equal(m.ehPropriaHolding(linha({ favorito_grau: "eu_mesmo" })), true);
  assert.equal(m.estagioDoFavorito(linha({ favorito_etapa: "lixo" }).favorito), "inicial", "etapa desconhecida = sem");
});

test("próxima etapa segue a ordem; própria holding começa pelo Croqui", () => {
  assert.equal(m.proximaEtapaSugerida(linha()), "Entrevista Prévia");
  assert.equal(m.proximaEtapaSugerida(linha({ favorito_etapa: "entrevista" })), "Reunião Preliminar");
  assert.equal(m.proximaEtapaSugerida(linha({ favorito_etapa: "preliminar" })), "Sessão de Viabilidade");
  assert.equal(
    m.proximaEtapaSugerida(
      linha({ favorito_etapa: "preliminar", sessoes: [{ tipo_id: 3, tipo: "Sessão de Viabilidade", estado: "realizado", inicio_em: ontem }] }),
    ),
    "Croqui Estrutural",
  );
  assert.equal(m.proximaEtapaSugerida(linha({ favorito_etapa: "croqui" })), "Apresentação da Minuta");
  assert.equal(m.proximaEtapaSugerida(linha({ favorito_grau: "eu_mesmo" })), "Croqui Estrutural");
});

test("próxima ação: login, cliente e favorito vêm antes da agenda", () => {
  assert.match(m.proximaAcao(linha({ tem_login: false, clientes: 0, favorito_id: null }), AGORA), /primeiro login/);
  assert.doesNotMatch(m.proximaAcao(linha({ tem_login: false }), AGORA), /primeiro login/, "com cliente, login não é o problema");
  assert.match(m.proximaAcao(linha({ clientes: 0, favorito_id: null }), AGORA), /primeiros clientes/);
  assert.match(m.proximaAcao(linha({ favorito_id: null }), AGORA), /escolher o cliente/);
  assert.match(m.proximaAcao(linha(), AGORA), /Convidar a marcar a Entrevista Prévia/);
  assert.match(m.proximaAcao(linha({ solicitacoes_pendentes: 1 }), AGORA), /solicitação pendente/);
});

test("relatório: sem telefone, com resumo e tabela por grupo", () => {
  const ls = [linha(), linha({ aluno_id: "a2", nome: "Beltrano | Silva", clientes: 0, favorito_id: null })];
  const r = m.montarRelatorio(ls, AGORA, "16/10/2026 17:00");
  assert.match(r, /Base: 2 parceiros/);
  assert.match(r, /\| Não cadastraram nenhum cliente \| 1 \| 50% \|/);
  assert.doesNotMatch(r, /11999990000/, "telefone não viaja no relatório");
  assert.match(r, /Beltrano \/ Silva/, "barra vertical escapada");
});

test("exportação traz o telefone para a equipe", () => {
  const e = m.exportarLinha(linha(), AGORA);
  assert.equal(e.telefone, "11999990000");
  assert.equal(e.grupos, "Cadastraram e favoritaram");
});
