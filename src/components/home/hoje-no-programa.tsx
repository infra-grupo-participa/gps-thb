import Link from "next/link";
import { Secao } from "@/components/ui/secao";
import { formatarDataHora } from "@/lib/datas";
import { faixaHorario, rotuloData } from "@/lib/plantao";
import {
  estadoDaSala,
  type HojeNoPrograma as Dados,
  type PlantaoHoje,
  type PlantaoSlotHoje,
} from "@/components/home/hoje-tipos";

/**
 * "Hoje no programa" — o que acontece hoje e onde fica cada coisa.
 *
 * Server Component, sem estado e sem JS no cliente. Denso e chapado: uma
 * caixa só, uma linha por assunto, hierarquia por POSIÇÃO (título à
 * esquerda, conteúdo à direita; empilha no celular). Sem card por item, sem
 * ícone decorativo.
 *
 * Cada parte é `null` quando a leitura falhou (o servidor já logou) e some;
 * sem nenhuma parte, o bloco inteiro não renderiza.
 *
 * 🔴 Nenhum link de sala aqui: revelar o link grava presença. Tudo leva a
 * `/plantao`, que é a porta.
 */
export function HojeNoPrograma({ dados, className }: { dados: Dados; className?: string }) {
  const { plantao, sessoes, atalhos } = dados;
  const temAtalhos = atalhos !== null && atalhos.length > 0;
  if (!plantao && !sessoes && !temAtalhos) return null;

  return (
    <Secao titulo="Hoje no programa" className={className}>
      <div className="divide-y divide-borda-fina rounded-lg border border-borda-fina bg-card">
        {plantao ? (
          <Linha titulo="Plantão de dúvidas">
            <ConteudoPlantao plantao={plantao} hoje={dados.hoje} agoraMs={dados.agoraMs} />
          </Linha>
        ) : null}

        {sessoes ? (
          <Linha titulo="Suas sessões com a equipe">
            {sessoes.proxima ? (
              <p>
                <span className="font-medium">
                  {sessoes.proxima.tipoNome ?? "Sessão"}
                  {sessoes.proxima.clienteNome ? ` · ${sessoes.proxima.clienteNome}` : ""}
                </span>
                {" — "}
                {quando(sessoes.proxima.data, dados.hoje)}, às{" "}
                {sessoes.proxima.horaInicio.replace(":", "h")}
              </p>
            ) : (
              <p className="text-muted-foreground">Nenhuma sessão marcada.</p>
            )}
            <LinkInterno href="/sessoes">
              {sessoes.proxima ? "Ver suas sessões" : "Ver horários disponíveis"}
            </LinkInterno>
          </Linha>
        ) : null}

        {temAtalhos ? (
          <Linha titulo="Onde fica cada coisa">
            <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {atalhos.map((a) => (
                <li key={`${a.rotulo}|${a.url}`} className="min-w-0">
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium break-words text-accent-foreground underline-offset-4 hover:underline"
                  >
                    {a.rotulo}
                    <span className="sr-only"> (abre em nova aba)</span>
                  </a>
                  {a.descricao ? (
                    <span className="block break-words corpo-sm text-muted-foreground">
                      {a.descricao}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </Linha>
        ) : null}
      </div>
    </Secao>
  );
}

function Linha({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-x-4 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[12rem_minmax(0,1fr)]">
      <h3 className="font-semibold text-foreground">{titulo}</h3>
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

function LinkInterno({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-block font-medium text-accent-foreground underline-offset-4 hover:underline"
    >
      {children}
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

function ConteudoPlantao({
  plantao,
  hoje,
  agoraMs,
}: {
  plantao: PlantaoHoje;
  hoje: string;
  agoraMs: number;
}) {
  const { minhaInscricao, proximo, abertoParaVoce } = plantao;

  if (minhaInscricao) {
    const sala = estadoDaSala(minhaInscricao.inicioEm, minhaInscricao.fimEm, agoraMs);
    return (
      <>
        <p>
          <span className="font-medium">Você está inscrito</span> —{" "}
          {horario(minhaInscricao, hoje)}, com {minhaInscricao.mentoraNome}.
        </p>
        <p className="text-muted-foreground">
          {sala === "aberta"
            ? "A sala já está liberada: pegue o link no Plantão."
            : "O link da sala aparece 1h antes, no Plantão."}
        </p>
        <LinkInterno href="/plantao">
          {sala === "aberta" ? "Entrar pelo Plantão" : "Abrir o Plantão"}
        </LinkInterno>
      </>
    );
  }

  if (!proximo) {
    return (
      <>
        <p className="text-muted-foreground">Nenhum plantão publicado por enquanto.</p>
        <LinkInterno href="/plantao">Ver o Plantão</LinkInterno>
      </>
    );
  }

  const podeAlgum = proximo.inscricaoAberta || abertoParaVoce !== null;
  return (
    <>
      <p>
        <span className="font-medium">{horario(proximo, hoje)}</span>, com{" "}
        {proximo.mentoraNome}.
      </p>
      <p className="text-muted-foreground">{situacaoDoProximo(proximo, agoraMs)}</p>
      {abertoParaVoce ? (
        <p>
          Próximo com inscrição aberta para você:{" "}
          <span className="font-medium">{horario(abertoParaVoce, hoje)}</span>, com{" "}
          {abertoParaVoce.mentoraNome}.
        </p>
      ) : null}
      <LinkInterno href="/plantao">
        {podeAlgum ? "Inscrever-se no Plantão" : "Ver o calendário do Plantão"}
      </LinkInterno>
    </>
  );
}

function situacaoDoProximo(s: PlantaoSlotHoje, agoraMs: number): string {
  if (new Date(s.inicioEm).getTime() <= agoraMs) return "Acontecendo agora.";
  if (s.inscricaoAberta) {
    return s.prazoEm
      ? `Inscrições abertas até ${formatarDataHora(s.prazoEm)}.`
      : "Inscrições abertas.";
  }
  if (s.emIntervalo) {
    return "Este fica de fora para você: depois de cada plantão, o seguinte é pulado.";
  }
  return s.prazoEm
    ? `Inscrições encerradas em ${formatarDataHora(s.prazoEm)}.`
    : "Inscrições encerradas.";
}
