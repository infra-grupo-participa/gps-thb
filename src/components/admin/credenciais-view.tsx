"use client";

import { useState } from "react";
import { Check, Copy, MessageCircle } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { linkWhatsapp } from "@/lib/whatsapp";

/**
 * A tela de "pronto, aqui está o acesso" — um lugar só (CD11).
 *
 * Existia em duas cópias divergentes: `gerenciar-acesso.tsx` (mensagem
 * completa, com portal e WhatsApp) e `criar-acesso.tsx` (três linhas soltas,
 * sem WhatsApp). A cópia mais pobre era justamente a do fluxo mais comum —
 * criar o primeiro acesso do aluno —, e quem criava login tinha de digitar o
 * link do portal à mão para mandar por WhatsApp.
 *
 * Ficou a versão completa nos dois. O que muda entre os fluxos é só o
 * `titulo` e o aviso opcional de confirmação de e-mail.
 *
 * 🔑 `telefone` pode ser `null` (aluno sem cadastro casado pelo e-mail). Nesse
 * caso o botão de WhatsApp **some** — nunca vira um link quebrado que abre o
 * WhatsApp sem destinatário.
 */
export interface Credenciais {
  email: string;
  senha: string;
  emailEnviado: boolean;
  nome: string | null;
  telefone: string | null;
  /** Só o fluxo de criação de login usa: confirmação de e-mail ativa no Supabase. */
  precisaConfirmar?: boolean;
}

/** Senha temporária legível, gerada no navegador (ex.: Thb-7f3a-2b9c). */
export function sugerirSenha(): string {
  const b = new Uint8Array(4);
  crypto.getRandomValues(b);
  const hex = Array.from(b, (n) => n.toString(16).padStart(2, "0")).join("");
  return `Thb-${hex.slice(0, 4)}-${hex.slice(4)}`;
}

/**
 * O texto que o admin cola no WhatsApp. Não diz "GPS" em lugar nenhum — o
 * portal se apresenta como Programa de Implementação Assistida (decisão de
 * marca de 09/07).
 */
export function mensagemAcesso(c: Credenciais): string {
  return (
    `Olá${c.nome ? `, ${c.nome.split(" ")[0]}` : ""}! Seu acesso ao Programa de ` +
    `Implementação Assistida do Time Holding Brasil:\n\n` +
    `Portal: https://programa.timeholdingbrasil.com.br\n` +
    `Login: ${c.email}\n` +
    `Senha: ${c.senha}\n\n` +
    `Você pode trocar a senha depois, dentro do portal.`
  );
}

export function CredenciaisView({
  credenciais,
  titulo = "Senha definida — a pessoa já pode entrar",
  onConcluir,
}: {
  credenciais: Credenciais;
  /** Cabeçalho do bloco verde. Muda com o fluxo (criar acesso × trocar senha). */
  titulo?: string;
  onConcluir: () => void;
}) {
  const [copiado, setCopiado] = useState(false);
  const texto = mensagemAcesso(credenciais);
  const whatsapp = linkWhatsapp(credenciais.telefone, texto);

  function copiar() {
    navigator.clipboard.writeText(texto).then(() => {
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    });
  }

  return (
    <div className="grid gap-4">
      <div className="rounded-md border border-green-600/30 bg-green-600/10 p-4">
        <div className="mb-2 text-sm font-medium text-green-700">{titulo}</div>
        <div className="grid gap-1 text-sm">
          <div>
            <span className="text-muted-foreground">Login:</span>{" "}
            <span className="font-medium">{credenciais.email}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Senha:</span>{" "}
            <span className="font-mono font-medium">{credenciais.senha}</span>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {credenciais.emailEnviado
            ? "As credenciais também foram enviadas por e-mail."
            : "O e-mail não saiu — repasse as credenciais por WhatsApp."}
        </p>
        {credenciais.precisaConfirmar ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Obs.: a confirmação de e-mail está ativa — a pessoa precisa
            confirmar o e-mail antes de entrar.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={copiar} className="flex-1">
          {copiado ? (
            <>
              <Check className="size-4" /> Copiado
            </>
          ) : (
            <>
              <Copy className="size-4" /> Copiar mensagem
            </>
          )}
        </Button>
        {whatsapp ? (
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline" }) + " flex-1"}
          >
            <MessageCircle className="size-4" /> WhatsApp
          </a>
        ) : null}
        <Button onClick={onConcluir} className="flex-1">
          Concluir
        </Button>
      </div>
    </div>
  );
}
