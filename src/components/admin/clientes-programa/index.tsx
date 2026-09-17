"use client";

/**
 * 🔴 CONTORNO QUE FUNCIONOU — causa raiz ainda não provada (16/09/2026).
 *
 * Esta tela e `/admin/fila` ficavam presas em "Carregando…" para sempre em
 * produção (Hostinger compartilhada): HTTP 200, o `loading.tsx` aparecia e o
 * conteúdo NUNCA o substituía; depois caía no `error.tsx`.
 *
 * O que foi PROVADO antes desta mudança:
 *   - o banco responde: `gps.admin_clientes_lista` devolveu 100 linhas com o
 *     JWT do admin, e o log da API do Supabase registra HTTP 200 da chamada
 *     no MESMO instante em que a tela mostrava "Carregando…";
 *   - não é permissão, não é deploy faltando, não é chave errada;
 *   - as duas telas que falhavam renderizavam Server Component; as duas do
 *     mesmo `/admin` que funcionam (`operadores`, `tutoriais`) são
 *     `"use client"`. As duas quebradas nasceram em 15/09 e NUNCA
 *     funcionaram em produção.
 *
 * A causa raiz NÃO foi isolada — falta o log do Node na Hostinger, onde está
 * a exceção real. O `server.js` deste repo já documenta aquele servidor como
 * instável (`fetch failed` intermitente, TTFB variando 14× na mesma página
 * estática), e streaming de RSC é o que mais sofre com isso.
 *
 * ✅ CONFIRMADO EM PRODUÇÃO (16/09/2026, após o deploy de `fe5e7f0`): as duas
 * telas passaram a carregar. A fila mostra as 35 linhas; `/admin/clientes`
 * mostra 1.585 clientes com filtros e busca. A hipótese se sustenta —
 * naquele servidor, o streaming de RSC destas duas telas não completava.
 *
 * ⚠️ NÃO REVERTER sem antes reproduzir a falha: a mudança é o que faz a tela
 * abrir hoje. A causa raiz (por que o streaming trava LÁ e não aqui) segue
 * sem prova — se algum dia o log do Node na Hostinger explicar, o conserto
 * certo é lá, e aí sim isto pode voltar a Server Component.
 *
 * ⚠️ Se o log aparecer e apontar outra causa, REVERTER isto e corrigir lá.
 *   Enquanto for `"use client"`, o componente não pode usar API de servidor
 *   (cookies/headers/createClient) — hoje não usa nenhuma: é render puro
 *   sobre `linhas`, que a page (Server Component) já buscou e passa por prop.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * `/admin/clientes` — busca, chips de fase e grau, contagem no topo,
 * tabela e paginação.
 *
 * A busca e os chips continuam sendo `<form>`/`<Link>` que navegam com
 * `searchParams` novos — quem filtra é o BANCO (`gps.admin_clientes_lista`),
 * nunca memória do cliente. Diferente de `alunos-ativos-lista` (que filtra um
 * lote já carregado), aqui não existe "lote": são 1.585 clientes hoje
 * (medido em 16/09/2026; eram 1.223 quando esta tela nasceu) — não cabem na
 * memória do navegador (ver docs/audits/2026-09-14-esteira/01-listas-clicaveis.md).
 * Isso NÃO muda com `"use client"`: a paginação segue no servidor.
 *
 * 🔴 `registro_contato` não existe no retorno da RPC — não é omissão de
 * tela, o dado nunca chega até aqui (decisão de LGPD do Marcio).
 */

import Link from "next/link";
import { Search, Users, AlertTriangle } from "lucide-react";
import type { ClienteDoPrograma, ReuniaoKpis } from "@/lib/data/clientes-admin";
import { FASES_CLIENTE, GRAUS_RELACAO_UI } from "@/lib/etapa1";
import { Card, CardContent } from "@/components/ui/card";
import { FaixaMetricas } from "@/components/ui/faixa-metricas";
import { Input } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { TabelaClientesPrograma } from "./tabela";
import { ExportarClientesCsv } from "./exportar";
import {
  ITENS_POR_PAGINA,
  hrefClientes,
  type EstadoClientesUrl,
  type FiltroReuniao,
} from "./estado-na-url";

/** Catálogo fechado dos chips de reunião — mesma allowlist da RPC/URL.
 * 🔴 `para_vencer` entrou na migração `…282` (KPIs, 17/09/2026): faltava
 * aqui embora já estivesse na allowlist de `estado-na-url.ts` desde o item 5
 * do backlog — o chip nunca tinha sido acrescentado ao catálogo da tela. */
const CHIPS_REUNIAO: { id: FiltroReuniao; rotulo: string }[] = [
  // 🔑 Primeiro da fila: é o mais amplo (todos os que têm reunião, 42) e o
  // destino do tile "Total". Sem ele aqui, quem chegasse pelo tile veria a
  // lista filtrada sem nenhum chip aceso — e sem como desfazer o filtro por
  // esta barra.
  { id: "com_reuniao", rotulo: "Com reunião" },
  { id: "marcada", rotulo: "Marcada" },
  { id: "para_vencer", rotulo: "Para vencer" },
  { id: "vencida", rotulo: "Vencida" },
  { id: "sem", rotulo: "Sem reunião" },
];

export function ClientesPrograma({
  linhas,
  total,
  erro,
  estado,
  kpis,
  erroKpis,
}: {
  linhas: ClienteDoPrograma[];
  /** Universo do FILTRO (o `count(*) over()` da RPC) — nunca o da página. */
  total: number;
  erro: string | null;
  estado: EstadoClientesUrl;
  /**
   * Os 4 KPIs da aba "reunião agendada" (`gps.admin_clientes_reuniao_kpis`,
   * 17/09/2026) — universo INTEIRO, não o do filtro ativo. Opcional só para
   * não quebrar chamador antigo durante a integração; a tela real de KPIs
   * (quais 4 números, onde clicam, o que filtram) é montagem à parte.
   */
  kpis?: ReuniaoKpis;
  erroKpis?: string | null;
}) {
  const inicio = total === 0 ? 0 : (estado.pagina - 1) * ITENS_POR_PAGINA + 1;
  const fim = Math.min(estado.pagina * ITENS_POR_PAGINA, total);
  const totalPaginas = Math.max(1, Math.ceil(total / ITENS_POR_PAGINA));

  if (erro) {
    return (
      <EmptyState
        icone={<Users />}
        titulo="Não foi possível carregar os clientes"
        descricao={erro}
      />
    );
  }

  return (
    <div className="grid gap-4">
      {/* 🔴 A contagem fica NO TOPO (decisão do Marcio) — não só no rodapé,
          senão a paginação lê como bug: "100 de 1.585" precisa aparecer antes
          de a pessoa rolar a tabela inteira. */}
      <p aria-live="polite" className="corpo-sm text-muted-foreground">
        {total === 0 ? (
          "Nenhum cliente encontrado."
        ) : (
          <>
            Mostrando <span className="numero font-semibold text-foreground">{inicio}</span>–
            <span className="numero font-semibold text-foreground">{fim}</span> de{" "}
            <span className="numero font-semibold text-foreground">{total}</span>
          </>
        )}
      </p>

      <FaixaKpisReuniao kpis={kpis} erro={erroKpis} estado={estado} />

      <Card>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <form action="/admin/clientes" className="relative min-w-[240px] flex-1">
              {/* Chips e página atuais viajam como campos ocultos: buscar não
                  pode apagar o filtro de fase/grau que já estava marcado. */}
              {estado.fase ? (
                <input type="hidden" name="fase" value={estado.fase} />
              ) : null}
              {estado.grau ? (
                <input type="hidden" name="grau" value={estado.grau} />
              ) : null}
              {estado.reuniao ? (
                <input type="hidden" name="reuniao" value={estado.reuniao} />
              ) : null}
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                id="busca-clientes"
                type="search"
                name="q"
                defaultValue={estado.busca}
                placeholder="Buscar por nome do cliente ou do parceiro"
                aria-label="Buscar cliente por nome do cliente ou do parceiro"
                className="pl-8"
              />
            </form>

            <ExportarClientesCsv estado={estado} total={total} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ChipFiltro
              rotulo="Todas as fases"
              ativo={!estado.fase}
              href={hrefClientes({ fase: null, pagina: 1 }, estado)}
            />
            {FASES_CLIENTE.map((f) => (
              <ChipFiltro
                key={f.id}
                rotulo={f.rotulo}
                ativo={estado.fase === f.id}
                href={hrefClientes({ fase: f.id, pagina: 1 }, estado)}
              />
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ChipFiltro
              rotulo="Todos os graus"
              ativo={!estado.grau}
              href={hrefClientes({ grau: null, pagina: 1 }, estado)}
            />
            {GRAUS_RELACAO_UI.map((g) => (
              <ChipFiltro
                key={g.id}
                rotulo={g.rotulo}
                ativo={estado.grau === g.id}
                href={hrefClientes({ grau: g.id, pagina: 1 }, estado)}
              />
            ))}
            <ChipFiltro
              rotulo="Não informado"
              ativo={estado.grau === "_nulo"}
              href={hrefClientes({ grau: "_nulo", pagina: 1 }, estado)}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ChipFiltro
              rotulo="Todas"
              ativo={!estado.reuniao}
              href={hrefClientes({ reuniao: null, pagina: 1 }, estado)}
            />
            {CHIPS_REUNIAO.map((r) => (
              <ChipFiltro
                key={r.id}
                rotulo={r.rotulo}
                ativo={estado.reuniao === r.id}
                href={hrefClientes({ reuniao: r.id, pagina: 1 }, estado)}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {linhas.length === 0 ? (
        <EmptyState
          icone={<Users />}
          titulo="Nenhum cliente encontrado"
          descricao="Ajuste a busca ou os filtros de fase e grau de relação."
        />
      ) : (
        <TabelaClientesPrograma linhas={linhas} />
      )}

      {totalPaginas > 1 ? (
        <Paginacao
          pagina={estado.pagina}
          totalPaginas={totalPaginas}
          estado={estado}
        />
      ) : null}
    </div>
  );
}

/**
 * **Faixa de métricas de reunião preliminar** (Marcio, 17/09/2026): total,
 * marcadas, para vencer, vencidas — acima da lista, sempre visível.
 *
 * 🔑 Desde 17/09 usa `FaixaMetricas` (`ui/faixa-metricas.tsx`) em vez de
 * tiles próprios. A mudança não foi estética: o Marcio pediu a denominação
 * visual **justamente para pôr à prova o dia em que outra família de
 * métricas entrar nesta tela** (honorários, DISC, fase). Com tiles locais,
 * a segunda família seria mais uma parede de números iguais; com o
 * componente, é uma chamada a mais e a diferenciação vem de graça.
 *
 * **A cor aqui diz URGÊNCIA, não categoria:**
 *   vencidas    → `risco`   (a reunião já passou e ninguém tratou)
 *   para vencer → `atencao` (≤ 7 dias: é onde a ação ainda muda o resultado)
 *   marcadas    → `neutro`  (> 7 dias, está em dia — nada a fazer hoje)
 *   com reunião → `neutro`  (é âncora de navegação, não estado)
 * Zero rebaixa qualquer tom a neutro dentro do componente — "0 vencidas"
 * não pode ser vermelho.
 *
 * 🔑 Mostrada SEMPRE, não só com o filtro ativo: a RPC
 * (`gps.admin_clientes_reuniao_kpis`, 2,7 ms medidos) já roda em paralelo na
 * `page.tsx` independente de filtro, então exibir custa zero a mais — e ver
 * as 39 vencidas sem precisar filtrar antes é o caso de uso mais forte.
 *
 * 🔴 `erroKpis` NUNCA vira "0" nos números — zero é uma afirmação sobre o
 * mundo, e a busca ter falhado não prova conjunto vazio. Falha mostra aviso
 * (`role="alert"`), nunca número. `kpis` undefined não mostra nada.
 */
function FaixaKpisReuniao({
  kpis,
  erro,
  estado,
}: {
  kpis?: ReuniaoKpis;
  erro?: string | null;
  estado: EstadoClientesUrl;
}) {
  if (erro) {
    return (
      <p
        role="alert"
        className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive"
      >
        <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
        Não foi possível carregar os KPIs de reunião. {erro}
      </p>
    );
  }

  if (!kpis) return null;

  return (
    <FaixaMetricas
      titulo="Reunião preliminar"
      // Sem `resumo`: o primeiro tile JÁ é o total (42, "Com reunião"), e
      // repetir o mesmo número na mesma linha é ruído, não reforço.
      ativo={estado.reuniao}
      metricas={[
        {
          id: "com_reuniao",
          rotulo: "Com reunião",
          valor: kpis.totalComReuniao,
          // Âncora de navegação, não estado: neutro de propósito.
          href: hrefClientes({ reuniao: "com_reuniao", pagina: 1 }, estado),
          detalhe: "qualquer prazo",
        },
        {
          id: "marcada",
          rotulo: "Marcadas",
          valor: kpis.marcadas,
          href: hrefClientes({ reuniao: "marcada", pagina: 1 }, estado),
          detalhe: "em mais de 7 dias",
        },
        {
          id: "para_vencer",
          rotulo: "Para vencer",
          valor: kpis.paraVencer,
          tom: "atencao",
          href: hrefClientes({ reuniao: "para_vencer", pagina: 1 }, estado),
          detalhe: "nos próximos 7 dias",
        },
        {
          id: "vencida",
          rotulo: "Vencidas",
          valor: kpis.vencidas,
          tom: "risco",
          href: hrefClientes({ reuniao: "vencida", pagina: 1 }, estado),
          detalhe: "data já passou",
        },
      ]}
    />
  );
}

function ChipFiltro({
  rotulo,
  ativo,
  href,
}: {
  rotulo: string;
  ativo: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      prefetch={false}
      aria-current={ativo ? "true" : undefined}
      className={cn(
        "foco-visivel inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition",
        ativo
          ? "border-marca-acao bg-marca-acao text-white"
          : "border-borda-forte bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      {rotulo}
    </Link>
  );
}

function Paginacao({
  pagina,
  totalPaginas,
  estado,
}: {
  pagina: number;
  totalPaginas: number;
  estado: EstadoClientesUrl;
}) {
  const anterior = pagina > 1 ? hrefClientes({ pagina: pagina - 1 }, estado) : null;
  const proxima =
    pagina < totalPaginas ? hrefClientes({ pagina: pagina + 1 }, estado) : null;

  return (
    <nav
      aria-label="Paginação de clientes"
      className="flex items-center justify-between gap-3"
    >
      {anterior ? (
        <Link href={anterior} prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Página anterior
        </Link>
      ) : (
        <span />
      )}
      <span className="corpo-sm text-muted-foreground">
        Página <span className="numero font-semibold text-foreground">{pagina}</span> de{" "}
        <span className="numero font-semibold text-foreground">{totalPaginas}</span>
      </span>
      {proxima ? (
        <Link href={proxima} prefetch={false} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Próxima página
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
