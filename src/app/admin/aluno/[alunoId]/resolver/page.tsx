import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContextoSessao } from "@/lib/auth";
import {
  getAlunoById,
  getAmbiente,
  getClienteEquipe,
  getClientesEtapa1,
  getDiagnosticoAmbiente,
  getEtapas,
  getOnboardingDoAluno,
  getProgressoAluno,
  contarMembrosDoAmbiente,
  alunoJaTemCliente,
} from "@/lib/data";
import { getFinanceiroDoAluno } from "@/lib/financeiro";
import {
  etapasComLiberacaoDoAluno,
  proximoPasso,
  type OverridesLiberacao,
} from "@/lib/etapas";
import { assistenciaNavItems } from "@/lib/nav";
import { AppHeader } from "@/components/app-header";
import { PageHeader } from "@/components/ui/page-header";
import { ErroPainel } from "@/components/ui/erro-painel";
import { buttonVariants } from "@/components/ui/button";
import { AssistBanner } from "@/components/admin/assist-banner";
import { CentralResolucao } from "@/components/admin/central";
import { BotaoRecarregar } from "@/components/admin/central/botao-recarregar";
import type { ContratoVinculado } from "@/components/admin/central/secao-financeiro";

export const metadata = { title: "Resolver" };

/**
 * Central de resolução — "por que este aluno não anda".
 *
 * O diagnóstico inteiro vem de UMA RPC (`getDiagnosticoAmbiente`), que já
 * devolve o checklist na ordem da tela, os membros, as etapas, o progresso e
 * os contratos órfãos que casam com o cadastro. A página não repete nenhuma
 * dessas contas.
 *
 * 🔑 Duas exceções, e as duas têm motivo:
 *
 * - **`proximoPasso()`** — o banco manda `tarefa_atual` com `ok: null` e só o
 *   número de concluídas, de propósito: o catálogo de tarefas vive no
 *   TypeScript, com as travas `exigeFavorito`/`exigeTarefa`. A frase é montada
 *   aqui, com a MESMA função da home do aluno. Daí `getEtapas`, os clientes e
 *   o progresso — e a liberação individual entra por
 *   `etapasComLiberacaoDoAluno`, com os overrides que o diagnóstico já trouxe
 *   (nenhuma consulta a mais).
 * - **`getFinanceiroDoAluno`** — só quando JÁ existe contrato ligado. É o
 *   único lugar que conhece o `contatoHmId` dos contratos vinculados, sem o
 *   qual "desvincular" não teria alvo. Sem contrato a pergunta não existe e a
 *   consulta não acontece.
 */
export default async function AdminAlunoResolverPage({
  params,
}: {
  params: Promise<{ alunoId: string }>;
}) {
  const { alunoId } = await params;
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  const ambiente = await getAmbiente(alunoId);
  if (!ambiente) notFound();

  const base = `/admin/aluno/${alunoId}`;
  const [
    aluno,
    qtdMembros,
    resultado,
    etapasGlobais,
    clientes,
    progressoTodas,
    favorito,
    onboarding,
    jaTemCliente
  ] = await Promise.all([
    getAlunoById(alunoId),
    contarMembrosDoAmbiente(alunoId),
    getDiagnosticoAmbiente(alunoId),
    getEtapas(),
    getClientesEtapa1(alunoId),
    getProgressoAluno(alunoId),
    getClienteEquipe(alunoId),
    // Uma RPC (`gps.admin_onboarding_do_aluno`), no MESMO `Promise.all` das
    // outras: o bloco novo não acrescenta uma ida em série à abertura da tela.
    getOnboardingDoAluno(alunoId),
    alunoJaTemCliente(alunoId)
  ]);

  // Diagnóstico parcial faria o admin concluir "está tudo bem" sobre o que não
  // carregou. Ou a tela inteira, ou a tela de erro — nunca meia tela.
  if (resultado.erro || !resultado.diagnostico) {
    return (
      <ErroPainel
        titulo="Não foi possível conferir este ambiente"
        descricao={
          resultado.erro ??
          "O diagnóstico não veio agora. Nada foi alterado no ambiente do aluno."
        }
      >
        <BotaoRecarregar />
        <Link href={base} className={buttonVariants({ variant: "outline" })}>
          Voltar à ficha do aluno
        </Link>
      </ErroPainel>
    );
  }

  const diagnostico = resultado.diagnostico;

  // Os overrides já vieram no diagnóstico (`origem` diferente de "global"):
  // reler `gps.etapa_liberacao_aluno` seria a segunda ida ao banco pelo mesmo
  // dado. `etapasComLiberacaoDoAluno` continua sendo a única regra.
  const overrides: OverridesLiberacao = {};
  for (const e of diagnostico.etapas) {
    if (e.origem !== "global") {
      overrides[e.etapa] = {
        liberada: e.liberada,
        ...(e.motivo ? { motivo: e.motivo } : {}),
      };
    }
  }
  const etapas = etapasComLiberacaoDoAluno(etapasGlobais, overrides);
  const passo = proximoPasso(etapas, clientes, progressoTodas, {
    temFavorito: favorito !== null,
    // 🔑 Sem isto a HOME trava o passo que a Etapa 01 mostra liberado: quem
    // chegou COM cliente não é travado pela tarefa dos 30, e as duas telas
    // precisam dizer a mesma coisa.
    jaTemCliente,
  });

  const temContrato =
    diagnostico.verificacoes.find((v) => v.chave === "financeiro_contrato")
      ?.ok === true;
  let contratosVinculados: ContratoVinculado[] = [];
  if (temContrato) {
    const financeiro = await getFinanceiroDoAluno(alunoId);
    if (financeiro.estado === "ok") {
      contratosVinculados = financeiro.contratos
        .filter((c): c is typeof c & { contatoHmId: string } =>
          Boolean(c.contatoHmId),
        )
        .map((c) => ({
          contatoHmId: c.contatoHmId,
          produto: c.produto,
          plano: c.plano,
          valorPrograma: c.valorPrograma,
        }));
    }
  }

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={assistenciaNavItems(alunoId, {
          ambienteCompartilhado: qtdMembros > 1,
        })}
      />
      <AssistBanner aluno={aluno} />

      <main id="conteudo" className="mx-auto w-full max-w-4xl px-4 py-8">
        <PageHeader
          eyebrow="Central de resolução"
          titulo={`Resolver — ${aluno?.nome ?? diagnostico.nome ?? "aluno"}`}
          descricao="O que está travando este ambiente, na ordem do socorro: sem login, nada mais importa. Cada linha traz o dado que sustenta o diagnóstico."
          voltar={
            <Link
              href={base}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              ← Voltar ao início do aluno
            </Link>
          }
        />

        <CentralResolucao
          alunoId={alunoId}
          diagnostico={diagnostico}
          passo={passo}
          contratosVinculados={contratosVinculados}
          onboarding={onboarding}
          // `getClienteEquipe` já era carregado aqui (é ele que diz a
          // `proximoPasso` se há favorito): nenhuma consulta nova para saber se
          // a equipe assumiu o acompanhamento.
          favorito={
            favorito
              ? {
                  id: favorito.id,
                  nome: favorito.nome,
                  confirmadoEm: favorito.acompanhamento_confirmado_em,
                }
              : null
          }
        />
      </main>
    </>
  );
}
