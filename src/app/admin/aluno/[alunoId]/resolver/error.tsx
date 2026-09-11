"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErroPainel } from "@/components/ui/erro-painel";

/**
 * Falha ao montar a Central de resolução.
 *
 * O erro esperado (a RPC do diagnóstico recusando) é tratado na própria
 * página, com a frase em português que a leitura devolve. Este boundary cobre
 * o inesperado — e diz o que importa numa tela de suporte: **nada foi alterado
 * no ambiente do aluno**. A Central só escreve por confirmação nomeada, então
 * uma falha de carregamento nunca deixou correção pela metade.
 *
 * `error.digest` é o único fio entre a queixa e a linha do log;
 * `error.message` continua fora, por poder carregar detalhe interno.
 */
export default function ResolverError({
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
      titulo="Não foi possível conferir este ambiente"
      descricao="O diagnóstico não carregou. Nada foi alterado no ambiente do parceiro — tente de novo ou volte à ficha dele."
      digest={error.digest}
    >
      <Button onClick={() => reset()}>Tentar de novo</Button>
      <Link
        href={voltarPara}
        className={buttonVariants({ variant: "outline" })}
      >
        {alunoId ? "Voltar à ficha do parceiro" : "Ir para o painel"}
      </Link>
    </ErroPainel>
  );
}
