import { test, expect } from "@playwright/test";
import {
  PERGUNTAS_ENTREVISTA,
  PERGUNTAS_ATIVAS,
  BLOCOS_ENTREVISTA,
  TOTAL_PERGUNTAS,
  CHAVE_FRASES_CLIENTE,
  CHAVE_AGENDAMENTO_PRELIMINAR,
  perguntaPorId,
  type PerguntaEntrevista,
  type RespostasEntrevista,
} from "@/lib/entrevista-previa-perguntas";
import { perguntasVisiveis } from "@/lib/entrevista-previa-fluxo";
import { calcularDisc, mapearDecisores } from "@/lib/entrevista-previa-calculo";
import { PARTES_SCRIPT, montarParte, type ParteScript } from "@/lib/script-reuniao";

/**
 * INVARIANTES da Entrevista Prévia 3.0 (`entrevista-previa-perguntas.ts` +
 * `entrevista-previa-fluxo.ts` + `entrevista-previa-calculo.ts`) e do mapa do
 * Script de Fechamento da Reunião Preliminar (`script-reuniao.ts`).
 *
 * ⚠️ ESTE TESTE É ESTÁTICO DE PROPÓSITO — importa os módulos direto (o
 * Playwright da casa resolve `@/lib/*`, mesmo padrão de
 * `e2e/espelho-admin.spec.ts`), não abre navegador, não faz login e não toca
 * produção. É lógica pura: contagem, ordem, forma de dado. Roda com
 * `--project=desktop` sem sessão nenhuma.
 *
 * Roteiro 3.0 (29/09/2026, decisão do Marcio): 15 perguntas ativas no caminho
 * mais longo (11 no curto) + 20 APOSENTADAS que continuam no catálogo com
 * `aposentada: true`, porque o id é o que está gravado nas entrevistas antigas.
 */

// ── FOTOGRAFIA DO CATÁLOGO 2.0 (HEAD antes da 3.0) ─────────────────────────
// Lista FIXA, escrita a partir de `git show HEAD:src/lib/entrevista-previa-perguntas.ts`.
// Não é derivada do catálogo atual: seria comparar o arquivo com ele mesmo.
const IDS_2_0 = [
  "motivo_busca", "urgencia", "ja_tentou", "composicao", "titularidade",
  "instrumento_existente", "conflito_herdeiros", "imoveis_qtd", "imoveis_heranca",
  "imoveis_alugados", "pro_labore", "inventario_familia", "risco_atividade",
  "decide_sozinho", "filhos_participam", "consulta_terceiro", "socios_negocio",
  "quem_bate_martelo", "estilo_decisao", "o_que_convence", "ritmo_conversa",
  "reacao_preco", "lidar_com_erro", "delega", "mudanca", "confianca_equipe",
  "disposicao_reuniao", "decide_investimento", "temperatura", "objecao_principal",
] as const;

// As 10 do 2.0 que seguem ATIVAS na 3.0 (mesmo id, mesmo significado).
const IDS_2_0_REUSADOS = [
  "motivo_busca", "ja_tentou", "titularidade", "instrumento_existente",
  "conflito_herdeiros", "imoveis_qtd", "decide_sozinho", "filhos_participam",
  "socios_negocio", "ritmo_conversa",
] as const;

// As 5 ativas NOVAS da 3.0 — id que nunca existiu, nunca reaproveitado.
const IDS_NOVOS_3_0 = [
  "bens", "presenca_decisores", "criterio_valor", "processamento", "obs_comportamento",
] as const;

// Opções do 2.0 nas perguntas reusadas: nenhuma pode sumir (só ser aposentada).
const OPCOES_2_0_DAS_REUSADAS: Record<string, readonly string[]> = {
  motivo_busca: ["problema_urgente", "medo_futuro", "indicacao", "pesquisa", "economia"],
  ja_tentou: ["nunca", "conversou", "comecou", "outro_escritorio"],
  titularidade: ["tudo_pf", "parte_pj", "tudo_pj", "nao_sabe"],
  instrumento_existente: ["nada", "testamento", "doacao", "holding", "nao_sabe"],
  conflito_herdeiros: ["tranquila", "discussao", "conflito_hoje", "nunca_pensou"],
  imoveis_qtd: ["nenhum", "um_dois", "tres_cinco", "seis_mais"],
  decide_sozinho: ["sozinho", "conjuge_participa", "conjuge_decide", "sem_conjuge"],
  filhos_participam: ["nao_tem", "nao_participam", "opinam", "participam_negocio"],
  socios_negocio: ["sem_socios", "socio_familia", "socio_externo"],
  ritmo_conversa: ["direto", "falante", "reservado", "questionador"],
};

// Ativas que NÃO alimentam nenhuma das 7 partes, de propósito (script-reuniao.ts,
// "O QUE FICA FORA DAS 7 PARTES"): `ritmo_conversa` é observação que só mede a
// letra; as 3 de decisores têm bloco próprio no briefing ("Decisores").
const ATIVAS_FORA_DAS_PARTES = [
  "ritmo_conversa", "decide_sozinho", "filhos_participam", "socios_negocio",
] as const;

// Fatos objetivos: sem peso DISC e sem sinal de decisor em nenhuma opção.
const PERGUNTAS_FATO = [
  "ja_tentou", "bens", "imoveis_qtd", "titularidade", "instrumento_existente",
  "conflito_herdeiros", "presenca_decisores",
] as const;

const LETRAS = ["D", "I", "S", "C"] as const;

function primeiraOpcaoDeCadaPergunta(): Record<string, string> {
  const respostas: Record<string, string> = {};
  for (const p of PERGUNTAS_ENTREVISTA) {
    respostas[p.id] = p.opcoes[0].id;
  }
  return respostas;
}

/** Respostas que abrem TODAS as condições: caminho de 15 perguntas. */
const RESPOSTAS_CAMINHO_LONGO: RespostasEntrevista = {
  bens: "imovel_uso|empresa",
  decide_sozinho: "conjuge_participa",
  filhos_participam: "decidem_junto",
};

/** Respostas que fecham TODAS as condições: caminho de 11 perguntas. */
const RESPOSTAS_CAMINHO_CURTO: RespostasEntrevista = {
  bens: "investimentos",
  decide_sozinho: "sozinho",
  filhos_participam: "nao_tem",
};

/** Teto de pontos por letra: única = maior peso da pergunta; múltipla = soma dos itens. */
function tetoPorLetra(perguntas: readonly PerguntaEntrevista[]): Record<string, number> {
  const teto: Record<string, number> = { D: 0, I: 0, S: 0, C: 0 };
  for (const p of perguntas) {
    for (const letra of LETRAS) {
      const pesos = p.opcoes.map((o) => o.disc?.[letra] ?? 0);
      teto[letra] += p.multipla ? pesos.reduce((a, b) => a + b, 0) : Math.max(0, ...pesos);
    }
  }
  return teto;
}

test.describe("Entrevista Prévia 3.0 — invariantes do roteiro @estatico", () => {
  test("15 ativas + 20 aposentadas, ids únicos, TOTAL_PERGUNTAS = 15", () => {
    const ids = PERGUNTAS_ENTREVISTA.map((p) => p.id);
    const ativas = PERGUNTAS_ENTREVISTA.filter((p) => !p.aposentada);
    const aposentadas = PERGUNTAS_ENTREVISTA.filter((p) => p.aposentada);

    expect(ativas.length, "REGRA: o roteiro 3.0 tem exatamente 15 perguntas ativas.").toBe(15);
    expect(aposentadas.length, "REGRA: 20 perguntas aposentadas ficam no catálogo.").toBe(20);
    expect(
      new Set(ids).size,
      `REGRA: ids de pergunta têm de ser únicos (ativas + aposentadas). Ids: ${ids.join(", ")}`,
    ).toBe(ids.length);
    expect(
      PERGUNTAS_ATIVAS.map((p) => p.id),
      "REGRA: PERGUNTAS_ATIVAS é o catálogo sem as aposentadas, na mesma ordem.",
    ).toEqual(ativas.map((p) => p.id));
    expect(
      TOTAL_PERGUNTAS,
      "REGRA: TOTAL_PERGUNTAS tem de ser 15 (teto do caminho mais longo).",
    ).toBe(15);
  });

  test("a ordem dos blocos é consciencia -> decisores -> gatilhos -> relacionamento", () => {
    const ORDEM_ESPERADA = ["consciencia", "decisores", "gatilhos", "relacionamento"];

    const ordemNoArray: string[] = [];
    for (const p of PERGUNTAS_ATIVAS) {
      if (!ordemNoArray.includes(p.bloco)) ordemNoArray.push(p.bloco);
    }
    expect(
      ordemNoArray,
      "REGRA: a primeira ocorrência de cada bloco nas ativas tem de seguir " +
        "consciencia -> decisores -> gatilhos -> relacionamento (C → QD → G → R).",
    ).toEqual(ORDEM_ESPERADA);

    // Blocos contíguos: nenhuma pergunta volta a um bloco já encerrado.
    const blocosEmSequencia = PERGUNTAS_ATIVAS.map((p) => p.bloco).filter(
      (b, i, arr) => i === 0 || arr[i - 1] !== b,
    );
    expect(
      blocosEmSequencia,
      "REGRA: cada bloco é um trecho contínuo do roteiro (sem intercalar).",
    ).toEqual(ORDEM_ESPERADA);

    expect(
      BLOCOS_ENTREVISTA.map((b) => b.id),
      "REGRA: BLOCOS_ENTREVISTA (usado para agrupar a tela) tem de seguir a mesma ordem.",
    ).toEqual(ORDEM_ESPERADA);
  });

  test("caminho longo tem 15 perguntas e o curto tem 11 (via perguntasVisiveis)", () => {
    const longo = perguntasVisiveis(RESPOSTAS_CAMINHO_LONGO);
    const curto = perguntasVisiveis(RESPOSTAS_CAMINHO_CURTO);

    expect(
      longo.map((p) => p.id),
      "REGRA: com bens (imóvel + empresa), alguém que decide junto e filhos, aparecem as 15 ativas na ordem do roteiro.",
    ).toEqual(PERGUNTAS_ATIVAS.map((p) => p.id));
    expect(longo.length, "REGRA: caminho mais longo = 15.").toBe(15);

    expect(curto.length, "REGRA: caminho mais curto = 11.").toBe(11);
    expect(
      PERGUNTAS_ATIVAS.filter((p) => !curto.some((c) => c.id === p.id)).map((p) => p.id),
      "REGRA: o caminho curto esconde exatamente imoveis_qtd, socios_negocio, presenca_decisores e conflito_herdeiros.",
    ).toEqual(["imoveis_qtd", "socios_negocio", "presenca_decisores", "conflito_herdeiros"]);
  });

  test("pergunta aposentada nunca aparece em perguntasVisiveis, mesmo respondida", () => {
    // Todas as perguntas (ativas E aposentadas) respondidas com a 1ª opção: um
    // rascunho/entrevista antiga cheia. A tela não pode reabrir nenhuma aposentada.
    const visiveis = perguntasVisiveis(primeiraOpcaoDeCadaPergunta());
    const aposentadasVisiveis = visiveis.filter((p) => p.aposentada).map((p) => p.id);
    expect(
      aposentadasVisiveis,
      `REGRA: perguntas aposentadas ficam fora do fluxo. Vazaram: ${aposentadasVisiveis.join(", ") || "nenhuma"}`,
    ).toEqual([]);
    expect(visiveis.length, "Sanidade: o teto do fluxo é 15.").toBeLessThanOrEqual(15);
  });

  test("peso DISC: teto de 11 por letra nas ativas e peso 3 só em pergunta `observacao: true`", () => {
    expect(
      tetoPorLetra(PERGUNTAS_ATIVAS),
      "REGRA: o máximo somável por letra é 11/11/11/11 (100% = 11). Peso fora do desenho desloca todos os percentuais.",
    ).toEqual({ D: 11, I: 11, S: 11, C: 11 });

    const pesoAltoForaDeObservacao: string[] = [];
    for (const p of PERGUNTAS_ATIVAS) {
      if (p.observacao) continue;
      for (const o of p.opcoes) {
        for (const [letra, peso] of Object.entries(o.disc ?? {})) {
          if ((peso ?? 0) >= 3) pesoAltoForaDeObservacao.push(`${p.id}.${o.id} -> ${letra}:${peso}`);
        }
      }
    }
    expect(
      pesoAltoForaDeObservacao,
      "REGRA: peso DISC >= 3 só é permitido em pergunta de observação (`observacao: true`). " +
        `Excessos: ${pesoAltoForaDeObservacao.join(", ") || "nenhum"}`,
    ).toEqual([]);

    const comPeso3 = PERGUNTAS_ATIVAS.filter((p) =>
      p.opcoes.some((o) => Object.values(o.disc ?? {}).some((v) => (v ?? 0) >= 3)),
    ).map((p) => p.id);
    expect(comPeso3, "REGRA: peso 3 existe só em ritmo_conversa.").toEqual(["ritmo_conversa"]);
    expect(perguntaPorId("ritmo_conversa")?.observacao, "REGRA: ritmo_conversa é observação.").toBe(true);
  });

  test("perguntas de fato não têm disc nem decisor em nenhuma opção", () => {
    const comDiscOuDecisor: string[] = [];
    for (const id of PERGUNTAS_FATO) {
      const pergunta = perguntaPorId(id);
      expect(pergunta, `REGRA: a pergunta '${id}' tem de existir no roteiro.`).toBeTruthy();
      expect(pergunta!.aposentada, `REGRA: '${id}' tem de estar ativa.`).toBeFalsy();
      for (const o of pergunta!.opcoes) {
        if (o.disc && Object.keys(o.disc).length > 0) comDiscOuDecisor.push(`${id}.${o.id} tem disc`);
        if (o.decisor) comDiscOuDecisor.push(`${id}.${o.id} tem decisor`);
      }
    }
    expect(
      comDiscOuDecisor,
      "REGRA: pergunta de dado objetivo (patrimônio, presença, conhecimento) não pode ter peso DISC " +
        `nem sinal de decisor. Achados: ${comDiscOuDecisor.join(", ") || "nenhum"}`,
    ).toEqual([]);
  });

  test("toda opção tem id único dentro da pergunta e rótulo não vazio", () => {
    const problemas: string[] = [];
    for (const p of PERGUNTAS_ENTREVISTA) {
      const idsOpcao = p.opcoes.map((o) => o.id);
      if (new Set(idsOpcao).size !== idsOpcao.length) {
        problemas.push(`${p.id}: ids de opção duplicados (${idsOpcao.join(", ")})`);
      }
      for (const o of p.opcoes) {
        if (!o.rotulo || o.rotulo.trim().length === 0) {
          problemas.push(`${p.id}.${o.id}: rótulo vazio`);
        }
      }
    }
    expect(
      problemas,
      `REGRA: toda opção tem de ter id único dentro da pergunta e rótulo não vazio. Achados: ${problemas.join("; ") || "nenhum"}`,
    ).toEqual([]);
  });
});

test.describe("Nenhum id antigo sumiu (o id é o que está gravado no banco) @estatico", () => {
  test("todos os 30 ids do roteiro 2.0 continuam no catálogo", () => {
    const sumidos = IDS_2_0.filter((id) => !perguntaPorId(id));
    expect(
      sumidos,
      `REGRA: nenhum id foi renomeado nem apagado — entrevista antiga ainda é lida por eles. Sumiram: ${sumidos.join(", ") || "nenhum"}`,
    ).toEqual([]);
    expect(new Set(IDS_2_0).size, "Sanidade: a lista fixa tem 30 ids distintos.").toBe(30);
  });

  test("ativas = 10 reusadas do 2.0 + 5 novas; as outras 20 do 2.0 estão aposentadas", () => {
    const ativas = PERGUNTAS_ATIVAS.map((p) => p.id);
    expect(
      ativas.filter((id) => (IDS_2_0 as readonly string[]).includes(id)).sort(),
      "REGRA: das 15 ativas, 10 herdam id do 2.0.",
    ).toEqual([...IDS_2_0_REUSADOS].sort());
    expect(
      ativas.filter((id) => !(IDS_2_0 as readonly string[]).includes(id)).sort(),
      "REGRA: as 5 ativas restantes são ids NOVOS (id antigo nunca é reaproveitado com outro significado).",
    ).toEqual([...IDS_NOVOS_3_0].sort());

    const aposentadas = PERGUNTAS_ENTREVISTA.filter((p) => p.aposentada).map((p) => p.id);
    expect(
      aposentadas.sort(),
      "REGRA: as aposentadas são exatamente os ids do 2.0 que não seguem ativos.",
    ).toEqual(IDS_2_0.filter((id) => !(IDS_2_0_REUSADOS as readonly string[]).includes(id)).sort());
  });

  test("nenhuma opção antiga das perguntas reusadas sumiu; `nenhum` e `participam_negocio` estão aposentadas", () => {
    const sumidas: string[] = [];
    for (const [perguntaId, opcoes] of Object.entries(OPCOES_2_0_DAS_REUSADAS)) {
      const p = perguntaPorId(perguntaId);
      for (const id of opcoes) {
        if (!p?.opcoes.some((o) => o.id === id)) sumidas.push(`${perguntaId}.${id}`);
      }
    }
    expect(
      sumidas,
      `REGRA: opção gravada em entrevista antiga não pode sumir da pergunta. Sumiram: ${sumidas.join(", ") || "nenhuma"}`,
    ).toEqual([]);

    const opcaoAposentada = (perguntaId: string, opcaoId: string) =>
      perguntaPorId(perguntaId)?.opcoes.find((o) => o.id === opcaoId)?.aposentada;
    expect(opcaoAposentada("imoveis_qtd", "nenhum"), "REGRA: imoveis_qtd.nenhum saiu do fluxo.").toBe(true);
    expect(
      opcaoAposentada("filhos_participam", "participam_negocio"),
      "REGRA: filhos_participam.participam_negocio saiu do fluxo.",
    ).toBe(true);
  });

  test("entrevista antiga: aposentadas PESAM no DISC (02/10, card 86akrypfm), não no mapa de decisores; `participam_negocio` segue valendo como decide junto", () => {
    // Só perguntas aposentadas respondidas (estilo_decisao.rapido = D3, etc.).
    const legado: Record<string, string> = {
      estilo_decisao: "rapido",
      o_que_convence: "resultado",
      decide_investimento: "consulta_conjuge",
      quem_bate_martelo: "juntos",
      consulta_terceiro: "contador",
    };
    let disc;
    let decisores;
    expect(() => {
      disc = calcularDisc(legado);
      decisores = mapearDecisores(legado);
    }, "REGRA: uma entrevista antiga (só ids aposentados) não pode lançar exceção.").not.toThrow();
    // estilo_decisao.rapido D3 + o_que_convence.resultado D3 + consulta_terceiro.contador C2.
    expect(disc!.pontos, "REGRA: aposentada respondida soma o peso do catálogo (senão a entrevista antiga fica sem DISC).").toEqual({
      D: 6, I: 0, S: 0, C: 2,
    });
    expect(disc!.letra, "REGRA: entrevista antiga com sinais nas aposentadas tem letra.").toBe("D");
    expect(calcularDisc({ temperatura: "morno" }).letra, "REGRA: sem nenhum ponto não há perfil (nunca inventar 'D').").toBeNull();
    expect(decisores!.total, "REGRA: o entrevistado é sempre 1 decisor; aposentada não acrescenta.").toBe(1);
    expect(decisores!.decideJunto, "REGRA: decisor de pergunta aposentada não trava.").toEqual([]);

    const antigoNegocio = mapearDecisores({ filhos_participam: "participam_negocio" });
    expect(
      antigoNegocio.decideJunto.map((d) => d.sinal),
      "REGRA: quem marcou `participam_negocio` no 2.0 era contado como decisor; na 3.0 isso é `dj`.",
    ).toEqual(["filhos"]);
  });
});

test.describe("Script de Fechamento — invariantes do mapa (script-reuniao.ts) @estatico", () => {
  test("PARTES_SCRIPT tem 7 partes numeradas 1..7 em sequência, ids únicos", () => {
    const numeros = PARTES_SCRIPT.map((p) => p.numero);
    const ids = PARTES_SCRIPT.map((p) => p.id);

    expect(PARTES_SCRIPT.length, "REGRA: o script tem de ter exatamente 7 partes.").toBe(7);
    expect(
      numeros,
      "REGRA: `numero` tem de ser 1..7 em sequência, na ordem do array.",
    ).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(
      new Set(ids).size,
      `REGRA: ids de parte têm de ser únicos. Ids: ${ids.join(", ")}`,
    ).toBe(ids.length);
  });

  test("todo id de alimentadaPor existe no catálogo (ativo ou aposentado); frases_cliente e agendamento só na Parte 06", () => {
    const ausentes: string[] = [];
    const partesComFrases: number[] = [];
    const partesComAgendamento: number[] = [];
    for (const parte of PARTES_SCRIPT) {
      for (const id of parte.alimentadaPor) {
        if (id === CHAVE_FRASES_CLIENTE) {
          partesComFrases.push(parte.numero);
          continue;
        }
        if (id === CHAVE_AGENDAMENTO_PRELIMINAR) {
          partesComAgendamento.push(parte.numero);
          continue;
        }
        if (!perguntaPorId(id)) ausentes.push(`${parte.id}:${id}`);
      }
    }
    expect(
      ausentes,
      `REGRA: todo id em \`alimentadaPor\` tem de existir no catálogo (ativo ou aposentado). Ausentes: ${ausentes.join(", ") || "nenhum"}`,
    ).toEqual([]);
    expect(
      partesComFrases,
      "REGRA: `frases_cliente` não é pergunta; alimenta só a Parte 06 do briefing.",
    ).toEqual([6]);
    expect(
      partesComAgendamento,
      "REGRA: `agendamento_preliminar` não é pergunta; alimenta só a Parte 06 do briefing.",
    ).toEqual([6]);
  });

  test("toda pergunta ativa alimenta alguma parte, exceto as 4 que têm bloco próprio no briefing", () => {
    const usadas = new Set(PARTES_SCRIPT.flatMap((p) => p.alimentadaPor));
    const semParte = PERGUNTAS_ATIVAS.filter((p) => !usadas.has(p.id)).map((p) => p.id);

    expect(
      semParte,
      "REGRA: pergunta ativa sem parte no script some do briefing. Só ficam fora, de propósito, " +
        "ritmo_conversa (observação que só mede a letra) e as 3 de decisores (bloco 'Decisores').",
    ).toEqual([...ATIVAS_FORA_DAS_PARTES].sort((a, b) => ordem(a) - ordem(b)));

    // A exceção é estreita: vale só para observação pura e para o bloco decisores.
    const excecaoIndevida = semParte.filter((id) => {
      const p = perguntaPorId(id)!;
      return !(p.observacao === true || p.bloco === "decisores");
    });
    expect(excecaoIndevida, "REGRA: só observação pura ou bloco `decisores` podem ficar fora das partes.").toEqual([]);

    // E as aposentadas que ficam fora das partes não alimentam nada por engano.
    for (const id of ATIVAS_FORA_DAS_PARTES) {
      expect(usadas.has(id), `REGRA: '${id}' tem bloco próprio e não pode estar em alimentadaPor.`).toBe(false);
    }
  });

  test("a Parte 06 usa só presenca_decisores e obs_comportamento como perguntas ATIVAS; preço só como legado", () => {
    const parte06 = PARTES_SCRIPT.find((p) => p.numero === 6) as ParteScript;
    const ativasNaParte = parte06.alimentadaPor.filter(
      (id) => id !== CHAVE_FRASES_CLIENTE && id !== CHAVE_AGENDAMENTO_PRELIMINAR && perguntaPorId(id) && !perguntaPorId(id)!.aposentada,
    );
    expect(
      ativasNaParte,
      "REGRA (decisão do Marcio, 29/09, item b): a Parte 06 ativa é presença + pontos de atenção (+ frases).",
    ).toEqual(["presenca_decisores", "obs_comportamento"]);

    for (const id of ["decide_investimento", "reacao_preco"]) {
      expect(
        perguntaPorId(id)?.aposentada,
        `REGRA: '${id}' (preço) está aposentada — não pode voltar como pergunta ativa.`,
      ).toBe(true);
      expect(
        perguntasVisiveis(primeiraOpcaoDeCadaPergunta()).some((p) => p.id === id),
        `REGRA: '${id}' nunca aparece no fluxo.`,
      ).toBe(false);
    }

    // Entrevista 3.0 completa: a Parte 06 montada não traz nenhum item de preço.
    const respostas: RespostasEntrevista = {
      ...RESPOSTAS_CAMINHO_LONGO,
      presenca_decisores: "alguns",
      obs_comportamento: "falou_preco",
    };
    const montada = montarParte(parte06, respostas, "D");
    expect(
      montada.itens.map((i) => i.perguntaId),
      "REGRA: entrevista 3.0 monta a Parte 06 só com presença e pontos de atenção.",
    ).toEqual(["presenca_decisores", "obs_comportamento"]);
    expect(montada.itens.some((i) => i.legado), "REGRA: nenhum item legado numa entrevista 3.0.").toBe(false);

    // Entrevista antiga: a resposta de preço aparece, MARCADA como legado.
    const antiga = montarParte(parte06, { decide_investimento: "na_hora" }, "D");
    expect(
      antiga.itens.map((i) => [i.perguntaId, i.legado]),
      "REGRA: entrevista antiga ainda mostra a resposta de preço, sinalizada como legado.",
    ).toEqual([["decide_investimento", true]]);
  });

  test("gatilho tem as 4 letras D/I/S/C não vazias em todas as partes", () => {
    const problemas: string[] = [];
    for (const parte of PARTES_SCRIPT) {
      for (const letra of LETRAS) {
        const texto = parte.gatilho[letra];
        if (typeof texto !== "string" || texto.trim().length === 0) {
          problemas.push(`${parte.id}.${letra}`);
        }
      }
    }
    expect(
      problemas,
      `REGRA: toda parte tem de ter gatilho não vazio para as 4 letras D/I/S/C. Faltando: ${problemas.join(", ") || "nenhum"}`,
    ).toEqual([]);
  });

  test("variantes só existe na parte 05 e é exatamente [Sessão de Viabilidade, Croqui Estrutural]", () => {
    const comVariantes = PARTES_SCRIPT.filter((p) => p.variantes !== undefined);
    expect(
      comVariantes.map((p) => p.id),
      "REGRA: só a parte 05 (virada) pode ter `variantes`.",
    ).toEqual(["virada"]);
    expect(
      comVariantes[0]?.variantes,
      "REGRA: as variantes da parte 05 têm de ser exatamente estas duas, nesta ordem.",
    ).toEqual(["Sessão de Viabilidade", "Croqui Estrutural"]);
  });

  test("nenhum gatilho ou título contém 'R$' (a Parte 05 proíbe citar valor)", () => {
    const comValor: string[] = [];
    for (const parte of PARTES_SCRIPT) {
      if (parte.titulo.includes("R$")) comValor.push(`${parte.id}.titulo`);
      for (const [letra, texto] of Object.entries(parte.gatilho)) {
        if (texto.includes("R$")) comValor.push(`${parte.id}.gatilho.${letra}`);
      }
    }
    expect(
      comValor,
      `REGRA: nenhum \`gatilho\` ou \`titulo\` pode citar "R$" — o script proíbe preço em reais. Achados: ${comValor.join(", ") || "nenhum"}`,
    ).toEqual([]);
  });
});

/** Posição da pergunta no roteiro (para comparar listas na ordem da conversa). */
function ordem(id: string): number {
  return PERGUNTAS_ATIVAS.findIndex((p) => p.id === id);
}

test.describe("montarParte — cobertura, gatilho, idsDesconhecidos e múltipla @estatico", () => {
  test("respostas completas do caminho longo e letra D dão cobertura completa em toda parte 3.0", () => {
    const respostas: RespostasEntrevista = {};
    for (const p of perguntasVisiveis(RESPOSTAS_CAMINHO_LONGO)) {
      respostas[p.id] = RESPOSTAS_CAMINHO_LONGO[p.id] ?? p.opcoes[0].id;
    }

    // Partes 1..6 têm ao menos uma pergunta ativa; a 7 só tem legado (temperatura).
    for (const parte of PARTES_SCRIPT.filter((p) => p.numero <= 6)) {
      const resultado = montarParte(parte, respostas, "D");
      expect(
        resultado.cobertura,
        `REGRA: com todas as perguntas visíveis respondidas, a parte ${parte.numero} tem cobertura 'completa'.`,
      ).toBe("completa");
      expect(typeof resultado.gatilho, "REGRA: com letra 'D', o gatilho tem de ser string.").toBe("string");
      expect(
        resultado.idsDesconhecidos,
        "REGRA: sem id inválido em `alimentadaPor`, `idsDesconhecidos` tem de ser vazio.",
      ).toEqual([]);
    }
  });

  test("pergunta visível sem resposta rebaixa a cobertura para parcial", () => {
    const abertura = PARTES_SCRIPT.find((p) => p.id === "abertura") as ParteScript;
    // `bens` respondida, `imoveis_qtd` visível (imóvel) mas em branco.
    const resultado = montarParte(abertura, { bens: "imovel_uso" }, "D");
    expect(
      resultado.cobertura,
      "REGRA: esperada (visível) e não respondida é lacuna — cobertura 'parcial', não 'completa'.",
    ).toBe("parcial");
  });

  test("respostas null e letra null dão cobertura nenhuma e gatilho null", () => {
    const parte = PARTES_SCRIPT.find((p) => p.id === "abertura") as ParteScript;

    const resultado = montarParte(parte, null, null);

    expect(
      resultado.cobertura,
      "REGRA: sem nenhuma resposta, a cobertura tem de ser 'nenhuma'.",
    ).toBe("nenhuma");
    expect(resultado.gatilho, "REGRA: sem letra DISC, o gatilho tem de ser null.").toBeNull();
  });

  test("id inexistente injetado numa cópia da parte aparece em idsDesconhecidos", () => {
    const parteOriginal = PARTES_SCRIPT.find((p) => p.id === "abertura") as ParteScript;
    const parteComIdFalso: ParteScript = {
      ...parteOriginal,
      alimentadaPor: [...parteOriginal.alimentadaPor, "id_que_nao_existe_no_catalogo"],
    };

    const resultado = montarParte(parteComIdFalso, primeiraOpcaoDeCadaPergunta(), "C");

    expect(
      resultado.idsDesconhecidos,
      "REGRA: id de `alimentadaPor` ausente do catálogo tem de aparecer em `idsDesconhecidos`, " +
        "sem derrubar a função.",
    ).toContain("id_que_nao_existe_no_catalogo");
  });

  test("resposta com id de opção inválida faz o item sumir de itens", () => {
    const parte = PARTES_SCRIPT.find((p) => p.id === "abertura") as ParteScript;
    const primeiraPerguntaDaParte = parte.alimentadaPor[0];

    const resultado = montarParte(parte, { [primeiraPerguntaDaParte]: "opcao_que_nao_existe_nesta_pergunta" }, "D");

    expect(
      resultado.itens.some((i) => i.perguntaId === primeiraPerguntaDaParte),
      "REGRA: resposta com id de OPÇÃO inválido (pergunta existe, opção não) tem de fazer " +
        "o item sumir de `itens`, não aparecer com rótulo indefinido.",
    ).toBe(false);
  });

  test('múltipla gravada como "a|b" é lida por montarParte (todos os itens, na ordem do catálogo)', () => {
    const abertura = PARTES_SCRIPT.find((p) => p.id === "abertura") as ParteScript;
    const bens = montarParte(abertura, { bens: "imovel_uso|empresa" }, "D").itens.find(
      (i) => i.perguntaId === "bens",
    );
    expect(bens, "REGRA: `bens` gravada como \"a|b\" tem de virar item da Parte 01.").toBeTruthy();
    expect(
      bens!.rotulos,
      'REGRA: "imovel_uso|empresa" vira DOIS rótulos, não um id inválido que faz o item sumir.',
    ).toEqual(["Imóvel onde mora", "Empresa / participação em negócio"]);
    expect(bens!.rotuloDaOpcao, "REGRA: os rótulos marcados saem juntos por ', '.").toBe(
      "Imóvel onde mora, Empresa / participação em negócio",
    );

    // Mesma leitura para array (formato aceito na leitura, ainda que o banco grave string).
    const comArray = montarParte(abertura, { bens: ["imovel_uso", "empresa"] }, "D").itens.find(
      (i) => i.perguntaId === "bens",
    );
    expect(comArray!.rotulos, "REGRA: string \"a|b\" e array dão o mesmo resultado.").toEqual(bens!.rotulos);
  });

  test('obs_comportamento "a|b" na Parte 06 mostra só o grupo atenção', () => {
    const parte06 = PARTES_SCRIPT.find((p) => p.numero === 6) as ParteScript;
    const item = montarParte(
      parte06,
      { obs_comportamento: "interrompeu|falou_preco|desconfianca" },
      "D",
    ).itens.find((i) => i.perguntaId === "obs_comportamento");
    expect(
      item?.rotulos,
      'REGRA: da múltipla "jeito|atenção", a Parte 06 mostra só os pontos de atenção ("interrompeu" é jeito e vira letra DISC).',
    ).toEqual(["Perguntou de preço", "Demonstrou desconfiança"]);

    const semAtencao = montarParte(parte06, { obs_comportamento: "interrompeu|entusiasmo" }, "D").itens.find(
      (i) => i.perguntaId === "obs_comportamento",
    );
    expect(
      semAtencao?.rotulos,
      "REGRA: respondeu, mas sem ponto de atenção, é informação ('nenhum'), não lacuna.",
    ).toEqual(["Nenhum ponto de atenção marcado"]);
  });
});

test.describe("Cálculo — DISC e decisores sobre o roteiro 3.0 @estatico", () => {
  test("calcularDisc soma múltipla por item e não lança com respostas parciais", () => {
    const disc = calcularDisc({
      motivo_busca: "problema_urgente",
      ritmo_conversa: "direto",
      obs_comportamento: "interrompeu|urgencia_controle",
    });
    expect(
      disc.pontos,
      "REGRA: D = 2 (motivo) + 3 (ritmo) + 1 + 1 (dois itens da múltipla); as outras letras ficam em 0.",
    ).toEqual({ D: 7, I: 0, S: 0, C: 0 });
    expect(disc.letra, "REGRA: a maior soma vence.").toBe("D");
    expect(disc.sinais, "REGRA: `sinais` conta OPÇÕES com peso marcadas (a múltipla conta cada item).").toBe(4);
  });

  test("só quem decide junto (dj) trava; opina e só avisa vão para o relatório", () => {
    const avisa = mapearDecisores({ decide_sozinho: "conjuge_avisa" });
    const opina = mapearDecisores({ decide_sozinho: "conjuge_opina" });
    const junto = mapearDecisores({ decide_sozinho: "conjuge_participa" });

    expect(avisa.exigeTodosNaPreliminar, "REGRA: 'só avisa' não trava a Preliminar.").toBe(false);
    expect(avisa.soAvisam.map((d) => d.sinal), "REGRA: 'só avisa' vai para `soAvisam`.").toEqual(["conjuge"]);
    expect(opina.exigeTodosNaPreliminar, "REGRA: 'opina' não trava a Preliminar.").toBe(false);
    expect(opina.influenciam.map((d) => d.sinal), "REGRA: 'opina' vai para `influenciam`.").toEqual(["conjuge"]);
    expect(junto.exigeTodosNaPreliminar, "REGRA: 'decide junto' trava a Preliminar.").toBe(true);
    expect(junto.total, "REGRA: o entrevistado + quem decide junto.").toBe(2);
  });
});
