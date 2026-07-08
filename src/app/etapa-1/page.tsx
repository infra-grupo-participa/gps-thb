import Link from "next/link";
import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getClientesEtapa1,
  getMembro,
  getProgressoEtapa,
} from "@/lib/data";
import { AppHeader } from "@/components/app-header";
import { Etapa1Workspace } from "@/components/etapa1/etapa1-workspace";

export const metadata = {
  title: "Etapa 01 — Estrutura e contato com a base de clientes | GPS",
};

export default async function Etapa1AlunoPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const alunoId = ctx.alunoId;
  const [aluno, clientes, progresso, membro] = await Promise.all([
    getAlunoById(alunoId),
    getClientesEtapa1(alunoId),
    getProgressoEtapa(alunoId, 1),
    getMembro(alunoId),
  ]);

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Aluno"
      />
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Voltar às etapas
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            Etapa 01 — Estrutura e contato com a base de clientes
          </h1>
          <p className="text-muted-foreground">
            Liste seus 30 clientes potenciais, calcule a perda pela inércia e
            agende as reuniões preliminares.
          </p>
        </div>

        <Etapa1Workspace
          alunoId={alunoId}
          clientesIniciais={clientes}
          progressoInicial={progresso}
          dataAgendamentoInicial={membro?.data_agendamento_disponivel ?? null}
        />
      </main>
    </>
  );
}
