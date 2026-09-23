import { test, expect, type Page } from "@playwright/test";
import { exigeAdmin, entrar, registrarTela } from "./apoio";
import { INTERRUPTORES_CONFIG } from "../src/lib/config-tipos";

/**
 * Os interruptores de `/admin/configuracoes` — o teste que teria pego o
 * defeito de 17/09.
 *
 * 🔴 A CLASSE DE DEFEITO QUE ISTO GUARDA
 *
 * A lista da tela (`INTERRUPTORES_CONFIG`, TypeScript) e a allowlist de
 * `gps.config_definir` (o CORPO de uma função no Postgres) são duas fontes que
 * precisam concordar — e **nada no build as compara**. Em 17/09
 * `minuta_contexto_obrigatorio` entrou só no TypeScript; medido em 22/09 com
 * JWT de admin real, clicar nele devolvia
 * `[22023] "Este interruptor não existe."`. A equipe via o botão, clicava, e
 * acreditava ter desligado a exigência.
 *
 * `tsc`, `eslint` e `next build` ficam verdes: a allowlist está fora do
 * alcance do compilador. Só clicar de verdade revela.
 *
 * ── 🔴 ESTE SPEC ESCREVE CONFIG GLOBAL DE PRODUÇÃO ──
 *
 * Interruptor não é dado de teste: desligar `chamados_aberto` fecha o suporte
 * para TODOS os alunos enquanto estiver desligado. Três travas, aprendidas na
 * primeira execução — em que o **timeout de 45s cortou o teste no meio** e
 * deixou `slack_mencoes_ativo` trocado em produção (restaurado à mão, pela
 * trilha de `acessos_log`, que provou 7 pares e 1 ímpar):
 *
 *  1. `timeout` próprio, dimensionado pelo nº de interruptores — não o padrão.
 *  2. **Um interruptor por vez, restaurado ANTES do próximo.** A janela em que
 *     algo fica trocado é de segundos, nunca a duração da suíte.
 *  3. `finally` restaura o que estiver pendente mesmo se a asserção falhar.
 *
 * ⚠️ Se este teste for interrompido à força (Ctrl+C), confira com:
 *     select substring(detalhe from 'interruptor "([a-z_]+)"'), count(*)
 *       from gps.acessos_log where acao='interruptor_alterado'
 *        and criado_em > now() - interval '30 minutes' group by 1;
 *     -- contagem ÍMPAR = ficou trocado.
 */

const cred = exigeAdmin();

/** Clica no switch e confirma o diálogo. Devolve o `aria-checked` final. */
async function alternar(page: Page, chave: string): Promise<string | null> {
  const sw = page.getByRole("switch", { name: new RegExp(`\\(${chave}\\)`) });
  await sw.click();
  const confirmar = page.getByRole("button", { name: /^(ligar|desligar)$/i }).last();
  if (await confirmar.isVisible().catch(() => false)) await confirmar.click();
  await page.waitForTimeout(2_200);
  return sw.getAttribute("aria-checked");
}

test.describe("Admin · interruptores de gps.config", () => {
  test.skip(!cred, "Sem QA_ADMIN_EMAIL/SENHA no .env.qa.");

  test("cada interruptor da tela é ACEITO pelo banco (ligar e desligar de volta)", async ({
    page,
  }, info) => {
    test.skip(
      test.info().project.name !== "desktop",
      "Escreve em config global: roda uma vez só.",
    );
    // 🔴 SEGUNDA vez que este teste deixou config trocada em produção
    // (`slack_mencoes_ativo` em 22/09 às 21h; `minuta_contexto_obrigatorio`
    // às 00h). A restauração um-a-um já existe; o que falhava era o TEMPO.
    // 20s por interruptor, não 15: cada um são 2 cliques + 2 confirmações +
    // 2 idas ao banco, e a rede de produção varia.
    test.setTimeout(60_000 + INTERRUPTORES_CONFIG.length * 20_000);

    await entrar(page, cred!, "/admin/configuracoes");
    await page.goto("/admin/configuracoes");
    await expect(
      page.getByRole("heading", { name: /interruptores/i }).first(),
    ).toBeVisible();

    // 🔑 Esperar os SWITCHES, não só o cabeçalho. O cabeçalho é estático e
    // aparece antes da lista montar: na 1ª execução o teste rodou em 3s e
    // relatou os 14 interruptores como "AUSENTE na tela" — um falso positivo
    // que acusaria o produto de um defeito inexistente. Medido depois: a
    // página tem 12 switches, e o seletor casa 1 por chave.
    await expect(page.getByRole("switch").first()).toBeVisible({ timeout: 15_000 });
    await registrarTela(page, info, "interruptores.png");

    const falhas: string[] = [];
    // O que está trocado NESTE instante. Some assim que é restaurado — é o
    // que o `finally` usa para não deixar produção alterada.
    let pendente: { chave: string; original: string | null } | null = null;

    try {
      for (const item of INTERRUPTORES_CONFIG) {
        const sw = page.getByRole("switch", {
          name: new RegExp(`\\(${item.chave}\\)`),
        });

        if (!(await sw.isVisible().catch(() => false))) {
          // ⚠️ Rodando contra o site PUBLICADO, um interruptor recém-acrescentado
          // ao `INTERRUPTORES_CONFIG` local ainda não existe lá — a ausência é
          // do deploy, não um defeito. Reportado como falha mesmo assim (o
          // teste não deve ficar verde sobre o que não verificou), mas com a
          // causa provável escrita, para não mandar ninguém caçar fantasma.
          falhas.push(
            `${item.chave}: declarado em INTERRUPTORES_CONFIG e AUSENTE na tela. ` +
              `Se a chave é nova, isto some depois do deploy — confira se o ` +
              `commit que a adicionou já subiu.`,
          );
          continue;
        }

        const original = await sw.getAttribute("aria-checked");
        pendente = { chave: item.chave, original };

        const depois = await alternar(page, item.chave);

        // 🔴 A PROVA: erro da RPC aparece no `role="alert"`. É onde o
        // `[22023] "Este interruptor não existe"` apareceria.
        const alerta = page.getByRole("alert").first();
        const textoErro = (await alerta.isVisible().catch(() => false))
          ? (await alerta.innerText()).trim()
          : "";

        if (textoErro) {
          falhas.push(`${item.chave}: a tela mostrou erro → "${textoErro.slice(0, 120)}"`);
        } else if (depois === original) {
          falhas.push(
            `${item.chave}: cliquei e o estado NÃO mudou (${original} → ${depois}). ` +
              `A RPC provavelmente recusou a chave.`,
          );
        }

        // RESTAURA JÁ, antes do próximo — a janela trocada dura segundos.
        if (depois !== original) {
          let final = await alternar(page, item.chave);

          // 🔴 TENTA DE NOVO antes de desistir. Terceira config deixada
          // trocada em produção (`slack_mencoes_ativo`, depois
          // `minuta_contexto_obrigatorio`, depois
          // `socio_cadastro_obrigatorio`) — e a causa raiz não era o timeout,
          // era ESTA linha: se a 1ª restauração falhasse, o código anotava a
          // falha e mesmo assim zerava `pendente`, tirando do `finally` a
          // única chance de consertar.
          for (let tentativa = 0; tentativa < 2 && final !== original; tentativa++) {
            await page.waitForTimeout(1_500);
            final = await alternar(page, item.chave);
          }

          if (final !== original) {
            falhas.push(
              `🔴 ${item.chave}: NÃO voltou (${original} → ${final}) após 3 ` +
                `tentativas. CONFIG DE PRODUÇÃO — conferir e corrigir à mão.`,
            );
            // Deixa `pendente` preenchido: o `finally` ainda tenta.
            continue;
          }
        }
        pendente = null;
      }
    } finally {
      // Rede de segurança: se a asserção lançou no meio, devolve o que ficou.
      if (pendente) {
        const sw = page.getByRole("switch", {
          name: new RegExp(`\\(${pendente.chave}\\)`),
        });
        const agora = await sw.getAttribute("aria-checked").catch(() => null);
        if (agora !== null && agora !== pendente.original) {
          await alternar(page, pendente.chave).catch(() => {});
        }
      }
    }

    expect(
      falhas,
      "Interruptores que a tela oferece e o banco não aceita (ou que não " +
        "voltaram ao estado original):\n" +
        falhas.map((f) => `  • ${f}`).join("\n"),
    ).toEqual([]);
  });
});
