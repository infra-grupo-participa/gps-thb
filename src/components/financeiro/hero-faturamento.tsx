import Link from "next/link";
import { ArrowRight, Flag, Trophy, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BarraMarcos } from "@/components/ui/barra-marcos";
import { Card, CardContent } from "@/components/ui/card";
import { IconeChip } from "@/components/ui/kpi-card";
import { brl, brlInteiro } from "@/lib/moeda";
import type { ProgressoFaturamento } from "@/lib/financeiro";

/**
 * Hero da aba Financeiro: **quanto o aluno já faturou na mentoria**.
 *
 * A pergunta que a aba responde primeiro não é "quanto eu devo", é "quanto eu
 * já ganhei com isso" — R$ 150.000 em honorários contratados é o próximo
 * nível (**Áureo**) e R$ 250.000 dá o **bônus do programa**. Por isso o
 * faturamento vem antes do pagamento, com o número grande e a barra.
 *
 * 🔴 **Com 0 contratados o número NÃO aparece.** "R$ 0 de R$ 150.000" com a
 * barra zerada é uma afirmação sobre o faturamento de gente real feita em
 * cima de campo vazio — a mesma armadilha do `coalesce(..., 0)` que virou
 * "taxa zero" por 5 semanas no sistema de disparos. Sem dado, a tela mostra o
 * CAMINHO (os dois marcos) e a instrução de como entrar nele.
 *
 * 🔑 Nada é recalculado aqui: `faltaParaMeta`, `faltaParaBonus`, `pctMeta` e
 * `nivelAtual` vêm de `ProgressoFaturamento` (servidor, `@/lib/financeiro`),
 * a mesma fonte da home. Duas contas = duas respostas para o mesmo aluno.
 *
 * ⚠️ O bônus é "**bônus do programa**", sem detalhe. O João não disse qual é;
 * inventar "R$ X de prêmio" seria promessa do portal, não do programa.
 */
export function HeroFaturamento({
  progresso,
  basePath,
}: {
  progresso: ProgressoFaturamento;
  /** "" para o aluno; "/admin/aluno/<id>" no modo assistência. */
  basePath: string;
}) {
  const {
    faturado,
    meta,
    bonus,
    faltaParaMeta,
    faltaParaBonus,
    pctMeta,
    nivelAtual,
    contratados,
    contratadosSemValor,
  } = progresso;

  const hrefClientes = `${basePath}/clientes`;
  const chegouNoAureo = nivelAtual === "aureo" || nivelAtual === "bonus";
  // Quantos contratados de fato somam para o número exibido. Dizer
  // "honorários de 4 clientes" quando 1 deles está sem valor atribuiria ao
  // número uma origem que ele não tem — e é justamente o cliente que o aviso
  // logo abaixo manda preencher.
  const comValor = Math.max(0, contratados - contratadosSemValor);

  const marcos = [
    { valor: meta, rotulo: "Áureo", atingido: chegouNoAureo },
    { valor: bonus, rotulo: "Bônus", atingido: nivelAtual === "bonus" },
  ];

  return (
    <Card className="ring-primary/20">
      <CardContent className="grid gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Seu faturamento na mentoria
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Honorários dos clientes que você já fechou.
            </p>
          </div>
          <IconeChip destaque={chegouNoAureo}>
            <Trophy />
          </IconeChip>
        </div>

        {faturado === null ? (
          /* ── SEM DADO ────────────────────────────────────────────────────
             Nem número nem barra. A tela mostra a régua do programa (os dois
             marcos são regra, não medição) e diz o que fazer para entrar
             nela. Dois textos diferentes: "não tem contratado" e "tem
             contratado sem valor" pedem ações diferentes. */
          <div className="grid gap-4">
            <p className="text-base text-pretty">
              {contratados === 0 ? (
                <>
                  Quando você marcar um cliente como{" "}
                  <span className="font-medium text-foreground">
                    Contratado
                  </span>{" "}
                  e informar os honorários, ele entra aqui.
                </>
              ) : (
                <>
                  {contratados}{" "}
                  {contratados === 1
                    ? "cliente contratado"
                    : "clientes contratados"}
                  , nenhum com honorários informados. Registre o valor na ficha
                  do cliente para acompanhar o seu faturamento.
                </>
              )}
            </p>

            <ul className="grid gap-2 rounded-lg bg-muted/60 p-3 text-sm">
              {marcos.map((m) => (
                <li key={m.rotulo} className="flex items-baseline gap-2">
                  <Flag
                    aria-hidden
                    className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground"
                  />
                  <span className="font-medium tabular-nums">
                    {brlInteiro(m.valor)}
                  </span>
                  <span className="text-muted-foreground">
                    {m.rotulo === "Áureo"
                      ? "· Áureo, o próximo nível"
                      : "· bônus do programa"}
                  </span>
                </li>
              ))}
            </ul>

            <Link
              href={hrefClientes}
              className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-accent-foreground underline-offset-4 hover:underline"
            >
              Ir para os meus clientes
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </div>
        ) : (
          /* ── COM DADO ───────────────────────────────────────────────────
             Hierarquia: número grande → comparação → barra → apoio. */
          <div className="grid gap-4">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span
                className="font-heading text-4xl leading-none font-semibold text-accent-foreground tabular-nums sm:text-5xl"
                title={brl(faturado)}
              >
                {brlInteiro(faturado)}
              </span>
              {chegouNoAureo ? (
                <Badge className="bg-accent text-accent-foreground">
                  <Trophy aria-hidden />
                  {nivelAtual === "bonus" ? "Bônus alcançado" : "Áureo"}
                </Badge>
              ) : (
                <span className="text-lg text-muted-foreground tabular-nums">
                  de {brlInteiro(meta)}
                </span>
              )}
            </div>

            <p className="text-base text-pretty">
              {nivelAtual === "bonus" ? (
                <>
                  Você passou dos {brlInteiro(bonus)} — bônus do programa.
                </>
              ) : nivelAtual === "aureo" ? (
                <>
                  Você chegou ao{" "}
                  <span className="font-medium">Áureo</span>! Faltam{" "}
                  <span
                    className="font-medium tabular-nums"
                    title={faltaParaBonus === null ? undefined : brl(faltaParaBonus)}
                  >
                    {faltaParaBonus === null ? "—" : brlInteiro(faltaParaBonus)}
                  </span>{" "}
                  para o bônus do programa.
                </>
              ) : (
                <>
                  Faltam{" "}
                  <span
                    className="font-medium tabular-nums"
                    title={faltaParaMeta === null ? undefined : brl(faltaParaMeta)}
                  >
                    {faltaParaMeta === null ? "—" : brlInteiro(faltaParaMeta)}
                  </span>{" "}
                  para o Áureo.
                </>
              )}
            </p>

            <BarraMarcos
              valor={faturado}
              max={bonus}
              marcos={marcos}
              rotuloAcessivel="Faturamento na mentoria"
              textoAcessivel={
                nivelAtual === "bonus"
                  ? `${brlInteiro(faturado)}; Áureo e bônus do programa alcançados.`
                  : nivelAtual === "aureo"
                    ? `${brlInteiro(faturado)}; Áureo alcançado, bônus do programa em ${brlInteiro(bonus)}.`
                    : `${brlInteiro(faturado)} de ${brlInteiro(meta)} até o Áureo; bônus do programa em ${brlInteiro(bonus)}.`
              }
            />

            <p className="text-xs text-muted-foreground">
              {/* "100% da meta" ao lado de "Você chegou ao Áureo!" é a mesma
                  informação duas vezes — e o teto de 100 faria 260 mil ler
                  como 100%, igual a 150 mil. No Áureo o percentual sai. */}
              {chegouNoAureo || pctMeta === null ? null : <>{pctMeta}% da meta · </>}
              honorários de {comValor}{" "}
              {comValor === 1 ? "cliente contratado" : "clientes contratados"}
            </p>
          </div>
        )}

        {contratadosSemValor > 0 ? (
          <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800">
            <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              {contratadosSemValor}{" "}
              {contratadosSemValor === 1
                ? "cliente contratado ainda sem honorários informados"
                : "clientes contratados ainda sem honorários informados"}
              . Sem o valor, esse faturamento não entra na conta.{" "}
              <Link
                href={hrefClientes}
                className="font-medium underline underline-offset-4"
              >
                Informar agora
              </Link>
            </span>
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
