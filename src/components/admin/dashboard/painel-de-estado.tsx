import Link from "next/link";

import type { PainelDeEstado } from "@/lib/data/dashboard";
import { LINK_LISTA } from "./tipos";

/**
 * O **painel de estado** — pedido do Marcio em 15/09/2026, literal:
 * *"preciso listar quem já logou e tá tudo ok, de quem tá pendente, e o que
 * tá pendente de cada, em números, não quero palavras nisso, quero números,
 * pois os números devem informar com clareza cada"*.
 *
 * 🔑 UI DENSA E CHAPADA (regra do Marcio para todo o produto): hierarquia por
 * POSIÇÃO, não por card/ícone/fonte grande. Por isso este painel NÃO usa
 * `KpiTile` nem `CardDashboard` — é uma TABELA de 12 linhas em 4 grupos, cada
 * linha rótulo→número→link, sem moldura decorativa em cada item. O grupo tem
 * um título pequeno (posição), não uma caixa.
 *
 * 🔴 ZERO consulta nova: os 12 números saem de `painelDeEstado(alunos)`,
 * função pura sobre o lote que `/admin` já carregou — mesmo molde de
 * `faixasDeTrilha`/`resumoAtendimento` (`src/lib/data/dashboard.ts`).
 *
 * Cada linha é um `<Link>` PRÓPRIO para a lista filtrada — nunca um
 * `<span>` estático. `aria-label` nomeia o conjunto por extenso, porque o
 * número sozinho ("19") não diz nada a quem usa leitor de tela.
 */
export function PainelDeEstado({ dados }: { dados: PainelDeEstado }) {
  const grupos: {
    titulo: string;
    linhas: { rotulo: string; valor: number; href: string; ariaLabel: string }[];
  }[] = [
    {
      titulo: "Acesso",
      linhas: [
        {
          rotulo: "Ambientes",
          valor: dados.ambientes,
          href: `${LINK_LISTA}&ordem=recentes`,
          ariaLabel: `Ver os ${dados.ambientes} ambientes`,
        },
        {
          rotulo: "Já logaram",
          valor: dados.jaLogaram,
          href: `${LINK_LISTA}&f=ja_entrou`,
          ariaLabel: `Ver os ${dados.jaLogaram} parceiros que já logaram`,
        },
        {
          rotulo: "Sem login",
          valor: dados.semLogin,
          href: `${LINK_LISTA}&f=sem_login`,
          ariaLabel: `Ver os ${dados.semLogin} parceiros sem login`,
        },
        {
          rotulo: "Nunca entraram",
          valor: dados.nuncaEntraram,
          href: `${LINK_LISTA}&f=nunca_entrou`,
          ariaLabel: `Ver os ${dados.nuncaEntraram} parceiros que nunca entraram`,
        },
      ],
    },
    {
      titulo: "Atividade",
      linhas: [
        {
          rotulo: "Ativos 30 dias",
          valor: dados.ativos30d,
          href: `${LINK_LISTA}&f=ativos30`,
          ariaLabel: `Ver os ${dados.ativos30d} parceiros ativos nos últimos 30 dias`,
        },
        {
          rotulo: "Parados 30 dias+",
          valor: dados.parados30d,
          href: `${LINK_LISTA}&f=inativos`,
          ariaLabel: `Ver os ${dados.parados30d} parceiros parados há 30 dias ou mais`,
        },
      ],
    },
    {
      titulo: "Clientes",
      linhas: [
        {
          rotulo: "Sem nenhum cliente",
          valor: dados.semNenhumCliente,
          href: `${LINK_LISTA}&f=sem_cliente`,
          ariaLabel: `Ver os ${dados.semNenhumCliente} parceiros sem nenhum cliente`,
        },
        {
          rotulo: "No meio dos 30",
          valor: dados.noMeioDos30,
          href: `${LINK_LISTA}&f=clientes_incompleto`,
          ariaLabel: `Ver os ${dados.noMeioDos30} parceiros no meio dos 30 clientes`,
        },
        {
          rotulo: "Fecharam os 30",
          valor: dados.fecharamOs30,
          href: `${LINK_LISTA}&f=etapa1_ok`,
          ariaLabel: `Ver os ${dados.fecharamOs30} parceiros que fecharam os 30 clientes`,
        },
      ],
    },
    {
      titulo: "Onboarding",
      linhas: [
        {
          rotulo: "Não começou",
          valor: dados.onboardingNaoComecou,
          href: `${LINK_LISTA}&f=onb_nao`,
          ariaLabel: `Ver os ${dados.onboardingNaoComecou} parceiros que não começaram o onboarding`,
        },
        {
          rotulo: "Em andamento",
          valor: dados.onboardingEmAndamento,
          href: `${LINK_LISTA}&f=onb_andamento`,
          ariaLabel: `Ver os ${dados.onboardingEmAndamento} parceiros com o onboarding em andamento`,
        },
        {
          rotulo: "Concluído",
          valor: dados.onboardingConcluido,
          href: `${LINK_LISTA}&f=onb_ok`,
          ariaLabel: `Ver os ${dados.onboardingConcluido} parceiros com o onboarding concluído`,
        },
      ],
    },
  ];

  return (
    <section
      aria-labelledby="painel-de-estado"
      className="grid gap-2 rounded-md border border-borda-fina bg-card p-3"
    >
      <h2 id="painel-de-estado" className="rotulo text-muted-foreground">
        Estado do programa
      </h2>
      <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-4">
        {grupos.map((g) => (
          <div key={g.titulo} className="grid gap-0.5">
            <h3 className="corpo-sm font-semibold text-muted-foreground">
              {g.titulo}
            </h3>
            <ul className="grid">
              {g.linhas.map((l) => (
                <li key={l.rotulo}>
                  <Link
                    href={l.href}
                    prefetch={false}
                    aria-label={l.ariaLabel}
                    className="foco-visivel -mx-1.5 flex items-baseline justify-between gap-3 rounded-sm px-1.5 py-1 hover:bg-superficie-afundada"
                  >
                    <span className="min-w-0 corpo-sm text-muted-foreground">
                      {l.rotulo}
                    </span>
                    <span className="numero shrink-0 font-semibold tabular-nums">
                      {l.valor}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
