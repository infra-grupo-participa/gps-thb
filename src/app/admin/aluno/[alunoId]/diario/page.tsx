import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getAmbiente,
  getDiarioDoAluno,
  getPendenciasAbertasDoAluno,
  getEventosDoAluno,
  getAcoesAdministrativasDoAluno,
  getMarcosDeAcesso,
  getMarcosDeTrilha,
} from "@/lib/data";
import { montarTrilha } from "@/lib/log-agregacao";
import type { ItemTrilha } from "@/lib/types";
import { assistenciaNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { AssistBanner } from "@/components/admin/assist-banner";
import { DiarioForm } from "@/components/admin/diario-form";
import { DiarioTimeline } from "@/components/admin/diario-timeline";
import { TrilhaCabecalho } from "@/components/admin/trilha-cabecalho";
import { TrilhaDoAluno } from "@/components/admin/trilha-do-aluno";
import { cn } from "@/lib/utils";

export const metadata = { title: "Diário do aluno" };

type Foco = "tudo" | "aluno" | "equipe";
type Janela = "30" | "90" | "tudo";

const OPCOES_FOCO: { valor: Foco; rotulo: string }[] = [
  { valor: "tudo", rotulo: "Tudo" },
  { valor: "aluno", rotulo: "Só aluno" },
  { valor: "equipe", rotulo: "Só equipe" },
];

const OPCOES_JANELA: { valor: Janela; rotulo: string }[] = [
  { valor: "30", rotulo: "30 dias" },
  { valor: "90", rotulo: "90 dias" },
  { valor: "tudo", rotulo: "Tudo" },
];

/** Rótulo da janela ativa para o estado vazio da trilha ("Nenhum registro nos últimos X"). `null` = "Tudo" (sem recorte de tempo, não faz sentido citar período). */
function rotuloJanelaAtiva(janela: Janela): string | null {
  if (janela === "tudo") return null;
  return OPCOES_JANELA.find((op) => op.valor === janela)?.rotulo ?? null;
}

function parseFoco(v: string | undefined): Foco {
  return v === "aluno" || v === "equipe" ? v : "tudo";
}

function parseJanela(v: string | undefined): Janela {
  return v === "30" || v === "tudo" ? v : "90";
}

/**
 * `desde` (ISO) para `getEventosDoAluno`, ou `undefined` para "tudo".
 *
 * Função de módulo separada do corpo do componente de propósito: o linter do
 * React Compiler (`react-hooks/purity`) reprova `Date.now()` chamado direto
 * durante o render — mesmo em Server Component. Isolar a leitura do relógio
 * aqui deixa o corpo do componente livre da chamada impura.
 */
function desdeDaJanela(janela: Janela): string | undefined {
  if (janela === "tudo") return undefined;
  const dias = janela === "30" ? 30 : 90;
  return new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
}

function montarHref(
  alunoId: string,
  params: { foco: Foco; janela: Janela },
): string {
  const qs = new URLSearchParams();
  if (params.foco !== "tudo") qs.set("foco", params.foco);
  if (params.janela !== "90") qs.set("janela", params.janela);
  const query = qs.toString();
  return `/admin/aluno/${alunoId}/diario${query ? `?${query}` : ""}`;
}

/**
 * Aplica o filtro Foco (Tudo / Só aluno / Só equipe) sobre a trilha já
 * montada. "Aluno" = a ação foi do aluno (evento/macro com `ator='aluno'`).
 * "Equipe" = notas do diário + ações administrativas + eventos/macros com
 * `ator='equipe'`. Eventos de `ator='sistema'` (ex.: conta criada) aparecem
 * em ambos os focos — são o pano de fundo objetivo da jornada, não uma ação
 * de uma das duas partes.
 */
function filtrarPorFoco(itens: ItemTrilha[], foco: Foco): ItemTrilha[] {
  if (foco === "tudo") return itens;
  return itens.filter((item) => {
    if (item.variante === "nota" || item.variante === "acao_administrativa") {
      return foco === "equipe";
    }
    const ator =
      item.variante === "macro" ? item.macro.ator : item.evento.ator;
    if (ator === "sistema") return true;
    return ator === foco;
  });
}

/**
 * Diário do aluno — Fase 2: trilha única (log de ações do aluno + diário da
 * equipe + ações administrativas). Visualização EXCLUSIVA do admin (LGPD).
 * Ver aviso em `assistenciaNavItems` (`src/lib/nav.ts`) e `CLAUDE.md`.
 *
 * Filtro de foco e janela de tempo lidos de `searchParams` e aplicados NO
 * SERVIDOR (sem `useEffect`, sem estado de cliente) — navegação por `<Link>`
 * com query string, como `admin/plantao`.
 */
export default async function AdminAlunoDiarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ alunoId: string }>;
  searchParams: Promise<{ foco?: string; janela?: string }>;
}) {
  const { alunoId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const ambiente = await getAmbiente(alunoId);
  if (!ambiente) notFound();

  const sp = await searchParams;
  const foco = parseFoco(sp.foco);
  const janela = parseJanela(sp.janela);
  const desde = desdeDaJanela(janela);

  const [
    aluno,
    notas,
    pendenciasAbertas,
    eventosResultado,
    acoesAdministrativas,
    marcos,
    marcosTrilha,
  ] = await Promise.all([
    getAlunoById(alunoId),
    // A janela vale para as TRÊS fontes da trilha (eventos, notas e ações
    // administrativas) — senão o filtro "30 dias" mostraria nota de 6 meses
    // atrás e a tela mentiria sobre o próprio recorte.
    getDiarioDoAluno(alunoId, { desde }),
    // Todas as pendências abertas, sem o teto de 50 da timeline e SEM janela
    // — a seção `DiarioTimeline` no topo ignora o filtro de período de
    // propósito (regra da Fase 1): uma pendência antiga nunca pode ficar sem
    // botão de baixa só porque caiu fora dos últimos 30/90 dias.
    getPendenciasAbertasDoAluno(alunoId),
    getEventosDoAluno(alunoId, { desde }),
    getAcoesAdministrativasDoAluno(alunoId, { desde }),
    getMarcosDeAcesso(alunoId),
    // Primeiro acesso e corte do backfill NUNCA podem depender da janela de
    // tempo escolhida na tela — ver `getMarcosDeTrilha`. Não usar `eventos`
    // (já filtrado por `desde`) para nenhum dos dois.
    getMarcosDeTrilha(alunoId),
  ]);

  // `truncado` = o teto de 300 cortou dentro da janela. A tela precisa dizer
  // isso: sem o aviso, o rodapé do corte de backfill afirmaria uma cobertura
  // que a lista não tem.
  const { eventos, truncado } = eventosResultado;

  const trilhaCompleta = montarTrilha(eventos, notas, acoesAdministrativas);
  const trilha = filtrarPorFoco(trilhaCompleta, foco);

  const eventoPrimeiroAcessoEm = marcosTrilha.primeiroAcessoEm;
  const dataCorteBackfill = marcosTrilha.corteBackfillEm;
  const janelaAtiva = rotuloJanelaAtiva(janela);

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={assistenciaNavItems(alunoId)}
      />
      <AssistBanner aluno={aluno} />

      <main id="conteudo" className="mx-auto w-full max-w-4xl px-4 py-8">
        <PageHeader
          titulo={`Diário de ${aluno?.nome ?? ""}`}
          descricao="Trilha única: o que o aluno fez no portal e o que a equipe observou, combinou ou deixou pendente. Visível só para o admin."
        />

        <div className="mb-6">
          <TrilhaCabecalho
            primeiroAcesso={eventoPrimeiroAcessoEm}
            ultimoAcesso={marcos?.ultimoAcesso ?? null}
          />
        </div>

        <div className="mb-8">
          <DiarioForm alunoId={alunoId} />
        </div>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Filtrar trilha por foco" className="flex gap-1">
            {OPCOES_FOCO.map((op) => (
              <Link
                key={op.valor}
                href={montarHref(alunoId, { foco: op.valor, janela })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  foco === op.valor
                    ? "border-primary bg-primary/10 text-accent-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
                aria-current={foco === op.valor ? "true" : undefined}
              >
                {op.rotulo}
              </Link>
            ))}
          </nav>

          <nav aria-label="Filtrar trilha por período" className="flex gap-1">
            {OPCOES_JANELA.map((op) => (
              <Link
                key={op.valor}
                href={montarHref(alunoId, { foco, janela: op.valor })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition",
                  janela === op.valor
                    ? "border-primary bg-primary/10 text-accent-foreground"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
                aria-current={janela === op.valor ? "true" : undefined}
              >
                {op.rotulo}
              </Link>
            ))}
          </nav>
        </div>

        {pendenciasAbertas.length > 0 ? (
          <div className="mb-8">
            <p className="mb-2 text-xs text-muted-foreground">
              Pendências em aberto — independem do filtro de período acima,
              para nenhuma ficar esquecida sem baixa.
            </p>
            <DiarioTimeline pendenciasAbertas={pendenciasAbertas} />
          </div>
        ) : null}

        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          {janelaAtiva ? `Trilha completa · últimos ${janelaAtiva}` : "Trilha completa"}
        </h2>
        <TrilhaDoAluno
          itens={trilha}
          alunoId={alunoId}
          dataCorteBackfill={dataCorteBackfill}
          truncado={truncado}
          janelaAtiva={janelaAtiva}
        />
      </main>
    </>
  );
}
