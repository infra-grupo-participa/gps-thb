"use client";

/**
 * As pessoas do ambiente e as correções que só existem aqui: ligar um membro
 * ao CADASTRO dele, promover um sócio a titular e mover um sócio de ambiente.
 *
 * 🔑 O que já tem porta não ganha uma segunda. Definir senha, adotar um login
 * que já existe, adicionar sócio e remover membro moram em **Gerenciar
 * acesso**, na ficha do aluno — esta seção manda para lá em vez de repetir a
 * escrita. Duas portas para a mesma escrita foi como as duas telas de status
 * do CNHF divergiram.
 *
 * O bloco nasce fechado quando não há nada vermelho ou âmbar nesta seção: a
 * Central não pode virar painel de "tudo pode".
 */

import Link from "next/link";
import { ArrowRightLeft, KeyRound, UserCheck, UserSearch } from "lucide-react";
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
}: {
  membros: MembroDiagnostico[];
  alunoId: string;
  aberto: boolean;
  pendente: boolean;
  onVincularPessoa: (m: MembroDiagnostico) => void;
  onTrocarTitular: (m: MembroDiagnostico) => void;
  onMoverMembro: (m: MembroDiagnostico) => void;
}) {
  if (membros.length === 0) return null;

  return (
    <BlocoDeCorrecao
      aberto={aberto}
      titulo={`Corrigir as ${membros.length === 1 ? "pessoas" : `${membros.length} pessoas`} deste ambiente`}
      ajuda="Senha, adotar um login existente, adicionar sócio e remover membro ficam em Gerenciar acesso, na ficha do aluno."
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
