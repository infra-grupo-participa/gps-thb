"use client";

/**
 * Central de resolução — o checklist do ambiente e as correções.
 *
 * O diagnóstico inteiro chega PRONTO do servidor (`getDiagnosticoAmbiente`,
 * uma RPC só). Esta tela não consulta o banco, não deduz estado e não calcula
 * número: ela desenha o que veio, na ordem em que veio, e oferece a correção
 * onde há vermelho ou âmbar.
 *
 * 🔑 Quatro regras que valem em cada linha deste arquivo:
 *
 * 1. **A cor vem do servidor.** `ok` tem três valores e `null` é informação —
 *    nem verde, nem vermelho. Nada aqui olha para o texto de `valor`/`detalhe`
 *    para decidir gravidade.
 * 2. **Botão só onde há vermelho ou âmbar.** Linha verde não ganha ação; as
 *    correções que se fazem sobre linha verde (tornar titular, voltar à regra
 *    geral, desvincular contrato) vivem em blocos que nascem fechados.
 * 3. **Uma porta por escrita.** Senha, adotar login existente, adicionar sócio
 *    e remover membro já têm porta em "Gerenciar acesso" — aqui só há link
 *    para lá. As sete escritas de `central-actions.ts` mais
 *    `atualizarEmailAluno` são as únicas que nascem nesta tela.
 * 4. **Toda escrita passa por `DialogoConfirmacao`** com a consequência
 *    escrita e botão com nome próprio; onde a RPC exige motivo, o campo é
 *    validado (3..300) antes de sair da tela.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, RefreshCw } from "lucide-react";
import type {
  DiagnosticoAmbiente,
  MembroDiagnostico,
  VerificacaoDiagnostico,
} from "@/lib/data/central";
import type { OnboardingDaPessoa } from "@/lib/types";
import type { ProximoPasso } from "@/lib/etapas";
import { formatarDataHora } from "@/lib/datas";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Secao } from "@/components/ui/secao";
import {
  SECOES,
  agruparPorSecao,
  contarEstados,
  definicaoDaChave,
  estadoDaLinha,
} from "./catalogo";
import { AcaoDaLinha } from "./acao-da-linha";
import { LinhaVerificacao } from "./linha-verificacao";
import { SecaoOnboarding } from "./secao-onboarding";
import { SecaoPessoas } from "./secao-pessoas";
import { SecaoTrilha } from "./secao-trilha";
import {
  CandidatosFinanceiro,
  DesfazerVinculoFinanceiro,
  type ContratoVinculado,
} from "./secao-financeiro";
import { ConfirmacaoDaAcao } from "./dialogos/confirmacoes";
import { SeletorCadastro } from "./dialogos/seletor-cadastro";
import { executarAcao, impedimentoDoAlvo } from "./executar-acao";
import { rotuloEtapa, type AcaoPendente } from "./tipos";

/** O que o seletor de cadastro está escolhendo. */
type Seletor =
  | { tipo: "pessoa"; membro: MembroDiagnostico }
  | { tipo: "ambiente"; membro: MembroDiagnostico };

export function CentralResolucao({
  alunoId,
  diagnostico,
  passo,
  contratosVinculados,
  onboarding,
  favorito,
}: {
  alunoId: string;
  diagnostico: DiagnosticoAmbiente;
  /** De `proximoPasso()` — a regra única de "qual é a próxima tarefa". */
  passo: ProximoPasso | null;
  /** Contratos JÁ ligados a este ambiente, para o desvincular. */
  contratosVinculados: ContratoVinculado[];
  /**
   * O questionário inicial de CADA pessoa do ambiente (§D.3). Inclui quem não
   * respondeu: "ninguém respondeu ainda" é resultado, e sumiria da tela se a
   * lista só trouxesse quem respondeu.
   */
  onboarding: OnboardingDaPessoa[];
  /** A estrela do ambiente — e se a equipe já assumiu o acompanhamento. */
  favorito: { id: string; nome: string; confirmadoEm: string | null } | null;
}) {
  const router = useRouter();
  const [acao, setAcao] = useState<AcaoPendente | null>(null);
  const [motivo, setMotivo] = useState("");
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [seletor, setSeletor] = useState<Seletor | null>(null);
  const [pendente, executando] = useTransition();
  const [reconferindo, reconferir] = useTransition();

  const base = `/admin/aluno/${alunoId}`;
  const contagem = contarEstados(diagnostico.verificacoes);
  const grupos = agruparPorSecao(diagnostico.verificacoes);
  const tudoEmOrdem = contagem.problemas === 0 && contagem.avisos === 0;
  const emailLogin = diagnostico.acesso.emailLogin;

  function recarregar() {
    reconferir(() => {
      router.refresh();
    });
  }

  function abrir(nova: AcaoPendente) {
    setErroAcao(null);
    setMotivo("");
    setAcao(nova);
  }

  function fechar() {
    if (pendente) return;
    setAcao(null);
    setErroAcao(null);
    setMotivo("");
  }

  /**
   * Executa a ação confirmada. Toda action deste repo devolve `{ erro }` em
   * português (nunca `throw`, nunca `error.message`): o erro fica no diálogo,
   * que continua aberto, e o sucesso reconfere o ambiente sozinho.
   */
  function confirmar() {
    if (!acao) return;
    setErroAcao(null);
    executando(async () => {
      const resultado = await executarAcao(acao, alunoId, motivo);
      if (resultado.erro) {
        setErroAcao(resultado.erro);
        return;
      }
      setAcao(null);
      setMotivo("");
      toast.success(resultado.sucesso);
      recarregar();
    });
  }

  /**
   * `tarefa_atual` chega do banco com `ok: null` e só o número de concluídas —
   * o catálogo de tarefas vive no TypeScript. A frase é montada com
   * `proximoPasso()`, a mesma regra do card da home do aluno; o banco não tem
   * como saber quantas tarefas uma etapa tem, e inventar isso em SQL seria a
   * segunda fonte de verdade do checklist.
   */
  function detalheDaLinha(v: VerificacaoDiagnostico): string | null {
    if (v.chave !== "tarefa_atual") return v.detalhe;
    if (!passo) return "Nenhuma tarefa pendente nas etapas liberadas.";
    if (passo.bloqueio) {
      return `Tudo o que está pendente depende de destravar antes: ${passo.bloqueio}. Primeira pendente: ${rotuloEtapa(passo.etapa)} · passo ${passo.codigo} — ${passo.titulo}.`;
    }
    return `Próximo passo: ${rotuloEtapa(passo.etapa)} — ${passo.etapaNome} · passo ${passo.codigo}: ${passo.titulo}.`;
  }

  return (
    <>
      <Card elevacao="raised" className="mb-6">
        <CardContent className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            {/* As quatro contagens SOMAM o total: esconder as informações
                deixaria 4 das 20 conferências fora da conta e o admin sem
                saber o que aconteceu com elas. Zero sai em neutro — "0
                problemas" em vermelho seria alarme sobre boa notícia. */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant={contagem.problemas > 0 ? "danger" : "neutral"}
                icone={contagem.problemas > 0 ? undefined : false}
              >
                {contagem.problemas}{" "}
                {contagem.problemas === 1 ? "problema" : "problemas"}
              </Badge>
              <Badge
                variant={contagem.avisos > 0 ? "warning" : "neutral"}
                icone={contagem.avisos > 0 ? undefined : false}
              >
                {contagem.avisos} {contagem.avisos === 1 ? "aviso" : "avisos"}
              </Badge>
              <Badge variant="success">
                {contagem.ok}{" "}
                {contagem.ok === 1 ? "conferência ok" : "conferências ok"}
              </Badge>
              <Badge variant="neutral" icone={false}>
                {contagem.informacoes}{" "}
                {contagem.informacoes === 1 ? "informação" : "informações"}
              </Badge>
            </div>
            <p className="mt-2 corpo-sm text-muted-foreground">
              {contagem.total} conferências, feitas em{" "}
              {diagnostico.geradoEm
                ? formatarDataHora(diagnostico.geradoEm)
                : "horário não informado"}
              .
            </p>
          </div>
          <Button
            variant="outline"
            onClick={recarregar}
            disabled={reconferindo}
            aria-busy={reconferindo || undefined}
          >
            <RefreshCw className="size-4" />
            {reconferindo ? "Reconferindo…" : "Reconferir"}
          </Button>
        </CardContent>
      </Card>

      {/* O leitor de tela precisa saber que a lista está sendo refeita — o
          botão sozinho só avisa quem enxerga o rótulo mudar. */}
      <p aria-live="polite" className="sr-only">
        {reconferindo ? "Reconferindo o ambiente." : ""}
      </p>

      {tudoEmOrdem ? (
        <div className="mb-6">
          <EmptyState
            icone={<CheckCircle2 />}
            titulo="Nada a resolver por aqui"
            descricao={`As ${contagem.total} conferências passaram. Abaixo, o que foi conferido — uma tela verde sem a lista não vale nada.`}
          />
        </div>
      ) : null}

      <div className="ritmo-secao">
        {grupos.map((g, i) => {
          const meta = SECOES[g.secao];
          const Icone = meta.icone;
          const temPendencia = g.itens.some((v) => {
            const e = estadoDaLinha(v);
            return e === "problema" || e === "atencao";
          });

          return (
            <Secao
              key={`${g.secao}-${i}`}
              icone={<Icone />}
              titulo={meta.titulo}
              descricao={tudoEmOrdem ? undefined : meta.descricao}
            >
              <ul className="border-t border-borda-fina">
                {g.itens.map((v) => {
                  const estado = estadoDaLinha(v);
                  const mostraCandidatos =
                    v.chave === "financeiro_contrato" &&
                    estado !== "ok" &&
                    diagnostico.candidatosFinanceiro.length > 0;

                  return (
                    <LinhaVerificacao
                      key={v.chave}
                      estado={estado}
                      rotulo={definicaoDaChave(v.chave).rotulo}
                      valor={v.valor}
                      detalhe={detalheDaLinha(v)}
                      acao={
                        <AcaoDaLinha
                          chave={v.chave}
                          estado={estado}
                          base={base}
                          passo={passo}
                          emailCadastro={diagnostico.emailCadastro}
                          emailLogin={emailLogin}
                          pendente={pendente}
                          onAlinharEmail={(deCadastro, paraLogin) =>
                            abrir({
                              tipo: "alinhar-email",
                              deCadastro,
                              paraLogin,
                            })
                          }
                        />
                      }
                      compacto={tudoEmOrdem}
                    >
                      {mostraCandidatos ? (
                        <CandidatosFinanceiro
                          candidatos={diagnostico.candidatosFinanceiro}
                          pendente={pendente}
                          onVincular={(candidato) =>
                            abrir({ tipo: "vincular-financeiro", candidato })
                          }
                        />
                      ) : null}
                    </LinhaVerificacao>
                  );
                })}
              </ul>

              {g.secao === "pessoas" ? (
                <SecaoPessoas
                  membros={diagnostico.membros}
                  alunoId={alunoId}
                  aberto={temPendencia && !tudoEmOrdem}
                  pendente={pendente}
                  onVincularPessoa={(membro) =>
                    setSeletor({ tipo: "pessoa", membro })
                  }
                  onTrocarTitular={(membro) =>
                    abrir({ tipo: "trocar-titular", membro })
                  }
                  onMoverMembro={(membro) =>
                    setSeletor({ tipo: "ambiente", membro })
                  }
                />
              ) : null}

              {g.secao === "trilha" ? (
                <SecaoTrilha
                  etapas={diagnostico.etapas}
                  progresso={diagnostico.progresso}
                  alunoId={alunoId}
                  // Abre quando há exceção para revisar; a lista de etapas não
                  // é o remédio de "faltam clientes", então aviso de outra
                  // linha não a escancara.
                  aberto={diagnostico.etapas.some((e) => e.origem !== "global")}
                  pendente={pendente}
                  onLiberar={(etapa) => abrir({ tipo: "liberar-etapa", etapa })}
                  onTravar={(etapa) => abrir({ tipo: "travar-etapa", etapa })}
                  onVoltarRegraGeral={(etapa) =>
                    abrir({ tipo: "voltar-regra-geral", etapa })
                  }
                  onReabrir={(etapa, concluidas) =>
                    abrir({ tipo: "reabrir-etapa", etapa, concluidas })
                  }
                />
              ) : null}

              {g.secao === "financeiro" ? (
                <DesfazerVinculoFinanceiro
                  contratos={contratosVinculados}
                  pendente={pendente}
                  onDesvincular={(c) =>
                    abrir({
                      tipo: "desvincular-financeiro",
                      contatoHmId: c.contatoHmId,
                      produto: c.produto,
                    })
                  }
                />
              ) : null}
            </Secao>
          );
        })}

        {/* O questionário inicial fecha a lista: ele explica o CONTEXTO do
            aluno (de onde vem o cliente 1, o que ele pediu de pronto), e não é
            uma conferência do ambiente — por isso vem depois do checklist e
            fora da contagem de problemas/avisos do topo, que soma as
            verificações que o banco devolve. */}
        <SecaoOnboarding
          pessoas={onboarding}
          alunoId={alunoId}
          favorito={favorito}
        />
      </div>

      {/* Escolher o alvo NÃO escreve: o seletor só devolve quem foi escolhido,
          e a confirmação nomeada acontece no diálogo seguinte. */}
      {seletor ? (
        <SeletorCadastro
          aberto
          titulo={
            seletor.tipo === "pessoa"
              ? "Qual é o cadastro desta pessoa?"
              : "Para qual ambiente mover este sócio?"
          }
          descricao={
            seletor.tipo === "pessoa"
              ? `Ligar ${seletor.membro.emailLogin ?? "este membro"} ao cadastro do Time Holding Brasil.`
              : `Escolha o titular do ambiente de destino de ${seletor.membro.emailLogin ?? "este sócio"}.`
          }
          impedimento={(a) => impedimentoDoAlvo(seletor.tipo, a, alunoId)}
          onEscolher={(escolhido) => {
            const membro = seletor.membro;
            setSeletor(null);
            abrir(
              seletor.tipo === "pessoa"
                ? { tipo: "vincular-pessoa", membro, pessoa: escolhido }
                : { tipo: "mover-membro", membro, destino: escolhido },
            );
          }}
          onCancelar={() => setSeletor(null)}
        />
      ) : null}

      {acao ? (
        <ConfirmacaoDaAcao
          key={acao.tipo}
          acao={acao}
          motivo={motivo}
          onMotivo={setMotivo}
          pendente={pendente}
          erro={erroAcao}
          onConfirmar={confirmar}
          onCancelar={fechar}
        />
      ) : null}
    </>
  );
}
