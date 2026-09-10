import { TriangleAlert, WalletMinimal } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { HeroFaturamento } from "@/components/financeiro/hero-faturamento";
import { ContratosFechados } from "@/components/financeiro/contratos-fechados";
import { DetalhesEquipe } from "@/components/financeiro/detalhes-equipe";
import { ProgramaCard } from "@/components/financeiro/programa-card";
import { Extrato } from "@/components/financeiro/extrato";
import { Secao } from "@/components/ui/secao";
import type {
  LinhaExtrato,
  ProgressoFaturamento,
  ResultadoFinanceiro,
} from "@/lib/financeiro";

/**
 * Aba Financeiro — o **painel de progresso financeiro** do aluno, a MESMA
 * tela para o titular e para o admin em assistência. `ehAdmin` só ACRESCENTA
 * (a gaveta `DetalhesEquipe`); nenhum número muda de valor entre as duas,
 * senão admin e aluno discutiriam olhando telas diferentes.
 *
 * A ordem responde às perguntas na ordem em que o aluno as faz:
 *
 * 1. **Quanto eu já faturei?** — a peça forte da tela: o faturado, a meta de
 *    R$ 150.000 (o **AURUM**) e a barra. Vem de `gps.etapa1_clientes`.
 * 2. **De onde veio esse número?** — a lista curta dos contratos fechados.
 * 3. **Como está o meu pagamento do programa?** — "Seu programa", enxuto: um
 *    card por contrato com situação, pago de total, parcelas e vencimento.
 * 4. **Quais pagamentos entraram?** — o extrato, colapsado.
 *
 * 🔴 **Nada de sistema na tela do aluno** (pedido do João, 09/09/2026): nome
 * de view, id de cadastro, "divergência" e aviso técnico moraram aqui e
 * saíram. O que a equipe precisa continua existindo, dentro de
 * `DetalhesEquipe` — gaveta fechada, renderizada só no ramo `ehAdmin`.
 *
 * 🔴 **A seção 1 não depende da 3.** São 31 ambientes sem registro do programa;
 * para eles o bloco diz que a equipe está cuidando disso, e a meta de
 * faturamento continua na tela — ela vem dos clientes do aluno, não do sip.
 * Colapsar as duas apagaria a metade da aba que sempre funciona.
 *
 * 🔑 `erro` e `sem_registro` são estados DIFERENTES e continuam diferentes
 * aqui. Colapsar os dois faria uma falha de banco aparecer como "este aluno
 * não tem financeiro" — a tela mentiria com cara de normalidade.
 *
 * Somente leitura: nenhum formulário, nenhuma Server Action, nenhum `input`.
 */
export function FinanceiroView({
  progresso,
  resultado,
  linhasExtrato,
  extratoTruncado,
  ehAdmin,
  basePath,
}: {
  progresso: ProgressoFaturamento;
  resultado: ResultadoFinanceiro;
  /** Vazio quando não há extrato, sem permissão ou falha — a seção some. */
  linhasExtrato: LinhaExtrato[];
  /** Bateu o teto de 200 linhas da RPC: a seção avisa em vez de somar. */
  extratoTruncado: boolean;
  ehAdmin: boolean;
  /** "" para o aluno; "/admin/aluno/<id>" no modo assistência. */
  basePath: string;
}) {
  const contratos = resultado.estado === "ok" ? resultado.contratos : [];

  // `contato_hm_id` → produto, para o extrato só rotular a coluna quando o
  // aluno tem mais de um contrato (2 alunos medidos com HM + AURUM).
  const produtoPorContrato: Record<string, string> = {};
  for (const c of contratos) {
    if (c.contatoHmId) produtoPorContrato[c.contatoHmId] = c.produto ?? "Programa";
  }

  return (
    <div className="grid gap-6">
      <HeroFaturamento progresso={progresso} basePath={basePath} />

      <ContratosFechados
        clientes={progresso.clientes}
        total={progresso.faturado}
        basePath={basePath}
      />

      {/* `Secao` (marcador + título + régua) no lugar do `uppercase
          tracking-wide`: é o cabeçalho de seção do portal desde a Onda A, e
          esta aba era a última tela com a etiqueta em caixa alta. */}
      <Secao
        icone={<WalletMinimal />}
        titulo="Seu programa"
        classeConteudo="grid gap-4"
      >
        {/* 🔑 `erro` e `sem_registro` continuam SEPARADOS. Colapsar os dois
            faria uma falha de leitura aparecer como "você não tem programa" —
            a tela mentiria com cara de normalidade. O que mudou foi só a
            LINGUAGEM: nenhum dos dois fala de sistema. */}
        {resultado.estado === "erro" ? (
          <EmptyState
            icone={<TriangleAlert />}
            titulo="Não conseguimos mostrar o seu programa agora."
            descricao="Tente de novo em alguns minutos. Seu faturamento acima não depende disto."
          />
        ) : resultado.estado === "sem_permissao" ? (
          <EmptyState
            icone={<WalletMinimal />}
            titulo="Este contrato não está disponível para você."
            descricao="O contrato do programa é do titular do ambiente."
          />
        ) : contratos.length === 0 ? (
          <div className="grid gap-3">
            <EmptyState
              icone={<WalletMinimal />}
              titulo="Ainda não recebemos o registro do seu programa por aqui"
              descricao="A equipe está cuidando disso. Sua meta e seus contratos já aparecem acima."
            />
            {ehAdmin ? (
              <DetalhesEquipe>
                <p>
                  Nenhum registro em{" "}
                  <code className="font-mono">cs.contatos_hm</code> para este
                  ambiente. Provável lacuna de cadastro, não erro do portal — dá
                  para vincular o contrato pela aba Resolver.
                </p>
              </DetalhesEquipe>
            ) : null}
          </div>
        ) : (
          contratos.map((contrato, i) => (
            <ProgramaCard
              // A ordem vem do `order by` da RPC e a lista é estática
              // (Server Component, sem reordenação e sem estado de
              // cliente): índice como chave aqui não tem o defeito que
              // teria numa lista editável.
              key={contrato.contatoHmId ?? `${contrato.produto ?? "programa"}-${i}`}
              contrato={contrato}
              ehAdmin={ehAdmin}
            />
          ))
        )}
      </Secao>

      <Extrato
        linhas={linhasExtrato}
        truncado={extratoTruncado}
        produtoPorContrato={produtoPorContrato}
      />
    </div>
  );
}
