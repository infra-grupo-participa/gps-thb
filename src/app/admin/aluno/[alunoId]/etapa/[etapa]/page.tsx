import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getClientesEtapa1,
  getEtapas,
  getMembro,
  getProgressoEtapa,
} from "@/lib/data";
import { conteudoEtapa } from "@/lib/etapas";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { Etapa1Guide } from "@/components/etapa1/etapa1-guide";
import { EtapaGuide } from "@/components/etapa/etapa-guide";
import { Badge } from "@/components/ui/badge";

export default async function AdminAlunoEtapaPage({
  params,
}: {
  params: Promise<{ alunoId: string; etapa: string }>;
}) {
  const { alunoId, etapa } = await params;
  const n = Number(etapa);
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const conteudo = conteudoEtapa(n);
  if (!Number.isInteger(n) || !conteudo) notFound();

  const membro = await getMembro(alunoId);
  if (!membro) notFound();

  const base = `/admin/aluno/${alunoId}`;
  const [aluno, etapas, progresso] = await Promise.all([
    getAlunoById(alunoId),
    getEtapas(),
    getProgressoEtapa(alunoId, n),
  ]);
  const etapaInfo = etapas.find((e) => e.id === n);

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
          <div className="mt-2 flex items-center gap-2">
            <h1 className="text-2xl font-semibold">
              Etapa {String(n).padStart(2, "0")} — {etapaInfo?.nome}
            </h1>
            {!etapaInfo?.liberada ? (
              <Badge variant="outline">Bloqueada para o aluno</Badge>
            ) : null}
          </div>
        </div>

        {n === 1 ? (
          <Etapa1Guide
            alunoId={alunoId}
            clientesIniciais={await getClientesEtapa1(alunoId)}
            progressoInicial={progresso}
            dataAgendamentoInicial={membro.data_agendamento_disponivel}
            clientesHref={`${base}/clientes`}
          />
        ) : (
          <EtapaGuide
            alunoId={alunoId}
            etapa={n}
            tarefas={conteudo.tarefas}
            meta={conteudo.meta}
            progressoInicial={progresso}
          />
        )}
      </main>
    </>
  );
}
