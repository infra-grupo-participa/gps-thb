import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAgendamentosReuniaoRange, getBloqueiosRange } from "@/lib/data";
import { hojeSaoPaulo, quartaDaSemana } from "@/lib/reuniao";
import { adminNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { ReunioesCalendario } from "@/components/admin/reunioes-calendario";

export const metadata = { title: "Reuniões" };

export default async function AdminReunioesPage({
  searchParams,
}: {
  searchParams: Promise<{ semana?: string }>;
}) {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const { semana } = await searchParams;
  // A semana é sempre representada pela sua quarta.
  const alvo = semana && /^\d{4}-\d{2}-\d{2}$/.test(semana) ? semana : hojeSaoPaulo();
  const quarta = quartaDaSemana(alvo);

  const [agendamentos, bloqueios] = await Promise.all([
    getAgendamentosReuniaoRange(quarta, quarta),
    getBloqueiosRange(quarta, quarta),
  ]);

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={adminNavItems()}
      />
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Reuniões</h1>
          <p className="text-muted-foreground">
            Agenda das reuniões de implementação (quartas, 09h–17h). Os alunos se
            encaixam nos horários livres; aqui você acompanha e pode bloquear datas.
          </p>
        </div>

        <ReunioesCalendario
          quarta={quarta}
          agendamentos={agendamentos}
          bloqueada={bloqueios.includes(quarta)}
        />
      </main>
    </>
  );
}
