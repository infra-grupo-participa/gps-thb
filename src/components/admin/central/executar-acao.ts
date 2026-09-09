/**
 * A execução das dez escritas da Central, fora do componente.
 *
 * `switch` exaustivo sobre a união discriminada de `tipos.ts`: uma ação nova
 * sem tratamento **não compila**. Cada caso devolve `{ erro?, sucesso }` — a
 * frase de sucesso sai do RETORNO da action, nunca de suposição, porque o que
 * a regra do banco decidiu (o Financeiro mudou de dono? o vínculo veio do
 * portal?) só é conhecido depois.
 *
 * Nenhuma action lança: todas devolvem `{ erro }` em português
 * (`traduzirErroBanco`), e é isso que o diálogo mostra sem fechar.
 */

import {
  definirLiberacaoEtapa,
  desvincularFinanceiro,
  moverMembro,
  reabrirEtapa,
  trocarTitular,
  vincularFinanceiro,
  vincularPessoaMembro,
} from "@/app/admin/central-actions";
// Importada direto do módulo de origem: reexportar de outro módulo
// `"use server"` tira o export do build (o caso está registrado em
// `admin/plantao/actions.ts`).
import { atualizarEmailAluno, type AlunoBusca } from "@/app/admin/actions";
import { rotuloEtapa, type AcaoPendente } from "./tipos";

/**
 * Por que este cadastro não serve como alvo. `null` = serve.
 *
 * Mover um sócio para um cadastro SEM ambiente criaria um ambiente órfão sem
 * titular; para o próprio ambiente de origem, não moveria nada. Os dois casos
 * seriam erro do banco depois do clique — aqui viram explicação antes dele.
 */
export function impedimentoDoAlvo(
  alvo: "pessoa" | "ambiente",
  a: AlunoBusca,
  alunoId: string,
): string | null {
  if (alvo !== "ambiente") return null;
  if (a.id === alunoId) return "É o ambiente de onde o sócio está saindo.";
  if (!a.jaNoGps) return "Este cadastro ainda não tem ambiente no programa.";
  return null;
}

export async function executarAcao(
  acao: AcaoPendente,
  alunoId: string,
  motivo: string,
): Promise<{ erro?: string; sucesso: string }> {
  switch (acao.tipo) {
    case "alinhar-email": {
      const r = await atualizarEmailAluno(alunoId, acao.paraLogin);
      return {
        erro: r.erro,
        sucesso: `Cadastro alinhado para ${acao.paraLogin}.`,
      };
    }
    case "vincular-pessoa": {
      const r = await vincularPessoaMembro(
        acao.membro.membroId,
        acao.pessoa.id,
        alunoId,
      );
      return {
        erro: r.erro,
        sucesso: `Membro vinculado a ${r.nome ?? acao.pessoa.nome ?? "o cadastro escolhido"}.`,
      };
    }
    case "trocar-titular": {
      const r = await trocarTitular(alunoId, acao.membro.membroId);
      return {
        erro: r.erro,
        // A copy do resultado sai do RETORNO, não da suposição: é a regra da
        // guarda do Financeiro que decide, e ela pode mudar num commit só.
        sucesso: r.financeiroPassaAVer
          ? `Titular agora é ${r.emailAtual ?? "o membro escolhido"}. O Financeiro do ambiente passou para ele.`
          : `Titular agora é ${r.emailAtual ?? "o membro escolhido"}. O Financeiro do ambiente não mudou de dono.`,
      };
    }
    case "mover-membro": {
      const r = await moverMembro(
        acao.membro.membroId,
        acao.destino.id,
        alunoId,
      );
      return {
        erro: r.erro,
        sucesso: `Sócio movido para ${r.para ?? acao.destino.nome ?? "o ambiente escolhido"}. O que ele registrou ficou aqui.`,
      };
    }
    case "liberar-etapa": {
      const r = await definirLiberacaoEtapa(
        alunoId,
        acao.etapa.etapa,
        true,
        motivo,
      );
      return {
        erro: r.erro,
        sucesso: `${rotuloEtapa(acao.etapa.etapa)} liberada só para este aluno.`,
      };
    }
    case "travar-etapa": {
      const r = await definirLiberacaoEtapa(
        alunoId,
        acao.etapa.etapa,
        false,
        motivo,
      );
      return {
        erro: r.erro,
        sucesso: `${rotuloEtapa(acao.etapa.etapa)} travada só para este aluno.`,
      };
    }
    case "voltar-regra-geral": {
      const r = await definirLiberacaoEtapa(
        alunoId,
        acao.etapa.etapa,
        null,
        motivo,
      );
      return {
        erro: r.erro,
        sucesso: `${rotuloEtapa(acao.etapa.etapa)} voltou a seguir a regra geral.`,
      };
    }
    case "reabrir-etapa": {
      const r = await reabrirEtapa(alunoId, acao.etapa.etapa, motivo);
      const n = r.reabertas ?? 0;
      return {
        erro: r.erro,
        sucesso: `${n} ${n === 1 ? "tarefa reaberta" : "tarefas reabertas"} na ${rotuloEtapa(acao.etapa.etapa)}.`,
      };
    }
    case "vincular-financeiro": {
      const r = await vincularFinanceiro(alunoId, acao.candidato.contatoHmId);
      return {
        erro: r.erro,
        sucesso: acao.candidato.produto
          ? `Contrato ${acao.candidato.produto} vinculado a este ambiente.`
          : "Contrato vinculado a este ambiente.",
      };
    }
    case "desvincular-financeiro": {
      const r = await desvincularFinanceiro(alunoId, acao.contatoHmId);
      return {
        erro: r.erro,
        // A origem só é conhecida DEPOIS. A confirmação avisou a
        // possibilidade; aqui se diz o que de fato foi desfeito.
        sucesso: r.vinculadoPeloPortal
          ? "Vínculo desfeito. Ele tinha sido feito por aqui."
          : "Vínculo desfeito. Ele vinha do sistema de origem, não do portal.",
      };
    }
  }
}
