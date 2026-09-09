import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { AnexoLink } from "@/components/chamados/anexo-link";
import { BADGE_ATENCAO } from "@/components/chamados/badges";
import { cn } from "@/lib/utils";
import { formatarDataHora } from "@/lib/datas";
import type { ChamadoMensagemComAutor } from "@/lib/chamados-tipos";

/**
 * A conversa de um chamado. Server Component — nada aqui é interativo, exceto
 * o `AnexoLink` (que precisa de cliente para assinar a URL no clique).
 *
 * Não reusa `DiarioTimeline`/`TrilhaItem`: aqueles são acoplados a nota e
 * evento do Diário, que é dado exclusivo do admin (LGPD) e que o aluno nunca
 * pode ver. O que se reusa é o PADRÃO VISUAL — `Card` + `Badge` + carimbo de
 * hora à direita + `whitespace-pre-wrap break-words`.
 *
 * `break-words` não é enfeite: a mensagem é texto colado pelo aluno e pode
 * trazer URL ou identificador longo sem espaço. Sem isso, ela estoura a
 * largura do card em 360 px.
 */
export function ChamadoThread({
  mensagens,
  visao,
}: {
  mensagens: ChamadoMensagemComAutor[];
  /** Muda só o rótulo do autor: para o aluno, a mensagem dele é "Você". */
  visao: "aluno" | "admin";
}) {
  return (
    <ol className="grid gap-3">
      {mensagens.map((m) => {
        const daEquipe = m.autor_papel === "equipe";
        const autor = daEquipe
          ? "Equipe"
          : visao === "aluno"
            ? "Você"
            : (m.autor_nome ?? "Aluno");

        return (
          <li key={m.id}>
            <Card
              // A mensagem da equipe fica visualmente destacada — é a resposta
              // que o aluno abriu a tela para ler.
              className={daEquipe ? "bg-accent/40" : undefined}
            >
              <CardContent className="grid gap-2 py-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className={cn("text-[10px]", daEquipe && BADGE_ATENCAO)}
                  >
                    {autor}
                  </Badge>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    <time dateTime={m.criado_em}>
                      {formatarDataHora(m.criado_em)}
                    </time>
                  </span>
                </div>

                <p className="whitespace-pre-wrap break-words text-sm">
                  {m.texto}
                </p>

                {m.anexo_path ? (
                  <AnexoLink
                    path={m.anexo_path}
                    nome={m.anexo_nome}
                    mime={m.anexo_mime}
                    tamanho={m.anexo_tamanho}
                    expurgadoEm={m.anexo_expurgado_em}
                  />
                ) : null}
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ol>
  );
}
