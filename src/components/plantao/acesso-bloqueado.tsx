"use client";

/**
 * Plantão de Dúvidas — Acelera Holding. Guarda de cookie de terceiro.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Esta é a peça que evita o pior modo de falha da rota: dentro do iframe da
 * Hotmart, o navegador pode bloquear o cookie de sessão do plantão por ser
 * "de terceiro" (o domínio do iframe é diferente do domínio da página que o
 * hospeda). Sem esta guarda, o aluno digitaria a senha certa, o login daria
 * certo no servidor, e a tela voltaria para o formulário — em loop, sem
 * nenhum aviso do motivo.
 *
 * Fluxo:
 * 1. Roda a sonda (`/p/plantao/sonda`): GET grava um cookie de teste,
 *    POST (com `credentials: "include"`) diz se ele voltou.
 * 2. Cookie chegou → libera o formulário normalmente.
 * 3. Não chegou, mas o navegador suporta Storage Access API → mostra botão
 *    "Ativar acesso" (exige gesto do usuário, ex.: Safari) que chama
 *    `document.requestStorageAccess()`. Concedido, libera o formulário.
 * 4. Não chegou e sem Storage Access → NÃO mostra o formulário. Só a
 *    orientação para abrir `/p/plantao` numa aba própria (ali o cookie é
 *    first-party e sempre funciona).
 */

import { useEffect, useState } from "react";
import { ExternalLinkIcon, ShieldAlertIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlantaoLogin } from "@/components/plantao/plantao-login";

type Estado =
  | "verificando"
  | "liberado"
  | "precisa-ativar"
  | "sem-storage-access"
  | "ativando";

/** `document.hasStorageAccess` só existe em navegadores com Storage Access API. */
function suportaStorageAccess(): boolean {
  return typeof document !== "undefined" && "hasStorageAccess" in document;
}

/** Fora de iframe o cookie é sempre first-party — não há o que sondar. */
function estaEmIframe(): boolean {
  try {
    return typeof window !== "undefined" && window.self !== window.top;
  } catch {
    // Acesso a `window.top` pode lançar por cross-origin — se lançou, é
    // porque está num frame de outra origem.
    return true;
  }
}

async function cookieVoltou(): Promise<boolean> {
  try {
    const get = await fetch("/p/plantao/sonda", {
      method: "GET",
      credentials: "include",
    });
    if (!get.ok) return false;
    const post = await fetch("/p/plantao/sonda", {
      method: "POST",
      credentials: "include",
    });
    if (!post.ok) return false;
    const dados = (await post.json()) as { cookieOk?: boolean };
    return Boolean(dados.cookieOk);
  } catch {
    return false;
  }
}

export function AcessoBloqueado() {
  const [estado, setEstado] = useState<Estado>("verificando");

  useEffect(() => {
    let cancelado = false;
    (async () => {
      // Fora de iframe (ex.: aba própria) o cookie é first-party e sempre
      // chega — nem vale rodar a sonda.
      if (!estaEmIframe()) {
        if (!cancelado) setEstado("liberado");
        return;
      }
      const ok = await cookieVoltou();
      if (cancelado) return;
      if (ok) {
        setEstado("liberado");
        return;
      }
      setEstado(suportaStorageAccess() ? "precisa-ativar" : "sem-storage-access");
    })();
    return () => {
      cancelado = true;
    };
  }, []);

  async function ativarAcesso() {
    setEstado("ativando");
    try {
      // Exige gesto do usuário (é chamado a partir de onClick) — Safari
      // mostra um prompt nativo perguntando se autoriza.
      await (
        document as unknown as { requestStorageAccess: () => Promise<void> }
      ).requestStorageAccess();
      const ok = await cookieVoltou();
      setEstado(ok ? "liberado" : "sem-storage-access");
    } catch {
      setEstado("sem-storage-access");
    }
  }

  if (estado === "verificando") {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex flex-col items-center gap-3 py-10 text-center text-sm text-muted-foreground"
      >
        <Loader2Icon className="size-5 animate-spin" aria-hidden />
        Verificando o acesso...
      </div>
    );
  }

  if (estado === "liberado") {
    return <PlantaoLogin />;
  }

  if (estado === "precisa-ativar" || estado === "ativando") {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlertIcon className="size-5 text-primary" aria-hidden />
            <CardTitle className="text-lg">
              Este navegador precisa de uma etapa a mais
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            É uma proteção de privacidade do navegador, não um erro seu.
            Clique abaixo para autorizar o acesso do plantão dentro desta
            página.
          </p>
          <Button
            onClick={ativarAcesso}
            disabled={estado === "ativando"}
            className="self-start"
          >
            {estado === "ativando" ? "Ativando..." : "Ativar acesso"}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // sem-storage-access
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ShieldAlertIcon className="size-5 text-primary" aria-hidden />
          <CardTitle className="text-lg">
            Seu navegador não permite login dentro desta página
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          É uma proteção de privacidade do navegador, não um erro seu. Clique
          abaixo para abrir o plantão em uma aba própria — funciona igual e
          você só precisa entrar uma vez.
        </p>
        <a
          href="/p/plantao"
          target="_blank"
          rel="noopener"
          className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition hover:bg-primary/80 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          Abrir o plantão em uma nova aba
          <ExternalLinkIcon className="size-4" aria-hidden />
        </a>
      </CardContent>
    </Card>
  );
}
