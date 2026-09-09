import { AlertTriangle } from "lucide-react";
import { ThbLogo } from "@/components/thb-logo";

/**
 * Tela de falha do portal — o mesmo corpo para o `error.tsx` da raiz e para os
 * boundaries de segmento (`/clientes`, diário do aluno).
 *
 * O boundary de segmento substitui a `page.tsx` e leva junto o `AppHeader`
 * (o header é montado por página, não por layout). Sem a marca aqui, o aluno
 * cai numa tela branca sem nada que diga onde ele está — por isso o selo e o
 * `h1` de contexto vivem no componente e não em cada arquivo.
 *
 * `digest` é o hash que o Next gera para o erro no servidor: é o único fio que
 * liga a queixa do aluno ("deu erro às 14h") à linha do log. `error.message`
 * NUNCA entra aqui — em produção pode carregar detalhe interno.
 */
export function ErroPainel({
  titulo,
  descricao,
  digest,
  children,
}: {
  titulo: string;
  descricao: string;
  /** `error.digest` do Next. Ausente em erro que nasceu no cliente. */
  digest?: string;
  /** Ações: "Tentar de novo" + link de volta. */
  children: React.ReactNode;
}) {
  return (
    <main
      id="conteudo"
      className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center gap-6 p-6 text-center"
    >
      <ThbLogo />
      <div className="flex flex-col items-center gap-2">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle aria-hidden className="size-6" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{titulo}</h1>
        <p className="text-sm text-muted-foreground">{descricao}</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {children}
      </div>
      {digest ? (
        <p className="text-xs text-muted-foreground">
          Código:{" "}
          {/* `select-all` para o aluno copiar com um clique e mandar ao suporte. */}
          <code className="select-all font-mono text-foreground">{digest}</code>
        </p>
      ) : null}
    </main>
  );
}
