import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getClientesDoPrograma } from "@/lib/data/clientes-admin";
import { adminNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { ClientesPrograma } from "@/components/admin/clientes-programa";
import {
  ITENS_POR_PAGINA,
  lerEstadoClientesUrl,
  offsetDaPagina,
} from "@/components/admin/clientes-programa/estado-na-url";

export const metadata = { title: "Admin — Clientes" };

/**
 * Lista consolidada de clientes do programa — TODOS os ambientes, não só o
 * do parceiro aberto (item 3 dos 9, ver
 * `docs/audits/2026-09-14-esteira/01-listas-clicaveis.md`).
 *
 * Backend já pronto e testado: `gps.admin_clientes_lista` (RPC) via
 * `getClientesDoPrograma` — não mexer nele. Esta página só lê `searchParams`
 * (allowlist fechada, `estado-na-url.ts`) e monta a tela.
 *
 * 🔴 Rota PRÓPRIA, fora de `/admin` (decisão do Marcio): os 1.223 clientes só
 * custam consulta/payload para quem abre `/admin/clientes`, nunca para quem
 * só quer o painel de parceiros.
 *
 * ⚠️ Dados de TERCEIROS: os clientes cadastrados aqui são pessoas físicas que
 * nunca abriram conta no portal — são os clientes dos parceiros, não os
 * parceiros. O aviso mora no `PageHeader` (LGPD), não só neste comentário.
 */
export default async function AdminClientesPage({
  searchParams,
}: {
  searchParams: Promise<{
    fase?: string;
    grau?: string;
    q?: string;
    pag?: string;
    reuniao?: string;
  }>;
}) {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const estado = lerEstadoClientesUrl(await searchParams);

  const { linhas, total, erro } = await getClientesDoPrograma({
    limite: ITENS_POR_PAGINA,
    offset: offsetDaPagina(estado.pagina),
    fase: estado.fase,
    grau: estado.grau,
    busca: estado.busca || null,
    reuniao: estado.reuniao,
  });

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={adminNavItems({ souAdmin: true })}
      />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Clientes"
          descricao="Clientes dos parceiros, de todos os ambientes do programa — são dados de terceiros: nunca fizeram login no portal. Sem o registro de contato, que fica só na ficha individual do parceiro."
        />

        <ClientesPrograma
          linhas={linhas}
          total={total}
          erro={erro ?? null}
          estado={estado}
        />
      </main>
    </>
  );
}
