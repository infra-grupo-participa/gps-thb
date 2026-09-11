import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getMembrosDoAmbiente, getTurmaCodigo } from "@/lib/data";
import { assistenciaNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { PerfilEditor } from "@/components/perfil/perfil-editor";
import type { Aluno } from "@/lib/types";

export const metadata = { title: "Perfil do parceiro" };

export default async function AdminAlunoPerfilPage({
  params,
}: {
  params: Promise<{ alunoId: string }>;
}) {
  const { alunoId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  // 🔑 As duas consultas são INDEPENDENTES — `getAlunoById` não usa nada de
  // `getMembrosDoAmbiente`. Em série somavam duas idas ao banco; em paralelo
  // custam uma. Só `getTurmaCodigo` depende de fato (precisa do `turma_id`),
  // então ela fica de fora do lote.
  const [membros, aluno] = await Promise.all([
    getMembrosDoAmbiente(alunoId),
    getAlunoById(alunoId),
  ]);
  if (membros.length === 0) notFound();
  // O admin edita o perfil do TITULAR do ambiente (é quem `alunoId` identifica
  // diretamente; sócios têm perfil próprio, editável só pelo próprio login).
  const titular = membros.find((m) => m.papel === "titular") ?? membros[0];

  const base = `/admin/aluno/${alunoId}`;
  const turma = await getTurmaCodigo(aluno?.turma_id);

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={assistenciaNavItems(alunoId, {
          ambienteCompartilhado: membros.length > 1,
        })}
      />
      <AssistBanner aluno={aluno} />

      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          titulo={`Perfil de ${aluno?.nome ?? ""}`}
          voltar={
            <Link
              href={base}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar ao ambiente do parceiro
            </Link>
          }
        />

        <PerfilEditor
          aluno={(aluno ?? { id: alunoId }) as Aluno}
          turma={turma}
          perfilInicial={titular.perfil ?? {}}
          alunoId={alunoId}
        />
      </main>
    </>
  );
}
