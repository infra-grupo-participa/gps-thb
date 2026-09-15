import { redirect } from "next/navigation";
import { getContextoSessao, ehEquipeDaEsteira } from "@/lib/auth";
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
 *
 * 🔑 Guarda `ehEquipeDaEsteira()` (Fatia 5, 15/09/2026), NÃO `ctx.papel !==
 * "admin"`: a decisão do Marcio abriu esta página também ao OPERADOR puro
 * (`gps.operadores`, ativo) — a mesma pessoa que abre o dossiê. `gp_is_admin()`
 * continua valendo por baixo em toda outra rota `/admin/**`; SÓ esta página
 * troca de guarda.
 *
 * Um operador que não é admin nem aluno chega aqui com `ctx.papel ===
 * "sem_acesso"` (ele não tem vínculo em `gps.membros` nem em
 * `public.perfis` — `gps.operadores` referencia `auth.users` direto, ver a
 * migração `…264`). Por isso o rótulo do header e o destino do logo não usam
 * `ctx.papel === "admin"` como sinal de identidade — usam o resultado desta
 * própria guarda.
 */
export default async function AdminFilaPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");

  const souEquipe = await ehEquipeDaEsteira();
  if (!souEquipe) redirect("/");

  const souAdmin = ctx.papel === "admin";

  const { linhas, total, erro } = await getFilaDeLigacoes({ limite: 200 });

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo={souAdmin ? "Admin" : "Equipe da esteira"}
        homeHref="/admin/fila"
        navItems={adminNavItems({ souAdmin })}
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
