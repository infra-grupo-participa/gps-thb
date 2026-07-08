import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getClientesEtapa1,
  getMembro,
  getProgressoEtapa,
} from "@/lib/data";
import { AppHeader } from "@/components/app-header";
import { Etapa1Workspace } from "@/components/etapa1/etapa1-workspace";
import { Badge } from "@/components/ui/badge";

export default async function AdminAlunoPage({
  params,
}: {
  params: Promise<{ alunoId: string }>;
}) {
  const { alunoId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const membro = await getMembro(alunoId);
  if (!membro) notFound();

  const [aluno, clientes, progresso] = await Promise.all([
    getAlunoById(alunoId),
    getClientesEtapa1(alunoId),
    getProgressoEtapa(alunoId, 1),
  ]);

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
      />

      <div className="border-b bg-primary/5">
        <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-2 text-sm">
          <Badge variant="secondary">Modo assistência</Badge>
          <span className="text-muted-foreground">
            Você está no ambiente de{" "}
            <span className="font-medium text-foreground">
              {aluno?.nome ?? "aluno"}
            </span>
            . Alterações são salvas na conta do aluno.
          </span>
        </div>
      </div>

      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6">
          <Link
            href="/admin"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Voltar aos alunos
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            {aluno?.nome ?? "Aluno"}
          </h1>
          <p className="text-muted-foreground">
            {aluno?.email}
            {aluno?.telefone ? ` · ${aluno.telefone}` : ""}
          </p>
          <h2 className="mt-4 text-lg font-medium">
            Etapa 01 — Estrutura e contato com a base de clientes
          </h2>
        </div>

        <Etapa1Workspace
          alunoId={alunoId}
          clientesIniciais={clientes}
          progressoInicial={progresso}
          dataAgendamentoInicial={membro.data_agendamento_disponivel}
        />
      </main>
    </>
  );
}
