import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getClienteById, getClienteEquipe, getTutoriaisAtivo } from "@/lib/data";
import { navDoAluno, navFixoDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { ClienteFicha } from "@/components/clientes/cliente-ficha";
import { estrelaTravada } from "@/components/clientes/clientes-manager/ordenacao";
import { getMinutaContextoObrigatorio } from "@/lib/data/minutas";
import { getMinutasDoCliente } from "@/lib/data/minutas";
import {
  getDecisoresPendentes,
  getEntrevistasDoCliente,
} from "@/lib/data/entrevista-previa";
import { PainelEntrevistaPrevia } from "@/components/clientes/entrevista-previa/painel-resultado";

export default async function ClienteFichaPage({
  params,
}: {
  params: Promise<{ clienteId: string }>;
}) {
  const { clienteId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const alunoId = ctx.alunoId;

  // 🔑 Em paralelo: `getAlunoById` recebe `alunoId` da SESSÃO, não do
  // cliente — não depende do resultado da primeira consulta e não vaza nada
  // se a guarda abaixo reprovar (ela busca o próprio aluno, que a pessoa já
  // tem direito de ver). Em série eram duas idas ao banco.
  //
  // ⚠️ A guarda de propriedade continua ANTES de qualquer render: o
  // `notFound()` roda com as duas respostas em mãos, no mesmo ponto lógico
  // de antes.
  const [cliente, aluno, minutas, tutoriaisAtivo, decisores, entrevistas] =
    await Promise.all([
    getClienteById(clienteId),
    getAlunoById(alunoId),
    // 🔑 No MESMO Promise.all: a lista de minutas não depende do cliente nem
    // do aluno, então pedir em cascata custaria uma viagem a mais por ficha.
    getMinutasDoCliente(clienteId),
    // 🔑 Estava SOLTO fora do Promise.all (uma ida ao banco a mais por
    // abertura de ficha) — junto aqui, mesma independência das outras três.
    getTutoriaisAtivo(),
    // 🔑 No MESMO Promise.all: decisores e histórico da Entrevista Prévia não
    // dependem do cliente nem do aluno. Em cascata custariam duas viagens a
    // mais por abertura de ficha — a tela mais usada do produto.
    getDecisoresPendentes(clienteId),
    getEntrevistasDoCliente(clienteId),
  ]);
  if (!cliente || cliente.aluno_id !== alunoId) notFound();

  /**
   * Só quando ESTE cliente não é a estrela: a ficha precisa saber se OUTRO
   * cliente do ambiente já é, senão ofereceria uma estrela que o banco recusa
   * (42501). Uma linha indexada (`acompanhado_equipe` é único por ambiente), e
   * nem isso quando o cliente aberto já é o favorito.
   *
   * 🔴 **Migração ...304 (23/09/2026)**: quem esconde a estrela desta ficha é o
   * outro favorito cujo CASO JÁ ANDOU — `definirClienteEquipe` o desmarcaria
   * primeiro, e é esse `update` que a trigger recusa com 42501. Era
   * `acompanhamento_confirmado_em`, que em 3 meses nunca foi preenchida: a
   * condição valia `false` para todo mundo e a estrela nunca sumia.
   *
   * `estrelaTravada` é a MESMA função que a lista e a ficha usam — um lugar só
   * para a regra, senão duas telas discordam sobre o mesmo cliente.
   */
  const outroFavorito = cliente.acompanhado_equipe
    ? null
    : await getClienteEquipe(alunoId);
  const outroFavoritoNome = outroFavorito?.nome ?? null;
  const outroConfirmadoNome =
    outroFavorito && estrelaTravada(outroFavorito)
      ? (outroFavorito.nome ?? null)
      : null;

  // O interruptor `gps.config.minuta_contexto_obrigatorio` (17/09/2026).
  // Vai por RPC (`getMinutaContextoObrigatorio`) porque `gps.config` só tem
  // policy de admin — o parceiro leria 0 linhas e cairia no fallback para
  // sempre. Memoizada por requisição, então não custa uma ida a mais.
  const contextoObrigatorio = await getMinutaContextoObrigatorio();

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Parceiro"
        navItems={navDoAluno(ctx)}
        navFixo={navFixoDoAluno("", { tutoriais: tutoriaisAtivo })}
      />
      <main id="conteudo" className="mx-auto w-full max-w-4xl px-4 pt-8 pb-16">
        <PageHeader
          titulo={cliente.nome || "Novo cliente"}
          voltar={
            <Link
              href="/clientes"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar aos clientes
            </Link>
          }
        />

        <ClienteFicha
          cliente={cliente}
          minutas={minutas}
          contextoObrigatorio={contextoObrigatorio}
          alunoId={alunoId}
          outroConfirmadoNome={outroConfirmadoNome}
          outroFavoritoNome={outroFavoritoNome}
          // 🔑 A contagem sai do MESMO `getDecisoresPendentes` que já alimenta
          // o painel, resolvido no `Promise.all` acima. Zero consulta nova: o
          // DISC virou pop-up e a ficha precisa do sinal de "mais de um
          // decisor" do lado de fora dele, senão a trava da Preliminar só
          // apareceria para quem abrisse a janela.
          //
          // `?? null` e não `?? 0`: a RPC devolve `null` quando falha
          // (`getDecisoresPendentes` loga e retorna `null`), e 0 diria "não há
          // decisor" — afirmação que um erro de leitura não autoriza.
          qtdDecisores={decisores?.decisores.length ?? null}
          // 🔑 ZERO CONSULTA NOVA: derivado do MESMO `getEntrevistasDoCliente`
          // que já está no `Promise.all` acima e já alimenta o painel. É a
          // regra que `qtdDecisores` inaugurou logo acima — o sinal na ficha
          // não pode custar mais uma ida ao banco na tela mais usada do
          // produto.
          //
          // `concluida_em != null` e não `.length > 0`: entrevista ABERTA
          // (o parceiro começou e a conversa caiu) não é entrevista feita, e
          // sugerir marcar a sessão em cima dela mandaria ele adiante com o
          // mapa dos decisores pela metade.
          temEntrevistaConcluida={entrevistas.some((e) => e.concluida_em != null)}
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
