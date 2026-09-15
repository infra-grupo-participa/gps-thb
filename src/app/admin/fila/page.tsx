import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getFilaDeLigacoes } from "@/lib/data/entrevistas";
import { adminNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { FilaDeLigacoes } from "@/components/admin/fila";

export const metadata = { title: "Admin — Fila de ligações" };

/**
 * Fila de ligações da entrevista prévia (Fatia 3 da esteira, 15/09/2026).
 *
 * A equipe liga para os clientes que cada parceiro selecionou
 * (`selecionado_entrevista = true`) e registra resultado, DISC e decisores.
 * Ordem FIFO — `gps.fila_de_ligacoes` já devolve na ordem certa (mais antigo
 * primeiro); esta página não reordena.
 *
 * 🔴 LGPD: a RPC não devolve `entrevista_observacoes` nem decisores — eles só
 * existem na ficha/dossiê de UM cliente por vez, nunca nesta lista.
 */
export default async function AdminFilaPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const { linhas, total, erro } = await getFilaDeLigacoes({ limite: 200 });

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={adminNavItems()}
      />
      <main id="conteudo" className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Fila de ligações"
          descricao="Os clientes selecionados pelos parceiros para a entrevista prévia, do mais antigo para o mais recente. Ligue, registre o resultado e a linha sai da fila."
        />

        <p aria-live="polite" className="mb-4 corpo-sm text-muted-foreground">
          {erro
            ? null
            : `${total} na fila.`}
        </p>

        {erro ? (
          <p role="alert" className="corpo-sm text-destructive">
            {erro}
          </p>
        ) : (
          <FilaDeLigacoes linhas={linhas} />
        )}
      </main>
    </>
  );
}
