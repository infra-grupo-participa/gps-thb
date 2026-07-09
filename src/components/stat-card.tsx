import { Card, CardContent } from "@/components/ui/card";

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
    <Card className="transition hover:shadow-sm">
      <CardContent className="pt-5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span
            className={
              "flex size-8 shrink-0 items-center justify-center rounded-lg " +
              (destaque
                ? "bg-primary text-primary-foreground"
                : "bg-primary/10 text-primary")
            }
          >
            {icon}
          </span>
        </div>
        <div
          className={
            "mt-2 text-2xl font-semibold " + (destaque ? "text-primary" : "")
          }
        >
          {value}
        </div>
        {hint ? (
          <div className="text-xs text-muted-foreground">{hint}</div>
        ) : null}
      </CardContent>
    </Card>
  );
}
