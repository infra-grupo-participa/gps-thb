import type { VozNota, TipoNota, OrigemNota } from "@/lib/types";

/** Rótulos em português (com acentuação) dos enums do diário do aluno. */
export const ROTULO_VOZ: Record<VozNota, string> = {
  equipe: "Equipe",
  aluno: "Aluno",
};

export const ROTULO_TIPO: Record<TipoNota, string> = {
  observacao: "Observação",
  duvida: "Dúvida",
  combinado: "Combinado",
  pendencia: "Pendência",
};

export const ROTULO_ORIGEM: Record<OrigemNota, string> = {
  reuniao: "Reunião",
  email: "E-mail",
  whatsapp: "WhatsApp",
  plataforma: "Plataforma",
  planilha: "Planilha",
};

/** Variante do Badge (ver `src/components/ui/badge.tsx`) por tipo de nota. */
export function variantePorTipo(
  tipo: TipoNota,
  resolvida: boolean,
): "default" | "secondary" | "destructive" | "outline" {
  if (tipo === "pendencia") return resolvida ? "secondary" : "destructive";
  return "outline";
}

export function formatarDataHora(iso: string): string {
  // `DiarioTimeline`/`DiarioResumoCard` são Server Components: sem
  // `timeZone`, o horário sai no fuso do processo Node (Hostinger), não no
  // do usuário — mesma lição de `src/lib/plantao.ts`.
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  });
}
