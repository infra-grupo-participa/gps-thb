import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";
import { getAlunoById, getTutoriaisAtivo } from "@/lib/data";
import { navDoAluno, navFixoDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import Link from "next/link";
import { FileText } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { GeradorMinutasMoldura } from "@/components/gerador-minutas-moldura";
import { GeradorMinutasQuadro } from "@/components/gerador-minutas-quadro";
import { urlDoGeradorComAcessoUnico } from "@/lib/gerador-sso";

export const metadata = { title: "Gerador de minutas" };
// Token de 60 s e uso único no HTML: nada de cache desta página.
export const dynamic = "force-dynamic";

/** Erro de RPC → false (sem iframe): nunca abre o gerador na dúvida. */
async function geradorAtivo(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("gps").rpc("gerador_minutas_ativo");
  if (error) {
    logErro("geradorMinutasAtivo", error);
    return false;
  }
  return data === true;
}

export default async function GeradorDeMinutasPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  // O login do gerador é pessoal: admin não entra por aqui.
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const [aluno, tutoriaisAtivo, ativo] = await Promise.all([
    getAlunoById(ctx.alunoId),
    getTutoriaisAtivo(),
    geradorAtivo(),
  ]);
  // Acesso único (…358): só pede token se o gerador está ligado. Falha → /dashboard.
  const src = ativo ? await urlDoGeradorComAcessoUnico() : null;

  return (
    // Altura da viewport, header + área de trabalho em flex: só o gerador rola
    // (por dentro do iframe). `min-h-[560px]`: em tela muito baixa a página
    // rola em vez de esmagar o gerador.
    <div className="flex h-dvh min-h-[560px] flex-col bg-background">
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Parceiro"
        navItems={navDoAluno(ctx)}
        navFixo={navFixoDoAluno("", { tutoriais: tutoriaisAtivo })}
      />
      <main
        id="conteudo"
        data-gerador-minutas
        className="mx-auto flex min-h-0 w-full max-w-pagina flex-1 flex-col px-4 pt-3 pb-4"
      >
        {ativo && src ? (
          <GeradorMinutasQuadro src={src} />
        ) : (
          <GeradorMinutasMoldura>
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
              <EmptyState
                icone={<FileText />}
                titulo="Indisponível agora"
                descricao={
                  <span className="text-base">
                    O gerador está fora do ar no momento. Tente de novo mais tarde.
                  </span>
                }
                acao={
                  <Link
                    href="/"
                    className={cn(buttonVariants({ variant: "outline", size: "lg" }), "min-h-11 text-base")}
                  >
                    Voltar ao início
                  </Link>
                }
              />
            </div>
          </GeradorMinutasMoldura>
        )}
      </main>
    </div>
  );
}
