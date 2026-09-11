import { redirect } from "next/navigation";
import { LifeBuoy, Lock } from "lucide-react";
import { getContextoSessao } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getAlunoById, getMembrosDoAmbiente } from "@/lib/data";
import { getClientesEtapa1, getClienteEquipe } from "@/lib/data/clientes";
import {
  getChamadosCategoriasAtivo,
  getChamadosDoAmbiente,
  getSuporteAberto,
} from "@/lib/chamados-data";
import {
  CATEGORIAS_CHAMADO,
  CHAMADOS_MAX_ABERTOS,
  type CategoriaChamado,
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
 * `?categoria=` é PREFILL de qual aba do diálogo abre — não pré-aprovação de
 * nada. Hoje só quem chega da ficha do cliente usa (`hrefChamadoTroca`, em
 * `acompanhamento-equipe.tsx`, com `troca_cliente`). Categoria fora da
 * allowlist cai em `null` (o diálogo abre na primeira opção).
 */
function categoriaDaUrl(
  bruto: string | string[] | undefined,
): CategoriaChamado | null {
  if (typeof bruto !== "string") return null;
  return (CATEGORIAS_CHAMADO as readonly string[]).includes(bruto)
    ? (bruto as CategoriaChamado)
    : null;
}

export default async function ChamadosPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | string[] | undefined }>;
}) {
  const categoriaInicial = categoriaDaUrl((await searchParams).categoria);
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel === "admin") redirect("/admin/chamados");
  if (ctx.papel !== "aluno" || !ctx.alunoId) redirect("/");

  const alunoId = ctx.alunoId;
  const [aluno, chamados, suporteAberto, categoriasAtivo] = await Promise.all([
    getAlunoById(alunoId),
    getChamadosDoAmbiente(alunoId),
    getSuporteAberto(),
    getChamadosCategoriasAtivo(),
  ]);

  // O formulário de troca só precisa de clientes/sócio quando a feature está
  // ligada — poupa duas idas ao banco no caminho comum (interruptor
  // desligado é o padrão de hoje, e continuará sendo até o Marcio ligar).
  const [clientes, favorito, membros] = categoriasAtivo
    ? await Promise.all([
        getClientesEtapa1(alunoId),
        getClienteEquipe(alunoId),
        getMembrosDoAmbiente(alunoId),
      ])
    : [[], null, []];

  const socioAtual = membros.find((m) => m.papel === "socio") ?? null;
  const socioAtualNome = await nomeDoSocio(socioAtual?.pessoa_aluno_id ?? null);

  const vivos = chamados.filter((c) => c.status !== "fechado");
  const noLimite = vivos.length >= CHAMADOS_MAX_ABERTOS;
  // Três razões diferentes para não haver botão — e a tela diz qual é. Botão
  // que some sem explicação é o defeito que esta fase existe para não repetir.
  const podeAbrir = suporteAberto && !noLimite;

  const dialogo = podeAbrir ? (
    <ChamadoNovoDialog
      categoriaInicial={categoriaInicial}
      categoriasAtivo={categoriasAtivo}
      clientes={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
      clienteAtualId={favorito?.id ?? null}
      clienteAtualNome={favorito?.nome ?? null}
      socioAtualNome={socioAtualNome}
      temSocio={Boolean(socioAtual)}
    />
  ) : null;

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
          acao={dialogo}
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
            acao={dialogo}
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

/**
 * Nome do sócio ATUAL, via `thb_alunos` — mesmo padrão de `pessoasDosMembros`
 * em `src/app/equipe/page.tsx` (sem `pessoa_aluno_id`, sem consulta).
 * `null` quando não há sócio ou o vínculo com o cadastro ainda não foi feito.
 */
async function nomeDoSocio(pessoaAlunoId: string | null): Promise<string | null> {
  if (!pessoaAlunoId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("thb_alunos")
    .select("nome")
    .eq("id", pessoaAlunoId)
    .maybeSingle();
  return (data as { nome: string | null } | null)?.nome ?? null;
}
