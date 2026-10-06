import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { faixaHorario, rotuloData } from "@/lib/plantao";
import {
  estadoDaSala,
  type HojeNoPrograma as Dados,
  type PlantaoHoje,
} from "@/components/home/hoje-tipos";

/**
 * "Hoje no programa" — dois atalhos pequenos lado a lado (Plantão e Sessões),
 * uma linha de situação cada, e o verbo da ação à direita.
 *
 * Server Component, sem JS no cliente. Cada parte é `null` quando a leitura
 * falhou (o servidor já logou) e some; sem nenhuma parte, nada renderiza.
 * Sem nada marcado o atalho continua: é a porta de entrada do Plantão.
 *
 * 🔴 Nenhum link de sala aqui: revelar o link grava presença. Tudo leva a
 * `/plantao`, que é a porta.
 */
export function HojeNoPrograma({ dados, className }: { dados: Dados; className?: string }) {
  const { plantao, sessoes, atalhos } = dados;
  const temAtalhos = atalhos !== null && atalhos.length > 0;
  if (!plantao && !sessoes && !temAtalhos) return null;

  const p = plantao ? linhaDoPlantao(plantao, dados.hoje, dados.agoraMs) : null;

  return (
    <div className={className}>
      <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
        {p ? (
          <Atalho href="/plantao" titulo="Plantão de dúvidas" linha={p.linha} verbo={p.verbo} />
        ) : null}
        {sessoes ? (
          <Atalho
            href="/sessoes"
            titulo="Sessões com a equipe"
            linha={
              sessoes.proxima
                ? `${sessoes.proxima.tipoNome ?? "Sessão"} · ${quando(sessoes.proxima.data, dados.hoje)}, às ${sessoes.proxima.horaInicio.replace(":", "h")}`
                : "Nenhuma sessão marcada"
            }
            verbo={sessoes.proxima ? "Ver sessões" : "Ver horários"}
          />
        ) : null}
      </div>

      {temAtalhos ? (
        <ul className="mt-3 flex flex-wrap gap-x-6 text-base">
          {atalhos.map((a) => (
            <li key={`${a.rotulo}|${a.url}`} className="min-w-0">
              {/* `min-h-11`: alvo de toque de 44 px; o ícone diz "sai do portal". */}
              <a
                href={a.url}
                target="_blank"
                rel="noopener noreferrer"
                title={a.descricao ?? undefined}
                className="foco-visivel inline-flex min-h-11 items-center gap-1.5 font-medium break-words text-accent-foreground underline underline-offset-4"
              >
                {a.rotulo}
                <ExternalLink aria-hidden className="size-4 shrink-0" />
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function Atalho({
  href,
  titulo,
  linha,
  verbo,
}: {
  href: string;
  titulo: string;
  linha: string;
  verbo: string;
}) {
  return (
    <Link href={href} className="foco-visivel block min-w-0 rounded-xl">
      <Card interativo className="h-full">
        <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <span className="min-w-0">
            <span className="block text-base font-semibold">{titulo}</span>
            <span className="block text-base text-muted-foreground">{linha}</span>
          </span>
          <span className="inline-flex items-center gap-1 text-base font-medium whitespace-nowrap text-accent-foreground">
            {verbo} <ArrowRight aria-hidden className="size-4" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

/** "Hoje" ou "sex., 03/10" — `data` é date-only, sem `Date` no fuso do servidor. */
function quando(data: string, hoje: string): string {
  return data === hoje ? "Hoje" : rotuloData(data);
}

function horario(s: { data: string; horaInicio: string; duracaoMin: number }, hoje: string) {
  return `${quando(s.data, hoje)}, ${faixaHorario(s.horaInicio, s.duracaoMin)}`;
}

/** Uma linha de situação + o verbo, para cada estado do Plantão. */
function linhaDoPlantao(
  plantao: PlantaoHoje,
  hoje: string,
  agoraMs: number,
): { linha: string; verbo: string } {
  const { minhaInscricao, proximo, abertoParaVoce } = plantao;

  if (minhaInscricao) {
    const sala = estadoDaSala(minhaInscricao.inicioEm, minhaInscricao.fimEm, agoraMs);
    return {
      linha: `Inscrito · ${horario(minhaInscricao, hoje)}`,
      verbo: sala === "aberta" ? "Entrar" : "Abrir",
    };
  }

  if (!proximo) return { linha: "Nenhum plantão marcado", verbo: "Abrir" };

  if (new Date(proximo.inicioEm).getTime() <= agoraMs) {
    return { linha: `Acontecendo agora · com ${proximo.mentoraNome}`, verbo: "Abrir" };
  }
  if (proximo.inscricaoAberta) {
    return { linha: `${horario(proximo, hoje)} · inscrições abertas`, verbo: "Inscrever-se" };
  }
  // O próximo não serve para ele (intervalo ou prazo encerrado): mostra o
  // primeiro que ele ainda pode pegar, quando existe.
  if (abertoParaVoce) {
    return { linha: `${horario(abertoParaVoce, hoje)} · inscrições abertas`, verbo: "Inscrever-se" };
  }
  return {
    linha: `${horario(proximo, hoje)} · ${proximo.emIntervalo ? "fica de fora para você" : "inscrições encerradas"}`,
    verbo: "Ver calendário",
  };
}
