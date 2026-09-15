import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getAmbiente,
  contarMembrosDoAmbiente,
  getTutoriaisAtivo,
  getTutoriaisDoAluno,
} from "@/lib/data";
import { assistenciaNavItems, navFixoDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { TutoriaisLista } from "@/components/tutoriais";

export const metadata = { title: "Tutoriais" };

/**
 * Espelho obrigatório de `/tutoriais` para o Modo Assistência — "como o
 * aluno vê" (15/09/2026). Não há amarra a etapa nesta feature, então a MESMA
 * RPC (`gps.tutoriais_do_aluno`) serve aos dois: não existe função irmã
 * `*_admin` como em vídeos, que só precisou dela por causa do corte por
 * etapa liberada.
 *
 * 🔴 Sem este espelho, um tutorial publicado só apareceria em `/tutoriais`
 * (aluno) e a prévia "como o aluno vê" mentiria — é o mesmo defeito já
 * registrado em `materiais/loading.tsx` (achado do Marcio, 11/09/2026).
 *
 * ⚠️ O QUE ESTE ESPELHO MOSTRA — e o que NÃO mostra.
 *
 * A RPC resolve `minha_reacao` por **`gps.pessoa_atual()` de quem chama**,
 * não por `gps.aluno_atual()` nem pelo `alunoId` da rota. Para o admin essa
 * função devolve NULL, então aqui a lista chega SEMPRE com `minhaReacao:
 * null` — a prévia mostra o catálogo como um aluno **que ainda não votou** o
 * veria, nunca o voto real daquele parceiro.
 *
 * 🔑 Isso é DESENHO, não limitação: a decisão 2 do Marcio (LGPD) é que o
 * nome de quem reagiu nunca sai do banco. Mostrar aqui o voto individual
 * exigiria justamente a coluna de pessoa que `gps.admin_tutoriais_resumo`
 * não devolve e que `gps.tutorial_reacoes` não expõe (não há policy de
 * admin). O que a equipe vê é o **placar agregado**, em `/admin/tutoriais`.
 *
 * `somenteLeitura`: além do acima, `pessoa_atual()` NULL faria o voto
 * recusar com 42501. Os botões ficam desabilitados com a razão no `title`,
 * nunca escondidos — a prévia existe para mostrar o que o aluno vê, e sumir
 * com eles mentiria na direção oposta.
 */
export default async function AdminAlunoTutoriaisPage({
  params,
}: {
  params: Promise<{ alunoId: string }>;
}) {
  const { alunoId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const ambiente = await getAmbiente(alunoId);
  if (!ambiente) notFound();

  const [aluno, qtdMembros, ativo] = await Promise.all([
    getAlunoById(alunoId),
    contarMembrosDoAmbiente(alunoId),
    getTutoriaisAtivo(),
  ]);
  const tutoriais = ativo ? await getTutoriaisDoAluno() : [];

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
        navFixo={navFixoDoAluno(`/admin/aluno/${alunoId}`, { tutoriais: ativo })}
      />
      <AssistBanner aluno={aluno} />

      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 py-8">
        <PageHeader
          titulo="Tutoriais"
          descricao="Como usar o portal, passo a passo — por assunto."
        />
        {/* Mesmo tratamento de `/tutoriais`: interruptor off diz o estado
            real, não "ainda não publicamos". Aqui a frase é para a EQUIPE —
            é ela que abre esta tela para responder ao aluno, e precisa saber
            que o sumiço é do interruptor, não falta de conteúdo. */}
        {ativo ? (
          <TutoriaisLista tutoriais={tutoriais} somenteLeitura />
        ) : (
          <p className="text-sm text-muted-foreground">
            Os tutoriais estão desligados pelo interruptor
            (<code>gps.config.tutoriais_ativo</code>): a aba não aparece para
            nenhum parceiro. O cadastro em <strong>Tutoriais</strong> continua
            funcionando normalmente.
          </p>
        )}
      </main>
    </>
  );
}
