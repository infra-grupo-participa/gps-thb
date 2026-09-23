import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getMinutaContextoObrigatorio } from "@/lib/data/minutas";
import {
  getAlunoById,
  getClienteById,
  getClienteEquipe,
  getAmbiente,
  contarMembrosDoAmbiente,
  getTutoriaisAtivo,
} from "@/lib/data";
import { assistenciaNavItems, navFixoDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { ClienteFicha } from "@/components/clientes/cliente-ficha";
import { getMinutasDoCliente } from "@/lib/data/minutas";

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
  const [aluno, qtdMembros, outroConfirmado, tutoriaisAtivo, minutas] =
    await Promise.all([
      getAlunoById(alunoId),
      contarMembrosDoAmbiente(alunoId),
      // Mesma regra da ficha do aluno: só quando este cliente não é a estrela.
      cliente.acompanhado_equipe
        ? Promise.resolve(null)
        : getClienteEquipe(alunoId),
      getTutoriaisAtivo(),
      // 🔑 No MESMO Promise.all (o `cliente` já foi resolvido acima): pedir em
      // cascata custaria uma viagem a mais por abertura de ficha.
      getMinutasDoCliente(clienteId),
    ]);
  const outroConfirmadoNome = outroConfirmado?.acompanhamento_confirmado_em
    ? (outroConfirmado.nome ?? null)
    : null;

  // Mesmo interruptor da ficha do aluno — por RPC, porque `gps.config` só
  // tem policy de admin (ver comentário em `getMinutaContextoObrigatorio`).
  const contextoObrigatorio = await getMinutaContextoObrigatorio();

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
        navFixo={navFixoDoAluno(base, { tutoriais: tutoriaisAtivo })}
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
            `gp_is_admin()` das RPCs; esta prop decide o que a tela oferece.

            🔴 SEM `painelEntrevista` E SEM `qtdDecisores`, DE PROPÓSITO.
            Quem conduz a Entrevista Prévia é o parceiro, ao telefone com o
            lead — esta page nunca chamou `getDecisoresPendentes` e **não
            passa a chamar**: acrescentar a RPC aqui seria uma consulta nova
            por abertura de ficha só para pintar uma linha de aviso.

            O efeito é o desenhado: no diálogo "Ver perfil" o admin vê
            "A entrevista é conduzida pelo parceiro" no lugar do painel, e o
            sinal "N decisores · a Preliminar exige todos presentes" **não
            aparece** na ficha. `qtdDecisores` fica `null` = "não sabemos" —
            nunca 0, que afirmaria não haver decisor. O admin continua
            editando os 4 campos do DISC pelo botão, que é o que ele já fazia
            antes desta mudança.

            🔴 SEM `temEntrevistaConcluida` (23/09/2026), pelo MESMO motivo e
            por mais um: a linha "Próximo passo · marque a sessão" leva a
            `/sessoes`, rota que só existe para o ALUNO (`nav.ts` filtra por
            `basePath === ""`; não há `admin/aluno/[id]/sessoes/page.tsx`).
            Mostrá-la aqui mandaria o admin a um 404 — link que dá erro é pior
            que link ausente, a mesma regra que já governa a aba. Saber se há
            entrevista concluída custaria `getEntrevistasDoCliente`, consulta
            que esta page nunca fez. O default `false` do componente resolve
            sem que esta page precise saber. */}
        <ClienteFicha
          cliente={cliente}
          minutas={minutas}
          contextoObrigatorio={contextoObrigatorio}
          alunoId={alunoId}
          admin
          outroConfirmadoNome={outroConfirmadoNome}
        />
      </main>
    </>
  );
}
