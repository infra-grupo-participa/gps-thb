import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getArtigosAjudaAdmin, getMetricasAjudaAdmin } from "@/lib/data/ajuda";
import { adminNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { AvisoInline } from "@/components/ui/aviso-inline";
import { AjudaAdmin } from "@/components/ajuda/admin";

export const metadata = { title: "Admin — Ajuda" };

/**
 * Central de ajuda — artigos curados pela equipe e o que os parceiros
 * fizeram com eles (02/10/2026). SEM IA (decisão do João).
 *
 * 🔴 Artigos com `{ ok: false }` NÃO viram lista vazia: "nenhum artigo" é
 * afirmação, e a leitura ter falhado não a prova — a tela diz que falhou e
 * não oferece criar por cima de uma lista que ela não conhece.
 */
export default async function AdminAjudaPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const [artigos, metricas] = await Promise.all([
    getArtigosAjudaAdmin(),
    getMetricasAjudaAdmin(),
  ]);

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={adminNavItems({ souAdmin: true })}
      />
      <main id="conteudo" className="mx-auto w-full max-w-5xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Ajuda"
        />
        {artigos.ok ? (
          <AjudaAdmin artigos={artigos.dados} metricas={metricas.ok ? metricas.dados : null} />
        ) : (
          <div role="alert">
            <AvisoInline>
              Não deu para carregar os artigos. Atualize a página.
            </AvisoInline>
          </div>
        )}
      </main>
    </>
  );
}
