import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";
import { getAlunoById, getTutoriaisAtivo } from "@/lib/data";
import { navDoAluno, navFixoDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
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
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Parceiro"
        navItems={navDoAluno(ctx)}
        navFixo={navFixoDoAluno("", { tutoriais: tutoriaisAtivo })}
      />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader titulo="Gerador de minutas" />
        {ativo && src ? (
          <GeradorMinutasQuadro src={src} hrefTelaCheia="/gerador-de-minutas/abrir" />
        ) : (
          <p className="text-base">Indisponível agora. Tente mais tarde.</p>
        )}
      </main>
    </>
  );
}
