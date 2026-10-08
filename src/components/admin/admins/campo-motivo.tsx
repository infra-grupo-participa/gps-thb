"use client";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MOTIVO_ADMIN_MAX, MOTIVO_ADMIN_MIN } from "@/lib/admins-tipos";

/** `true` quando o motivo cabe nos limites da RPC (3..300, sem contar bordas). */
export function motivoValido(motivo: string): boolean {
  const n = motivo.trim().length;
  return n >= MOTIVO_ADMIN_MIN && n <= MOTIVO_ADMIN_MAX;
}

/**
 * Motivo obrigatório com contador — o mesmo campo no "Adicionar" e no
 * diálogo de remover. O contador diz o mínimo enquanto falta, e o total
 * depois; `maxLength` impede passar do teto.
 */
export function CampoMotivo({
  id,
  valor,
  onChange,
  placeholder,
}: {
  id: string;
  valor: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const n = valor.trim().length;
  const curto = n > 0 && n < MOTIVO_ADMIN_MIN;
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>Motivo</Label>
      <Input
        id={id}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        maxLength={MOTIVO_ADMIN_MAX}
        placeholder={placeholder}
        aria-invalid={curto || undefined}
        aria-describedby={`${id}-contador`}
        autoComplete="off"
      />
      <p id={`${id}-contador`} className="corpo-sm text-muted-foreground">
        {n < MOTIVO_ADMIN_MIN
          ? `Obrigatório, mínimo de ${MOTIVO_ADMIN_MIN} caracteres.`
          : `${n}/${MOTIVO_ADMIN_MAX}`}
      </p>
    </div>
  );
}
