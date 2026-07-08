"use client";

import type { TarefaDef } from "@/lib/etapa1";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

export function TarefaItem({
  tarefa: t,
  concluida,
  pending,
  onToggle,
}: {
  tarefa: TarefaDef;
  concluida: boolean;
  pending: boolean;
  onToggle: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50">
      <Checkbox
        checked={concluida}
        disabled={t.automatica || pending}
        onCheckedChange={(v) => onToggle(Boolean(v))}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={
              "text-sm font-medium " +
              (concluida ? "text-muted-foreground line-through" : "")
            }
          >
            {t.num}. {t.titulo}
          </span>
          {t.automatica ? (
            <Badge variant="outline" className="text-[10px]">
              automática
            </Badge>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">{t.descricao}</p>

        {t.info ? (
          <p className="mt-1 text-xs font-medium text-primary">{t.info}</p>
        ) : null}

        {t.tutorialUrl || t.modelo ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-3">
            {t.tutorialUrl ? (
              <a
                href={t.tutorialUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                ▶ Ver tutorial
              </a>
            ) : null}
            {t.modelo ? (
              t.modelo.url ? (
                <a
                  href={t.modelo.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  ⬇ Modelo: {t.modelo.nome}
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Modelo: {t.modelo.nome}
                </span>
              )
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
