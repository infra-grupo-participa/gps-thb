import { Info, LogIn, History } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatarDataHora } from "@/lib/datas";

/**
 * Cabeçalho da trilha: primeiro e último acesso do aluno ao portal.
 *
 * Último acesso é ESTADO (o que vale AGORA, via `gps.admin_status_acesso`),
 * não um evento gravado — por isso mora só aqui, nunca como linha na trilha
 * (ver `getMarcosDeAcesso`, `src/lib/data.ts`). Primeiro acesso, ao
 * contrário, É um evento (`tipo='primeiro_acesso'`) e aparece tanto aqui
 * quanto como linha solta na trilha (marcos nunca agregam) — não há
 * duplicação de dado, só duas visões do mesmo fato.
 */
export function TrilhaCabecalho({
  primeiroAcesso,
  ultimoAcesso,
}: {
  primeiroAcesso: string | null;
  ultimoAcesso: string | null;
}) {
  return (
    <Card>
      <CardContent className="grid gap-3 py-4 sm:grid-cols-2">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <LogIn className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="rotulo text-muted-foreground">
              Primeiro acesso
            </div>
            <div className="text-sm">
              {primeiroAcesso ? (
                formatarDataHora(primeiroAcesso)
              ) : (
                <span className="font-medium text-destructive">
                  Nunca acessou
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <History className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="rotulo text-muted-foreground">
              Último acesso
            </div>
            <div className="text-sm">
              {ultimoAcesso ? (
                formatarDataHora(ultimoAcesso)
              ) : (
                <span className="font-medium text-destructive">
                  Nunca acessou
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 sm:col-span-2">
          <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">
            Registramos o primeiro e o último acesso; os intermediários não
            são guardados.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
