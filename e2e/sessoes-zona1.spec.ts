import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { estadoDaEntrevista } from "@/components/sessoes/pre-requisitos";
import { causaDoVazio, type BlocoDeTipo } from "@/components/sessoes/causa-do-vazio";
import type { SessaoAgendamento, SessaoTipo } from "@/lib/sessoes-tipos";

/**
 * A JUNÇÃO DA TELA `/sessoes` — Zona 1 (o que falta) e Zona 2 (o vazio).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 POR QUE ESTE ARQUIVO EXISTE (dois achados do joão, 24/09/2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * 1. **✓ sem prova.** `temEntrevista = sessoes.some(tipo 1) || letra` fundia
 *    dois fatos num booleano. `getSessoesDoAmbiente({ estados: ["agendado"] })`
 *    devolve só sessões VIVAS, isto é, FUTURAS — então a Zona 1 imprimia
 *    "✓ Feito · já aconteceu" para uma conversa que ainda ia acontecer.
 * 2. **Causa inventada.** A Zona 2 dizia "A Reunião Preliminar acontece depois
 *    da Entrevista Prévia" e oferecia a Entrevista como o que destrava — mas
 *    NADA em `gps.sessao_pode_agendar` condiciona o tipo 2 à Entrevista. O
 *    gate real é a Etapa 02 fechada.
 *
 * Nenhuma suíte pegava os dois: `tsc` e `eslint` passam com a frase errada, e
 * `sessoes-parceiro.spec.ts` exige login (`QA_PARCEIRO_EMAIL`) e se PULA
 * sozinho na máquina de quem desenvolve. Estado errado que só aparece com
 * credencial é estado errado sem teste.
 *
 * ⚠️ ESTE TESTE É ESTÁTICO DE PROPÓSITO — roda SEM login, SEM navegador e
 * SEM tocar produção, como `e2e/script-reuniao.spec.ts` e
 * `e2e/espelho-admin.spec.ts`. Ele prova DECISÃO (qual estado/qual causa) e
 * COPY (qual frase existe no arquivo). Ele NÃO prova geometria nem pigmento:
 * isso só se prova em navegador que pinta, e continua com a suíte logada.
 *
 * 🔑 POR QUE A COPY É CONFERIDA LENDO O ARQUIVO, e não renderizando.
 * O compilador de specs do Playwright aplica a PRÓPRIA fábrica de JSX aos
 * `.tsx` importados (os nós saem como `{__pw_type,…}`), então
 * `renderToStaticMarkup(<PreRequisitos …/>)` falha com "Objects are not valid
 * as a React child" — medido em 24/09, com e sem `createElement`. Renderizar
 * componente de produção não é opção neste harness. A leitura do arquivo é o
 * mesmo recurso que `espelho-admin.spec.ts` usa pela mesma razão, e cobre
 * exatamente o que os dois achados eram: FRASE errada na tela.
 */

const RAIZ = join(__dirname, "..");
const PRE_REQUISITOS = "src/components/sessoes/pre-requisitos.tsx";
const SEM_HORARIO = "src/components/sessoes/sem-horario.tsx";
const PAGE = "src/app/sessoes/page.tsx";

/**
 * O arquivo SEM os comentários — é o que a tela realmente imprime.
 *
 * 🔴 Sem este corte o teste teria FALSO VERMELHO e, pior, falso verde: os
 * comentários desta fatia citam de propósito as frases que foram REMOVIDAS
 * ("já aconteceu", `sem-entrevista`) para explicar por que saíram. Procurar a
 * string no arquivo cru acusaria a explicação como se fosse a copy.
 */
function copyDe(arquivoRelativo: string): string {
  const cru = readFileSync(join(RAIZ, arquivoRelativo), "utf8");
  return cru
    .replace(/\/\*[\s\S]*?\*\//g, " ") // bloco /* … */ e /** … */ (inclui os {/* … */} do JSX)
    .replace(/(^|[^:])\/\/.*$/gm, "$1 "); // linha // … (o `[^:]` poupa `https://`)
}

/** Uma sessão viva de Entrevista Prévia, com só o que a Zona 1 lê dela. */
const ENTREVISTA_VIVA = { data: "2026-09-30", hora_inicio: "14:00:00" };

/** Um bloco de tipo sintético — a Zona 2 só lê estes 5 campos. */
function bloco(over: Partial<BlocoDeTipo> = {}): BlocoDeTipo {
  return {
    tipo: { id: 2, nome: "Reunião Preliminar" } as SessaoTipo,
    jaMarcada: null,
    elegivel: { clienteId: null, falhou: false },
    horarios: [],
    ...over,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// ZONA 1 — a linha da Entrevista Prévia
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Zona 1 de /sessoes · Entrevista Prévia @estatico", () => {
  test("🔴 sessão VIVA de tipo 1 sem letra do DISC ⇒ 'marcada', NUNCA 'feito'", () => {
    expect(
      estadoDaEntrevista({ letraDisc: null, sessaoViva: ENTREVISTA_VIVA }),
      "REGRA: `getSessoesDoAmbiente({ estados: ['agendado'] })` só devolve sessão " +
        "VIVA — isto é, FUTURA. Entrevista marcada para a semana que vem NÃO " +
        "aconteceu, e a tela não pode afirmar que aconteceu. Este é o achado " +
        "'✓ sem prova' do joão (24/09).",
    ).toBe("marcada");
  });

  test("a letra do DISC preenchida ⇒ 'feito' (é ela que prova que a conversa houve)", () => {
    expect(
      estadoDaEntrevista({ letraDisc: "C", sessaoViva: null }),
      "REGRA: é a Entrevista que apura o perfil (decisão do Marcio, 22/09), " +
        "então a letra prova que ela aconteceu — inclusive depois de a sessão " +
        "sair das vivas.",
    ).toBe("feito");
  });

  test("letra preenchida VENCE a sessão viva — o fato consumado ganha do compromisso", () => {
    expect(
      estadoDaEntrevista({ letraDisc: "D", sessaoViva: ENTREVISTA_VIVA }),
      "REGRA: quem já tem a letra fez a entrevista. Uma sessão viva ao lado é " +
        "outra conversa marcada, não uma pendência da primeira.",
    ).toBe("feito");
  });

  test("sem letra e sem sessão ⇒ 'falta' (é o único estado que oferece o link)", () => {
    expect(estadoDaEntrevista({ letraDisc: null, sessaoViva: null })).toBe("falta");
    expect(
      estadoDaEntrevista({ letraDisc: "  ", sessaoViva: null }),
      "REGRA: letra em branco é 'lido, e vazio' — vira ✗, não ✓.",
    ).toBe("falta");
  });

  test("leitura falhada (`undefined`) ⇒ 'a-conferir', e nunca ✗", () => {
    expect(
      estadoDaEntrevista({ letraDisc: undefined, sessaoViva: null }),
      "REGRA: falha de leitura e 'não preenchido' são fatos diferentes. Virar ✗ " +
        "afirmaria sobre o banco o que a consulta não soube responder — a " +
        "mentira de 16/09.",
    ).toBe("a-conferir");
    expect(
      estadoDaEntrevista({ letraDisc: undefined, sessaoViva: ENTREVISTA_VIVA }),
      "REGRA: o compromisso é fato OBSERVADO e vale mais que a leitura que caiu.",
    ).toBe("marcada");
  });

  test("🔴 a copy 'já aconteceu' NÃO existe mais na Zona 1", () => {
    const copy = copyDe(PRE_REQUISITOS);
    expect(
      copy,
      "REGRA: nenhuma frase da Zona 1 pode afirmar que a Entrevista aconteceu — " +
        "o ✓ agora sai só da letra do DISC, e o texto dele não promete data.",
    ).not.toContain("já aconteceu");
  });

  test("a copy do estado 'marcada' existe: a palavra, o glifo e a frase da data", () => {
    const copy = copyDe(PRE_REQUISITOS);
    expect(
      copy,
      "REGRA: cor NUNCA é o único portador (05 Decisoes/sic-hf-excecao-visual…). " +
        "O estado novo precisa da PALAVRA 'Marcada', não só de um glifo.",
    ).toContain('palavra: "Marcada"');
    expect(copy, "O glifo do estado 'marcada'.").toContain('glifo: "◷"');
    expect(
      copy,
      "REGRA: 'marcada' sem QUANDO é pior que 'falta' — o parceiro não sabe se " +
        "precisa agir. A data sai do próprio agendamento, sem consulta nova.",
    ).toContain("marcada para ");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ZONA 2 — a causa do vazio
// ═══════════════════════════════════════════════════════════════════════════

test.describe("Zona 2 de /sessoes · a causa do vazio @estatico", () => {
  test("🔴 favorito PRESENTE + a RPC devolvendo null ⇒ 'etapa-fechada', nunca 'nao-elegivel'", () => {
    expect(
      causaDoVazio(bloco({ elegivel: { clienteId: null, falhou: false } }), true),
      "REGRA: com favorito, a Zona 1 já imprime '✓ Feito · Cliente — <nome>'. " +
        "Dizer 'Escolha o cliente' logo abaixo são duas frases contraditórias na " +
        "mesma tela, e o parceiro não tem como saber qual seguir.",
    ).toBe("etapa-fechada");
  });

  test("sem favorito ⇒ 'nao-elegivel' (a saída dele é mesmo a aba Clientes)", () => {
    expect(causaDoVazio(bloco(), false)).toBe("nao-elegivel");
  });

  test("elegível e sem bloco publicado ⇒ 'sem-horario'", () => {
    expect(
      causaDoVazio(bloco({ elegivel: { clienteId: "c1", falhou: false } }), true),
    ).toBe("sem-horario");
  });

  test("falha de leitura NUNCA vira causa de vazio — ela tem frase própria com role=alert", () => {
    expect(
      causaDoVazio(bloco({ erro: "não deu para conferir" }), true),
      "REGRA: lista vazia por ERRO e lista vazia por AUSÊNCIA são fatos " +
        "diferentes. Afirmar o segundo quando aconteceu o primeiro é a mentira de 16/09.",
    ).toBeNull();
    expect(
      causaDoVazio(bloco({ elegivel: { clienteId: null, falhou: true } }), true),
    ).toBeNull();
  });

  test("bloco com sessão já marcada não tem causa de vazio", () => {
    expect(
      causaDoVazio(
        bloco({ jaMarcada: { id: "s1" } as SessaoAgendamento }),
        true,
      ),
    ).toBeNull();
  });

  test("🔴 a causa inventada 'sem-entrevista' não existe mais em lugar nenhum", () => {
    const causas: (string | null)[] = [
      causaDoVazio(bloco(), false),
      causaDoVazio(bloco(), true),
      causaDoVazio(bloco({ elegivel: { clienteId: "c1", falhou: false } }), true),
    ];
    expect(
      causas,
      "REGRA: nada em `gps.sessao_pode_agendar` condiciona o tipo 2 à Entrevista " +
        "Prévia. Os gates reais são favorito, `sessoes_exige_confirmacao` e a " +
        "etapa liberada (`sessao_tipos.etapa_id = 2` × Etapa 02 fechada).",
    ).not.toContain("sem-entrevista");

    expect(copyDe(SEM_HORARIO)).not.toContain("sem-entrevista");
  });

  test("🔴 a copy de 'etapa-fechada' diz a causa REAL e oferece a Entrevista como ADIANTAMENTO", () => {
    const copy = copyDe(SEM_HORARIO);

    expect(
      copy,
      "REGRA: quem destrava é a equipe liberando a etapa do tipo " +
        "(`gps.etapa_liberada_para` sobre `sessao_tipos.etapa_id`). A frase tem " +
        "de nomear isso.",
    ).toContain("abre quando a equipe liberar");

    expect(
      copy,
      "REGRA: a Entrevista é o que ele PODE ADIANTAR, nunca o que destrava — " +
        "'Enquanto isso' é a palavra que separa as duas coisas.",
    ).toContain("Enquanto isso");

    expect(
      copy,
      "REGRA: a frase antiga afirmava uma regra de banco que não existe.",
    ).not.toContain("acontece depois da Entrevista Prévia");
  });

  test("🔴 o número da etapa sai do DADO (`sessao_tipos.etapa_id`), nunca de literal na frase", () => {
    const copy = copyDe(SEM_HORARIO);

    expect(
      copy,
      "REGRA: `causaDoVazio` devolve 'etapa-fechada' para QUALQUER tipo com " +
        "favorito e RPC recusando — inclusive a Entrevista Prévia, que tem " +
        "`etapa_id = 1` (…292:139). Com 'Etapa 02' escrito na frase, o bloco da " +
        "Entrevista mentiria a etapa. Mesma classe do `150` que a …291 proíbe.",
    ).toContain("Etapa ${String(etapaDoTipo)");

    expect(
      copy,
      "REGRA: nenhum número de etapa escrito à mão na copy.",
    ).not.toContain("liberar a Etapa 02");
  });

  test("🔴 a Entrevista Prévia não se oferece como adiantamento DENTRO do próprio bloco", () => {
    const copy = copyDe(SEM_HORARIO);
    expect(
      copy,
      "REGRA: mandar o parceiro 'adiantar a Entrevista Prévia' dentro do bloco " +
        "que acabou de dizer que a Entrevista Prévia não abriu é um beco. O " +
        "guarda é `etapaDoTipo === 1` (o tipo 1 é a própria Entrevista).",
    ).toContain("ehAEntrevista");
  });

  test("🔴 `causaUnica` não funde 'etapa-fechada' — os dois tipos dizem etapas diferentes", () => {
    // 🔑 Lido do arquivo porque a fusão mora em `CorpoSessoes` (`page.tsx`), e
    // importar aquele módulo arrasta `app-header` -> `server-only`, que não
    // resolve fora do bundler do Next. Ver o cabeçalho deste arquivo.
    const fonte = readFileSync(join(RAIZ, PAGE), "utf8");
    expect(
      fonte,
      "REGRA: as outras causas produzem UMA frase idêntica para qualquer tipo, " +
        "então fundir evita parágrafo repetido. `etapa-fechada` nomeia a ETAPA " +
        "daquele tipo (1 para a Entrevista, 2 para a Preliminar) — fundir " +
        "obrigaria a tela a escolher um número de etapa para valer pelos dois, " +
        "que é a mesma invenção que este conserto desfaz.",
    ).toContain('causas[0] !== "etapa-fechada"');
  });

  test("🔴 com favorito, a tela NUNCA pode dizer 'Escolha o cliente'", () => {
    const copy = copyDe(SEM_HORARIO);

    // A frase existe — e é CORRETA — só no ramo `nao-elegivel`, que por
    // construção só roda com `temCliente === false`.
    expect(copy).toContain("Escolha o cliente que a equipe vai acompanhar");

    // A prova da não-contradição é a DECISÃO: com favorito, a causa escolhida
    // nunca é a que carrega aquela frase.
    expect(
      causaDoVazio(bloco(), true),
      "REGRA: `temCliente === true` tem de sair por 'etapa-fechada'. Se voltar a " +
        "'nao-elegivel', a Zona 2 pede para escolher um cliente que a Zona 1 " +
        "acabou de listar como escolhido.",
    ).not.toBe("nao-elegivel");
  });
});
