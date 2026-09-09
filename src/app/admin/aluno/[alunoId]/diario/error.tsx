"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErroPainel } from "@/components/ui/erro-painel";

/**
 * Falha ao montar o Diário do aluno. É a página com mais consultas do sistema
 * (trilha + eventos + pendências + marcos): quando uma delas cai, o admin
 * precisa voltar para a ficha do aluno sem perder o contexto de quem estava
 * vendo — por isso o link de volta é para a ficha, não para `/admin`.
 */
export default function DiarioError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ alunoId?: string }>();
  const alunoId = params?.alunoId;
  const voltarPara = alunoId ? `/admin/aluno/${alunoId}` : "/admin";

  return (
    <ErroPainel
      titulo="Não foi possível carregar o diário"
      descricao="A trilha do aluno não veio agora. Nenhum registro foi perdido — tente de novo ou volte à ficha do aluno."
      digest={error.digest}
    >
      <Button onClick={() => reset()}>Tentar de novo</Button>
      <Link
        href={voltarPara}
        className={buttonVariants({ variant: "outline" })}
      >
        {alunoId ? "Voltar à ficha do aluno" : "Ir para o painel"}
      </Link>
    </ErroPainel>
  );
}
