import { soDigitos } from "@/lib/masks";

/**
 * Monta o link do WhatsApp (wa.me) a partir de um telefone brasileiro.
 * Garante o DDI 55 quando o número tem 10 ou 11 dígitos.
 */
export function linkWhatsapp(
  telefone: string | null | undefined,
  mensagem?: string,
): string | null {
  const d = soDigitos(telefone ?? "");
  if (!d) return null;
  const comDDI = d.length === 10 || d.length === 11 ? `55${d}` : d;
  const base = `https://wa.me/${comDDI}`;
  return mensagem ? `${base}?text=${encodeURIComponent(mensagem)}` : base;
}
