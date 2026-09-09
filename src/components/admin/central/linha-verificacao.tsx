import { Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EstadoLinha } from "./catalogo";

/**
 * Uma linha do checklist da Central.
 *
 * 🔑 O estado é dito por **forma e por texto**, nunca só por cor: cada um dos
 * quatro tem um ícone diferente (o `Badge` já traz o seu) e a palavra escrita
 * ao lado. Cor sozinha reprova a WCAG 1.4.1 e, aqui, seria a diferença entre
 * "resolva agora" e "só para você saber".
 *
 * `informacao` (`ok: null` no servidor) **não é verde nem vermelho**: é fato
 * sem juízo — "nunca entrou no portal" não é falha do ambiente, é dado.
 */
const APRESENTACAO: Record<
  EstadoLinha,
  {
    palavra: string;
    variante: "success" | "warning" | "danger" | "neutral";
    icone?: typeof Info;
  }
> = {
  ok: { palavra: "ok", variante: "success" },
  atencao: { palavra: "atenção", variante: "warning" },
  problema: { palavra: "problema", variante: "danger" },
  // O ícone padrão do `neutral` é um cadeado (estado "bloqueado"); aqui a
  // linha não está trancada, está apenas informando.
  informacao: { palavra: "informação", variante: "neutral", icone: Info },
};

export function LinhaVerificacao({
  estado,
  rotulo,
  valor,
  detalhe,
  acao,
  compacto = false,
  children,
}: {
  estado: EstadoLinha;
  rotulo: string;
  /** O dado da linha ("3 de 4", "joao@x.com / joao@y.com"). */
  valor?: string | null;
  /** A frase que explica o que aquilo significa e o que fazer. */
  detalhe?: string | null;
  /** Links e botões de correção. Só existe em linha âmbar ou vermelha. */
  acao?: React.ReactNode;
  /** Lista compacta do estado 100% verde: só rótulo e valor. */
  compacto?: boolean;
  /** Bloco de remédio abaixo da linha (candidatos de contrato, por exemplo). */
  children?: React.ReactNode;
}) {
  const { palavra, variante, icone } = APRESENTACAO[estado];

  return (
    <li
      className={cn(
        "grid gap-1.5 border-b border-borda-fina last:border-b-0 sm:grid-cols-[7rem_1fr] sm:gap-x-3",
        compacto ? "py-2" : "py-3",
      )}
    >
      <Badge
        variant={variante}
        icone={icone}
        className="w-fit justify-start self-start"
      >
        {palavra}
      </Badge>

      <div className="min-w-0">
        <p className="corpo text-foreground">
          <span className="font-medium">{rotulo}</span>
          {valor ? (
            <span className="text-muted-foreground"> — {valor}</span>
          ) : null}
        </p>

        {!compacto && detalhe ? (
          <p className="mt-1 max-w-[70ch] corpo-sm text-muted-foreground">
            {detalhe}
          </p>
        ) : null}

        {!compacto && acao ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">{acao}</div>
        ) : null}

        {!compacto && children ? <div className="mt-3">{children}</div> : null}
      </div>
    </li>
  );
}
