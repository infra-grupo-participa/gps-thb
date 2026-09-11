import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { UsersRound } from "lucide-react";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getMembrosDoAmbiente } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { assistenciaNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AssistBanner } from "@/components/admin/assist-banner";

export const metadata = { title: "Equipe do parceiro" };

/**
 * Aba "Equipe" no MODO ASSISTÊNCIA — a equipe vê a mesma dupla que o parceiro
 * vê, para responder chamado sobre sócio/convite olhando a tela dele.
 *
 * 🔴 ESTA PÁGINA EXISTIA COMO ABA E NÃO COMO ROTA (achado do orquestrador,
 * 11/09/2026). `assistenciaNavItems` já passava `equipe: true`, então a aba
 * aparecia em TODAS as telas de assistência e **todo clique dava 404** — a
 * mesma classe do incidente "Modo Assistência respondia 404" de 10/09. A
 * escolha foi criar a página, não apagar a flag: o comentário do `nav.ts` diz
 * por que a equipe precisa dela.
 *
 * ⚠️ SOMENTE LEITURA. O convite é ato do TITULAR (decisão do Marcio: "não
 * acho válido deixar para nossa equipe fazer a liberação dos sócios"), e
 * remover sócio ativo passa pelo Suporte. Quem precisa agir no acesso usa
 * "Gerenciar acesso", que já existe e tem as guardas cross-sistema.
 *
 * 🔴 NADA DE FINANCEIRO aqui (B7-b), igual à aba do parceiro.
 */
export default async function AdminEquipePage({
  params,
}: {
  params: Promise<{ alunoId: string }>;
}) {
  const { alunoId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const [membros, aluno] = await Promise.all([
    getMembrosDoAmbiente(alunoId),
    getAlunoById(alunoId),
  ]);
  if (membros.length === 0) notFound();

  const pessoas = await pessoasDosMembros(membros);
  const temSocio = membros.some((m) => m.papel === "socio");
  const base = `/admin/aluno/${alunoId}`;

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={assistenciaNavItems(alunoId, {
          ambienteCompartilhado: membros.length > 1,
        })}
      />
      <AssistBanner aluno={aluno} />

      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Equipe do ambiente"
          descricao="Quem divide este ambiente — os mesmos clientes, tarefas e progresso."
          voltar={
            <Link
              href={base}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar ao ambiente do parceiro
            </Link>
          }
        />

        {temSocio ? (
          <div className="grid gap-3">
            {pessoas.map((p) => (
              <MembroCard key={p.membroId} pessoa={p} />
            ))}
          </div>
        ) : (
          <div className="grid gap-4">
            {pessoas.map((p) => (
              <MembroCard key={p.membroId} pessoa={p} />
            ))}
            <EmptyState
              icone={<UsersRound />}
              titulo="Este ambiente ainda não tem sócio"
              descricao="Quem convida é o próprio titular, pela aba Equipe do portal dele. A equipe não emite o convite — se ele estiver com dificuldade, oriente pelo Suporte."
            />
          </div>
        )}

        <p className="mt-4 text-xs text-muted-foreground">
          Para mexer em login, senha ou vínculo, use{" "}
          <Link
            href={base}
            className="font-medium text-accent-foreground underline underline-offset-4"
          >
            Gerenciar acesso
          </Link>{" "}
          no ambiente do parceiro.
        </p>
      </main>
    </>
  );
}

interface PessoaDoMembro {
  membroId: string;
  papel: "titular" | "socio";
  nome: string | null;
  email: string | null;
}

/**
 * Nome/e-mail de cada membro numa consulta `.in()` (não N+1).
 * `pessoa_aluno_id` já vem no select de `getMembrosDoAmbiente`.
 */
async function pessoasDosMembros(
  membros: Awaited<ReturnType<typeof getMembrosDoAmbiente>>,
): Promise<PessoaDoMembro[]> {
  const ids = membros
    .map((m) => m.pessoa_aluno_id)
    .filter((v): v is string => typeof v === "string" && v.length > 0);

  const porId = new Map<string, { nome: string | null; email: string | null }>();
  if (ids.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("thb_alunos")
      .select("id, nome, email")
      .in("id", ids);
    for (const linha of (data ?? []) as {
      id: string;
      nome: string | null;
      email: string | null;
    }[]) {
      porId.set(linha.id, { nome: linha.nome, email: linha.email });
    }
  }

  return membros.map((m) => {
    const p = m.pessoa_aluno_id ? porId.get(m.pessoa_aluno_id) : undefined;
    return {
      membroId: m.id,
      papel: m.papel as "titular" | "socio",
      nome: p?.nome ?? null,
      email: p?.email ?? null,
    };
  });
}

function MembroCard({ pessoa }: { pessoa: PessoaDoMembro }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="font-medium text-balance">
            {pessoa.nome ?? pessoa.email ?? "Membro sem cadastro vinculado"}
          </p>
          {pessoa.email && pessoa.nome ? (
            <p className="corpo-sm text-muted-foreground">{pessoa.email}</p>
          ) : null}
          {/* Sem `pessoa_aluno_id` a Central resolve o vínculo — dizer isso
              aqui poupa o admin de procurar o motivo em outra tela. */}
          {!pessoa.nome && !pessoa.email ? (
            <p className="corpo-sm text-muted-foreground">
              Sem cadastro vinculado — resolva em Resolver → Pessoas.
            </p>
          ) : null}
        </div>
        <Badge
          variant={pessoa.papel === "titular" ? "default" : "neutral"}
          className="shrink-0"
        >
          {pessoa.papel === "titular" ? "Titular" : "Sócio"}
        </Badge>
      </CardContent>
    </Card>
  );
}
