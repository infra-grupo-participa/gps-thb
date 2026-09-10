import Link from "next/link";
import { ArrowRight, Flag, Trophy } from "lucide-react";
import { AvisoInline } from "@/components/ui/aviso-inline";
import { Badge } from "@/components/ui/badge";
import { BarraMarcos } from "@/components/ui/barra-marcos";
import { Card, CardContent } from "@/components/ui/card";
import { IconeChip } from "@/components/ui/kpi-card";
import { Secao } from "@/components/ui/secao";
import { brl, brlInteiro } from "@/lib/moeda";
import type { ProgressoFaturamento } from "@/lib/financeiro";

/**
 * A peça FORTE da aba Financeiro: **quanto o aluno já faturou na mentoria**.
 *
 * A aba abre com o progresso dele, não com o que ele deve. R$ 150.000 em
 * honorários contratados é o **AURUM** (ouro em latim) — o objetivo do
 * programa. Uma meta, um número, uma barra: é a tela inteira em três linhas.
 *
 * 🔴 **Com 0 contratados o número NÃO aparece.** "R$ 0 de R$ 150.000" com a
 * barra zerada é uma afirmação sobre o faturamento de gente real feita em
 * cima de campo vazio — a mesma armadilha do `coalesce(..., 0)` que virou
 * "taxa zero" por 5 semanas no sistema de disparos. Sem dado, a tela mostra a
 * meta e a instrução de como entrar nela.
 *
 * 🔑 Nada é recalculado aqui: `faltaParaMeta`, `pctMeta` e `nivelAtual` vêm de
 * `ProgressoFaturamento` (servidor, `@/lib/financeiro`), a mesma fonte da
 * home. Duas contas = duas respostas para o mesmo aluno.
 *
 * ⚠️ O segundo marco (R$ 250.000, "bônus do programa") **saiu da interface**
 * em 09/09/2026, a pedido do João: ninguém sabia dizer o que era o bônus, e
 * uma segunda meta atrás da primeira empurrava o objetivo para longe em vez de
 * aproximá-lo. Não reintroduzir sem ele definir o que é.
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
    faltaParaMeta,
    pctMeta,
    nivelAtual,
    contratados,
    contratadosSemValor,
  } = progresso;

  const hrefClientes = `${basePath}/clientes`;
  const chegouNoAurum = nivelAtual === "aureo";
  // Quantos contratados de fato somam para o número exibido. Dizer
  // "honorários de 4 clientes" quando 1 deles está sem valor atribuiria ao
  // número uma origem que ele não tem — e é justamente o cliente que o aviso
  // logo abaixo manda preencher.
  const comValor = Math.max(0, contratados - contratadosSemValor);

  // Um marco só, no fim da trilha: o AURUM.
  const marcos = [{ valor: meta, rotulo: "AURUM", atingido: chegouNoAurum }];

  return (
    <Card className="ring-primary/20">
      <CardContent className="grid gap-4">
        {/* `Secao`, não o `uppercase tracking-wide` que a Onda A tirou de 15
            telas: rótulo tracked-out acima de tudo é o tell mais conhecido de
            UI gerada. O troféu continua à direita (`acao`), e continua sendo
            o `IconeChip` — é ele que acende em `marca-solida` no AURUM. */}
        <Secao
          titulo={faturado === null ? "Seu faturamento" : "Você já faturou"}
          descricao="Honorários dos clientes que você fechou no programa."
          acao={
            <IconeChip destaque={chegouNoAurum}>
              <Trophy />
            </IconeChip>
          }
        />

        {faturado === null ? (
          /* ── SEM DADO ────────────────────────────────────────────────────
             Nem número nem barra. A tela mostra a meta (que é regra, não
             medição) e diz o que fazer para entrar nela. Dois textos
             diferentes: "não tem contratado" e "tem contratado sem valor"
             pedem ações diferentes. */
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

            <p className="flex items-baseline gap-2 rounded-lg bg-muted/60 p-3 text-sm">
              <Flag
                aria-hidden
                className="size-3.5 shrink-0 translate-y-0.5 text-muted-foreground"
              />
              <span className="font-medium tabular-nums">
                {brlInteiro(meta)}
              </span>
              <span className="text-muted-foreground">
                · o AURUM, a meta do programa
              </span>
            </p>

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
              {chegouNoAurum ? (
                <Badge className="bg-accent text-accent-foreground">
                  <Trophy aria-hidden />
                  AURUM
                </Badge>
              ) : (
                <span className="text-lg text-muted-foreground tabular-nums">
                  de {brlInteiro(meta)}
                </span>
              )}
            </div>

            <p className="text-base text-pretty">
              {chegouNoAurum ? (
                <>
                  Você chegou ao{" "}
                  <span className="font-medium">AURUM</span>. Meta de{" "}
                  {brlInteiro(meta)} alcançada.
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
                  para o AURUM.
                </>
              )}
            </p>

            <BarraMarcos
              valor={faturado}
              max={meta}
              marcos={marcos}
              rotuloAcessivel="Faturamento na mentoria"
              textoAcessivel={
                chegouNoAurum
                  ? `${brlInteiro(faturado)}; AURUM alcançado.`
                  : `${brlInteiro(faturado)} de ${brlInteiro(meta)} até o AURUM.`
              }
            />

            <p className="text-xs text-muted-foreground">
              {/* "100% da meta" ao lado de "Você chegou ao AURUM" é a mesma
                  informação duas vezes — e o teto de 100 faria 260 mil ler
                  como 100%, igual a 150 mil. No AURUM o percentual sai. */}
              {chegouNoAurum || pctMeta === null ? null : (
                <>{pctMeta}% da meta · </>
              )}
              honorários de {comValor}{" "}
              {comValor === 1 ? "cliente contratado" : "clientes contratados"}
            </p>
          </div>
        )}

        {contratadosSemValor > 0 ? (
          <AvisoInline>
            {contratadosSemValor}{" "}
            {contratadosSemValor === 1
              ? "cliente contratado ainda sem honorários informados"
              : "clientes contratados ainda sem honorários informados"}
            . Sem o valor, esse faturamento não entra na conta.{" "}
            <Link
              href={hrefClientes}
              className="foco-visivel rounded-xs font-medium underline underline-offset-4"
            >
              Informar agora
            </Link>
          </AvisoInline>
        ) : null}
      </CardContent>
    </Card>
  );
}
