"use client";

/**
 * O card de UM ambiente na lista do painel: nome, badges de estado, a última
 * nota do Diário, os números da Etapa 01 e o atalho de nota rápida.
 *
 * 🔴 SÓ ADMIN. Mostra trecho de nota do Diário (`gps.aluno_notas`, exclusiva
 * do admin por LGPD, migração 20260908000001). Não reaproveitar em rota de
 * aluno.
 *
 * Sem estado: recebe o ambiente por spread (`{...a}`) e o "agora" fixado uma
 * vez pela lista — recalcular o relógio a cada card faria "há N dias" mudar no
 * meio da rolagem.
 *
 * 🎨 Onda B (B10) — DENSIDADE. Seis alunos ocupavam 900 px: ~150 px por card
 * para três linhas de informação, com a metade direita em branco. E todos os
 * cards eram iguais: o ambiente com 2 pendências, 2 chamados e 51 dias sem
 * acesso tinha a mesma moldura do que bateu a meta. Agora:
 * - `--card-spacing: 12px` e as linhas de identidade compactadas em três (o
 *   e-mail e o histórico de acesso dividem uma linha só, sem perder dado);
 * - a régua de números vira **grade de largura fixa** — antes cada bloco
 *   mudava de largura conforme o texto e nada alinhava entre cards;
 * - o rótulo "COMPLETOS · 30 LISTADOS" em caixa alta quebrava em duas linhas
 *   de 9 px e virava ruído: passou a sentence case em uma linha.
 */

import Link from "next/link";
import { KeyRound, LifeBuoy } from "lucide-react";
import type { AlunoGps, AtendimentoDoAluno } from "@/lib/data";
import type { StatusOnboarding } from "@/lib/types";
import { ROTULO_TIPO } from "@/components/admin/diario-labels";
import { FASES_CLIENTE } from "@/lib/etapa1";
import { formatarDataHora, formatarData } from "@/lib/datas";
import { NotaRapida } from "@/components/admin/nota-rapida";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { descreverAcesso, honorariosDoCard } from "./ordenacao";
import { marcarUltimoAluno } from "./ancora";
import { META_CLIENTES, TAMANHO_RESUMO } from "./tipos";

/** Uma coluna da régua de números. Largura FIXA, para alinhar entre cards. */
function Metrica({
  valor,
  rotulo,
  titulo,
  descricaoAcessivel,
}: {
  valor: React.ReactNode;
  rotulo: string;
  titulo?: string;
  descricaoAcessivel?: string;
}) {
  return (
    <div className="w-24 text-center">
      <div className="numero text-base font-semibold" title={titulo}>
        {descricaoAcessivel ? (
          <>
            <span aria-hidden>{valor}</span>
            <span className="sr-only">{descricaoAcessivel}</span>
          </>
        ) : (
          valor
        )}
      </div>
      <div className="rotulo truncate text-muted-foreground">{rotulo}</div>
    </div>
  );
}

/**
 * O chip de onboarding do TITULAR do ambiente.
 *
 * 🔑 "Não iniciado" **não vira chip**: hoje são os 158 ambientes, e um chip
 * repetido em todo card não separa ninguém — só engorda a linha de badges. O
 * chip aparece quando há notícia ("começou" / "respondeu"), que é quando ele
 * muda o que a equipe faz. O FILTRO continua servindo para achar quem não
 * respondeu, e o card 3 do dashboard leva direto a ele.
 */
const CHIP_ONBOARDING: Partial<
  Record<StatusOnboarding, { rotulo: string; variante: "success" | "warning" }>
> = {
  // Atenção: começou e não terminou é o que a equipe pode destravar.
  em_andamento: { rotulo: "onboarding em andamento", variante: "warning" },
  concluido: { rotulo: "onboarding concluído", variante: "success" },
};

export function AlunoCard({
  aluno,
  alunoId,
  temLogin,
  qtdMembros,
  pct,
  clientesPreenchidos,
  clientesComDados,
  agendados,
  honorariosContratados,
  contratados,
  contratadosSemValor,
  desde,
  ultimoAcesso,
  onboardingStatus,
  aptoAoSaldo,
  classe,
  listaIncompleta,
  prontoParaFinalizar,
  favorito,
  atendimentoDe,
  agora,
  selecao,
}: AlunoGps & {
  /** Nunca `undefined`: o card sempre tem o que ler, sem `?.` espalhado. */
  atendimentoDe: (alunoId: string) => AtendimentoDoAluno;
  /** "Agora" fixado uma vez pela lista inteira. */
  agora: number;
  /**
   * Seleção em lote. Só chega quando o filtro "sem login" está ativo — o
   * checkbox é para uma ação (criar acesso) que só existe para quem não tem
   * login, e uma caixa que não leva a lugar nenhum é ruído em 158 cards.
   */
  selecao?: { marcado: boolean; onChange: (v: boolean) => void };
}) {
  const atendimento = atendimentoDe(alunoId);
  const honorarios = honorariosDoCard(
    honorariosContratados,
    contratados,
    contratadosSemValor,
  );
  const pendencias = atendimento.pendenciasAbertas;
  const chamados = atendimento.chamadosAbertos;
  const nome = aluno?.nome ?? "Parceiro sem nome";
  // Um ambiente que espera a equipe (pendência aberta ou chamado aberto) NÃO
  // pode ter a mesma moldura de um em dia — era a queixa do diagnóstico, e a
  // faixa lateral custa 3 px, não uma cor de fundo que competiria com o texto.
  const esperando = pendencias > 0 || chamados > 0;
  const chipOnboarding = CHIP_ONBOARDING[onboardingStatus];
  return (
    // O card NÃO é um `<Link>` por fora: botão dentro de link é HTML inválido,
    // some do Tab e o clique navega em vez de abrir o diálogo. O link é uma
    // camada absoluta atrás do conteúdo (`z-0`), e todo controle sobe para
    // `z-10` — sem `stopPropagation`, o empilhamento resolve.
    <Card
      key={alunoId}
      interativo
      // `data-aluno-id` é o gancho da âncora: é por ele que `ancora.ts` acha
      // o card depois de a lista filtrada montar. Não remover.
      data-aluno-id={alunoId}
      className={
        "relative [--card-spacing:--spacing(3)]" +
        (esperando
          ? " before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-risco-foreground"
          : "") +
        // Destaque de "é daqui que você saiu": `ancora.ts` põe e tira o
        // atributo `data-ancorado` direto no DOM. Anel por OUTLINE, não por
        // `ring`: o `Card` é `overflow-hidden` e recortaria o anel inteiro.
        " data-ancorado:outline-2 data-ancorado:outline-offset-2 data-ancorado:outline-solid data-ancorado:outline-ring"
      }
    >
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        {/* Foco por `outline` com deslocamento NEGATIVO, não por `ring`: o
            link ocupa exatamente a caixa do `Card`, que é `overflow-hidden` —
            um anel desenhado para FORA da caixa é recortado por inteiro e o
            teclado navega às cegas. Medido no navegador: com
            `focus-visible:ring-3` não aparecia um pixel. */}
        <Link
          href={`/admin/aluno/${alunoId}`}
          aria-label={`Abrir o ambiente de ${nome}`}
          // Guarda de qual card o admin saiu. É gravado no clique (e não numa
          // rolagem monitorada) porque o que interessa é a INTENÇÃO de sair
          // por aqui — o `scrollY` de quem só passou o olho não diz nada.
          onClick={() => marcarUltimoAluno(alunoId)}
          className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        />

        <div className="flex min-w-0 items-start gap-3">
          {/* `relative z-10`: sobe acima da camada do link, senão marcar a
              caixa abriria o ambiente em vez de selecionar. */}
          {selecao ? (
            <Checkbox
              checked={selecao.marcado}
              onCheckedChange={(v) => selecao.onChange(v === true)}
              aria-label={`Selecionar ${nome} para criar acesso`}
              className="relative z-10 mt-1 shrink-0"
            />
          ) : null}

          <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="truncate font-medium">{nome}</span>
            {temLogin ? (
              <Badge variant="secondary" className="text-[10px]">
                com login
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px]">
                sem login
              </Badge>
            )}
            {qtdMembros > 1 ? (
              <Badge variant="outline" className="text-[10px]">
                {qtdMembros} pessoas
              </Badge>
            ) : null}
            {pendencias > 0 ? (
              <Badge variant="danger" className="text-[10px]">
                {pendencias} {pendencias === 1 ? "pendência" : "pendências"}
              </Badge>
            ) : null}
            {/* 🔑 O SELO DA LISTA INCOMPLETA (10/09/2026).
                Os 5 cards são funil de ATENÇÃO: quem tem cliente contratado
                aparece em Execução mesmo com a lista pela metade, porque é
                quem a equipe mais precisa olhar. O que não pode sumir junto
                é a dívida — sem este selo a equipe veria a fase avançada e
                não saberia que a base está incompleta.
                Só aparece FORA da Inicial: lá dentro, todo mundo está
                montando a lista e o selo seria ruído em 111 cartões. */}
            {/* 🔑 "Pronto para finalizar" é SINAL, não estado: quem bate a
                meta fica onde está até a equipe aprovar (decisão do Marcio,
                10/09/2026). Antes a fase virava sozinha — e o Carlos foi
                para "Finalizado" com 10 clientes e um valor digitado. */}
            {prontoParaFinalizar ? (
              <Badge
                variant="success"
                className="text-[10px]"
                title="Bateu a meta de R$ 150 mil. Só a equipe marca como finalizado — abra o ambiente para aprovar."
              >
                pronto para finalizar
              </Badge>
            ) : null}
            {listaIncompleta && classe !== "inicial" ? (
              <Badge
                variant="warning"
                className="text-[10px]"
                title={`Está numa fase avançada, mas tem ${clientesComDados} de ${META_CLIENTES} fichas completas (nome e telefone).`}
              >
                {clientesComDados}/{META_CLIENTES} fichas
              </Badge>
            ) : null}
            {/* PL5 — `chamadosAbertos` já vinha na RPC de atendimento e não
                aparecia em lugar nenhum: sem a lista de e-mails da equipe
                preenchida, um chamado novo não avisava ninguém E não era
                visível. Zero consulta nova — é o mesmo Map do badge acima. */}
            {chamados > 0 ? (
              <Badge variant="warning" icone={LifeBuoy} className="text-[10px]">
                {chamados}{" "}
                {chamados === 1 ? "chamado aberto" : "chamados abertos"}
              </Badge>
            ) : null}
            {chipOnboarding ? (
              <Badge variant={chipOnboarding.variante} className="text-[10px]">
                {chipOnboarding.rotulo}
              </Badge>
            ) : null}
            {/* 🔒 B-S1 — o chip diz o FATO observável e nenhum valor em reais.
                `aptoAoSaldo` é derivado no banco (cliente contratado + valor +
                anexo do contrato); a tela não recalcula e não escreve
                "apto a pagar os R$ 15.000". */}
            {aptoAoSaldo ? (
              <Badge variant="default" className="text-[10px]">
                Contrato de honorários enviado
              </Badge>
            ) : null}
          </div>

          {/* E-mail e histórico de acesso numa linha só: eram duas de quatro
              linhas de 16 px, e é o que fazia o card passar de 96 px. Nenhum
              dado saiu. */}
          <div className="truncate text-xs text-muted-foreground">
            {aluno?.email}
            {desde ? <> · entrou em {formatarData(desde)}</> : null}
            {ultimoAcesso ? (
              <>
                {" "}
                · último acesso{" "}
                {/* "há N dias" depende do relógio: o valor do SSR pode cair
                    num dia diferente do da hidratação. */}
                <span
                  suppressHydrationWarning
                  title={formatarDataHora(ultimoAcesso)}
                >
                  {descreverAcesso(ultimoAcesso, agora)}
                </span>
              </>
            ) : (
              <> · nunca entrou</>
            )}
          </div>

          {/* O SUBNOME do favorito (pedido do Marcio, WAR-ROOM 10/09):
              "bater o olho na lista" e ver quem é o cliente que a equipe
              acompanha, com a fase dele — sem abrir o ambiente. Só aparece
              quando o ambiente TEM favorito; a maioria não tem, e não vira
              "—" nem "sem cliente" (ruído em ~150 cards). Mesmo token de cor
              da ficha do cliente (`FASES_CLIENTE.cor`, contraste já medido);
              nunca `text-primary` (2,98:1, reprova AA). */}
          {favorito ? (
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
              <span aria-hidden>↳</span>
              <span className="truncate">{favorito.nome}</span>
              {(() => {
                const fase = FASES_CLIENTE.find((f) => f.id === favorito.fase);
                return fase ? (
                  <span
                    className={
                      "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold " +
                      fase.cor
                    }
                    title={fase.ajuda}
                  >
                    {fase.rotulo}
                  </span>
                ) : null;
              })()}
            </div>
          ) : null}

          {/* Última nota do Diário — o trecho vem cortado do BANCO
              (`left(texto,140)`); aqui nunca se corta de novo nem se remonta a
              nota inteira. O `title` repete o MESMO trecho: inventar tooltip
              com texto que não veio seria mentir. */}
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs">
            {atendimento.ultimaNotaEm ? (
              <>
                {atendimento.ultimaNotaTipo ? (
                  // Sempre `outline`: daqui não dá para saber se uma
                  // "pendência" já foi resolvida, e pintar de vermelho uma nota
                  // resolvida contradiria o badge de pendências abertas ao lado.
                  <Badge variant="outline" className="shrink-0 text-[10px]">
                    {ROTULO_TIPO[atendimento.ultimaNotaTipo]}
                  </Badge>
                ) : null}
                <span
                  className="truncate text-muted-foreground"
                  title={atendimento.ultimaNotaResumo ?? undefined}
                >
                  {atendimento.ultimaNotaResumo}
                  {(atendimento.ultimaNotaResumo?.length ?? 0) >= TAMANHO_RESUMO
                    ? "…"
                    : null}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  · {formatarDataHora(atendimento.ultimaNotaEm)}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">Sem nota no Diário</span>
            )}
          </div>
          </div>
        </div>

        {/* `flex-wrap` no celular: 3 métricas + barra + botão davam 462 px
            num viewport de 358 e criavam barra horizontal na página. */}
        <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap sm:shrink-0">
          {/* PL3 — o número principal é `clientesComDados` (nome + telefone +
              nível), que é o que a tarefa 1 cobra e o que a home do aluno
              mostra. Exibir `clientesPreenchidos` aqui deixava o admin lendo
              30/30 enquanto o aluno via cadeado na mesma etapa. O total apenas
              listado continua visível, no rótulo. */}
          <Metrica
            valor={`${clientesComDados}/${META_CLIENTES}`}
            rotulo={`de ${clientesPreenchidos} listados`}
            descricaoAcessivel={`${clientesComDados} clientes com nome, telefone e nível · ${clientesPreenchidos} listados no total`}
          />
          <Metrica valor={`${agendados}/15`} rotulo="reuniões" />
          <Metrica
            valor={honorarios.visual}
            rotulo="honorários"
            titulo={honorarios.descricao}
            descricaoAcessivel={honorarios.descricao}
          />
          <div className="w-28">
            <div className="mb-1 flex items-baseline justify-between gap-1 text-[10px] text-muted-foreground">
              <span>Etapa 01</span>
              <span className="numero font-semibold text-accent-foreground">
                {pct}%
              </span>
            </div>
            <Progress value={pct} />
          </div>
          {/* `relative z-10`: sobe acima da camada do link, senão o clique
              abriria o ambiente em vez do diálogo. */}
          <div className="relative z-10 flex items-center gap-2">
            {/* Tem login e NUNCA entrou: recriar acesso não serve (a conta já
                existe). O caminho é "Gerenciar acesso", que gera senha
                temporária nova, confirma o e-mail e — se a conta tiver papel
                em outro portal do grupo — devolve `precisaConfirmar` com a
                lista de sistemas SEM alterar nada. A senha não é
                reimplementada aqui: um segundo caminho de escrita de senha é
                um segundo lugar para essa confirmação sumir.

                🔑 Chamava-se "Reenviar acesso" e NÃO reenviava nada: levava à
                mesma ficha do link do card, e lá o admin ainda tinha de achar
                "Gerenciar acesso". Agora o nome diz o que o botão faz e o
                `#acesso` abre o diálogo direto (ver `gerenciar-acesso`). */}
            {temLogin && !ultimoAcesso ? (
              <Link
                href={`/admin/aluno/${alunoId}#acesso`}
                prefetch={false}
                onClick={() => marcarUltimoAluno(alunoId)}
                className={
                  "foco-visivel inline-flex items-center gap-1 rounded-md border border-borda-forte px-2.5 py-1 text-xs font-medium " +
                  "text-accent-foreground hover:bg-muted"
                }
              >
                <KeyRound aria-hidden className="size-3.5" />
                Resolver acesso
              </Link>
            ) : null}
            <NotaRapida alunoId={alunoId} nomeDoAluno={nome} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
