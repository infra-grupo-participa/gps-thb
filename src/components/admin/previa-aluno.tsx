"use client";

import * as React from "react";
import { useEffect, useSyncExternalStore } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Atributo aplicado ao `<html>` enquanto a pré-visualização está ligada. */
export const PREVIA_ATTR = "data-previa";
export const PREVIA_VALOR = "aluno";
/** Classe que marca um elemento como exclusivo do admin (some na prévia). */
export const PREVIA_CLASSE = "previa-oculta";

const CHAVE = "gps:previa-aluno";

// A navegação entre as abas do modo assistência é client-side e não perderia o
// estado, mas um F5 perderia — daí o sessionStorage. Ele é lido por
// `useSyncExternalStore` (e não por `setState` dentro de um efeito) para não
// haver divergência entre o HTML do servidor e a primeira renderização do
// cliente: `snapshotNoServidor` devolve sempre `false`.
const ouvintes = new Set<() => void>();

function lerStorage(): boolean {
  try {
    return window.sessionStorage.getItem(CHAVE) === "1";
  } catch {
    // sessionStorage bloqueado (modo privado/iframe): a prévia só não persiste.
    return false;
  }
}

function gravarStorage(ligado: boolean): void {
  try {
    if (ligado) window.sessionStorage.setItem(CHAVE, "1");
    else window.sessionStorage.removeItem(CHAVE);
  } catch {
    // idem: sem persistência, mas o toggle continua funcionando na sessão.
  }
  for (const ouvinte of ouvintes) ouvinte();
}

function inscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

const snapshotNoServidor = () => false;

/**
 * "Pré-visualizar como o aluno vê" — dentro do Modo Assistência, esconde os
 * elementos exclusivos do admin (`.previa-oculta`, regra em `globals.css`).
 *
 * É PURAMENTE VISUAL. Nada muda no servidor: a sessão continua sendo a do
 * admin, `ehAdmin()` continua verdadeiro e o que for editado continua salvando
 * na conta do aluno. Por isso a pílula diz isso em texto quando está ligada —
 * a prévia não pode induzir o admin a achar que está num sandbox.
 *
 * "Virar o aluno" de verdade não é opção: colidiria com a trava de LGPD do
 * Diário, que é de servidor (`assistenciaNavItems` + policy só-admin).
 */
export function PreviaAlunoToggle(): React.JSX.Element {
  const ligado = useSyncExternalStore(
    inscrever,
    lerStorage,
    snapshotNoServidor,
  );

  useEffect(() => {
    const html = document.documentElement;
    if (ligado) html.setAttribute(PREVIA_ATTR, PREVIA_VALOR);
    else html.removeAttribute(PREVIA_ATTR);

    // Cleanup obrigatório: sem ele o atributo sobrevive à saída do modo
    // assistência e o painel `/admin` (onde este componente nem monta)
    // apareceria mutilado, sem nada que o desligue.
    return () => {
      html.removeAttribute(PREVIA_ATTR);
    };
  }, [ligado]);

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-[min(22rem,80vw)]">
      <button
        type="button"
        onClick={() => gravarStorage(!ligado)}
        aria-pressed={ligado}
        className={
          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium shadow-lg transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring " +
          (ligado
            ? "border-foreground/20 bg-foreground text-background hover:bg-foreground/90"
            : "border-border bg-background text-foreground hover:bg-muted")
        }
      >
        {ligado ? (
          <>
            <EyeOff className="size-3.5" /> Pré-visualização do aluno · Sair
          </>
        ) : (
          <>
            <Eye className="size-3.5" /> Pré-visualizar como o aluno vê
          </>
        )}
      </button>

      {ligado ? (
        <p className="mt-1.5 rounded-lg border bg-background/95 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground shadow-sm">
          Você continua como admin; o que você editar salva na conta do aluno.
        </p>
      ) : null}
    </div>
  );
}
