import { redirect } from "next/navigation";
import { UsersRound, Lock } from "lucide-react";
import { getContextoSessao } from "@/lib/auth";
import { getAlunoById, getMembrosDoAmbiente } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { getConvitePendente, getConviteSocioAtivo } from "@/lib/data/equipe";
import { navDoAluno } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConviteSocioForm } from "./convite-socio-form";
import { ConvitePendenteCard } from "./convite-pendente-card";

export const metadata = { title: "Equipe" };

/**
 * Aba "Equipe" (11/09/2026) — o TITULAR convida o próprio sócio.
 *
 * O portal já é compartilhado (clientes, tarefas e progresso são do
 * AMBIENTE); hoje só a equipe adicionava sócio. Esta aba dá esse poder ao
 * titular, e resolve a assimetria da home: o sócio já via o nome do
 * titular no banner (`AmbienteCompartilhadoBanner`); o titular não via o
 * nome do sócio em lugar nenhum.
 *
 * 🔴 NADA DE FINANCEIRO nesta aba (B7-b): nem "contratante", nem valor, nem
 * situação de pagamento. Só nome, e-mail, papel e último acesso.
 *
 * ⚠️ "Último acesso" por membro NÃO está disponível ao titular/sócio hoje —
 * é lido de `auth.users.last_sign_in_at`, que só a RPC SECURITY DEFINER do
 * admin (`gps.admin_status_acesso`) expõe. `MembroCard`, abaixo, mostra só
 * nome/e-mail/papel — divergência de contrato reportada no relatório da
 * feature (falta RPC de leitura análoga para o titular/sócio).
 */
export default async function EquipePage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const alunoId = ctx.alunoId;
  const souTitular = ctx.papelMembro === "titular";

  const [aluno, membros, conviteAtivo] = await Promise.all([
    getAlunoById(alunoId),
    getMembrosDoAmbiente(alunoId),
    getConviteSocioAtivo(),
  ]);

  const temSocioAtivo = membrosTemSocio(membros);
  // Convite pendente só existe quando ainda não há sócio — poupar a leitura
  // quando o ambiente já tem 2 membros evita uma RPC à toa em toda visita de
  // quem já tem sócio ativo.
  const [convitePendente, pessoas] = await Promise.all([
    temSocioAtivo ? Promise.resolve(null) : getConvitePendente(),
    pessoasDosMembros(membros),
  ]);

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
          titulo="Equipe"
          descricao="Quem compartilha este ambiente com você — os mesmos clientes, tarefas e progresso."
        />

        {temSocioAtivo ? (
          <div className="grid gap-3">
            {pessoas.map((p) => (
              <MembroCard key={p.membroId} pessoa={p} />
            ))}
            <p className="text-xs text-muted-foreground">
              Para trocar o sócio deste ambiente, fale com o Suporte — essa
              troca é feita pela equipe.
            </p>
          </div>
        ) : convitePendente ? (
          <div className="grid gap-4">
            {pessoas.map((p) => (
              <MembroCard key={p.membroId} pessoa={p} />
            ))}
            {souTitular ? (
              <ConvitePendenteCard convite={convitePendente} />
            ) : null}
          </div>
        ) : souTitular ? (
          <EmptyState
            icone={<UsersRound />}
            titulo="Convide seu sócio para este ambiente"
            descricao="Vocês vão compartilhar o mesmo portal: os mesmos clientes, as mesmas tarefas e o mesmo progresso. Cada um entra com o seu próprio e-mail e senha."
            acao={
              conviteAtivo ? (
                <div className="w-full max-w-md">
                  <ConviteSocioForm />
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock aria-hidden className="size-3.5" />
                  O convite de sócio ainda não está liberado para o seu
                  ambiente. Assim que abrir, o botão aparece aqui.
                </p>
              )
            }
          />
        ) : (
          <div className="grid gap-3">
            {pessoas.map((p) => (
              <MembroCard key={p.membroId} pessoa={p} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}

function membrosTemSocio(
  membros: Awaited<ReturnType<typeof getMembrosDoAmbiente>>,
): boolean {
  return membros.some((m) => m.papel === "socio");
}

interface PessoaDoMembro {
  membroId: string;
  papel: "titular" | "socio";
  nome: string | null;
  email: string | null;
}

/**
 * Nome/e-mail de cada membro, via `thb_alunos` (uma consulta `.in()`, não
 * N+1). `pessoa_aluno_id` vem no MESMO select de `getMembrosDoAmbiente`
 * (ver `src/lib/data/alunos.ts`) — zero consulta a mais para achar a chave.
 *
 * Membro sem `pessoa_aluno_id` (login ainda sem cadastro vinculado) aparece
 * com nome/e-mail `null`; a UI mostra "Sem cadastro vinculado" em vez de
 * quebrar ou inventar dado.
 */
async function pessoasDosMembros(
  membros: Awaited<ReturnType<typeof getMembrosDoAmbiente>>,
): Promise<PessoaDoMembro[]> {
  const ids = membros
    .map((m) => m.pessoa_aluno_id)
    .filter((id): id is string => Boolean(id));

  const porId = new Map<string, { nome: string | null; email: string | null }>();
  if (ids.length > 0) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("thb_alunos")
      .select("id, nome, email")
      .in("id", ids);
    for (const l of (data ?? []) as {
      id: string;
      nome: string | null;
      email: string | null;
    }[]) {
      porId.set(l.id, { nome: l.nome, email: l.email });
    }
  }

  return membros
    .map((m) => {
      const pessoa = m.pessoa_aluno_id ? porId.get(m.pessoa_aluno_id) : null;
      return {
        membroId: m.id,
        papel: m.papel,
        nome: pessoa?.nome ?? null,
        email: pessoa?.email ?? null,
      };
    })
    .sort((a, b) => (a.papel === "titular" ? -1 : b.papel === "titular" ? 1 : 0));
}

/**
 * Uma linha de pessoa: nome, e-mail, papel. NUNCA "último acesso" — ver o
 * comentário no topo do arquivo sobre a divergência de contrato.
 */
function MembroCard({ pessoa }: { pessoa: PessoaDoMembro }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">
              {pessoa.nome ?? "Sem cadastro vinculado"}
            </span>
            <Badge variant={pessoa.papel === "titular" ? "default" : "secondary"}>
              {pessoa.papel === "titular" ? "titular" : "sócio"}
            </Badge>
          </div>
          {pessoa.email ? (
            <p className="truncate text-sm text-muted-foreground">
              {pessoa.email}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
