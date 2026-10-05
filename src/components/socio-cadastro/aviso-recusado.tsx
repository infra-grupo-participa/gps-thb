"use client";

import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

/**
 * Aviso ao sócio cujo cadastro foi recusado por CPF de outro cadastro
 * (`gps.socio_cadastro_recusado`, migração …343). NÃO é modal e não trava
 * nada: o portal segue liberado e a Central liga a pessoa certa depois.
 *
 * Dispensável: "Entendi" grava em `localStorage` e o aviso não volta neste
 * navegador. `useSyncExternalStore` com snapshot de servidor = "dispensado"
 * evita piscar no SSR e erro de hidratação; o aviso só aparece no cliente.
 */
const CHAVE = "gps.socio.avisoCpfRecusado.dispensado";
const EVENTO = "gps:aviso-cpf-recusado";

function assinar(aoMudar: () => void) {
  window.addEventListener(EVENTO, aoMudar);
  window.addEventListener("storage", aoMudar);
  return () => {
    window.removeEventListener(EVENTO, aoMudar);
    window.removeEventListener("storage", aoMudar);
  };
}

function lerDispensado(): boolean {
  try {
    return window.localStorage.getItem(CHAVE) === "1";
  } catch {
    return false; // storage bloqueado: mostra o aviso, que é o lado seguro
  }
}

export function AvisoCpfRecusado() {
  const dispensado = useSyncExternalStore(assinar, lerDispensado, () => true);

  const dispensar = useCallback(() => {
    try {
      window.localStorage.setItem(CHAVE, "1");
    } catch {
      // sem storage o aviso volta na próxima visita; não há o que fazer
    }
    window.dispatchEvent(new Event(EVENTO));
  }, []);

  if (dispensado) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-4 bottom-20 z-40 mx-auto grid max-w-lg gap-3 rounded-xl border border-borda-forte bg-atencao p-4 text-atencao-foreground shadow-(--shadow-hover)"
    >
      <p className="flex items-start gap-2 text-base leading-snug">
        <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
        <span>
          <strong>Seu CPF já está em outro cadastro.</strong> A equipe vai ligar
          você ao cadastro certo. Se preferir, abra um chamado no{" "}
          <Link href="/chamados" className="font-semibold underline underline-offset-4">
            Suporte
          </Link>
          .
        </span>
      </p>
      <Button
        type="button"
        variant="outline"
        className="h-11 justify-self-end px-5 text-base"
        onClick={dispensar}
      >
        Entendi
      </Button>
    </div>
  );
}
