import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import {
  EtapaAgendar,
  type EstadoAgendar,
} from "@/components/clientes/entrevista-previa/etapa-agendar";
import {
  dataCombinadaFutura,
  getPreliminarViva,
} from "@/components/clientes/entrevista-previa/preliminar-viva";
import { getClienteElegivel } from "@/components/sessoes/elegibilidade";
import { PageHeader } from "@/components/ui/page-header";
import { getContextoSessao } from "@/lib/auth";
import { hojeSaoPaulo } from "@/lib/datas";
import { getAlunoById, getClienteById } from "@/lib/data";
import { getDecisoresPendentes, getEntrevistaEmAberto } from "@/lib/data/entrevista-previa";
import {
  getHorariosLivres,
  getHorariosReservados,
  getTiposDeSessaoAtivos,
} from "@/lib/data/sessoes";
import { mapearDecisores } from "@/lib/entrevista-previa-calculo";
import { navDoAluno } from "@/lib/nav";
import { TIPO_REUNIAO_PRELIMINAR } from "@/lib/sessoes-tipos";

/**
 * `/clientes/[clienteId]/entrevista/agendar?e=<entrevistaId>` — o passo
 * seguinte à Entrevista Prévia: marcar a Reunião Preliminar (plano 3.0, §3).
 *
 * 🔴 SÓ DO PARCEIRO. Admin recebe 404: a equipe não agenda nesta entrega
 * (item d) e a grade reusada chama `agendarSessao`, que agenda para o
 * ambiente de quem está logado.
 *
 * 🔴 IDOR do `?e=`: a entrevista só serve para ler a PRESENÇA declarada, e
 * só se for DESTE cliente. `e` de outro cliente do mesmo ambiente (a RLS
 * deixaria ler) → 404. `e` que a RLS esconde volta `null` e é ignorado.
 *
 * 🔑 Leituras aqui, nenhuma escrita: a única escrita da tela é a da grade
 * (`agendarSessao`), que já existe em `/sessoes`.
 *
 * Consultas, em 2 ondas paralelas: (1) cliente, parceiro, entrevista `e`,
 * Preliminar viva, catálogo, elegibilidade; (2) grade + decisores, SÓ no
 * caminho em que a grade aparece. O resto não pede nada além da onda 1.
 */
export const metadata = { title: "Marque a Reunião Preliminar" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AgendarPreliminarPage({
  params,
  searchParams,
}: {
  params: Promise<{ clienteId: string }>;
  searchParams: Promise<{ e?: string | string[] }>;
}) {
  const [{ clienteId }, sp] = await Promise.all([params, searchParams]);
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") notFound();
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");
  const alunoId = ctx.alunoId;

  const e = typeof sp.e === "string" ? sp.e : null;
  if (e !== null && !UUID.test(e)) notFound();

  const [cliente, aluno, entrevista, viva, tipos, elegivel] = await Promise.all([
    getClienteById(clienteId),
    getAlunoById(alunoId),
    e ? getEntrevistaEmAberto(e) : Promise.resolve(null),
    getPreliminarViva(alunoId),
    getTiposDeSessaoAtivos(),
    getClienteElegivel(alunoId, TIPO_REUNIAO_PRELIMINAR),
  ]);

  // Mesma guarda da ficha e da entrevista: o cliente tem de ser deste ambiente.
  if (!cliente || cliente.aluno_id !== alunoId) notFound();
  if (entrevista && entrevista.cliente_id !== clienteId) notFound();

  const sessaoTipo = tipos.find((t) => t.id === TIPO_REUNIAO_PRELIMINAR) ?? null;
  const clienteNome = cliente.nome ?? "o cliente";
  // A data que o parceiro combinou com o cliente ANTES da entrevista (ficha).
  const dataSugerida = dataCombinadaFutura(cliente.data_reuniao_preliminar, hojeSaoPaulo());

  let estado: EstadoAgendar;
  if (viva.falhou || elegivel.falhou || !sessaoTipo) {
    // `!sessaoTipo`: o catálogo engole o erro e devolve `[]`, então "tipo
    // ausente" e "leitura caída" chegam iguais — a frase de E é verdadeira
    // nos dois casos, uma afirmação sobre o catálogo não seria.
    estado = { tipo: "E" };
  } else if (viva.sessao) {
    estado = {
      tipo: "D",
      inicioEm: viva.sessao.inicio_em,
      outroCliente: viva.sessao.cliente_id !== clienteId,
    };
  } else if (elegivel.clienteId && elegivel.clienteId !== clienteId) {
    estado = { tipo: "C2", clienteAcompanhadoId: elegivel.clienteId };
  } else if (!elegivel.clienteId) {
    estado = cliente.acompanhado_equipe
      ? { tipo: "C3", nomeDoTipo: sessaoTipo.nome, etapaDoTipo: sessaoTipo.etapa_id ?? null }
      : { tipo: "C1" };
  } else {
    // Elegível e é este cliente: só agora se pede a grade e os decisores.
    const [grade, ocupados, decisores] = await Promise.all([
      getHorariosLivres({ tipoId: TIPO_REUNIAO_PRELIMINAR }),
      getHorariosReservados({ tipoId: TIPO_REUNIAO_PRELIMINAR }),
      getDecisoresPendentes(clienteId),
    ]);
    if (grade.erro) {
      estado = { tipo: "E" };
    } else if (grade.horarios.length === 0) {
      estado = {
        tipo: "B",
        reservadosNaGrade: { sessaoTipo, clienteNome, reservados: ocupados.horarios },
      };
    } else {
      estado = {
        tipo: "A",
        sessaoTipo,
        horarios: grade.horarios,
        reservados: ocupados.horarios,
        clienteNome,
        decisores: decisores
          ? {
              nomes: decisores.decisores.map((d) => d.nome).filter(Boolean),
              exigeTodos: decisores.exigeTodos,
            }
          : null,
        presenca: entrevista ? mapearDecisores(entrevista.respostas).presenca : null,
      };
    }
  }

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Parceiro"
        navItems={navDoAluno(ctx)}
      />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Marque a Reunião Preliminar"
          descricao={
            entrevista?.concluida_em
              ? `Entrevista Prévia com ${clienteNome} concluída. O próximo passo é a Reunião Preliminar com a equipe jurídica.`
              : `Reunião Preliminar de ${clienteNome} com a equipe jurídica.`
          }
        />
        <EtapaAgendar estado={estado} clienteId={clienteId} dataSugerida={dataSugerida} />
      </main>
    </>
  );
}
