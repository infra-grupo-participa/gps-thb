"use client";

/**
 * O campo Categoria — PRIMEIRO campo do formulário (decisão do briefing
 * 11/09/2026): a categoria decide o resto do formulário, então tem que vir
 * antes de qualquer outro campo, não depois.
 */

import {
  CATEGORIAS_CHAMADO,
  ROTULO_CATEGORIA_CHAMADO,
  type CategoriaChamado,
} from "@/lib/chamados-tipos";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CampoCategoria({
  id,
  valor,
  onChange,
  desabilitado,
}: {
  id: string;
  valor: CategoriaChamado;
  onChange: (v: CategoriaChamado) => void;
  desabilitado?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Categoria</Label>
      <Select
        value={valor}
        onValueChange={(v) => v && onChange(v as CategoriaChamado)}
        disabled={desabilitado}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue>
            {(v: CategoriaChamado) => ROTULO_CATEGORIA_CHAMADO[v]}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {CATEGORIAS_CHAMADO.map((c) => (
            <SelectItem key={c} value={c}>
              {ROTULO_CATEGORIA_CHAMADO[c]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
