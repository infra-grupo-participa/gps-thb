import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getTutoriaisAdmin } from "@/lib/data";
import { adminNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { TutoriaisAdmin } from "@/components/admin/tutoriais";

export const metadata = { title: "Admin — Tutoriais" };

/**
 * CRUD da biblioteca de tutoriais (15/09/2026) — autonomia da equipe de
 * publicar sem deploy. Molde: `admin/videos/page.tsx`.
 */
export default async function AdminTutoriaisPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const tutoriais = await getTutoriaisAdmin();

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
          titulo="Tutoriais"
          descricao="Como usar o portal, passo a passo — vídeo, texto, ou os dois. Cadastre por aqui, sem deploy."
        />

        <TutoriaisAdmin tutoriais={tutoriais} />
      </main>
    </>
  );
}
