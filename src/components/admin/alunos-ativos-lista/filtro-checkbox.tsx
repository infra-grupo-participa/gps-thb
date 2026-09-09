"use client";

import { Checkbox } from "@/components/ui/checkbox";

/** Um filtro da barra: só aparece quando há alguém para filtrar. */
export function FiltroCheckbox({
  rotulo,
  total,
  marcado,
  onChange,
}: {
  rotulo: string;
  total: number;
  marcado: boolean;
  onChange: (v: boolean) => void;
}) {
  if (total === 0) return null;
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
      <Checkbox
        checked={marcado}
        onCheckedChange={(v) => onChange(Boolean(v))}
        aria-label={`${rotulo} (${total})`}
      />
      <span className="font-normal leading-none">
        {rotulo} ({total})
      </span>
    </label>
  );
}
