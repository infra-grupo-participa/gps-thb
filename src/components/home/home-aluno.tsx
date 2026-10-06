import { Users } from "lucide-react";
import type { Etapa } from "@/lib/types";
import type { OverridesLiberacao, ProximoPasso } from "@/lib/etapas";
import { PageHeader } from "@/components/ui/page-header";
import { Secao } from "@/components/ui/secao";
import { ProximoPassoCard } from "@/components/etapa/proximo-passo-card";
import { TudoEmDiaCard } from "@/components/etapa/tudo-em-dia-card";
import { HomeNumeros } from "@/components/home/home-numeros";
import { HojeNoPrograma } from "@/components/home/hoje-no-programa";
import { TrilhaEtapas } from "@/components/home/trilha-etapas";
import type { HojeNoPrograma as DadosHoje } from "@/components/home/hoje-tipos";

/**
 * A home do parceiro, de cima para baixo (pedido do João, 06/10/2026):
 *
 * 1. "Olá, <nome>" + a etapa atual numa linha;
 * 2. o PRÓXIMO PASSO como peça principal (um botão sólido);
 * 3. a fileira de números (Clientes, Reuniões, Faturamento, cliente
 *    acompanhado) — cada número aparece uma vez na home;
 * 4. Plantão e Sessões como dois atalhos pequenos;
 * 5. "Seu caminho" em trilha compacta.
 *
 * Só recebe dado pronto (sem query): a `page.tsx` carrega tudo num lote. O
 * card de perfil saiu — o nome está no header e "Seu perfil" no menu da conta.
 */
export function HomeAluno({
  primeiroNome,
  compartilhado,
  etapaAtual,
  passo,
  proximaBloqueada,
  numeros,
  acompanhado,
  hoje,
  etapas,
  pctPorEtapa,
  overrides,
}: {
  primeiroNome: string | null;
  /** Só quando o ambiente tem mais de um membro. */
  compartilhado: { souSocio: boolean; nomeTitular: string | null } | null;
  etapaAtual: { id: number; ordem: number; nome: string } | null;
  passo: ProximoPasso | null;
  proximaBloqueada: { ordem: number; nome: string } | null;
  numeros: { clientes: number; reunioes: number; faturamento: number | null };
  acompanhado: { id: string; nome: string } | null;
  hoje: DadosHoje;
  etapas: Etapa[];
  pctPorEtapa: Record<number, number>;
  overrides: OverridesLiberacao;
}) {
  return (
    <>
      <PageHeader
        titulo={primeiroNome ? `Olá, ${primeiroNome}` : "Olá"}
        descricao={
          etapaAtual ? (
            <span className="text-base">
              Etapa {String(etapaAtual.ordem).padStart(2, "0")} · {etapaAtual.nome}
            </span>
          ) : undefined
        }
        acao={
          compartilhado ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-base text-muted-foreground">
              <Users aria-hidden className="size-4" />
              {compartilhado.souSocio
                ? `Ambiente de ${compartilhado.nomeTitular ?? "outro parceiro"}`
                : "Ambiente compartilhado"}
            </span>
          ) : undefined
        }
        className="mb-6"
      />

      {/* O lugar mais forte da home nunca fica vazio: sem passo pendente, o
          card diz que está tudo em dia e o que esperar. */}
      {passo ? (
        <ProximoPassoCard passo={passo} basePath="" />
      ) : (
        <TudoEmDiaCard proximaEtapa={proximaBloqueada} />
      )}

      <div className="mt-6">
        <HomeNumeros
          clientes={numeros.clientes}
          reunioes={numeros.reunioes}
          faturamento={numeros.faturamento}
          acompanhado={acompanhado}
        />
      </div>

      {/* Antes da trilha: no celular a trilha vira lista de 6 linhas, e o
          Plantão no fim da página era o "achei por acaso" já relatado. */}
      <HojeNoPrograma dados={hoje} className="mt-6" />

      <Secao titulo="Seu caminho" className="mt-10">
        <TrilhaEtapas
          etapas={etapas}
          pctPorEtapa={pctPorEtapa}
          overrides={overrides}
          etapaAtualId={etapaAtual?.id ?? null}
        />
      </Secao>
    </>
  );
}
