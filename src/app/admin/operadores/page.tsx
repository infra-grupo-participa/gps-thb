import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getOperadores } from "@/lib/data/operadores";
import { getAdminsDoPrograma, getHistoricoAdmins } from "@/lib/data/admins";
import { adminNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { Secao } from "@/components/ui/secao";
import { Operadores } from "@/components/admin/operadores";
import { AdminsDoPrograma } from "@/components/admin/admins";

export const metadata = { title: "Admin — Equipe e admins" };

/**
 * Gestão do papel "equipe da esteira" (Fatia 5, ÚLTIMA, 15/09/2026, decisão
 * do Marcio) — ativar/desativar operadores. Quem está ativo aqui vê a fila
 * de ligações (`/admin/fila`) E o dossiê de qualquer cliente.
 *
 * 🔴 Guarda `ctx.papel !== "admin"` (a de sempre), NÃO `ehEquipeDaEsteira()`:
 * operador não promove operador — só quem já é admin do sistema decide quem
 * entra na equipe da esteira. Mesma guarda de `gps.operador_definir` no
 * banco (`gp_is_admin()`).
 *
 * 08/10/2026: a página ganhou a seção "Admins do programa" (incluir/remover
 * admin sem depender de outro sistema) e passou a se chamar "Equipe e
 * admins". Fica ABAIXO dos operadores: quem já usa a tela encontra o que
 * usava no mesmo lugar, e mexer em admin é a ação mais rara e de maior
 * alcance — não deve ser a primeira coisa sob o cursor.
 */
export default async function AdminOperadoresPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  // As três leituras em paralelo; cada uma falha sozinha (a seção de admins
  // mostra o próprio erro e a de operadores segue de pé).
  const [{ linhas, erro }, admins, historico] = await Promise.all([
    getOperadores(),
    getAdminsDoPrograma(),
    getHistoricoAdmins(),
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
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader titulo="Equipe e admins" />

        <div className="grid gap-12">
          <Secao
            titulo="Operadores"
            descricao="Veem a fila de ligações e o dossiê dos clientes."
          >
            {erro ? (
              <p role="alert" className="corpo-sm text-destructive">
                {erro}
              </p>
            ) : (
              <Operadores operadores={linhas} />
            )}
          </Secao>

          <AdminsDoPrograma
            admins={admins.linhas}
            erroAdmins={admins.erro}
            historico={historico.linhas}
            erroHistorico={historico.erro}
            meuEmail={ctx.user.email ?? null}
          />
        </div>
      </main>
    </>
  );
}
