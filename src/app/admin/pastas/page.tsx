import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getPendenciasDrive } from "@/lib/data/drive";
import { adminNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { Secao } from "@/components/ui/secao";
import { PastasDriveAdmin } from "@/components/admin/pastas-drive";
import { AlunosSemPasta } from "@/components/admin/alunos-sem-pasta";

export const metadata = { title: "Admin — Pastas do Drive" };

/**
 * Pastas do Drive (07/10/2026). Acesso novo ganha a pasta sozinho; os antigos
 * sem pasta ganham por clique aqui (decisão do João — nada em massa).
 *
 * Server Component com UMA chamada a `gps.drive_pendencias` (só admin; 42501
 * para os outros). Falha devolve `null`: o card mostra o aviso e a lista de
 * "sem pasta" não aparece — lista vazia afirmaria que todos têm pasta.
 * Mesma guarda de `/admin/configuracoes`: não-admin sai pelo `redirect`.
 */
export default async function AdminPastasPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const dados = await getPendenciasDrive();

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
        <PageHeader titulo="Pastas do Drive" />

        <PastasDriveAdmin dados={dados} />

        {dados ? (
          <Secao titulo="Alunos sem pasta" className="mt-10">
            {/* Fora do `descricao` da Secao: ela usa `corpo-sm`, abaixo de 16 px. */}
            <p className="mb-3 text-base text-muted-foreground">
              Um clique cria a pasta. Leva de 3 a 7 minutos. O link vai sozinho para
              a ficha.
            </p>
            <AlunosSemPasta alunos={dados.semPasta} />
          </Secao>
        ) : null}
      </main>
    </>
  );
}
