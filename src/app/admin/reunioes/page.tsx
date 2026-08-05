import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAgendamentosReuniaoRange,
  getBloqueiosRange,
  getHorariosReuniao,
  getSolicitacoesPendentes,
} from "@/lib/data";
import { hojeSaoPaulo, quartaDaSemana } from "@/lib/reuniao";
import { adminNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { ReunioesCalendario } from "@/components/admin/reunioes-calendario";
import { SolicitacoesReuniao } from "@/components/admin/solicitacoes-reuniao";

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

  const [agendamentos, bloqueios, horarios, pendentes] = await Promise.all([
    getAgendamentosReuniaoRange(quarta, quarta),
    getBloqueiosRange(quarta, quarta),
    getHorariosReuniao(true),
    getSolicitacoesPendentes(),
  ]);

  // Quarta inteira fechada = bloqueio com horario NULL nesta data.
  const quartaBloqueada = bloqueios.some(
    (b) => b.data === quarta && b.horario === null,
  );
  // Horários pontuais fechados nesta quarta.
  const horariosBloqueados = bloqueios
    .filter((b) => b.data === quarta && b.horario !== null)
    .map((b) => b.horario as string);

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={adminNavItems(pendentes.length)}
      />
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold">Reuniões</h1>
          <p className="text-muted-foreground">
            Agenda das reuniões de implementação (quartas-feiras). O aluno{" "}
            <strong>solicita</strong> um horário e a reunião só vale depois que a
            equipe <strong>confirma</strong>. Aqui você responde as solicitações,
            agenda por um aluno, define a disponibilidade e fecha datas ou horários.
          </p>
        </div>

        <div className="mb-6">
          <SolicitacoesReuniao pendentes={pendentes} hojeIso={hojeSaoPaulo()} />
        </div>

        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Agenda da semana
        </h2>
        <ReunioesCalendario
          quarta={quarta}
          agendamentos={agendamentos}
          bloqueada={quartaBloqueada}
          horariosBloqueados={horariosBloqueados}
          horarios={horarios}
        />
      </main>
    </>
  );
}
