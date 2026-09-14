"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Copia o contato de um parceiro — e-mail, telefone, ou os dois com o nome.
 *
 * Pedido do Marcio (14/09/2026): *"queria também poder copiar os dados da
 * lista de alunos na área de parceiros, tipo telefone, email e etc"*.
 *
 * 🔑 ZERO CONSULTA NOVA: `nome`, `email` e `telefone` já vêm no payload de
 * `gps.admin_painel_alunos` (o `select` de `thb_alunos` em
 * `src/lib/data/alunos.ts` sempre trouxe os três). O card só não os exibia.
 *
 * 🔑 É `<button>` DENTRO do card, que é um `<Link>`. Por isso o
 * `stopPropagation` + `preventDefault`: sem eles, copiar também navegaria
 * para o ambiente do aluno. Âncora dentro de âncora é HTML inválido — este é
 * botão, não link, e o alvo de clique do card continua sendo o card.
 *
 * O rótulo é o PRÓPRIO VALOR (o e-mail, o telefone), não a palavra "Copiar":
 * quem varre a lista está procurando o dado, e ele precisa estar legível sem
 * depender de hover.
 */
export function CopiarContato({
  valor,
  rotuloAcessivel,
  className,
  formatar,
}: {
  /** O que vai para a área de transferência. `null`/vazio → não renderiza. */
  valor: string | null | undefined;
  /** Para o leitor de tela: "Copiar e-mail de Fulano". */
  rotuloAcessivel: string;
  className?: string;
  /** Como exibir (o valor copiado continua sendo `valor` cru). */
  formatar?: (v: string) => string;
}) {
  const [copiado, setCopiado] = useState(false);
  const limpo = valor?.trim();
  if (!limpo) return null;

  return (
    <button
      type="button"
      title={`${rotuloAcessivel} — clique para copiar`}
      aria-label={rotuloAcessivel}
      onClick={(e) => {
        // O card inteiro é um link; copiar não pode navegar junto.
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(limpo).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 1400);
        });
      }}
      className={cn(
        "foco-visivel group/copiar inline-flex min-w-0 max-w-full items-center gap-1 rounded-sm text-left",
        "hover:text-accent-foreground",
        copiado && "text-sucesso-foreground",
        className,
      )}
    >
      <span className="truncate">{formatar ? formatar(limpo) : limpo}</span>
      {copiado ? (
        <Check aria-hidden className="size-3 shrink-0" />
      ) : (
        <Copy
          aria-hidden
          className="size-3 shrink-0 opacity-0 transition-opacity group-hover/copiar:opacity-60"
        />
      )}
    </button>
  );
}
