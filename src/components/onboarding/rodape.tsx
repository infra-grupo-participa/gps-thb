"use client";

import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

import { Button, buttonVariants } from "@/components/ui/button";

/**
 * O rodapé de ações. Fica separado porque é a peça com mais regra por pixel do
 * componente: o que aparece, o que trava e **por quê** trava.
 */
export function Rodape(p: {
  passo: number;
  soTour: boolean;
  /** Só o passo da senha (questionário já concluído, senha temporária nova). */
  soSenha: boolean;
  podeFechar: boolean;
  salvando: boolean;
  razaoTravado: string;
  abas: number;
  indiceTour: number;
  proximoPassoHref?: string;
  onFechar: () => void;
  onVoltar: () => void;
  onSenha: () => void;
  onAvancar: () => void;
  onTourAvancar: () => void;
  onPularTour: () => void;
}) {
  const travado = p.razaoTravado.length > 0;
  const ultimoDoTour = p.indiceTour + 1 >= p.abas;

  return (
    <div className="grid gap-2">
      {/* 🔴 A razão fica ESCRITA ao lado do botão travado. Nunca deixar clicar
          e devolver erro — o clique que falha é o defeito que este bloco
          existe para não ter. */}
      {travado ? (
        <p aria-live="polite" className="corpo-sm text-atencao-foreground">
          {p.razaoTravado}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        {p.podeFechar && p.passo !== 9 ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={p.onFechar}
            disabled={p.salvando}
            className="mr-auto"
          >
            Continuar depois
          </Button>
        ) : null}

        {p.passo > 1 && p.passo < 8 ? (
          <Button variant="outline" onClick={p.onVoltar} disabled={p.salvando}>
            Voltar
          </Button>
        ) : null}

        {p.passo === 0 ? (
          <Button onClick={p.onSenha} disabled={travado || p.salvando} aria-busy={p.salvando || undefined}>
            {p.salvando ? "Salvando…" : "Salvar a senha"}
          </Button>
        ) : p.passo === 8 ? (
          <>
            <Button variant="ghost" size="sm" onClick={p.onPularTour}>
              Pular a apresentação
            </Button>
            <Button onClick={p.onTourAvancar}>
              {ultimoDoTour ? "Terminar" : "Próxima"}
              <ArrowRight aria-hidden />
            </Button>
          </>
        ) : p.passo === 9 ? (
          // Navegar e "fechar" são a MESMA ação aqui, e um `<a>` faz as duas:
          // sair da página desmonta o diálogo. Botão dentro de link é HTML
          // inválido (e some do Tab) — por isso é o link que veste o estilo de
          // botão, no mesmo padrão do `ProximoPassoCard`.
          p.proximoPassoHref ? (
            <Link
              href={p.proximoPassoHref}
              onClick={p.onFechar}
              className={buttonVariants()}
            >
              <Sparkles aria-hidden />
              Ir para o meu próximo passo
            </Link>
          ) : (
            <Button onClick={p.onFechar}>
              {p.soTour || p.soSenha ? null : <Sparkles aria-hidden />}
              {p.soTour ? "Fechar" : p.soSenha ? "Continuar" : "Começar"}
            </Button>
          )
        ) : (
          <Button
            onClick={p.onAvancar}
            disabled={travado || p.salvando}
            aria-busy={p.salvando || undefined}
          >
            {p.salvando ? "Salvando…" : p.passo === 1 ? "Vamos começar" : "Continuar"}
            <ArrowRight aria-hidden />
          </Button>
        )}
      </div>
    </div>
  );
}
