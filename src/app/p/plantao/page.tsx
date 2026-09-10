/**
 * Plantão de Dúvidas — Acelera Holding. Rota PÚBLICA embedada em iframe na
 * área de membros da Hotmart (https://hm.nivelouro.com.br/acelera-holding).
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Server Component: SEM login. `?e=<email>` é a identidade (opcional) e
 * `?m=YYYY-MM` o mês (opcional) — nunca cookie, nunca token, nunca senha.
 * A inscrição vale na hora do clique: quem chega sem `?e=` vê o calendário
 * público + formulário de identificação; quem chega com `?e=` (depois de se
 * identificar) vê também o card da própria inscrição, se houver.
 *
 * O e-mail que entra por `?e=` NUNCA é tratado como comprovado aqui — a
 * confirmação contra a base de compradores do Acelera acontece dentro de
 * `inscrever()`/`buscarCalendario()`, no servidor. Este componente só lê a
 * query string e repassa.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  buscarCalendario,
  buscarMinhaInscricao,
  registrarCliqueDeEmail,
} from "@/app/p/plantao/actions";
import { mesAtualSaoPaulo, normalizarEmail, emailValido } from "@/lib/plantao";
import { CalendarioMes } from "@/components/plantao/calendario-mes";
import { MinhaInscricaoCard } from "@/components/plantao/minha-inscricao-card";
import { NpsForm } from "@/components/plantao/nps-form";
import { IdentificacaoForm } from "@/components/plantao/identificacao-form";

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
  searchParams: Promise<{
    m?: string;
    e?: string;
    n?: string;
    /** origem do clique, posta pelos e-mails: sala_1h | abertura | nps */
    o?: string;
    /** slot a que o e-mail se referia, para casar o clique */
    s?: string;
  }>;
}) {
  const { m, e, n, o, s: slotDoEmail } = await searchParams;
  const { ano, mes } = parseMes(m);

  const email =
    e && emailValido(e) ? normalizarEmail(e) : null;
  const nome = n?.trim() || null;

  // "Trocar e-mail" volta ao formulário de identificação, preservando o mês
  // que a pessoa estava vendo (senão ela perde o lugar no calendário).
  const hrefTrocarEmail = m ? `/p/plantao?m=${m}` : "/p/plantao";

  // Chegou por um link de e-mail? Registra o clique. Vai junto do fetch
  // porque não bloqueia nada: a action engole qualquer erro, e o par
  // (recebeu → clicou → entrou) é o que dá o funil do plantão.
  const veioDeEmail = Boolean(email && o && slotDoEmail);

  const [calendario, minhaInscricao] = await Promise.all([
    buscarCalendario(ano, mes, email ?? undefined),
    email ? buscarMinhaInscricao(email) : Promise.resolve(null),
    veioDeEmail
      ? registrarCliqueDeEmail(email!, slotDoEmail!, o!)
      : Promise.resolve(),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <p className="rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Este plantão é exclusivo de quem comprou o Acelera Holding.
        {!email ? (
          <>
            {" "}
            <span className="font-medium text-accent-foreground">
              Passo 1:
            </span>{" "}
            informe seu nome e e-mail abaixo para poder se inscrever.
          </>
        ) : null}
      </p>

      {/* Âncora usada pelo aviso do topo do calendário e pelo painel do dia
          para trazer a pessoa de volta ao formulário sem perder o lugar. */}
      <div id="identificacao">
        {!email ? (
          <IdentificacaoForm />
        ) : !nome ? (
          // Chegou com `?e=` mas sem `?n=` (ex.: link salvo antes de se
          // identificar) — pede o nome de novo para poder se inscrever
          // (InscricaoPainel exige os dois), mas isso NÃO impede ver a
          // inscrição/card/NPS que já existir, abaixo.
          <IdentificacaoForm emailInicial={email} />
        ) : (
          <p className="text-sm">
            Inscrevendo como <span className="font-medium">{nome}</span>.{" "}
            <Link
              href={hrefTrocarEmail}
              className="font-medium text-accent-foreground underline underline-offset-4 hover:no-underline"
            >
              Não é você? Trocar e-mail
            </Link>
          </p>
        )}
      </div>

      {email && minhaInscricao ? (
        <MinhaInscricaoCard inscricao={minhaInscricao} email={email} />
      ) : null}

      {/* NPS: só quando o aluno esteve presente e o plantão já terminou. */}
      {email &&
      minhaInscricao &&
      minhaInscricao.encerrado &&
      minhaInscricao.presencaEm &&
      !minhaInscricao.npsEm ? (
        <NpsForm inscricaoId={minhaInscricao.inscricaoId} email={email} />
      ) : null}

      {calendario.ok ? (
        <CalendarioMes
          ano={ano}
          mes={mes}
          slots={calendario.slots}
          email={email}
          nome={nome}
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
