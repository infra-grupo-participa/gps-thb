import { test, expect } from "@playwright/test";
import {
  PERGUNTAS_ENTREVISTA,
  BLOCOS_ENTREVISTA,
  TOTAL_PERGUNTAS,
  type PerguntaEntrevista,
} from "@/lib/entrevista-previa-perguntas";
import { calcularDisc, mapearDecisores } from "@/lib/entrevista-previa-calculo";
import { PARTES_SCRIPT, montarParte, type ParteScript } from "@/lib/script-reuniao";

/**
 * INVARIANTES da Entrevista Prévia (`entrevista-previa-perguntas.ts` +
 * `entrevista-previa-calculo.ts`) e do mapa do Script de Fechamento da
 * Reunião Preliminar (`script-reuniao.ts`).
 *
 * ⚠️ ESTE TESTE É ESTÁTICO DE PROPÓSITO — importa os módulos direto (o
 * Playwright da casa resolve `@/lib/*`, mesmo padrão de
 * `e2e/espelho-admin.spec.ts`), não abre navegador, não faz login e não toca
 * produção. É lógica pura: contagem, ordem, forma de dado. Roda com
 * `--project=desktop` sem sessão nenhuma.
 *
 * Estes invariantes viviam em scripts descartáveis (`C:/tmp/entrevista/`),
 * um deles já sem rodar — nada os protegia dentro do repo.
 */

// As 5 perguntas de FATO novas de patrimônio: sem peso DISC, sem decisor.
const PERGUNTAS_FATO_PATRIMONIO = [
  "titularidade",
  "instrumento_existente",
  "conflito_herdeiros",
  "imoveis_qtd",
  "imoveis_heranca",
] as const;

const PERGUNTAS_SO_BLOCO_PROPRIO = [
  // As 4 PURAMENTE de DISC (só medem a letra) + as 4 de decisores: bloco
  // próprio no briefing. As outras 4 de `comportamento` (`o_que_convence`,
  // `confianca_equipe`, `mudanca`, `reacao_preco`) entram nas partes 04/06 de
  // propósito — são resposta sobre o caso, não só sinal de letra.
  "estilo_decisao", "ritmo_conversa", "lidar_com_erro", "delega",
  "decide_sozinho", "filhos_participam", "consulta_terceiro", "socios_negocio",
];

function primeiraOpcaoDeCadaPergunta(): Record<string, string> {
  const respostas: Record<string, string> = {};
  for (const p of PERGUNTAS_ENTREVISTA) {
    respostas[p.id] = p.opcoes[0].id;
  }
  return respostas;
}

test.describe("Entrevista Prévia — invariantes do roteiro @estatico", () => {
  test("PERGUNTAS_ENTREVISTA tem 30 perguntas com ids únicos e TOTAL_PERGUNTAS bate", () => {
    const ids = PERGUNTAS_ENTREVISTA.map((p) => p.id);
    expect(
      PERGUNTAS_ENTREVISTA.length,
      "REGRA: o roteiro tem de ter exatamente 30 perguntas.",
    ).toBe(30);
    expect(
      new Set(ids).size,
      `REGRA: ids de pergunta têm de ser únicos. Ids: ${ids.join(", ")}`,
    ).toBe(ids.length);
    expect(
      TOTAL_PERGUNTAS,
      "REGRA: TOTAL_PERGUNTAS tem de ser 30 (usado na barra de progresso da tela).",
    ).toBe(30);
  });

  test("a ordem dos blocos é abertura -> patrimonio -> decisores -> comportamento -> fechamento", () => {
    const ORDEM_ESPERADA = ["abertura", "patrimonio", "decisores", "comportamento", "fechamento"];

    const ordemNoArray: string[] = [];
    for (const p of PERGUNTAS_ENTREVISTA) {
      if (!ordemNoArray.includes(p.bloco)) ordemNoArray.push(p.bloco);
    }
    expect(
      ordemNoArray,
      "REGRA: a primeira ocorrência de cada bloco no array de perguntas tem de seguir " +
        "abertura -> patrimonio -> decisores -> comportamento -> fechamento (ajuste de " +
        "24/09/2026: patrimônio foi para antes de decisores).",
    ).toEqual(ORDEM_ESPERADA);

    const ordemBlocos = BLOCOS_ENTREVISTA.map((b) => b.id);
    expect(
      ordemBlocos,
      "REGRA: BLOCOS_ENTREVISTA (usado para agrupar a tela) tem de seguir a mesma ordem.",
    ).toEqual(ORDEM_ESPERADA);
  });

  test("peso DISC >= 3 só existe em opções do bloco comportamento", () => {
    const excessosForaDeComportamento: string[] = [];

    for (const p of PERGUNTAS_ENTREVISTA) {
      if (p.bloco === "comportamento") continue;
      for (const o of p.opcoes) {
        if (!o.disc) continue;
        for (const [letra, peso] of Object.entries(o.disc)) {
          if ((peso ?? 0) >= 3) {
            excessosForaDeComportamento.push(`${p.id}.${o.id} -> ${letra}:${peso} (bloco ${p.bloco})`);
          }
        }
      }
    }

    expect(
      excessosForaDeComportamento,
      "REGRA: peso DISC >= 3 só é permitido em opções do bloco `comportamento` " +
        `(fora dele, máximo 2 por letra). Excessos encontrados: ${excessosForaDeComportamento.join(", ") || "nenhum"}`,
    ).toEqual([]);
  });

  test("as 5 novas perguntas de patrimônio não têm disc/decisor; decide_investimento existe no fechamento com decisor", () => {
    const comDiscOuDecisor: string[] = [];
    for (const id of PERGUNTAS_FATO_PATRIMONIO) {
      const pergunta = PERGUNTAS_ENTREVISTA.find((p) => p.id === id);
      expect(pergunta, `REGRA: a pergunta '${id}' tem de existir no roteiro.`).toBeTruthy();
      for (const o of pergunta!.opcoes) {
        if (o.disc && Object.keys(o.disc).length > 0) {
          comDiscOuDecisor.push(`${id}.${o.id} tem disc`);
        }
        if (o.decisor) {
          comDiscOuDecisor.push(`${id}.${o.id} tem decisor`);
        }
      }
    }
    expect(
      comDiscOuDecisor,
      "REGRA: as 5 perguntas novas de patrimônio (dado objetivo para o script) não podem " +
        `ter peso DISC nem sinal de decisor em nenhuma opção. Achados: ${comDiscOuDecisor.join(", ") || "nenhum"}`,
    ).toEqual([]);

    const decideInvestimento = PERGUNTAS_ENTREVISTA.find((p) => p.id === "decide_investimento");
    expect(
      decideInvestimento,
      "REGRA: 'decide_investimento' tem de existir no roteiro.",
    ).toBeTruthy();
    expect(
      decideInvestimento!.bloco,
      "REGRA: 'decide_investimento' tem de estar no bloco `fechamento`.",
    ).toBe("fechamento");
    expect(
      decideInvestimento!.opcoes.some((o) => !!o.decisor),
      "REGRA: 'decide_investimento' tem de ter ao menos uma opção com sinal de decisor " +
        "(quem paga tem de estar na sala, parte 06 do script).",
    ).toBe(true);
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

  test("todo id de alimentadaPor existe em PERGUNTAS_ENTREVISTA", () => {
    const catalogoIds = new Set(PERGUNTAS_ENTREVISTA.map((p) => p.id));
    const ausentes: string[] = [];
    for (const parte of PARTES_SCRIPT) {
      for (const id of parte.alimentadaPor) {
        if (!catalogoIds.has(id)) ausentes.push(`${parte.id}:${id}`);
      }
    }
    expect(
      ausentes,
      `REGRA: todo id em \`alimentadaPor\` tem de existir em PERGUNTAS_ENTREVISTA. Ausentes: ${ausentes.join(", ") || "nenhum"}`,
    ).toEqual([]);
  });

  test("gatilho tem as 4 letras D/I/S/C não vazias em todas as partes", () => {
    const LETRAS = ["D", "I", "S", "C"] as const;
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

test.describe("montarParte — cobertura, gatilho e idsDesconhecidos @estatico", () => {
  test("respostas completas (primeira opção de cada pergunta) e letra D dão cobertura completa", () => {
    const parte = PARTES_SCRIPT.find((p) => p.id === "abertura") as ParteScript;
    const respostas = primeiraOpcaoDeCadaPergunta();

    const resultado = montarParte(parte, respostas, "D");

    expect(
      resultado.cobertura,
      "REGRA: com todas as perguntas respondidas, a cobertura tem de ser 'completa'.",
    ).toBe("completa");
    expect(typeof resultado.gatilho, "REGRA: com letra 'D', o gatilho tem de ser string.").toBe(
      "string",
    );
    expect(
      resultado.idsDesconhecidos,
      "REGRA: sem id inválido em `alimentadaPor`, `idsDesconhecidos` tem de ser vazio.",
    ).toEqual([]);
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
    const respostas = primeiraOpcaoDeCadaPergunta();

    const resultado = montarParte(parteComIdFalso, respostas, "C");

    expect(
      resultado.idsDesconhecidos,
      "REGRA: id de `alimentadaPor` ausente do catálogo tem de aparecer em `idsDesconhecidos`, " +
        "sem derrubar a função.",
    ).toContain("id_que_nao_existe_no_catalogo");
  });

  test("resposta com id de opção inválida faz o item sumir de itens", () => {
    const parte = PARTES_SCRIPT.find((p) => p.id === "abertura") as ParteScript;
    const primeiraPerguntaDaParte = parte.alimentadaPor[0];
    const respostas = {
      [primeiraPerguntaDaParte]: "opcao_que_nao_existe_nesta_pergunta",
    };

    const resultado = montarParte(parte, respostas, "D");

    expect(
      resultado.itens.some((i) => i.perguntaId === primeiraPerguntaDaParte),
      "REGRA: resposta com id de OPÇÃO inválido (pergunta existe, opção não) tem de fazer " +
        "o item sumir de `itens`, não aparecer com rótulo indefinido.",
    ).toBe(false);
  });
});

test.describe("Compatibilidade — cálculo sem as 6 perguntas novas @estatico", () => {
  test("calcularDisc e mapearDecisores não lançam e devolvem letra válida com só as 24 chaves antigas", () => {
    const idsNovos = new Set([
      "titularidade",
      "instrumento_existente",
      "conflito_herdeiros",
      "imoveis_qtd",
      "imoveis_heranca",
      "decide_investimento",
    ]);
    const perguntasAntigas: PerguntaEntrevista[] = PERGUNTAS_ENTREVISTA.filter(
      (p) => !idsNovos.has(p.id),
    );

    expect(
      perguntasAntigas.length,
      "Sanidade: têm de sobrar exatamente 24 perguntas antigas (30 - 6 novas).",
    ).toBe(24);

    const respostasAntigas: Record<string, string> = {};
    for (const p of perguntasAntigas) {
      respostasAntigas[p.id] = p.opcoes[0].id;
    }

    let disc;
    let decisores;
    expect(() => {
      disc = calcularDisc(respostasAntigas);
      decisores = mapearDecisores(respostasAntigas);
    }, "REGRA: uma entrevista antiga (só as 24 chaves que já existiam) não pode lançar exceção.").not.toThrow();

    expect(
      ["D", "I", "S", "C"],
      "REGRA: a letra devolvida por calcularDisc tem de pertencer a D/I/S/C.",
    ).toContain(disc!.letra);
    expect(
      decisores!.total,
      "REGRA: mapearDecisores tem de devolver ao menos 1 decisor (o próprio entrevistado).",
    ).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Perguntas de bloco próprio no briefing não alimentam PARTES_SCRIPT @estatico", () => {
  test("as 4 puramente de DISC e as 4 de decisores não estão em nenhum alimentadaPor", () => {
    const idsUsadosEmAlimentadaPor = new Set(PARTES_SCRIPT.flatMap((p) => p.alimentadaPor));

    const vazamentos = PERGUNTAS_SO_BLOCO_PROPRIO.filter((id) => idsUsadosEmAlimentadaPor.has(id));

    expect(
      PERGUNTAS_SO_BLOCO_PROPRIO.length,
      "Sanidade: têm de ser exatamente 8 perguntas (4 puramente de DISC + 4 de decisores).",
    ).toBe(8);

    expect(
      vazamentos,
      "REGRA (script-reuniao.ts, comentário do arquivo): as 4 puramente de DISC (estilo_decisao, " +
        "ritmo_conversa, lidar_com_erro, delega) e as 4 de decisores (decide_sozinho, " +
        "filhos_participam, consulta_terceiro, socios_negocio) têm bloco próprio no briefing " +
        `('DISC' e 'Decisores') e não entram em nenhum \`alimentadaPor\`. Vazamentos: ` +
        `${vazamentos.join(", ") || "nenhum"}.`,
    ).toEqual([]);
  });
});
