import Link from "next/link";
import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getInterruptores } from "@/lib/data/config";
import { adminNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { InterruptoresAdmin } from "@/components/admin/interruptores";

export const metadata = { title: "Admin — Interruptores" };

/**
 * Tela de interruptores de `gps.config` (15/09/2026) — os botões de pânico
 * que só se ligavam/desligavam por SQL direto no banco, sem trilha de autor.
 * Molde: `admin/tutoriais/page.tsx` / `admin/videos/page.tsx`.
 *
 * Server Component: a leitura (`getInterruptores`) já guarda `ehAdmin()` por
 * dentro (devolve `[]` para quem não é admin), mas o `redirect` aqui é a
 * segunda camada — sem ela um não-admin veria a tela vazia em vez de ser
 * levado para fora, e "tela vazia" não diz que ele não tem acesso.
 */
export default async function AdminConfiguracoesPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  // O card do Drive foi para /admin/pastas (07/10/2026): aqui fica só o
  // link, e a página deixa de chamar `gps.drive_pendencias`.
  const interruptores = await getInterruptores();

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
          titulo="Interruptores"
        />

        <InterruptoresAdmin interruptores={interruptores} />

        <p className="mt-10 text-base">
          <Link
            href="/admin/pastas"
            className="font-medium text-accent-foreground underline-offset-4 hover:underline"
          >
            Pastas do Drive →
          </Link>
        </p>
      </main>
    </>
  );
}
