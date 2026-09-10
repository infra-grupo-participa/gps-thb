import { TrendingUp, Users, CalendarCheck } from "lucide-react";
import {
  META_CLIENTES,
  META_REUNIOES,
  type ResumoHonorarios,
} from "@/lib/etapa1";
import { MetaHonorarios } from "@/components/etapa1/meta-honorarios";
import { Card, CardContent } from "@/components/ui/card";
import { KpiLinha } from "@/components/ui/kpi-card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

/**
 * Painel de resumo do aluno — consolida progresso e números-chave num único
 * container (em vez de vários cards soltos), para servir de coluna de apoio.
 *
 * As linhas vêm de `KpiLinha` (`ui/kpi-card`): o "chip de ícone" que existia
 * aqui era a 4ª cópia do mesmo bloco no projeto (VIS2). O `pt-6` que estava no
 * `CardContent` somava ao padding do `Card` e saiu (VIS1).
 *
 * 🎨 Onda B (B5): as três linhas viram grade — 2 colunas onde o card ocupa a
 * largura da página (celular e tablet, depois da subida do painel para o topo)
 * e 1 coluna na barra lateral do desktop, que tem 350 px.
 *
 * ⚠️ O KPI "Perda pela inércia" (soma de `perda_inercia` dos clientes) SAIU
 * daqui por decisão do Marcio (10/09/2026) — o conceito saiu do sistema por
 * inteiro. A fileira de KPIs ficou com dois cards em vez de três; não
 * substituir por outro número.
 */
export function HomeResumo({
  progressoGeral,
  etapasLiberadas,
  totalEtapas,
  clientes,
  clientesComDados,
  agendados,
  honorarios,
}: {
  progressoGeral: number;
  /**
   * Quantas etapas estão liberadas para este aluno e quantas o programa tem.
   *
   * 🔑 A média é das etapas LIBERADAS (decisão de produto de 09/09/2026).
   * Dividir por 6 fazia a Etapa 01 inteira aparecer como 17% — o aluno que
   * terminou tudo o que podia fazer lia "quase nada feito". O rótulo diz a
   * régua na cara: "Progresso nas etapas liberadas · 1 de 6".
   */
  etapasLiberadas: number;
  totalEtapas: number;
  /** `preenchidos`: clientes com nome. É a lista, não o que a tarefa 1 cobra. */
  clientes: number;
  /**
   * PL3 — `comDados`: nome + telefone, que é o que a tarefa 1 da Etapa 01
   * exige (o nível de relacionamento fazia parte desta conta até 10/09/2026
   * — saiu do sistema por decisão do Marcio). Quando presente, é ELE que
   * vira o número do KPI e `clientes` cai para o detalhe — senão o aluno lê
   * "30/30" com o passo 2 travado.
   *
   * Opcional porque `src/app/page.tsx` ainda passa só `preenchidos`; sem o
   * valor, o card fica exatamente como estava (nada é inventado).
   */
  clientesComDados?: number;
  agendados: number;
  /** Meta de faturamento do ambiente (B8) — calculada em `resumoHonorarios`. */
  honorarios: ResumoHonorarios;
}) {
  return (
    <Card elevacao="raised">
      <CardContent className="grid gap-4">
        <div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <TrendingUp className="size-4 text-primary" aria-hidden />
              Progresso nas etapas liberadas
            </span>
            <span className="numero text-xl font-semibold text-accent-foreground">
              {progressoGeral}%
            </span>
          </div>
          <Progress value={progressoGeral} className="mt-2" />
          <p className="mt-1.5 corpo-sm text-muted-foreground">
            {etapasLiberadas} de {totalEtapas} etapas
          </p>
        </div>

        {/* Faturamento logo abaixo do progresso: são as duas leituras de
            "onde eu estou" — uma do programa, outra do dinheiro. */}
        <MetaHonorarios resumo={honorarios} />

        <Separator />

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          <KpiLinha
            icone={<Users />}
            rotulo="Clientes"
            // As metas vêm de `src/lib/etapa1.ts` — "/30" e "/15" escritos à
            // mão faziam a home mentir no dia em que a meta mudasse, e ela é
            // a MESMA da Etapa 01 e da aba Clientes.
            valor={
              clientesComDados == null
                ? `${clientes}/${META_CLIENTES}`
                : `${clientesComDados}/${META_CLIENTES}`
            }
            hint={
              clientesComDados == null
                ? "da sua lista"
                : `${clientes} listados · ${clientesComDados} com nome e telefone`
            }
          />
          <KpiLinha
            icone={<CalendarCheck />}
            rotulo="Reuniões agendadas"
            valor={`${agendados}/${META_REUNIOES}`}
            hint={`meta de ${META_REUNIOES}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}
