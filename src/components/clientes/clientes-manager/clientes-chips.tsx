"use client";

/**
 * Os controles pequenos e repetidos da tela de clientes: chip de filtro,
 * alternador lista/quadro, estrela do cliente da equipe, atalho de WhatsApp e
 * a marca do cliente que recusou. Ficam juntos porque são a mesma família
 * visual e aparecem nas TRÊS visões (tabela, quadro e card do celular).
 */

import { MessageCircle, Star } from "lucide-react";
import type { ClienteEtapa1 } from "@/lib/types";
import { GRAUS_RELACAO_UI } from "@/lib/etapa1";
import { formatarData } from "@/lib/datas";
import { TEXTO_TROCA_LIVRE } from "@/components/clientes/acompanhamento-equipe";
import type { ModoEstrela } from "./ordenacao";

/**
 * O grau de relação do cliente, como chip de leitura.
 *
 * `null` não desenha nada AQUI (o card já é apertado e "não informado" em cada
 * linha viraria ruído) — mas a ficha e a tabela dizem "Não informado" com todas
 * as letras. O que nunca acontece, em lugar nenhum, é `null` virar "Lead".
 */
export function GrauChip({
  grau,
  className = "",
}: {
  grau: ClienteEtapa1["grau_relacao"];
  className?: string;
}) {
  if (!grau) return null;
  const def = GRAUS_RELACAO_UI.find((g) => g.id === grau);
  if (!def) return null;
  return (
    <span
      title={def.ajuda}
      className={
        "inline-flex shrink-0 items-center rounded-full bg-superficie-afundada px-2 py-0.5 text-[10px] font-medium text-neutro-foreground " +
        className
      }
    >
      {def.rotulo}
    </span>
  );
}

/**
 * A estrela do cliente que a EQUIPE assumiu: sinal, não botão.
 *
 * 🔑 Não é um `StarButton` desabilitado. Botão desligado ainda é botão — pede
 * clique, recebe foco e não explica nada. Aqui a estrela é um ícone com o
 * motivo escrito ao lado (ou no `title`, quando não há espaço), e o caminho de
 * saída fica na ficha. A trava real é a trigger `...203`, que devolve 42501
 * mesmo para quem chamar a Server Action por fora.
 */
export function EstrelaTravada({
  desde,
  className = "",
}: {
  desde: string | null;
  className?: string;
}) {
  const texto = desde
    ? `A equipe está acompanhando este cliente desde ${formatarData(desde)}. Só a equipe troca.`
    : "A equipe está acompanhando este cliente. Só a equipe troca.";
  return (
    <span
      title={texto}
      className={"shrink-0 text-accent-foreground " + className}
    >
      <Star className="size-4 fill-accent-foreground" aria-hidden />
      <span className="sr-only">{texto}</span>
    </span>
  );
}

/**
 * A estrela do cliente que o ALUNO escolheu e a equipe ainda não confirmou:
 * também é sinal, não botão (migração ...215).
 *
 * 🔑 Mesmo desenho da `EstrelaTravada`, e de propósito: para quem usa a tela os
 * dois estados são o mesmo fato — "este é o cliente da equipe, e a troca não é
 * um clique". O que muda é a frase. O LINK do Suporte não cabe numa célula de
 * tabela; ele fica no banner do topo da lista e na ficha, na mesma tela.
 */
export function EstrelaEscolhida({ className = "" }: { className?: string }) {
  // A estrela "escolhida" é a do parceiro, ANTES de a equipe assumir — a
  // troca ainda é dele. Dizer "abra um chamado" aqui mandava gente ao
  // Suporte para algo que ela resolvia num clique.
  const texto = `Este é o cliente que a equipe vai acompanhar. ${TEXTO_TROCA_LIVRE}.`;
  return (
    <span
      title={texto}
      className={"shrink-0 text-accent-foreground " + className}
    >
      <Star className="size-4 fill-accent-foreground" aria-hidden />
      <span className="sr-only">{texto}</span>
    </span>
  );
}

/**
 * A ficha não conta para os 30 — e isso NÃO era visível em lugar nenhum.
 *
 * 🔴 Achado da auditoria de 11/09/2026: a trava da fase Inicial conta
 * `comDados` (nome + telefone), mas a lista mostrava as fichas incompletas
 * exatamente como as completas. O subtítulo dizia "31 de 30 com dados" e o
 * parceiro não tinha como saber QUAIS fichas faltavam.
 *
 * Medido no banco: 18 fichas assim em 9 ambientes. O caso mais caro é de
 * alguém com **41 fichas e só 31 completas** — a 10 telefones de destravar,
 * sem nenhum sinal na tela. Outros dois estão a UM telefone.
 *
 * Some sozinha quando o telefone é preenchido. Não é erro nem cobrança: é o
 * aviso de que aquela linha ainda não entrou na conta.
 */
export function MarcaSemDados({
  cliente,
  className = "ml-2",
}: {
  cliente: ClienteEtapa1;
  className?: string;
}) {
  const falta = !cliente.nome?.trim()
    ? "o nome"
    : !cliente.telefone
      ? "o telefone"
      : null;
  if (!falta) return null;
  return (
    <span
      title={`Esta ficha ainda não conta para os 30: falta ${falta}.`}
      className={
        "inline-flex shrink-0 items-center rounded-full bg-atencao px-1.5 py-0.5 align-middle text-[10px] font-medium text-atencao-foreground " +
        className
      }
    >
      Falta {falta}
    </span>
  );
}

/**
 * Vestígio do modelo antigo de 5 status: sem esta marca, o cliente que disse
 * "não" sumiria dentro de "Prospecção" e o aluno o reprospectaria. Some
 * sozinha quando a coluna `status` for removida do banco.
 */
export function MarcaRecusou({
  cliente,
  className = "ml-2",
}: {
  cliente: ClienteEtapa1;
  className?: string;
}) {
  if (cliente.status !== "recusou") return null;
  return (
    <span
      title="Registro anterior às fases: este cliente foi marcado como “Recusou” no modelo antigo de status, que saiu do ar."
      className={
        "inline-flex shrink-0 items-center rounded-full border border-destructive/30 px-1.5 py-0.5 align-middle text-[10px] font-medium text-destructive " +
        className
      }
    >
      Recusou
    </span>
  );
}

export function WhatsappLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title="Abrir no WhatsApp"
      className="foco-visivel inline-flex items-center rounded-sm text-sucesso-foreground hover:opacity-80"
      onClick={(e) => e.stopPropagation()}
    >
      <MessageCircle className="size-4" />
    </a>
  );
}

export function StarButton({
  ativo,
  onClick,
}: {
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        ativo ? "Cliente acompanhado pela equipe" : "Marcar como cliente da equipe"
      }
      className={
        "foco-visivel shrink-0 rounded-sm transition " +
        (ativo
          ? "text-accent-foreground"
          : "text-muted-foreground/60 hover:text-muted-foreground")
      }
    >
      <Star className={"size-4 " + (ativo ? "fill-accent-foreground" : "")} />
    </button>
  );
}

/**
 * A estrela certa para o modo — UM lugar só, usado pelas três visões (tabela,
 * quadro e card do celular). Antes cada uma repetia o mesmo ternário de três
 * ramos, e a regra da ...215 teria de ser escrita três vezes.
 */
export function Estrela({
  cliente,
  modo,
  onToggle,
  className,
}: {
  cliente: ClienteEtapa1;
  modo: ModoEstrela;
  onToggle: (c: ClienteEtapa1) => void;
  className?: string;
}) {
  if (modo === "ausente") return null;
  if (modo === "confirmada") {
    return (
      <EstrelaTravada
        desde={cliente.acompanhamento_confirmado_em}
        className={className}
      />
    );
  }
  if (modo === "escolhida") return <EstrelaEscolhida className={className} />;
  return (
    <StarButton
      ativo={cliente.acompanhado_equipe}
      onClick={() => onToggle(cliente)}
    />
  );
}

export function ViewButton({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={
        // `bg-primary` com texto branco dá 2,98:1 em 12 px e reprovava o
        // WCAG 1.4.3. `marca-acao` (#C74600) com branco: 4,88:1, medido.
        "foco-visivel inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition " +
        (ativo
          ? "bg-marca-acao text-white"
          : "text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

export function FiltroChip({
  ativo,
  onClick,
  rotulo,
  titulo,
  qtd,
}: {
  ativo: boolean;
  onClick: () => void;
  rotulo: string;
  titulo?: string;
  qtd: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={titulo}
      aria-pressed={ativo}
      className={
        // Mesma correção de contraste do `ViewButton`: branco sobre #FF6300
        // era 2,98:1 num chip de 12 px.
        "foco-visivel inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition " +
        (ativo
          ? "border-marca-acao bg-marca-acao text-white"
          : "border-borda-forte bg-card text-muted-foreground hover:bg-muted hover:text-foreground")
      }
    >
      {rotulo}
      <span
        className={
          "numero rounded-full px-1.5 text-[10px] font-semibold " +
          (ativo ? "bg-black/25 text-white" : "bg-superficie-afundada text-neutro-foreground")
        }
      >
        {qtd}
      </span>
    </button>
  );
}
