/**
 * `StatCard` é a assinatura antiga (icon/label/value) de `KpiCard`.
 * Reexport fino para `src/app/admin/page.tsx` seguir compilando enquanto a
 * página não migra para `KpiCard` (Onda 2).
 *
 * O `pt-5` que existia colado no `CardContent` somava ao `py-(--card-spacing)`
 * que o `Card` já paga — era a origem de cards com topos de 16, 36 e 40 px na
 * mesma tela (VIS1). Não existe mais: o padding é só o do `Card`.
 */
import { KpiCard } from "@/components/ui/kpi-card";

export function StatCard({
  icon,
  label,
  value,
  hint,
  destaque,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  destaque?: boolean;
}) {
  return (
    <KpiCard
      icone={icon}
      rotulo={label}
      valor={value}
      hint={hint}
      destaque={destaque}
    />
  );
}
