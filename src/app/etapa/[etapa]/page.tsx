import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getEtapas } from "@/lib/data";
import { conteudoEtapa } from "@/lib/etapas";
import { alunoNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { EtapaConteudo } from "@/components/etapa/etapa-conteudo";

export default async function EtapaAlunoPage({
  params,
}: {
  params: Promise<{ etapa: string }>;
}) {
  const { etapa } = await params;
  const n = Number(etapa);
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const conteudo = conteudoEtapa(n);
  if (!Number.isInteger(n) || !conteudo) notFound();

  const alunoId = ctx.alunoId;
  const etapas = await getEtapas();
  const etapaInfo = etapas.find((e) => e.id === n);
  // Aluno só acessa etapa liberada.
  if (!etapaInfo?.liberada) redirect("/");

  const aluno = await getAlunoById(alunoId);

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Aluno"
        navItems={alunoNavItems("")}
      />
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        <div className="mb-6">
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Voltar ao início
          </Link>
          <h1 className="mt-2 text-2xl font-semibold">
            Etapa {String(n).padStart(2, "0")} — {etapaInfo.nome}
          </h1>
        </div>

        <EtapaConteudo alunoId={alunoId} n={n} basePath="" isAdmin={false} />
      </main>
    </>
  );
}
