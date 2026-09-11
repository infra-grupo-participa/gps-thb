"use client";

/**
 * Uma linha da lista no CELULAR (a tabela só aparece a partir de `sm`).
 *
 * 🎨 Onda B (B8/B.10): item de lista no padrão único do portal — identidade à
 * esquerda, métrica à direita, ação destrutiva FORA da linha de leitura. Antes
 * "Excluir" vinha escrito, em vermelho, com o mesmo peso de "Ficha": a ação
 * que apaga nome, telefone e contrato era a mais visível do card.
 */

import Link from "next/link";
import { Trash2 } from "lucide-react";
import type { ClienteEtapa1, FaseCliente } from "@/lib/types";
import { FASES_CLIENTE } from "@/lib/etapa1";
import { formatarDataSoDia } from "@/lib/datas";
import { mascaraTelefone } from "@/lib/masks";
import { linkWhatsapp } from "@/lib/whatsapp";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  Estrela,
  GrauChip,
  MarcaRecusou,
  MarcaSemDados,
  WhatsappLink,
} from "./clientes-chips";
import {
  fasesDisponiveis,
  modoEstrela,
  podeExcluirCliente,
  type CtxEstrela,
} from "./ordenacao";

export function ClienteCardLista({
  cliente: c,
  fichaHref,
  ctxEstrela,
  onFase,
  onEquipe,
  onExcluir,
  pending,
}: {
  cliente: ClienteEtapa1;
  fichaHref: (id: string) => string;
  /** Ver `ClientesTabela`: havendo favorito, a estrela some dos outros. */
  ctxEstrela: CtxEstrela;
  onFase: (c: ClienteEtapa1, f: FaseCliente) => void;
  onEquipe: (c: ClienteEtapa1) => void;
  onExcluir: (c: ClienteEtapa1) => void;
  pending: boolean;
}) {
  const wpp = linkWhatsapp(c.telefone);
  const modo = modoEstrela(c, ctxEstrela);
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-3",
        // O cliente da equipe se diz por forma + cor de marca, não por
        // opacidade nem por um ícone de 16 px sozinho.
        c.acompanhado_equipe && "border-primary/50 bg-accent/50",
      )}
    >
      {/* Coluna de "Perda pela inércia" à direita do nome REMOVIDA por
          decisão do Marcio (10/09/2026) — o conceito saiu do sistema. */}
      <div className="flex min-w-0 items-start gap-2">
        <Estrela
          cliente={c}
          modo={modo}
          onToggle={onEquipe}
          className="mt-0.5"
        />
        <Link
          href={fichaHref(c.id)}
          className="foco-visivel rounded-sm font-medium text-balance hover:text-accent-foreground hover:underline"
        >
          {c.nome || "Sem nome"}
        </Link>
        <GrauChip grau={c.grau_relacao} className="mt-0.5" />
        <MarcaSemDados cliente={c} />
        <MarcaRecusou cliente={c} />
      </div>

      <div className="mt-2 flex items-center gap-2 corpo-sm text-muted-foreground">
        {c.telefone ? mascaraTelefone(c.telefone) : "sem telefone"}
        {wpp ? <WhatsappLink href={wpp} /> : null}
        {c.data_reuniao_preliminar ? (
          <span className="ml-auto text-xs">
            {formatarDataSoDia(c.data_reuniao_preliminar)}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Select
          value={c.fase}
          onValueChange={(v) => v && onFase(c, v as FaseCliente)}
        >
          <SelectTrigger
            size="sm"
            className="h-8 flex-1 text-xs"
            aria-label={`Fase de ${c.nome || "cliente sem nome"}`}
          >
            <SelectValue>
              {(v: FaseCliente) =>
                FASES_CLIENTE.find((f) => f.id === v)?.rotulo ?? v
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {fasesDisponiveis(c).map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {f.rotulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Link
          href={fichaHref(c.id)}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Ficha
        </Link>
        {/* Ícone, não texto: o vermelho só aparece na intenção (`ghost-danger`)
            e o nome do cliente vai no `aria-label`, então o leitor de tela
            ganha precisão em vez de ouvir "Excluir" oito vezes seguidas.
            🔴 Some no cliente acompanhado — o DELETE volta 42501. */}
        {podeExcluirCliente(c, ctxEstrela.admin) ? (
          <Button
            variant="ghost-danger"
            size="icon-sm"
            aria-label={`Excluir ${c.nome || "cliente sem nome"}`}
            className="ml-1 disabled:opacity-40"
            onClick={() => onExcluir(c)}
            disabled={pending}
          >
            <Trash2 aria-hidden />
          </Button>
        ) : null}
      </div>
    </div>
  );
}
