import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getClienteById,
  getClienteEquipe,
  getAmbiente,
  contarMembrosDoAmbiente,
} from "@/lib/data";
import { assistenciaNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { ClienteFicha } from "@/components/clientes/cliente-ficha";

export default async function AdminAlunoClienteFichaPage({
  params,
}: {
  params: Promise<{ alunoId: string; clienteId: string }>;
}) {
  const { alunoId, clienteId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const ambiente = await getAmbiente(alunoId);
  if (!ambiente) notFound();

  const cliente = await getClienteById(clienteId);
  if (!cliente || cliente.aluno_id !== alunoId) notFound();

  const base = `/admin/aluno/${alunoId}`;
  const [aluno, qtdMembros, outroConfirmado] = await Promise.all([
    getAlunoById(alunoId),
    contarMembrosDoAmbiente(alunoId),
    // Mesma regra da ficha do aluno: só quando este cliente não é a estrela.
    cliente.acompanhado_equipe
      ? Promise.resolve(null)
      : getClienteEquipe(alunoId),
  ]);
  const outroConfirmadoNome = outroConfirmado?.acompanhamento_confirmado_em
    ? (outroConfirmado.nome ?? null)
    : null;

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

      <main id="conteudo" className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16">
        <PageHeader
          titulo={cliente.nome || "Novo cliente"}
          voltar={
            <Link
              href={`${base}/clientes`}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar aos clientes
            </Link>
          }
        />

        {/* `admin` liga "Confirmar acompanhamento"/"Liberar acompanhamento" —
            a CASA DE ORIGEM dessa escrita (§B.5). Quem autoriza é o
            `gp_is_admin()` das RPCs; esta prop decide o que a tela oferece. */}
        <ClienteFicha
          cliente={cliente}
          alunoId={alunoId}
          admin
          outroConfirmadoNome={outroConfirmadoNome}
        />
      </main>
    </>
  );
}
