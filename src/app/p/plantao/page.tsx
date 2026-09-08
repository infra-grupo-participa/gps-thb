/**
 * Plantão de Dúvidas — Acelera Holding. Rota PÚBLICA embedada em iframe na
 * área de membros da Hotmart (https://hm.nivelouro.com.br/acelera-holding).
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Server Component: lê o cookie de sessão do plantão (via `sessaoAtual`) e
 * decide entre a tela de login (guardada pela sonda de cookie de terceiro)
 * e o calendário do mês. Navegação entre meses por `?m=YYYY-MM` com `Link`
 * — nunca token na URL, nunca refetch em cascata.
 *
 * Quando havia cookie de sessão mas ele não resolveu mais nada (expirou, foi
 * revogado, ou o aluno perdeu acesso ao Plantão por ter migrado para o
 * Programa de Implementação — `bloqueado_por_programa`), a tela de login
 * recebe um aviso NEUTRO ("sua sessão expirou"), sempre o mesmo texto
 * independente do motivo — ver `sessaoAtual` em `actions.ts`.
 */

import type { Metadata } from "next";
import { sessaoAtual, buscarCalendario, buscarMinhaInscricao } from "@/app/p/plantao/actions";
import { mesAtualSaoPaulo } from "@/lib/plantao";
import { AcessoBloqueado } from "@/components/plantao/acesso-bloqueado";
import { TrocarSenhaPlantao } from "@/components/plantao/trocar-senha-plantao";
import { CalendarioMes } from "@/components/plantao/calendario-mes";
import { MinhaInscricaoCard } from "@/components/plantao/minha-inscricao-card";
import { NpsForm } from "@/components/plantao/nps-form";

export const metadata: Metadata = { title: "Calendário" };

function parseMes(m: string | undefined): { ano: number; mes: number } {
  if (m && /^\d{4}-\d{2}$/.test(m)) {
    const [ano, mes] = m.split("-").map(Number);
    if (mes >= 1 && mes <= 12) return { ano, mes };
  }
  return mesAtualSaoPaulo();
}

export default async function PlantaoPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { sessao, sessaoExpirou } = await sessaoAtual();

  if (!sessao) {
    // Mensagem sempre neutra — nunca diferenciar "expirou", "foi revogada"
    // ou "aluno bloqueado por ter migrado de produto": a rota é pública, e
    // diferenciar aqui confirmaria a um estranho que aquele e-mail comprou.
    return (
      <AcessoBloqueado
        avisoInicial={
          sessaoExpirou ? "Sua sessão expirou. Entre novamente." : undefined
        }
      />
    );
  }

  // Senha ainda provisória (1º acesso com a senha padrão da Hotmart, ou
  // login seguinte de quem ainda não trocou): a sessão já existe, mas o
  // aluno não pode usar o plantão antes de definir a própria senha.
  if (sessao.precisaTrocarSenha) {
    return <TrocarSenhaPlantao />;
  }

  const { m } = await searchParams;
  const { ano, mes } = parseMes(m);

  const [calendario, minhaInscricao] = await Promise.all([
    buscarCalendario(ano, mes),
    buscarMinhaInscricao(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Este acesso é exclusivo da Acelera Holding e é separado do seu acesso
        ao Programa de Implementação Assistida.
      </p>

      <p className="text-sm">
        Olá, <span className="font-medium">{sessao.nome}</span>.
      </p>

      {minhaInscricao ? (
        <MinhaInscricaoCard inscricao={minhaInscricao} />
      ) : null}

      {/* NPS: só quando o aluno esteve presente e o plantão já terminou. */}
      {minhaInscricao && minhaInscricao.encerrado && minhaInscricao.presencaEm && !minhaInscricao.npsEm ? (
        <NpsForm inscricaoId={minhaInscricao.inscricaoId} />
      ) : null}

      {calendario.ok ? (
        <CalendarioMes
          ano={ano}
          mes={mes}
          slots={calendario.slots}
          minhaInscricaoAtiva={
            minhaInscricao && !minhaInscricao.encerrado ? minhaInscricao : null
          }
        />
      ) : (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {calendario.erro}
        </div>
      )}
    </div>
  );
}
