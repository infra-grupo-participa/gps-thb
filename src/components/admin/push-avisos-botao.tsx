"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
  ativarAvisosPush,
  desativarAvisosPush,
} from "@/app/admin/chamados/push-actions";
import { Button } from "@/components/ui/button";
import { chamarAcao } from "@/lib/acao-no-navegador";

type Estado = "carregando" | "sem-suporte" | "bloqueado" | "ativo" | "inativo";

function chaveParaBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (b64url.length % 4)) % 4);
  const bin = atob((b64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesParaB64url(buf: ArrayBuffer | null): string {
  if (!buf) return "";
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Avisos de mensagem nova de parceiro neste computador (Web Push). */
export function PushAvisosBotao({ chavePublica }: { chavePublica: string }) {
  const [estado, setEstado] = useState<Estado>("carregando");
  const [pendente, iniciar] = useTransition();

  useEffect(() => {
    let vivo = true;
    (async () => {
      if (
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (vivo) setEstado("sem-suporte");
        return;
      }
      if (Notification.permission === "denied") {
        if (vivo) setEstado("bloqueado");
        return;
      }
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        if (vivo) setEstado(sub ? "ativo" : "inativo");
      } catch {
        if (vivo) setEstado("inativo");
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (!chavePublica || estado === "carregando") return null;

  if (estado === "sem-suporte") {
    return <p className="text-sm">Este navegador não mostra avisos.</p>;
  }
  if (estado === "bloqueado") {
    return (
      <p className="text-sm">
        Avisos bloqueados no navegador. Libere no cadeado ao lado do endereço.
      </p>
    );
  }

  function ativar() {
    iniciar(async () => {
      try {
        const permissao = await Notification.requestPermission();
        if (permissao !== "granted") {
          setEstado(permissao === "denied" ? "bloqueado" : "inativo");
          return;
        }
        await navigator.serviceWorker.register("/sw.js");
        const reg = await navigator.serviceWorker.ready;
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: chaveParaBytes(chavePublica),
          }));
        const r = await chamarAcao(() =>
          ativarAvisosPush({
            endpoint: sub.endpoint,
            p256dh: bytesParaB64url(sub.getKey("p256dh")),
            auth: bytesParaB64url(sub.getKey("auth")),
            userAgent: navigator.userAgent,
          }),
        );
        if (!r.ok) {
          await sub.unsubscribe().catch(() => {});
          toast.error(r.erro);
          return;
        }
        setEstado("ativo");
      } catch {
        toast.error("Não foi possível ativar os avisos agora.");
      }
    });
  }

  function desligar() {
    iniciar(async () => {
      try {
        const reg = await navigator.serviceWorker.getRegistration("/sw.js");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          const r = await chamarAcao(() => desativarAvisosPush(sub.endpoint));
          if (!r.ok) {
            toast.error(r.erro);
            return;
          }
          await sub.unsubscribe();
        }
        setEstado("inativo");
      } catch {
        toast.error("Não foi possível desligar os avisos agora.");
      }
    });
  }

  if (estado === "ativo") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm">Avisos ligados neste computador</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={desligar}
          disabled={pendente}
        >
          Desligar
        </Button>
      </div>
    );
  }
  return (
    <Button type="button" size="sm" onClick={ativar} disabled={pendente}>
      Ativar avisos neste computador
    </Button>
  );
}
