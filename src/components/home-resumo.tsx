import { TrendingUp, Users, CalendarCheck, Coins } from "lucide-react";
import type { ResumoHonorarios } from "@/lib/etapa1";
import { MetaHonorarios } from "@/components/etapa1/meta-honorarios";
import { Card, CardContent } from "@/components/ui/card";
import { KpiLinha } from "@/components/ui/kpi-card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * Painel de resumo do aluno — consolida progresso e números-chave num único
 * container (em vez de vários cards soltos), para servir de coluna de apoio.
 *
 * As linhas vêm de `KpiLinha` (`ui/kpi-card`): o "chip de ícone" que existia
 * aqui era a 4ª cópia do mesmo bloco no projeto (VIS2). O `pt-6` que estava no
 * `CardContent` somava ao padding do `Card` e saiu (VIS1).
 */
export function HomeResumo({
  progressoGeral,
  clientes,
  agendados,
  perdaTotal,
  honorarios,
}: {
  progressoGeral: number;
  clientes: number;
  agendados: number;
  perdaTotal: number;
  /** Meta de faturamento do ambiente (B8) — calculada em `resumoHonorarios`. */
  honorarios: ResumoHonorarios;
}) {
  return (
    <Card>
      <CardContent className="grid gap-4">
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <TrendingUp className="size-4 text-primary" aria-hidden />
              Progresso geral
            </span>
            <span className="font-semibold text-primary">{progressoGeral}%</span>
          </div>
          <Progress value={progressoGeral} className="mt-2" />
          <p className="mt-1 text-xs text-muted-foreground">média das 6 etapas</p>
        </div>

        {/* Faturamento logo abaixo do progresso: são as duas leituras de
            "onde eu estou" — uma do programa, outra do dinheiro. */}
        <MetaHonorarios resumo={honorarios} />

        <Separator />

        <KpiLinha
          icone={<Users />}
          rotulo="Clientes"
          valor={`${clientes}/30`}
          hint="da sua lista"
        />
        <KpiLinha
          icone={<CalendarCheck />}
          rotulo="Reuniões agendadas"
          valor={`${agendados}/15`}
          hint="meta de 15"
        />
        <KpiLinha
          icone={<Coins />}
          rotulo="Perda pela inércia"
          valor={brl.format(perdaTotal)}
          hint="soma dos clientes"
        />
      </CardContent>
    </Card>
  );
}
