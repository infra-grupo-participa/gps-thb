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
import { estrelaTravada } from "@/components/clientes/clientes-manager/ordenacao";
import { getMinutasDoCliente } from "@/lib/data/minutas";
import {
  getDecisoresPendentes,
  getEntrevistasDoCliente,
} from "@/lib/data/entrevista-previa";
import { PainelEntrevistaPrevia } from "@/components/clientes/entrevista-previa/painel-resultado";

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
  const [aluno, qtdMembros, outroConfirmado, tutoriaisAtivo, minutas, decisores, entrevistas] =
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
      // 🔑 Espelha a ficha do aluno (23/09/2026): decisores e histórico da
      // Entrevista Prévia não dependem do cliente nem do aluno. No MESMO
      // Promise.all — em cascata custaria duas viagens a mais por abertura
      // de ficha, a tela mais usada do produto.
      getDecisoresPendentes(clienteId),
      getEntrevistasDoCliente(clienteId),
    ]);
  // 🔴 `estrelaTravada` desde 23/09/2026 (migração ...304): o que esconde a
  // estrela é o outro favorito cujo CASO já andou, não mais
  // `acompanhamento_confirmado_em` — coluna que nunca foi preenchida em
  // produção. Mesma função da ficha do aluno e da lista.
  const outroConfirmadoNome =
    outroConfirmado && estrelaTravada(outroConfirmado)
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

            🔴 DECISÃO REVOGADA PELO MARCIO EM 23/09/2026: o espelho do admin
            passa a mostrar o painel da Entrevista Prévia, igual à ficha do
            aluno — a omissão anterior (nenhum `painelEntrevista`, nenhum
            `qtdDecisores`) deixava a visualização assistida divergir da real:
            o parceiro conduz a entrevista, o admin acompanha, e o admin não
            enxergava nem o resultado nem o aviso "N decisores · a Preliminar
            exige todos presentes". Motivo original (quem conduz é o parceiro)
            continua verdadeiro, só não justifica mais ESCONDER o resultado.

            🔴 CONTINUA SEM `temEntrevistaConcluida`, de propósito: a linha
            "Próximo passo · marque a sessão" leva a `/sessoes`, rota que só
            existe para o ALUNO (`nav.ts` filtra por `basePath === ""`; não há
            `admin/aluno/[id]/sessoes/page.tsx`). Passar essa prop mandaria o
            admin a um 404. `cliente-ficha.tsx:1175` já tem a guarda `!admin
            &&` para essa linha, mas não depender só dela: o default `false`
            do componente resolve sem que esta page precise declarar a prop. */}
        <ClienteFicha
          cliente={cliente}
          minutas={minutas}
          contextoObrigatorio={contextoObrigatorio}
          alunoId={alunoId}
          admin
          outroConfirmadoNome={outroConfirmadoNome}
          qtdDecisores={decisores?.decisores.length ?? null}
          painelEntrevista={
            <PainelEntrevistaPrevia
              clienteId={clienteId}
              temDisc={Boolean(cliente.perfil_disc)}
              decisores={decisores?.decisores ?? []}
              entrevistas={entrevistas}
            />
          }
        />
      </main>
    </>
  );
}
