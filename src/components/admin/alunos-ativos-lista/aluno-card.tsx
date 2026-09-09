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
 */

import Link from "next/link";
import { LifeBuoy } from "lucide-react";
import type { AlunoGps, AtendimentoDoAluno } from "@/lib/data";
import { ROTULO_TIPO } from "@/components/admin/diario-labels";
import { formatarDataHora, formatarData } from "@/lib/datas";
import { NotaRapida } from "@/components/admin/nota-rapida";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { descreverAcesso, honorariosDoCard } from "./ordenacao";
import { META_CLIENTES, TAMANHO_RESUMO } from "./tipos";

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
  atendimentoDe,
  agora,
}: AlunoGps & {
  /** Nunca `undefined`: o card sempre tem o que ler, sem `?.` espalhado. */
  atendimentoDe: (alunoId: string) => AtendimentoDoAluno;
  /** "Agora" fixado uma vez pela lista inteira. */
  agora: number;
}) {
  const atendimento = atendimentoDe(alunoId);
  const honorarios = honorariosDoCard(
    honorariosContratados,
    contratados,
    contratadosSemValor,
  );
  const pendencias = atendimento.pendenciasAbertas;
  const chamados = atendimento.chamadosAbertos;
  const nome = aluno?.nome ?? "Aluno sem nome";
  return (
    // O card NÃO é mais um `<Link>` por fora: botão dentro de link é
    // HTML inválido, some do Tab e o clique navega em vez de abrir o
    // diálogo. O link virou uma camada absoluta atrás do conteúdo
    // (`z-0`), e todo controle sobe para `z-10` — sem
    // `stopPropagation`, o empilhamento resolve.
    <Card
      key={alunoId}
      className="relative transition hover:border-primary/50 hover:shadow-sm"
    >
      <CardContent className="flex flex-col gap-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Foco por `outline` com deslocamento NEGATIVO, não por
            `ring`: o link ocupa exatamente a caixa do `Card`, que é
            `overflow-hidden` — um anel desenhado para FORA da caixa
            é recortado por inteiro e o teclado navega às cegas.
            Medido no navegador: com `focus-visible:ring-3` não
            aparecia um pixel. */}
        <Link
          href={`/admin/aluno/${alunoId}`}
          aria-label={`Abrir o ambiente de ${nome}`}
          className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
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
                {pendencias}{" "}
                {pendencias === 1 ? "pendência" : "pendências"}
              </Badge>
            ) : null}
            {/* PL5 — `chamadosAbertos` já vinha na RPC de
                atendimento e não aparecia em lugar nenhum: sem a
                lista de e-mails da equipe preenchida, um chamado
                novo não avisava ninguém E não era visível. Zero
                consulta nova — é o mesmo Map do badge acima. */}
            {chamados > 0 ? (
              <Badge variant="warning" icone={LifeBuoy} className="text-[10px]">
                {chamados}{" "}
                {chamados === 1 ? "chamado aberto" : "chamados abertos"}
              </Badge>
            ) : null}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {aluno?.email}
          </div>

          {/* Última nota do Diário — o trecho vem cortado do BANCO
              (`left(texto,140)`); aqui nunca se corta de novo nem se
              remonta a nota inteira. O `title` repete o MESMO trecho:
              inventar tooltip com texto que não veio seria mentir. */}
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs">
            {atendimento.ultimaNotaEm ? (
              <>
                {atendimento.ultimaNotaTipo ? (
                  // Sempre `outline`: daqui não dá para saber se uma
                  // "pendência" já foi resolvida, e pintar de vermelho
                  // uma nota resolvida contradiria o badge de
                  // pendências abertas ao lado.
                  <Badge
                    variant="outline"
                    className="shrink-0 text-[10px]"
                  >
                    {ROTULO_TIPO[atendimento.ultimaNotaTipo]}
                  </Badge>
                ) : null}
                <span
                  className="truncate text-muted-foreground"
                  title={atendimento.ultimaNotaResumo ?? undefined}
                >
                  {atendimento.ultimaNotaResumo}
                  {(atendimento.ultimaNotaResumo?.length ?? 0) >=
                  TAMANHO_RESUMO
                    ? "…"
                    : null}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  · {formatarDataHora(atendimento.ultimaNotaEm)}
                </span>
              </>
            ) : (
              <span className="text-muted-foreground">
                Sem nota no Diário
              </span>
            )}
          </div>

          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {desde ? (
              <>Entrou em {formatarData(desde)} · </>
            ) : null}
            {ultimoAcesso ? (
              <>
                {desde ? "último" : "Último"} acesso{" "}
                {/* "há N dias" depende do relógio: o valor do SSR
                    pode cair num dia diferente do da hidratação. */}
                <span
                  suppressHydrationWarning
                  title={formatarDataHora(ultimoAcesso)}
                >
                  {descreverAcesso(ultimoAcesso, agora)}
                </span>
              </>
            ) : (
              <span>{desde ? "nunca entrou" : "Nunca entrou"}</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-6">
          {/* PL3 — o número principal é `clientesComDados` (nome +
              telefone + nível), que é o que a tarefa 1 cobra e o que
              a home do aluno mostra. Exibir `clientesPreenchidos`
              aqui deixava o admin lendo 30/30 enquanto o aluno via
              cadeado na mesma etapa. O total apenas listado continua
              visível, ao lado, para a diferença não sumir. */}
          <div className="text-center">
            <div className="numero text-base font-semibold">
              {clientesComDados}/{META_CLIENTES}
            </div>
            <div className="rotulo text-muted-foreground">
              <span aria-hidden>
                completos · {clientesPreenchidos} listados
              </span>
              <span className="sr-only">
                {clientesComDados} clientes com nome, telefone e nível
                ·{" "}
                {clientesPreenchidos} listados no total
              </span>
            </div>
          </div>
          <div className="text-center">
            <div className="numero text-base font-semibold">{agendados}/15</div>
            <div className="rotulo text-muted-foreground">
              reuniões
            </div>
          </div>
          <div className="text-center">
            <div
              className="numero text-base font-semibold"
              title={honorarios.descricao}
            >
              <span aria-hidden>{honorarios.visual}</span>
              <span className="sr-only">{honorarios.descricao}</span>
            </div>
            <div className="rotulo text-muted-foreground">
              honorários
            </div>
          </div>
          <div className="w-32">
            <div className="mb-1 flex justify-between text-[10px] text-muted-foreground">
              <span>Etapa 01</span>
              <span>{pct}%</span>
            </div>
            <Progress value={pct} />
          </div>
          {/* `relative z-10`: sobe acima da camada do link, senão o
              clique abriria o ambiente em vez do diálogo. */}
          <div className="relative z-10">
            <NotaRapida alunoId={alunoId} nomeDoAluno={nome} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
