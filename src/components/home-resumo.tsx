import { TrendingUp, Users, CalendarCheck, Coins } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

/**
 * Painel de resumo do aluno — consolida progresso e números-chave num único
 * container (em vez de vários cards soltos), para servir de coluna de apoio.
 */
export function HomeResumo({
  progressoGeral,
  clientes,
  agendados,
  perdaTotal,
}: {
  progressoGeral: number;
  clientes: number;
  agendados: number;
  perdaTotal: number;
}) {
  return (
    <Card>
      <CardContent className="grid gap-4 pt-6">
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 font-medium">
              <TrendingUp className="size-4 text-primary" />
              Progresso geral
            </span>
            <span className="font-semibold text-primary">{progressoGeral}%</span>
          </div>
          <Progress value={progressoGeral} className="mt-2" />
          <p className="mt-1 text-xs text-muted-foreground">média das 6 etapas</p>
        </div>

        <Separator />

        <Linha
          icon={<Users className="size-4" />}
          label="Clientes"
          valor={`${clientes}/30`}
          hint="da sua lista"
        />
        <Linha
          icon={<CalendarCheck className="size-4" />}
          label="Reuniões agendadas"
          valor={`${agendados}/15`}
          hint="meta de 15"
        />
        <Linha
          icon={<Coins className="size-4" />}
          label="Perda pela inércia"
          valor={brl.format(perdaTotal)}
          hint="soma dos clientes"
        />
      </CardContent>
    </Card>
  );
}

function Linha({
  icon,
  label,
  valor,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  valor: string;
  hint: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{hint}</div>
      </div>
      <div className="shrink-0 text-lg font-semibold tabular-nums">{valor}</div>
    </div>
  );
}
