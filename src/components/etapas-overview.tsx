import Link from "next/link";
import { ArrowRight, Lock } from "lucide-react";
import type { Etapa } from "@/lib/types";
import { conteudoEtapa, type OverridesLiberacao } from "@/lib/etapas";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { IconeChip } from "@/components/ui/kpi-card";
import { cn } from "@/lib/utils";

/**
 * Quantos passos da etapa estão concluídos, a partir do percentual.
 *
 * 🔑 Não é estimativa: `pctPorEtapa` calcula `round(feitas / total * 100)`, e
 * inverter dá `round(pct * total / 100)`. O erro máximo do arredondamento é
 * `0,005 × total` — com a maior etapa do programa em 26 tarefas, isso é 0,13,
 * longe do 0,5 que trocaria de inteiro. Conferido tarefa a tarefa nas seis
 * etapas (9, 5, 13, 3, 26 e 2 tarefas): bate em 100% dos casos.
 *
 * Existe porque "0%" numa barra vazia parece ausência de dado; "0 de 9 passos"
 * é informação. Se um dia `pctPorEtapa` deixar de arredondar assim, esta conta
 * tem de sair junto — por isso ela mora ao lado de quem a exibe, e não vira
 * regra escondida em `src/lib`.
 */
function passosDaEtapa(etapaId: number, pct: number) {
  const total = conteudoEtapa(etapaId)?.tarefas.length ?? 0;
  if (total === 0) return null;
  return { feitas: Math.round((pct * total) / 100), total };
}

/**
 * Visão geral das 6 etapas. Etapas liberadas são clicáveis; as bloqueadas
 * aparecem como "Em breve" (ou clicáveis para preview, no modo admin).
 *
 * 🔑 `overrides` (`gps.etapa_liberacao_aluno`) NÃO decide o que abre — `etapas`
 * já chega com `liberada` resolvida por `etapasComLiberacaoDoAluno`. Ele serve
 * só para a tela DIZER A VERDADE sobre o motivo: a etapa travada só para este
 * aluno aparecia como "Em breve · Libera conforme sua turma avança", quando na
 * verdade a equipe a travou e escreveu um motivo (obrigatório, 3..300, na
 * Central de resolução) que nunca chegava a ele.
 */
export function EtapasOverview({
  etapas,
  basePath,
  pctPorEtapa = {},
  overrides = {},
  allowLockedPreview = false,
  dense = false,
}: {
  etapas: Etapa[];
  /** "" para aluno; "/admin/aluno/<id>" para admin. */
  basePath: string;
  pctPorEtapa?: Record<number, number>;
  /**
   * O que a EQUIPE decidiu para este ambiente, por etapa
   * (`getEtapasLiberadasPara`). Opcional: sem ele o card volta a ser o de
   * antes, sem inventar explicação nenhuma.
   */
  overrides?: OverridesLiberacao;
  allowLockedPreview?: boolean;
  /** Layout compacto (2 colunas) para caber dentro de uma coluna de conteúdo. */
  dense?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid gap-4",
        dense ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3",
      )}
    >
      {etapas.map((etapa) => {
        const liberada = etapa.liberada;
        const override = overrides[etapa.id];
        // Travada SÓ PARA ELE: não é a turma, é a equipe — e há motivo escrito.
        const travadaPelaEquipe = override?.liberada === false;
        // Liberada só para ele. Não se consulta o interruptor global aqui (o
        // card recebe a liberação já resolvida): a linha de override só existe
        // porque alguém da equipe a criou para este ambiente, então a frase é
        // verdadeira nos dois casos.
        const liberadaPelaEquipe = override?.liberada === true;
        const clicavel = liberada || allowLockedPreview;
        const href = `${basePath}/etapa/${etapa.id}`;
        // A barra aparece SEMPRE na etapa liberada (era só com `pct != null`):
        // 0% é informação, não ausência — e a etapa liberada sem barra ficava
        // indistinguível de uma bloqueada num muro de seis cards iguais.
        const pct = liberada ? (pctPorEtapa[etapa.id] ?? 0) : null;
        const passos = pct === null ? null : passosDaEtapa(etapa.id, pct);

        const conteudo = (
          // VIS3: a etapa bloqueada NÃO recebe `opacity-70` no card inteiro —
          // isso derrubava junto o contraste do título, do badge e da
          // descrição. O estado é dito por FORMA (borda tracejada, superfície
          // afundada, chip neutro), que não custa contraste nenhum.
          <Card
            elevacao={liberada ? "raised" : "flat"}
            interativo={clicavel}
            className={cn(
              "h-full",
              !liberada && "border-dashed bg-superficie-afundada",
            )}
          >
            <CardContent className="flex h-full flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <IconeChip
                  destaque={liberada}
                  // O número da etapa é conteúdo: não aparece em nenhum outro
                  // lugar do card, então não pode ser `aria-hidden`.
                  decorativo={false}
                  className={cn(
                    "font-heading text-sm font-semibold",
                    !liberada && "bg-neutro text-neutro-foreground",
                  )}
                >
                  {etapa.ordem}
                </IconeChip>
                {travadaPelaEquipe ? (
                  // `warning`, não `neutral`: "Em breve" é espera normal;
                  // isto é uma decisão tomada sobre ESTE aluno, e ele precisa
                  // distinguir as duas num muro de 6 cards iguais.
                  <Badge variant="warning" icone={Lock}>
                    Travada pela equipe
                  </Badge>
                ) : liberada ? (
                  // Era `secondary` — o MESMO cinza de "sem login" e de "2
                  // pessoas". A etapa liberada é a única coisa acionável de um
                  // muro de 6 cards; agora ela se acha em um segundo.
                  <Badge variant="success">
                    {liberadaPelaEquipe ? "Liberada para você" : "Disponível"}
                  </Badge>
                ) : (
                  <Badge variant="neutral">Em breve</Badge>
                )}
              </div>

              <div className="flex-1">
                <h3 className="font-heading text-sm leading-tight font-semibold">
                  {etapa.nome}
                </h3>
                {etapa.descricao ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {etapa.descricao}
                  </p>
                ) : null}
              </div>

              {pct !== null ? (
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      {passos
                        ? `${passos.feitas} de ${passos.total} passos`
                        : "Progresso"}
                    </span>
                    <span className="numero font-semibold text-accent-foreground">
                      {pct}%
                    </span>
                  </div>
                  <Progress value={pct} />
                </div>
              ) : null}

              {/* O motivo que a Central OBRIGA a equipe a escrever aparece
                  aqui — antes ele morria no banco. Fica acima do "Abrir →"
                  porque na prévia do admin a etapa travada continua clicável. */}
              {travadaPelaEquipe || liberadaPelaEquipe ? (
                <p className="text-xs text-muted-foreground">
                  {liberadaPelaEquipe ? "Liberada para você pela equipe." : null}
                  {liberadaPelaEquipe && override?.motivo ? " " : null}
                  {override?.motivo ??
                    (travadaPelaEquipe
                      ? "A equipe travou esta etapa para você."
                      : null)}
                </p>
              ) : null}

              {clicavel ? (
                <div className="flex items-center gap-1 text-xs font-medium text-accent-foreground">
                  Abrir <ArrowRight className="size-3" aria-hidden />
                </div>
              ) : travadaPelaEquipe ? null : (
                // Microcopy de expectativa VERDADEIRA: `gps.etapas` não tem
                // campo de previsão, então não existe data a prometer. Ocupa
                // o mesmo lugar do "Abrir →" para os cards ficarem alinhados.
                <p className="text-xs text-muted-foreground">
                  Libera conforme sua turma avança
                </p>
              )}
            </CardContent>
          </Card>
        );

        return clicavel ? (
          <Link
            key={etapa.id}
            href={href}
            className="foco-visivel block rounded-xl"
          >
            {conteudo}
          </Link>
        ) : (
          // Não é clicável e não recebe foco: `aria-disabled` diz ao leitor de
          // tela o que a borda tracejada diz ao olho.
          <div key={etapa.id} aria-disabled="true">
            {conteudo}
          </div>
        );
      })}
    </div>
  );
}
