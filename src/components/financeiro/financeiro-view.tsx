import { TriangleAlert, WalletMinimal } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { HeroFaturamento } from "@/components/financeiro/hero-faturamento";
import { ContratosFechados } from "@/components/financeiro/contratos-fechados";
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
 * (linha técnica e divergência); nenhum número muda de valor entre as duas,
 * senão admin e aluno discutiriam olhando telas diferentes.
 *
 * A ordem responde às perguntas na ordem em que o aluno as faz:
 *
 * 1. **Quanto eu já faturei?** — a meta de R$ 150.000 ("Áureo") e o bônus em
 *    R$ 250.000. Vem de `gps.etapa1_clientes` (clientes contratados).
 * 2. **De onde veio esse número?** — a lista dos contratos fechados.
 * 3. **Como está o meu pagamento do programa?** — um card por contrato, lido
 *    do cadastro financeiro do Grupo Participa (`cs.vw_hm_financeiro`).
 * 4. **Quais pagamentos entraram?** — o extrato, colapsado.
 *
 * 🔴 **A seção 1 não depende da 3.** São 31 ambientes sem registro no
 * cadastro financeiro; para eles o bloco do programa diz "não disponível" e a
 * meta de faturamento continua na tela — ela vem dos clientes do aluno, não
 * do sip. Colapsar as duas apagaria a metade da aba que sempre funciona.
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
        {resultado.estado === "erro" ? (
          <EmptyState
            icone={<TriangleAlert />}
            titulo="Não foi possível carregar o pagamento do programa agora."
            descricao="Tente de novo em alguns minutos. Se continuar, fale com a equipe. Seu faturamento acima não depende disto."
          />
        ) : resultado.estado === "sem_permissao" ? (
          <EmptyState
            icone={<WalletMinimal />}
            titulo="Este contrato não está disponível para você."
            descricao="O contrato do programa é do titular do ambiente."
          />
        ) : contratos.length === 0 ? (
          <EmptyState
            icone={<WalletMinimal />}
            titulo="Financeiro não disponível para este cadastro — fale com a equipe."
            descricao={
              ehAdmin ? (
                <>
                  Nenhum registro em{" "}
                  <code className="font-mono">cs.contatos_hm</code> para este
                  ambiente. Provável lacuna de cadastro, não erro do portal.
                </>
              ) : (
                "A equipe consegue conferir o seu contrato e atualizar o cadastro."
              )
            }
          />
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
