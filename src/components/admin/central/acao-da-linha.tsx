"use client";

/**
 * A ação de UMA linha do checklist — links de navegação e o único botão de
 * escrita que nasce numa linha (“Alinhar o cadastro”).
 *
 * 🔑 A regra que este arquivo existe para cumprir: **botão só onde há vermelho
 * ou âmbar**. Linha verde não ganha ação, senão a Central vira painel de
 * “tudo pode”. A exceção é o LINK, que não escreve nada: o “Abrir a etapa”
 * do próximo passo aparece mesmo em linha informativa, como no desenho.
 *
 * 🔑 E a outra: **uma porta por escrita**. Definir senha, adotar um login que
 * já existe, adicionar sócio e remover membro moram em “Gerenciar acesso” —
 * as linhas de acesso mandam para lá em vez de repetir a escrita.
 */

import Link from "next/link";
import { ExternalLink, KeyRound, Mail } from "lucide-react";
import type { ProximoPasso } from "@/lib/etapas";
import { emailValido } from "@/lib/texto";
import { Button, buttonVariants } from "@/components/ui/button";
import type { EstadoLinha } from "./catalogo";
import { rotuloEtapa } from "./tipos";


/**
 * A ação de UMA linha do checklist. Só linha `problema`/`atencao` recebe
 * botão de escrita; link de navegação (que não escreve nada) é liberado
 * também em linha verde — é o "Abrir a etapa" do próximo passo.
 */
export function AcaoDaLinha({
  chave,
  estado,
  base,
  passo,
  emailCadastro,
  emailLogin,
  pendente,
  onAlinharEmail,
}: {
  chave: string;
  estado: EstadoLinha;
  /** `/admin/aluno/<id>` — a raiz do modo assistência. */
  base: string;
  passo: ProximoPasso | null;
  emailCadastro: string | null;
  emailLogin: string | null;
  pendente: boolean;
  onAlinharEmail: (de: string | null, para: string) => void;
}) {
  const precisa = estado === "problema" || estado === "atencao";
  const linkFicha = (
    <Link
      href={base}
      className={buttonVariants({ variant: "outline", size: "sm" })}
    >
      <KeyRound className="size-4" /> Abrir Gerenciar acesso
    </Link>
  );

  switch (chave) {
    case "login":
    case "senha":
    case "email_confirmado":
    case "membros_com_login":
      return precisa ? linkFicha : null;

    case "email_bate":
      // A única porta do repo para `atualizarEmailAluno`. Alinha o CADASTRO
      // ao LOGIN (nunca o contrário): o login é o que a pessoa digita e vale
      // nos outros portais do grupo.
      return precisa && emailLogin && emailValido(emailLogin) ? (
        <Button
          size="sm"
          variant="outline"
          disabled={pendente}
          onClick={() => onAlinharEmail(emailCadastro, emailLogin)}
        >
          <Mail className="size-4" /> Alinhar o cadastro
        </Button>
      ) : null;

    case "vinculo_programa":
    case "solicitacao_pendente":
      return precisa ? (
        <Link
          href="/admin"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ExternalLink className="size-4" /> Ver a fila em Parceiros
        </Link>
      ) : null;

    case "clientes":
    case "cliente_favorito":
      return precisa ? (
        <Link
          href={`${base}/clientes`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ExternalLink className="size-4" /> Abrir os clientes
        </Link>
      ) : null;

    case "tarefa_atual":
      return passo ? (
        <Link
          href={`${base}/etapa/${passo.etapa}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ExternalLink className="size-4" /> Abrir a{" "}
          {rotuloEtapa(passo.etapa)}
        </Link>
      ) : null;

    case "chamados_abertos":
      return precisa ? (
        <Link
          href={`${base}/chamados`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ExternalLink className="size-4" /> Abrir os chamados
        </Link>
      ) : null;

    case "pendencias_diario":
      return precisa ? (
        <Link
          href={`${base}/diario`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ExternalLink className="size-4" /> Abrir o Diário
        </Link>
      ) : null;

    case "pasta_drive":
      return precisa ? (
        <Link
          href={`${base}/pasta`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <ExternalLink className="size-4" /> Abrir a Pasta
        </Link>
      ) : null;

    default:
      return null;
  }
}
