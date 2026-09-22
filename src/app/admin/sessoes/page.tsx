import { redirect } from "next/navigation";

import { AppHeader } from "@/components/app-header";
import { ListaDeSessoes } from "@/components/admin/sessoes/lista";
import {
  getSessoesVisiveisNaEquipe,
  TETO_SESSOES,
} from "@/components/admin/sessoes/dados";
import { PageHeader } from "@/components/ui/page-header";
import { Secao } from "@/components/ui/secao";
import { getContextoSessao } from "@/lib/auth";
import { getNomesDeClientes } from "@/lib/data/clientes";
import { getMapaDeResponsaveis } from "@/lib/data/sessoes";
import { adminNavItems } from "@/lib/nav";
import type { SessaoAgendamento } from "@/lib/sessoes-tipos";

/**
 * `/admin/sessoes` — a tela DA EQUIPE (Dras. Cristiane e Elaine, e admins):
 * próximas sessões, briefing, histórico, cancelar (FATIA 5).
 *
 * PRD: `docs/specs/2026-09-22-agenda-sessoes-equipe-PRD.md` (§7.2, §9-ter B2).
 *
 * 🔴 A REGRA DE ACESSO JÁ ESTÁ NO BANCO (§9-ter B2) e NÃO é replicada aqui:
 *   - doutora  → RLS `gps_sessao_agend_responsavel_select` (`responsavel_id
 *     = auth.uid()`) já devolve só as dela quando a query não filtra nada;
 *   - admin    → RLS `gps_sessao_agend_admin` (`gp_is_admin()`) devolve
 *     todas;
 *   - aluno/anon → RLS não devolve nada, e esta rota nem chega a chamar a
 *     leitura para eles (guarda de rota abaixo).
 * Esta página usa só `ehAdmin()`-equivalente (`ctx.papel === "admin"`, que
 * cobre cargo dev/admin) como GUARDA DE ROTA, no padrão das outras páginas de
 * `/admin` — nunca decide "quem vê o quê" de novo em TypeScript.
 *
 * 🔴 O BRIEFING NÃO CARREGA AQUI. `getSessoesVisiveisNaEquipe` seleciona só
 * as colunas de `sessao_agendamentos` alcançáveis por `authenticated`
 * (`briefing_snapshot` está fora do grant de coluna, …291 §6). O componente
 * de cada linha busca o briefing SOB DEMANDA, ao abrir a ficha
 * (`BriefingSessao`/`abrirBriefingDaSessao`) — carregar o de N sessões aqui
 * geraria N registros de acesso a dado pessoal na trilha LGPD sem ninguém
 * ter lido nada (`gps.sessao_briefing_ler` grava a cada chamada).
 */

export const metadata = { title: "Admin — Sessões com a equipe" };

export default async function AdminSessoesPage() {
  const ctx = await getContextoSessao();
  if (!ctx) redirect("/login");
  if (ctx.papel !== "admin") redirect("/");

  // 🔴 DUAS leituras, com recortes diferentes — e é deliberado.
  // "Próximas" são as agendadas: poucas por natureza (4/semana por doutora) e
  // é o que a equipe precisa ver INTEIRO, senão a tela esconde compromisso.
  // "Histórico" só cresce, então leva teto — e quando corta, a tela DIZ.
  const [prox, hist, mapaResponsaveis] = await Promise.all([
    getSessoesVisiveisNaEquipe({ estados: ["agendado"] }),
    getSessoesVisiveisNaEquipe({
      estados: ["realizado", "cancelado", "falta"],
    }),
    getMapaDeResponsaveis(),
  ]);

  const erro = prox.erro ?? hist.erro;
  const proximas = prox.sessoes;
  const historico = hist.sessoes;
  const sessoes = [...proximas, ...historico];

  // 🔴 UMA consulta para todos os clientes, nunca uma por cliente.
  // A versão anterior fazia `Array.from(ids, getClienteById)` — uma ida ao
  // PostgREST por cliente distinto. Com 8 sessões/semana isso vira ~400
  // requisições por abertura de tela em um ano: custo que cresce com a base,
  // não com o que a tela mostra. Reprovado no veredito de 22/09 pelo
  // checklist do protocolo ("nenhum await dentro de for/map").
  const nomeDoCliente = await getNomesDeClientes(
    sessoes.map((s) => s.cliente_id),
  );

  return (
    <>
      <AppHeader
        nome={ctx.perfil?.nome ?? ctx.user.email ?? null}
        email={ctx.user.email ?? null}
        papelRotulo="Admin"
        homeHref="/admin"
        navItems={adminNavItems({ souAdmin: true })}
      />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          titulo="Sessões com a equipe"
          descricao="Entrevista Prévia e Reunião Preliminar marcadas pelos parceiros nos horários que a equipe publicou."
        />

        {erro ? (
          <p role="alert" className="border border-borda-fina px-4 py-4 corpo-sm text-destructive">
            {erro}
          </p>
        ) : (
          <div className="grid gap-8">
            <Secao titulo="Próximas sessões" nivel="h2">
              {/* 🔴 O teto vale para as DUAS listas, então o aviso também.
                  O comentário acima promete "ver INTEIRO", mas a query limita
                  a 300 — se um dia cortar aqui, a tela tem de dizer, senão a
                  equipe conclui que aquilo é tudo. Achado do veredito de
                  22/09: `truncado` era calculado e ignorado deste lado. */}
              {prox.truncado ? (
                <p className="corpo-sm mb-2 text-muted-foreground">
                  Mostrando as {TETO_SESSOES} sessões mais próximas. Há mais
                  marcadas.
                </p>
              ) : null}
              <ListaDeSessoes
                sessoes={ordenarPorInicio(proximas)}
                nomeDoCliente={nomeDoCliente}
                nomeDaResponsavel={mapaResponsaveis}
                souAdmin
              />
            </Secao>

            <Secao titulo="Histórico" nivel="h2">
              {/* 🔴 Quando o teto corta, a tela DIZ. Lista truncada em
                  silêncio faz quem lê concluir que aquilo é tudo — o mesmo
                  defeito que o rodapé honesto do painel de alunos resolveu. */}
              {hist.truncado ? (
                <p className="corpo-sm mb-2 text-muted-foreground">
                  Mostrando as {TETO_SESSOES} sessões mais próximas de hoje. Há
                  mais no histórico.
                </p>
              ) : null}
              <ListaDeSessoes
                sessoes={ordenarPorInicioDesc(historico)}
                nomeDoCliente={nomeDoCliente}
                nomeDaResponsavel={mapaResponsaveis}
                souAdmin
              />
            </Secao>
          </div>
        )}
      </main>
    </>
  );
}

/** Próximas: mais cedo primeiro (o que precisa de atenção primeiro). */
function ordenarPorInicio(lista: SessaoAgendamento[]): SessaoAgendamento[] {
  return [...lista].sort((a, b) => a.inicio_em.localeCompare(b.inicio_em));
}

/** Histórico: mais recente primeiro (o que acabou de acontecer, no topo). */
function ordenarPorInicioDesc(lista: SessaoAgendamento[]): SessaoAgendamento[] {
  return [...lista].sort((a, b) => b.inicio_em.localeCompare(a.inicio_em));
}
