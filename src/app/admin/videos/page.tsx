import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getVideosAdmin } from "@/lib/data";
import { adminNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { VideosAdmin } from "@/components/admin/videos";

export const metadata = { title: "Admin — Vídeos" };

/**
 * Biblioteca de vídeos das reuniões — autonomia do admin (demanda 5,
 * 11/09/2026). O pedido do Marcio: embedar a partir do link do YouTube, sem
 * subir MP4, e a equipe publicar por conta própria, sem deploy.
 */
export default async function AdminVideosPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const videos = await getVideosAdmin();

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={adminNavItems()}
      />
      <main id="conteudo" className="mx-auto w-full max-w-5xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Vídeos"
          descricao="Gravações de reuniões e aulas, embedadas do YouTube não listado. Cadastre por aqui — sem subir arquivo, sem deploy."
        />

        <VideosAdmin videos={videos} />
      </main>
    </>
  );
}
