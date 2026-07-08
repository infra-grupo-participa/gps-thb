import type { Aluno } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export function AssistBanner({ aluno }: { aluno: Aluno | null }) {
  return (
    <div className="border-b bg-primary/5">
      <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2 text-sm">
        <Badge variant="secondary">Modo assistência</Badge>
        <span className="text-muted-foreground">
          Você está no ambiente de{" "}
          <span className="font-medium text-foreground">
            {aluno?.nome ?? "aluno"}
          </span>
          . Alterações são salvas na conta do aluno.
        </span>
      </div>
    </div>
  );
}
