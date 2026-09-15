import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getTutoriaisAtivo, getTutoriaisDoAluno } from "@/lib/data";
import { navDoAluno, navFixoDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { TutoriaisLista } from "@/components/tutoriais";

export const metadata = { title: "Tutoriais" };

/**
 * Aba de Tutoriais do aluno (15/09/2026) — rota `/tutoriais`. Molde:
 * `src/app/materiais/page.tsx`. A aba mora FIXA no header (`navFixoDoAluno`),
 * fora do trilho que rola — ver `nav-tabs.tsx`/`app-header.tsx`.
 *
 * Interruptor `gps.tutoriais_ativo()`: só busca a lista se estiver ligado —
 * não gasta RPC para uma seção que a aba fixa nem vai mostrar (e a própria
 * aba SOME quando desligado, decisão do Marcio — não é "em breve").
 */
export default async function TutoriaisPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const [aluno, ativo] = await Promise.all([getAlunoById(ctx.alunoId), getTutoriaisAtivo()]);
  const tutoriais = ativo ? await getTutoriaisDoAluno() : [];

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Parceiro"
        navItems={navDoAluno(ctx)}
        navFixo={navFixoDoAluno("", { tutoriais: ativo })}
      />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          titulo="Tutoriais"
          descricao="Como usar o portal, passo a passo — por assunto."
        />
        {/* 🔑 Interruptor DESLIGADO não é "ainda não publicamos". A aba some
            do header, mas quem tiver a URL salva continua chegando aqui — e o
            estado vazio padrão ("Nenhum tutorial publicado ainda") prometeria
            uma publicação que não vem enquanto a chave estiver off. Dizer o
            estado real é mais honesto do que reaproveitar a frase. */}
        {ativo ? (
          <TutoriaisLista tutoriais={tutoriais} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Os tutoriais estão indisponíveis no momento. Se precisar de ajuda
            agora, fale com a equipe pelo Suporte.
          </p>
        )}
      </main>
    </>
  );
}
