import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getAmbiente, getTutoriaisAtivo } from "@/lib/data";
import { getEstadoDrive } from "@/lib/data/drive";
import { navDoAluno, navFixoDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { PastaView } from "@/components/pasta/pasta-view";
import { PastaCriando } from "@/components/pasta/pasta-criando";
import { PastaParceiroForm } from "@/components/pasta/pasta-parceiro-form";

export const metadata = { title: "Pasta" };

export default async function PastaPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const [aluno, ambiente, tutoriaisAtivo, estadoDrive] = await Promise.all([
    getAlunoById(ctx.alunoId),
    getAmbiente(ctx.alunoId),
    getTutoriaisAtivo(),
    getEstadoDrive(ctx.alunoId),
  ]);
  // `null` (leitura falhou) ou chave desligada: fluxo de hoje (link ou campo de colar).
  // Só `provisionar_parceiro` em andamento esconde o link: `compartilhar` roda
  // sobre pasta que o parceiro já tem, e o link dele continua valendo.
  const criando =
    estadoDrive?.ativo === true &&
    estadoDrive.parceiro.situacao === "criando" &&
    estadoDrive.parceiro.tipo === "provisionar_parceiro";

  const pastaUrl = ambiente?.pasta_drive_url ?? null;
  const origem = ambiente?.pasta_drive_origem ?? null;

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Parceiro"
        navItems={navDoAluno(ctx)}
        navFixo={navFixoDoAluno("", { tutoriais: tutoriaisAtivo })}
      />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16">
        {/* UX6 — o cabeçalho afirmava "todos os documentos… organizados no
            Drive" mesmo para quem ainda não tem pasta nenhuma. A descrição
            passa a depender do estado real do ambiente. */}
        <PageHeader
          titulo="Minha pasta"
          descricao={
            criando
              ? "A equipe está criando a sua pasta do Drive."
              : pastaUrl
                ? "Os documentos do seu processo, na sua pasta do Drive."
                : "Cole aqui o link da pasta do Drive com os seus documentos — ou aguarde a equipe inserir."
          }
        />

        {/* PF4 — o formulário de admin NÃO é importado aqui: se estivesse,
            o código dele e a referência da Server Action de admin entrariam
            no bundle do aluno mesmo sem nunca renderizar. O do parceiro
            (`PastaParceiroForm`) chama só `salvarMinhaPasta`, cujo aluno vem
            da sessão. É irmão do `PastaView`, não filho: o refresh depois de
            salvar troca o vazio pelo card sem desmontar o formulário. */}
        <div className="grid gap-4">
          {criando && estadoDrive ? (
            <PastaCriando estado={estadoDrive.parceiro} />
          ) : (
            <>
              <PastaView
                pastaUrl={pastaUrl}
                isAdmin={false}
                origem={origem}
                porNome={ambiente?.pasta_drive_por_nome ?? null}
                em={ambiente?.pasta_drive_em ?? null}
              />
              <PastaParceiroForm pastaUrl={pastaUrl} origem={origem} />
            </>
          )}
        </div>
      </main>
    </>
  );
}
