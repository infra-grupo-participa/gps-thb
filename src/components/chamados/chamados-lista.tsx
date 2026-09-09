import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatarDataHora } from "@/lib/datas";
import { rotuloStatus, type Chamado, type StatusChamado } from "@/lib/chamados-tipos";
import { BADGE_ATENCAO } from "@/components/chamados/badges";
import { cn } from "@/lib/utils";

/** Só o "a bola é sua" ganha destaque. O resto é contorno ou cinza. */
function ehSuaVez(status: StatusChamado, visao: "aluno" | "admin"): boolean {
  // 'aberto' = esperando a equipe; 'respondido' = esperando o aluno.
  return (
    (visao === "admin" && status === "aberto") ||
    (visao === "aluno" && status === "respondido")
  );
}

/**
 * Lista de chamados de um ambiente. Server Component, sem estado.
 *
 * `rotuloStatus` vem de `chamados-tipos.ts` e diz DE QUEM É A BOLA
 * ("Aguardando a equipe" / "Aguardando você"), não o estado interno — é o que
 * faz a lista ser lida sem treinamento. Não reimplementar o rótulo aqui.
 *
 * A linha inteira é o link (`<Link>` cobrindo o card), com o assunto como
 * nome acessível: um botão "Ver" ao lado repetiria 20 vezes o mesmo rótulo
 * para quem navega por lista de links.
 */
export function ChamadosLista({
  chamados,
  basePath,
  visao,
}: {
  chamados: Chamado[];
  /** "/chamados" (aluno) ou "/admin/chamados" (equipe). */
  basePath: string;
  visao: "aluno" | "admin";
}) {
  return (
    <ul className="grid gap-3">
      {chamados.map((c) => (
        <li key={c.id}>
          <Card className="transition hover:shadow-sm has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring/50">
            <CardContent className="flex items-center gap-3 py-4">
              {/* O assunto ocupa a LINHA INTEIRA e a pílula desce para a linha
                  de baixo: em 360 px, badge e assunto lado a lado cortavam o
                  assunto em ~15 caracteres ("Não consigo salva…") — e o
                  assunto é a única coisa que distingue um chamado do outro. */}
              <div className="grid min-w-0 flex-1 gap-1.5">
                <Link
                  href={`${basePath}/${c.id}`}
                  prefetch={false}
                  className="font-medium outline-none hover:underline"
                >
                  {c.assunto}
                </Link>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge
                    variant={c.status === "fechado" ? "secondary" : "outline"}
                    className={cn(ehSuaVez(c.status, visao) && BADGE_ATENCAO)}
                  >
                    {rotuloStatus(c.status, visao)}
                  </Badge>
                  <p className="text-xs text-muted-foreground">
                    Última mensagem em{" "}
                    <time dateTime={c.ultima_mensagem_em}>
                      {formatarDataHora(c.ultima_mensagem_em)}
                    </time>
                  </p>
                </div>
              </div>
              <ChevronRight
                aria-hidden
                className="size-4 shrink-0 text-muted-foreground"
              />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
