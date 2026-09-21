"use client";

/**
 * As pessoas do ambiente e as correções que só existem aqui: ligar um membro
 * ao CADASTRO dele, promover um sócio a titular, mover um sócio de ambiente e
 * **trazer um titular de ambiente próprio como sócio, com o trabalho dele**.
 *
 * 🔑 O que já tem porta não ganha uma segunda. Definir senha, adotar um login
 * que já existe, adicionar sócio e remover membro moram em **Gerenciar
 * acesso**, na ficha do aluno — esta seção manda para lá em vez de repetir a
 * escrita. Duas portas para a mesma escrita foi como as duas telas de status
 * do CNHF divergiram.
 *
 * 🔴 A TERCEIRA PORTA (21/09/2026, chamado do Jonas). "Adicionar sócio" recusa
 * quem já pertence a outro ambiente ("Remova o acesso anterior antes"), e o
 * convite do titular recusa quem já tem login. Quem é titular de um ambiente
 * próprio — criado antes de a feature de sócio existir — não tinha caminho
 * nenhum que não apagasse o trabalho dele. Esta porta é esse caminho, e mora
 * **aqui** e não em Gerenciar acesso por três razões:
 *   1. o admin chega pelo DIAGNÓSTICO do ambiente que está quebrado ("o sócio
 *      preencheu tudo e eu vejo tela vazia") — é esta tela que ele já está
 *      olhando, e feature sem porta de entrada não existe;
 *   2. as outras ações CROSS-AMBIENTE (mover sócio, trocar titular) já vivem
 *      nesta seção; Gerenciar acesso é sobre login e senha de UM ambiente;
 *   3. ela precisa de confirmação nomeada + contagens do servidor, que é o
 *      desenho da Central, não o do painel de acesso.
 *
 * O bloco nasce fechado quando não há nada vermelho ou âmbar nesta seção: a
 * Central não pode virar painel de "tudo pode".
 */

import Link from "next/link";
import {
  ArrowRightLeft,
  KeyRound,
  UserCheck,
  UserPlus,
  UserSearch,
} from "lucide-react";
import type { MembroDiagnostico } from "@/lib/data/central";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatarData } from "@/lib/datas";
import { BlocoDeCorrecao } from "./bloco-de-correcao";

export function SecaoPessoas({
  membros,
  alunoId,
  aberto,
  pendente,
  onVincularPessoa,
  onTrocarTitular,
  onMoverMembro,
  onConverterTitular,
}: {
  membros: MembroDiagnostico[];
  alunoId: string;
  aberto: boolean;
  pendente: boolean;
  onVincularPessoa: (m: MembroDiagnostico) => void;
  onTrocarTitular: (m: MembroDiagnostico) => void;
  onMoverMembro: (m: MembroDiagnostico) => void;
  /** Abre o seletor da terceira porta (titular de outro ambiente → sócio). */
  onConverterTitular: () => void;
}) {
  if (membros.length === 0) return null;

  // A conversão só faz sentido se ESTE ambiente tem titular: a RPC recusa
  // destino sem titular, e oferecer o botão seria deixar clicar e falhar.
  const temTitular = membros.some((m) => m.papel === "titular");

  return (
    <BlocoDeCorrecao
      aberto={aberto}
      titulo={`Corrigir as ${membros.length === 1 ? "pessoas" : `${membros.length} pessoas`} deste ambiente`}
      ajuda="Senha, adotar um login existente, adicionar sócio e remover membro ficam em Gerenciar acesso, na ficha do parceiro."
    >
      <ul className="grid gap-2.5">
        {membros.map((m) => (
          <li
            key={m.membroId}
            className="rounded-lg border border-borda-fina bg-card p-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 truncate corpo font-medium">
                {m.emailLogin ?? m.pessoaEmail ?? "sem e-mail"}
              </span>
              <Badge variant={m.papel === "titular" ? "success" : "neutral"} icone={false}>
                {m.papel === "titular" ? "titular" : "sócio"}
              </Badge>
              {m.pessoaAlunoId === null ? (
                <Badge variant="danger">sem cadastro vinculado</Badge>
              ) : null}
              {!m.temLogin ? <Badge variant="danger">sem login</Badge> : null}
            </div>

            <p className="mt-1 corpo-sm text-muted-foreground">
              {m.pessoaNome ?? "Cadastro não identificado"}
              {" · "}
              {m.temSenha ? "tem senha" : "sem senha"}
              {" · "}
              {m.emailConfirmado ? "e-mail confirmado" : "e-mail não confirmado"}
              {" · "}
              {m.ultimoAcesso
                ? `último acesso ${formatarData(m.ultimoAcesso)}`
                : "nunca entrou"}
            </p>

            <div className="mt-2.5 flex flex-wrap gap-2">
              {m.pessoaAlunoId === null ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pendente}
                  onClick={() => onVincularPessoa(m)}
                >
                  <UserSearch className="size-4" /> Vincular a um cadastro
                </Button>
              ) : null}

              {m.papel === "socio" ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pendente}
                    onClick={() => onTrocarTitular(m)}
                  >
                    <UserCheck className="size-4" /> Tornar titular
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pendente}
                    onClick={() => onMoverMembro(m)}
                  >
                    <ArrowRightLeft className="size-4" /> Mover de ambiente
                  </Button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      {/* A terceira porta. Fica ABAIXO da lista de membros e ACIMA do link
          para Gerenciar acesso — hierarquia por posição: primeiro quem já
          está aqui, depois quem vem de fora, por último o link para a outra
          tela. Denso e chapado: borda fina, rótulo pequeno, sem card
          destacado e sem ícone decorativo (o do botão é affordance). */}
      <div className="mt-3 border-t border-borda-fina pt-3">
        <p className="rotulo text-muted-foreground">
          Trazer alguém que já tem ambiente próprio
        </p>
        <p className="mt-1 max-w-[70ch] corpo-sm text-muted-foreground">
          Para quem virou titular de um ambiente separado antes de existir a
          figura de sócio. Os clientes dele são <strong>copiados</strong> para
          cá; progresso, notas e chamados ficam no ambiente antigo. O que vai e
          o que fica é conferido no servidor antes de você confirmar.
          {temTitular
            ? ""
            : " Indisponível: este ambiente está sem titular — defina o titular antes."}
        </p>
        <div className="mt-2.5">
          <Button
            size="sm"
            variant="outline"
            disabled={pendente || !temTitular}
            onClick={onConverterTitular}
          >
            <UserPlus className="size-4" /> Converter titular em sócio daqui
          </Button>
        </div>
      </div>

      <div className="mt-3">
        <Link
          href={`/admin/aluno/${alunoId}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <KeyRound className="size-4" /> Abrir a ficha para gerenciar o acesso
        </Link>
      </div>
    </BlocoDeCorrecao>
  );
}
