import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getEtapas,
  getEtapasLiberadasPara,
} from "@/lib/data";
import { conteudoEtapa, etapasComLiberacaoDoAluno } from "@/lib/etapas";
import { navDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { EtapaConteudo } from "@/components/etapa/etapa-conteudo";
import { Badge } from "@/components/ui/badge";

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
  // A liberação vale POR ALUNO: `coalesce(override, global)`. Sem isto, uma
  // etapa aberta só para ele na home redirecionaria aqui — e uma etapa travada
  // só para ele continuaria abrindo pela URL.
  const [etapasGlobais, overrides] = await Promise.all([
    getEtapas(),
    getEtapasLiberadasPara(alunoId),
  ]);
  const etapas = etapasComLiberacaoDoAluno(etapasGlobais, overrides);
  const etapaInfo = etapas.find((e) => e.id === n);
  // Aluno só acessa etapa liberada.
  if (!etapaInfo?.liberada) redirect("/");

  const override = overrides[n];

  const aluno = await getAlunoById(alunoId);

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Aluno"
        navItems={navDoAluno(ctx)}
      />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          titulo={`Etapa ${String(n).padStart(2, "0")} — ${etapaInfo.nome}`}
          voltar={
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar ao início
            </Link>
          }
        />

        {/* Liberação individual (`gps.etapa_liberacao_aluno`). O caso "travada
            para você" não chega aqui: o redirect acima já barrou. Sem esta
            linha o aluno veria uma etapa aberta que os colegas não têm e não
            saberia por quê. */}
        {override ? (
          <div className="mb-6 rounded-lg border border-borda-fina bg-superficie-afundada p-3">
            <Badge variant="success">Liberada para você pela equipe</Badge>
            {override.motivo ? (
              <p className="mt-2 max-w-[70ch] corpo-sm text-muted-foreground">
                {override.motivo}
              </p>
            ) : null}
          </div>
        ) : null}

        <EtapaConteudo alunoId={alunoId} n={n} basePath="" isAdmin={false} />
      </main>
    </>
  );
}
