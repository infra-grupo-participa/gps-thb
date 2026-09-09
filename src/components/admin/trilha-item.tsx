"use client";

/**
 * Diário do aluno — Fase 2: um item da trilha unificada (log de ações +
 * diário da equipe). `"use client"` só aqui: o estado de expansão da macro
 * e o diálogo de "registrar nota sobre esta ação" são locais à linha.
 *
 * Faixas visuais (borda esquerda colorida) para distinguir de relance quem
 * gerou o item: aluno (laranja/primary), equipe (âmbar), sistema (azul).
 */

import { useState } from "react";
import { ChevronDown, ChevronRight, MessageSquarePlus, CheckCircle2, ShieldAlert, Link2 } from "lucide-react";
import type {
  ItemTrilha,
  AlunoEventoComAutor,
  AlunoNotaComAutor,
  TipoEvento,
} from "@/lib/types";
import { rotuloMacro, horaLocalCurta } from "@/lib/log-agregacao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DiarioForm } from "@/components/admin/diario-form";
import { DiarioBaixaButton } from "@/components/admin/diario-baixa-button";
import {
  ROTULO_VOZ,
  ROTULO_TIPO,
  ROTULO_ORIGEM,
  ROTULO_TIPO_EVENTO,
  ROTULO_ATOR,
  variantePorTipo,
  rotuloAcaoAdmin,
} from "@/components/admin/diario-labels";
import { formatarDataHora } from "@/lib/datas";

/**
 * Contexto do evento ao qual a nota foi vinculada (via botão "Registrar
 * observação sobre: <evento>", que grava `nota.evento_id`). Leitura
 * `eventoContexto` é preenchido por `comNomesDeAutor` (`src/lib/data.ts`), que
 * busca o rótulo/tipo do evento referenciado numa query restrita aos eventos
 * citados pelas notas presentes — por isso resolve mesmo quando o evento está
 * FORA da janela de tempo carregada. É `null` na nota solta (sem `evento_id`)
 * e também quando o evento referenciado não foi encontrado.
 *
 * O `rotulo` vazio é tratado como ausência: rótulo em branco renderizaria um
 * "sobre:" pendurado, pior que não mostrar nada.
 */
function contextoDaNota(
  nota: AlunoNotaComAutor,
): { rotulo: string; tipo: TipoEvento } | null {
  const ctx = nota.eventoContexto;
  if (!ctx || ctx.rotulo.length === 0) return null;
  return ctx;
}

/** Classe da faixa esquerda por origem do item — a mesma lógica das 3 variantes de evento/macro. */
function faixaPorAtor(ator: "aluno" | "equipe" | "sistema"): string {
  if (ator === "aluno") return "border-l-primary";
  if (ator === "equipe") return "border-l-amber-500";
  return "border-l-sky-500";
}

/** Botão que abre o diálogo de registrar nota vinculada a um evento específico. */
function BotaoNotaSobreEvento({
  alunoId,
  eventoId,
  contexto,
}: {
  alunoId: string;
  eventoId: string;
  contexto: string;
}) {
  const [aberto, setAberto] = useState(false);

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Registrar observação sobre: ${contexto}`}
        onClick={() => setAberto(true)}
      >
        <MessageSquarePlus className="size-3.5" />
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Registrar observação</DialogTitle>
          </DialogHeader>
          <DiarioForm
            alunoId={alunoId}
            eventoId={eventoId}
            contextoEvento={contexto}
            aoRegistrar={() => setAberto(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

function LinhaMicroAcao({
  alunoId,
  evento,
}: {
  alunoId: string;
  evento: AlunoEventoComAutor;
}) {
  return (
    <div className="flex items-center gap-2 py-1.5 pl-4 text-sm">
      <span className="w-14 shrink-0 text-xs text-muted-foreground">
        {horaLocalCurta(evento.ocorrido_em)}
      </span>
      <span className="min-w-0 flex-1 truncate">{evento.rotulo}</span>
      <BotaoNotaSobreEvento
        alunoId={alunoId}
        eventoId={evento.id}
        contexto={evento.rotulo}
      />
    </div>
  );
}

function ItemMacro({
  alunoId,
  macro,
}: {
  alunoId: string;
  macro: ItemTrilha & { variante: "macro" };
}) {
  const [expandido, setExpandido] = useState(false);
  const { macro: dados } = macro;

  return (
    <div className={`border-l-2 pl-3 ${faixaPorAtor(dados.ator)}`}>
      <div className="flex items-center gap-2 py-1.5">
        <button
          type="button"
          onClick={() => setExpandido((v) => !v)}
          aria-expanded={expandido}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left text-sm hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {expandido ? (
            <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          )}
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {ROTULO_ATOR[dados.ator]}
          </Badge>
          <span className="min-w-0 truncate font-medium">
            {rotuloMacro(dados)}
          </span>
          {dados.atorNome ? (
            <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
              {dados.atorNome}
            </span>
          ) : null}
        </button>
        <BotaoNotaSobreEvento
          alunoId={alunoId}
          eventoId={dados.itens[dados.itens.length - 1].id}
          contexto={rotuloMacro(dados)}
        />
      </div>
      {expandido ? (
        <div className="mb-1 ml-6 grid divide-y divide-border/60">
          {[...dados.itens]
            .sort((a, b) => (a.ocorrido_em < b.ocorrido_em ? 1 : -1))
            .map((evento) => (
              <LinhaMicroAcao key={evento.id} alunoId={alunoId} evento={evento} />
            ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Rótulo completo de um evento solto: VERBO (o que aconteceu, de
 * `ROTULO_TIPO_EVENTO`) + complemento (`evento.rotulo`, que para os tipos
 * `cliente_*` é só o nome do cliente — ex. "João Silva"). Sem o verbo, um
 * `cliente_favoritado` solto rendia só o nome do cliente, indistinguível de
 * cadastrou/mudou status/agendou reunião (achado do `fable-orchestrator`).
 * `evento.rotulo` é NOT NULL no banco, então nunca falta o complemento; se
 * algum dia vier igual ao verbo (redundante), evita duplicar o texto.
 */
function rotuloCompletoEvento(evento: AlunoEventoComAutor): string {
  const verbo = ROTULO_TIPO_EVENTO[evento.tipo];
  if (!evento.rotulo || evento.rotulo === verbo) return verbo;
  return `${verbo} · ${evento.rotulo}`;
}

function ItemEvento({
  alunoId,
  evento,
}: {
  alunoId: string;
  evento: AlunoEventoComAutor;
}) {
  const rotulo = rotuloCompletoEvento(evento);

  return (
    <div className={`flex items-center gap-2 border-l-2 py-1.5 pl-3 ${faixaPorAtor(evento.ator)}`}>
      <Badge variant="outline" className="shrink-0 text-[10px]">
        {ROTULO_ATOR[evento.ator]}
      </Badge>
      <span className="w-14 shrink-0 text-xs text-muted-foreground">
        {horaLocalCurta(evento.ocorrido_em)}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm">{rotulo}</span>
      {evento.ator_nome ? (
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
          {evento.ator_nome}
        </span>
      ) : null}
      <BotaoNotaSobreEvento
        alunoId={alunoId}
        eventoId={evento.id}
        contexto={rotulo}
      />
    </div>
  );
}

function ItemNota({ item }: { item: ItemTrilha & { variante: "nota" } }) {
  const { nota } = item;
  const pendenciaAberta = nota.tipo === "pendencia" && !nota.resolvido_em;
  const pendenciaResolvida = nota.tipo === "pendencia" && nota.resolvido_em;
  const contexto = contextoDaNota(nota);
  // Mesmo vocabulário da linha do evento na trilha ("Cadastrou cliente ·
  // Fulano"), para o admin reconhecer a que registro a nota se refere.
  const rotuloContexto = contexto
    ? `${ROTULO_TIPO_EVENTO[contexto.tipo]} · ${contexto.rotulo}`
    : null;

  return (
    <div
      className={`grid gap-1.5 border-l-2 border-l-amber-500 py-2 pl-3 ${
        pendenciaAberta ? "rounded-r-md bg-destructive/5" : ""
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="text-[10px]">
          {ROTULO_VOZ[nota.voz]}
        </Badge>
        <Badge
          variant={variantePorTipo(nota.tipo, Boolean(nota.resolvido_em))}
          className="text-[10px]"
        >
          {ROTULO_TIPO[nota.tipo]}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {ROTULO_ORIGEM[nota.origem]}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          {formatarDataHora(nota.criado_em)}
        </span>
      </div>
      {rotuloContexto ? (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link2 className="size-3 shrink-0" />
          <span className="truncate">sobre: {rotuloContexto}</span>
        </div>
      ) : null}
      <p className="whitespace-pre-wrap break-words text-sm">{nota.texto}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{nota.autor_nome ?? "Equipe"}</span>
        {pendenciaAberta ? <DiarioBaixaButton notaId={nota.id} /> : null}
        {pendenciaResolvida ? (
          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="size-3.5" />
            Baixa dada por {nota.resolvido_por_nome ?? "equipe"} em{" "}
            {formatarDataHora(nota.resolvido_em as string)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ItemAcaoAdministrativa({
  item,
}: {
  item: ItemTrilha & { variante: "acao_administrativa" };
}) {
  const { acao } = item;

  return (
    <div className="flex flex-wrap items-center gap-2 border-l-2 border-l-sky-500 py-1.5 pl-3 text-sm">
      <ShieldAlert className="size-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
      <Badge variant="outline" className="shrink-0 text-[10px]">
        Equipe
      </Badge>
      <span className="min-w-0 flex-1">{rotuloAcaoAdmin(acao.acao)}</span>
      {acao.detalhe ? (
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {acao.detalhe}
        </span>
      ) : null}
      <span className="shrink-0 text-xs text-muted-foreground">
        {formatarDataHora(acao.criado_em)}
      </span>
    </div>
  );
}

/** Renderiza UM item da trilha, roteando pela `variante` da união discriminada. */
export function TrilhaItem({
  item,
  alunoId,
}: {
  item: ItemTrilha;
  alunoId: string;
}) {
  switch (item.variante) {
    case "macro":
      return <ItemMacro alunoId={alunoId} macro={item} />;
    case "evento":
      return <ItemEvento alunoId={alunoId} evento={item.evento} />;
    case "nota":
      return <ItemNota item={item} />;
    case "acao_administrativa":
      return <ItemAcaoAdministrativa item={item} />;
    default: {
      const _exaustivo: never = item;
      return _exaustivo;
    }
  }
}
