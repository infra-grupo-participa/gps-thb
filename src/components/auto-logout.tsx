"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Encerra a sessão depois de um tempo sem ninguém encostar na tela.
 *
 * Motivo: aba esquecida aberta continua sendo uma sessão viva — o portal segue
 * revalidando e consultando o Supabase por conta própria, e o egress do plano
 * é compartilhado por toda a organização. Ninguém lembra de sair do sistema.
 *
 * O aviso do último minuto não é enfeite: sem ele, quem saiu para o café no
 * meio de um formulário perderia o que estava preenchendo. Qualquer clique,
 * tecla ou toque durante o aviso já rearma o contador (o próprio clique no
 * botão conta como atividade).
 */
const INATIVIDADE_MS = 30 * 60 * 1000;
const AVISO_MS = 60 * 1000;

export function AutoLogout() {
  const [restante, setRestante] = useState<number | null>(null);
  const fimRef = useRef(0);
  const saindoRef = useRef(false);

  useEffect(() => {
    const rearma = () => {
      fimRef.current = Date.now() + INATIVIDADE_MS;
      setRestante((v) => (v === null ? v : null));
    };
    const sinais = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    sinais.forEach((e) => window.addEventListener(e, rearma, { passive: true }));
    const aoVoltar = () => {
      if (!document.hidden) rearma();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", rearma);
    rearma();

    const tick = setInterval(async () => {
      const falta = fimRef.current - Date.now();
      if (falta <= 0) {
        if (saindoRef.current) return;
        saindoRef.current = true;
        clearInterval(tick);
        const supabase = createClient();
        try {
          // Escopo local: encerra só esta aba/aparelho, não derruba a mesma
          // conta em outro lugar (mesmo critério do botão Sair).
          await supabase.auth.signOut({ scope: "local" });
        } finally {
          window.location.assign("/login?motivo=inatividade");
        }
      } else if (falta <= AVISO_MS) {
        setRestante(Math.ceil(falta / 1000));
      }
    }, 1000);

    return () => {
      clearInterval(tick);
      sinais.forEach((e) => window.removeEventListener(e, rearma));
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", rearma);
    };
  }, []);

  if (restante === null) return null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      className="fixed inset-x-0 bottom-0 z-50 flex justify-center p-4"
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-lg border border-orange-300 bg-orange-50 p-4 shadow-lg">
        <div className="flex-1 text-sm text-orange-900">
          <strong>Sua sessão vai encerrar</strong> em {restante}s por inatividade.
        </div>
        <button
          type="button"
          className="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700"
        >
          Continuar conectado
        </button>
      </div>
    </div>
  );
}
