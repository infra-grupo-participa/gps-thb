"use client";

import { useState, useTransition } from "react";
import { Download, FileText } from "lucide-react";

import { urlDeDownloadDoAnexoOnboarding } from "@/app/onboarding/anexo-actions";
import { tamanhoLegivel } from "@/lib/chamados-tipos";
import { Button } from "@/components/ui/button";
import type { OnboardingAnexo } from "@/lib/types";

/**
 * Um anexo do questionário inicial, na tela do próprio aluno.
 *
 * 🔑 A URL é assinada NO CLIQUE, nunca no render: ela vive 60 segundos, então
 * uma URL embutida no HTML já estaria morta na primeira vez que alguém
 * clicasse — e seria um portador impresso na página. Mesmo padrão de
 * `components/chamados/anexo-link.tsx`, que já passou por duas auditorias.
 *
 * 🔴 Sem prévia de imagem aqui, ao contrário do anexo do chamado. O arquivo
 * mais comum desta lista é o **contrato de honorários assinado**, que é
 * documento de um TERCEIRO (o cliente do aluno): ele não fica renderizado na
 * tela por acidente de rolagem — é preciso pedir para baixar.
 */
export function AnexoDoInicio({ anexo }: { anexo: OnboardingAnexo }) {
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, startTransition] = useTransition();

  function baixar() {
    setErro(null);
    startTransition(async () => {
      const r = await urlDeDownloadDoAnexoOnboarding(anexo.path, anexo.nome);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      // Âncora programática (e não `window.open`) porque a URL só chega depois
      // de um `await`: nesse ponto o gesto do usuário já expirou e o bloqueador
      // de pop-up mataria a janela. A URL vem com `download=`.
      const a = document.createElement("a");
      a.href = r.url;
      a.rel = "noopener noreferrer";
      a.target = "_blank";
      document.body.append(a);
      a.click();
      a.remove();
    });
  }

  return (
    <div className="grid gap-1">
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-superficie-afundada px-2.5 py-1.5">
        <FileText aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate corpo-sm">{anexo.nome}</span>
        {anexo.tipo === "contrato_honorarios" ? (
          <span className="shrink-0 corpo-sm text-muted-foreground">
            contrato de honorários
          </span>
        ) : null}
        <span className="numero shrink-0 corpo-sm text-muted-foreground">
          {tamanhoLegivel(anexo.tamanho)}
        </span>
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={pendente}
          aria-busy={pendente || undefined}
          aria-label={`Baixar ${anexo.nome}`}
          onClick={baixar}
        >
          <Download aria-hidden /> {pendente ? "Abrindo…" : "Baixar"}
        </Button>
      </div>
      <p role="alert" className="corpo-sm text-destructive empty:hidden">
        {erro}
      </p>
    </div>
  );
}
