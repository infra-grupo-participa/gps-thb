import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getOperadores } from "@/lib/data/operadores";
import { adminNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { Operadores } from "@/components/admin/operadores";

export const metadata = { title: "Admin — Operadores" };

/**
 * Gestão do papel "equipe da esteira" (Fatia 5, ÚLTIMA, 15/09/2026, decisão
 * do Marcio) — ativar/desativar operadores. Quem está ativo aqui vê a fila
 * de ligações (`/admin/fila`) E o dossiê de qualquer cliente.
 *
 * 🔴 Guarda `ctx.papel !== "admin"` (a de sempre), NÃO `ehEquipeDaEsteira()`:
 * operador não promove operador — só quem já é admin do sistema decide quem
 * entra na equipe da esteira. Mesma guarda de `gps.operador_definir` no
 * banco (`gp_is_admin()`).
 */
export default async function AdminOperadoresPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const { linhas, erro } = await getOperadores();

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={adminNavItems({ souAdmin: true })}
      />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Operadores"
          descricao="Quem está ativo aqui vê a fila de ligações e o dossiê de qualquer cliente — o advogado que conduz a reunião preliminar e o operador que liga são o mesmo papel."
        />

        {erro ? (
          <p role="alert" className="corpo-sm text-destructive">
            {erro}
          </p>
        ) : (
          <Operadores operadores={linhas} />
        )}
      </main>
    </>
  );
}
