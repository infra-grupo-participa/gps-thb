import { redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import { getClientesAgendaKpis, getClientesDoPrograma } from "@/lib/data/clientes-admin";
import { getUltimaModificacaoPasta } from "@/lib/data/clientes-pasta";
import { formatarDataHora, formatarHaQuanto } from "@/lib/datas";
import { adminNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { ClientesPrograma } from "@/components/admin/clientes-programa";
import {
  ITENS_POR_PAGINA,
  lerEstadoClientesUrl,
  offsetDaPagina,
} from "@/components/admin/clientes-programa/estado-na-url";

export const metadata = { title: "Admin — Clientes" };

/**
 * Lista consolidada de clientes do programa — TODOS os ambientes, não só o
 * do parceiro aberto (item 3 dos 9, ver
 * `docs/audits/2026-09-14-esteira/01-listas-clicaveis.md`).
 *
 * Backend já pronto e testado: `gps.admin_clientes_lista` (RPC) via
 * `getClientesDoPrograma` — não mexer nele. Esta página só lê `searchParams`
 * (allowlist fechada, `estado-na-url.ts`) e monta a tela.
 *
 * KPIs = etapa de cada cliente na agenda (06/10/2026): buscados em PARALELO
 * com a lista (`Promise.all`, nunca em cascata) via `getClientesAgendaKpis()`
 * — uma chamada só para os 5 tiles, sempre do universo inteiro, não do
 * filtro ativo. Os 4 KPIs de reunião de 17/09 saíram da tela (a RPC
 * `admin_clientes_reuniao_kpis` segue viva no banco só como reversão).
 *
 * 🔴 Rota PRÓPRIA, fora de `/admin` (decisão do Marcio): os 1.223 clientes só
 * custam consulta/payload para quem abre `/admin/clientes`, nunca para quem
 * só quer o painel de parceiros.
 *
 * ⚠️ Dados de TERCEIROS: os clientes cadastrados aqui são pessoas físicas que
 * nunca abriram conta no portal — são os clientes dos parceiros, não os
 * parceiros. O aviso mora no `PageHeader` (LGPD), não só neste comentário.
 */
export default async function AdminClientesPage({
  searchParams,
}: {
  searchParams: Promise<{
    fase?: string;
    grau?: string;
    q?: string;
    pag?: string;
    reuniao?: string;
    agenda?: string;
  }>;
}) {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const estado = lerEstadoClientesUrl(await searchParams);

  // Lista (paginada, filtrada) e KPIs (universo inteiro, mesma chamada
  // única de sempre) são independentes — buscadas em PARALELO, nunca em
  // cascata (protocolo de sustentabilidade, pergunta "repetição").
  const [{ linhas, total, erro }, kpisAgenda] = await Promise.all([
    getClientesDoPrograma({
      limite: ITENS_POR_PAGINA,
      offset: offsetDaPagina(estado.pagina),
      fase: estado.fase,
      grau: estado.grau,
      busca: estado.busca || null,
      reuniao: estado.reuniao,
      agenda: estado.agenda,
    }),
    // Falha vira aviso na faixa, nunca "0" nem a tela inteira no error.tsx.
    getClientesAgendaKpis().catch(() => null),
  ]);
  const erroKpis = kpisAgenda ? null : "Tente recarregar a página.";

  // Depende dos ids da página, então vem logo DEPOIS (segunda consulta, uma
  // só por página). Falha → mapa vazio + `logErro` lá dentro: coluna "—".
  const pastaPorCliente = await getUltimaModificacaoPasta(linhas.map((l) => l.id));
  const pasta: Record<string, { rotulo: string; titulo: string }> = {};
  for (const [id, iso] of pastaPorCliente) {
    const rotulo = formatarHaQuanto(iso);
    if (rotulo) pasta[id] = { rotulo, titulo: formatarDataHora(iso) };
  }

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={adminNavItems({ souAdmin: true })}
      />
      <main id="conteudo" className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Clientes"
        />

        <ClientesPrograma
          linhas={linhas}
          total={total}
          erro={erro ?? null}
          estado={estado}
          kpis={kpisAgenda}
          pasta={pasta}
          erroKpis={erroKpis}
        />
      </main>
    </>
  );
}
