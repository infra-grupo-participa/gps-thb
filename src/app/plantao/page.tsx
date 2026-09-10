import Link from "next/link";
import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById } from "@/lib/data";
import { navDoAluno } from "@/lib/nav";
import { mesAtualSaoPaulo } from "@/lib/plantao";
import {
  buscarCalendarioLogado,
  buscarMinhaInscricaoLogado,
  inscreverLogado,
  cancelarLogado,
  revelarLinkLogado,
} from "@/app/plantao/actions";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { CalendarioMes } from "@/components/plantao/calendario-mes";
import { MinhaInscricaoCard } from "@/components/plantao/minha-inscricao-card";

/**
 * `/plantao` — aba do Plantão de Dúvidas DENTRO do sistema, exclusiva do
 * aluno do Programa de Implementação Assistida.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * e PROIBIDO de reconstruir.
 *
 * ⚠️ NÃO é a rota pública `/p/plantao` (embedada na Hotmart, exclusiva do
 * Acelera Holding). As duas convivem: `/p/plantao` continua recusando quem
 * tem ambiente no GPS (as 6 travas de sempre, intocadas); esta rota é o
 * caminho NOVO, só para quem já está logado no Programa — decisão do
 * Marcio, 10/09/2026 (ver a migration `20260910000236`).
 *
 * Identificação pela SESSÃO, nunca por formulário: nenhum `?e=`/`?n=` na
 * URL, nenhum campo de nome/e-mail na tela. `getContextoSessao()` já barra
 * quem não tem sessão de aluno; as RPCs `_logado` barram de novo no banco
 * (defesa em profundidade — a página nunca é a única fronteira).
 */

export const metadata = { title: "Plantão de Dúvidas" };

function parseMes(m: string | undefined): { ano: number; mes: number } {
  if (m && /^\d{4}-\d{2}$/.test(m)) {
    const [ano, mes] = m.split("-").map(Number);
    if (mes >= 1 && mes <= 12) return { ano, mes };
  }
  return mesAtualSaoPaulo();
}

export default async function PlantaoLogadoPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const { m } = await searchParams;
  const { ano, mes } = parseMes(m);

  const pessoaAlunoId = ctx.membroAlunoId ?? ctx.alunoId;
  const [aluno, calendario, minhaInscricao] = await Promise.all([
    getAlunoById(pessoaAlunoId),
    buscarCalendarioLogado(ano, mes),
    buscarMinhaInscricaoLogado(),
  ]);

  const abas = navDoAluno(ctx);

  return (
    <>
      <AppHeader
        nome={aluno?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Aluno"
        navItems={abas}
      />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Plantão de Dúvidas"
          voltar={
            <Link
              href="/"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar ao início
            </Link>
          }
        />

        <div className="grid gap-4">
          <p className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Você já está logado — a inscrição usa sua conta do Programa, sem
            precisar informar nome ou e-mail.
          </p>

          {minhaInscricao ? (
            <MinhaInscricaoCard
              inscricao={minhaInscricao}
              email=""
              aoCancelar={cancelarLogado}
              aoRevelarLink={revelarLinkLogado}
            />
          ) : null}

          {calendario.ok ? (
            <CalendarioMes
              ano={ano}
              mes={mes}
              slots={calendario.slots}
              email={null}
              nome={null}
              basePath="/plantao"
              aoInscrever={inscreverLogado}
              minhaInscricaoAtiva={
                minhaInscricao && !minhaInscricao.encerrado ? minhaInscricao : null
              }
            />
          ) : (
            <div
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            >
              {calendario.erro}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
