import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getEtapas,
  getEtapasLiberadasPara,
  getAmbiente,
  contarMembrosDoAmbiente,
} from "@/lib/data";
import { conteudoEtapa, etapasComLiberacaoDoAluno } from "@/lib/etapas";
import { assistenciaNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { EtapaConteudo } from "@/components/etapa/etapa-conteudo";
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

  const ambiente = await getAmbiente(alunoId);
  if (!ambiente) notFound();

  const base = `/admin/aluno/${alunoId}`;
  const [aluno, etapasGlobais, overrides, qtdMembros] = await Promise.all([
    getAlunoById(alunoId),
    getEtapas(),
    // O espelho do admin tem de dizer o que o ALUNO vê: com a liberação
    // individual, "Bloqueada para o aluno" só é verdade depois do override.
    getEtapasLiberadasPara(alunoId),
    contarMembrosDoAmbiente(alunoId),
  ]);
  const etapas = etapasComLiberacaoDoAluno(etapasGlobais, overrides);
  const etapaInfo = etapas.find((e) => e.id === n);

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={assistenciaNavItems(alunoId, {
          ambienteCompartilhado: qtdMembros > 1,
        })}
      />
      <AssistBanner aluno={aluno} />

      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          titulo={`Etapa ${String(n).padStart(2, "0")} — ${etapaInfo?.nome ?? ""}`}
          voltar={
            <Link
              href={base}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar ao início do aluno
            </Link>
          }
          acao={
            !etapaInfo?.liberada ? (
              <Badge variant="outline">Bloqueada para o aluno</Badge>
            ) : null
          }
        />

        <EtapaConteudo alunoId={alunoId} n={n} basePath={base} isAdmin />
      </main>
    </>
  );
}
