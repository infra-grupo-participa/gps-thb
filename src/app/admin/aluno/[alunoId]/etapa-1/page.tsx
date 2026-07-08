import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getClientesEtapa1,
  getMembro,
  getProgressoEtapa,
} from "@/lib/data";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { Etapa1Guide } from "@/components/etapa1/etapa1-guide";

export default async function AdminAlunoEtapa1Page({
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

  const base = `/admin/aluno/${alunoId}`;
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
        navItems={alunoNavItems(base)}
      />
      <AssistBanner aluno={aluno} />

      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6">
          <Link
            href={base}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Voltar ao início do aluno
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            Etapa 01 — Estrutura e contato com a base de clientes
          </h1>
        </div>

        <Etapa1Guide
          alunoId={alunoId}
          clientesIniciais={clientes}
          progressoInicial={progresso}
          dataAgendamentoInicial={membro.data_agendamento_disponivel}
          clientesHref={`${base}/clientes`}
        />
      </main>
    </>
  );
}
