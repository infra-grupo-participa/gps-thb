import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Lock } from "lucide-react";
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
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

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
  //
  // `getAlunoById` entra no MESMO lote: ele recebe `alunoId` da sessão e não
  // depende de etapa nenhuma. Estava sozinho, depois das guardas — uma ida
  // ao banco a mais, em série, em toda abertura de etapa.
  const [etapasGlobais, overrides, aluno] = await Promise.all([
    getEtapas(),
    getEtapasLiberadasPara(alunoId),
    getAlunoById(alunoId),
  ]);
  const etapas = etapasComLiberacaoDoAluno(etapasGlobais, overrides);
  const etapaInfo = etapas.find((e) => e.id === n);
  // `conteudoEtapa(n)` já garantiu que a etapa existe no catálogo; se ela
  // sumiu de `gps.etapas`, não há nome nem ordem para exibir.
  if (!etapaInfo) notFound();
  const override = overrides[n];
  // 🔴 Travada SÓ PARA ELE (`etapa_liberacao_aluno.liberada = false`): a página
  // ABRE, com o aviso e o motivo. O `redirect("/")` mudo que existia aqui
  // jogava fora justamente o texto que a Central OBRIGA a equipe a escrever
  // (3..300 caracteres) — o aluno voltava para a home sem saber de nada.
  const travadaPelaEquipe = override?.liberada === false;
  // Bloqueada para TODO MUNDO (só `gps.etapas.liberada = false`) continua
  // voltando para a home: ali não há decisão sobre esta pessoa nem motivo
  // escrito, e a home já diz "Em breve · Libera conforme sua turma avança".
  if (!etapaInfo.liberada && !travadaPelaEquipe) redirect("/");

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Parceiro"
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

        {/* Liberação individual (`gps.etapa_liberacao_aluno`) nos DOIS sentidos.
            Sem este bloco o aluno via uma etapa aberta que os colegas não têm
            — ou, pior, uma porta fechada sem explicação nenhuma. */}
        {override ? (
          <div
            className="mb-6 rounded-lg border border-borda-fina bg-superficie-afundada p-3"
            // O aviso da etapa travada é a razão de a página existir neste
            // estado: quem chega por link precisa ouvi-lo, não descobri-lo
            // varrendo a tela.
            role={travadaPelaEquipe ? "alert" : undefined}
          >
            {travadaPelaEquipe ? (
              <Badge variant="warning" icone={Lock}>
                Travada para você pela equipe
              </Badge>
            ) : (
              <Badge variant="success">Liberada para você pela equipe</Badge>
            )}
            <p className="mt-2 max-w-[70ch] corpo-sm text-muted-foreground">
              {override.motivo ||
                (travadaPelaEquipe
                  ? "A equipe travou esta etapa para você."
                  : "A equipe abriu esta etapa para você.")}
            </p>
          </div>
        ) : null}

        {travadaPelaEquipe ? (
          // Mesmo tratamento das etapas bloqueadas na home: o conteúdo NÃO
          // aparece (nem tarefa, nem material, nem aula), e o vazio vem com
          // saída — beco sem saída é o defeito que o `EmptyState` existe para
          // não repetir.
          <EmptyState
            icone={<Lock />}
            titulo="Conteúdo indisponível por ora"
            // Sem promessa sobre o progresso: travar a etapa não mexe em
            // `gps.progresso`, mas a equipe tem uma ação SEPARADA de reabrir
            // que zera as tarefas — a tela não sabe qual das duas virá.
            descricao="Quando a equipe liberar esta etapa de novo, ela volta a aparecer no seu caminho. As outras etapas liberadas continuam abertas."
            acao={
              <Link href="/" className={buttonVariants({ variant: "outline" })}>
                Voltar ao início
              </Link>
            }
          />
        ) : (
          <EtapaConteudo alunoId={alunoId} n={n} basePath="" isAdmin={false} />
        )}
      </main>
    </>
  );
}
