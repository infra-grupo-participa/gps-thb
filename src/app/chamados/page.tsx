import { redirect } from "next/navigation";
import { LifeBuoy, Lock } from "lucide-react";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById } from "@/lib/data";
import { getChamadosDoAmbiente, getSuporteAberto } from "@/lib/chamados-data";
import {
  CHAMADOS_MAX_ABERTOS,
  CHAMADO_ASSUNTO_MAXIMO,
} from "@/lib/chamados-tipos";
import { navDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ChamadosLista } from "@/components/chamados/chamados-lista";
import { ChamadoNovoDialog } from "@/components/chamados/chamado-novo-dialog";

export const metadata = { title: "Suporte" };

/**
 * Suporte do aluno — a lista de chamados do AMBIENTE.
 *
 * 🔑 Titular E sócio (ao contrário do Financeiro, B7-b): o chamado é do
 * ambiente, como cliente e progresso. Os dois veem a mesma thread, porque os
 * dois usam o mesmo portal e quebram nas mesmas telas.
 *
 * ⚠️ NÃO existe e-mail de suporte na UI hoje — este canal não substitui nada,
 * ele preenche um vazio. Por isso a copy é "Fale com a equipe por aqui", nunca
 * "no lugar do e-mail".
 */

/**
 * `?assunto=` é PREFILL, nada mais: quem chega da ficha do cliente ("abra um
 * chamado" para trocar o cliente acompanhado) já encontra o campo escrito.
 *
 * Tratado como texto normal, e o tratamento é o mínimo honesto: uma linha só
 * (CR/LF e caracteres de controle fora — o assunto vira `subject` de e-mail lá
 * na frente, e quebra de linha em cabeçalho é injeção), colapso de espaços e o
 * teto que o campo já tem. **Não é a fronteira**: quem valida de verdade
 * continua sendo `abrirChamado`, e é o React que escapa o texto na tela.
 */
const CONTROLE = new RegExp("[\u0000-\u001f\u007f]+", "g");

function assuntoDaUrl(bruto: string | string[] | undefined): string {
  if (typeof bruto !== "string") return "";
  return bruto
    .replace(CONTROLE, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, CHAMADO_ASSUNTO_MAXIMO);
}

export default async function ChamadosPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const assuntoInicial = assuntoDaUrl((await searchParams).assunto);
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin/chamados");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const alunoId = ctx.alunoId;
  const [aluno, chamados, suporteAberto] = await Promise.all([
    getAlunoById(alunoId),
    getChamadosDoAmbiente(alunoId),
    getSuporteAberto(),
  ]);

  const vivos = chamados.filter((c) => c.status !== "fechado");
  const noLimite = vivos.length >= CHAMADOS_MAX_ABERTOS;
  // Três razões diferentes para não haver botão — e a tela diz qual é. Botão
  // que some sem explicação é o defeito que esta fase existe para não repetir.
  const podeAbrir = suporteAberto && !noLimite;

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
          titulo="Suporte"
          descricao="Fale com a equipe por aqui. Abra um chamado, acompanhe a resposta e feche quando resolver."
          acao={
            podeAbrir ? (
              <ChamadoNovoDialog assuntoInicial={assuntoInicial} />
            ) : null
          }
        />

        {!suporteAberto ? (
          <p
            role="status"
            className="mb-6 flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"
          >
            <Lock aria-hidden className="mt-0.5 size-4 shrink-0" />
            O suporte por chamado está temporariamente fechado. Fale com a
            equipe pelos canais de sempre. Os chamados que já existem continuam
            recebendo resposta.
          </p>
        ) : null}

        {suporteAberto && noLimite ? (
          <p
            role="status"
            className="mb-6 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground"
          >
            Você já tem {CHAMADOS_MAX_ABERTOS} chamados em aberto. Acompanhe os
            que existem antes de abrir outro.
          </p>
        ) : null}

        {chamados.length === 0 ? (
          <EmptyState
            icone={<LifeBuoy />}
            titulo="Você ainda não abriu nenhum chamado."
            descricao="Precisa de ajuda com o portal? Abra um chamado e a equipe responde por aqui."
            acao={
              podeAbrir ? (
                <ChamadoNovoDialog assuntoInicial={assuntoInicial} />
              ) : null
            }
          />
        ) : (
          <ChamadosLista
            chamados={chamados}
            basePath="/chamados"
            visao="aluno"
          />
        )}
      </main>
    </>
  );
}
