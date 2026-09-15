"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { ErroPainel } from "@/components/ui/erro-painel";

/**
 * Falha ao montar a prévia "como o aluno vê" os tutoriais. Boundary de
 * segmento; o link de volta é para a ficha do aluno, não para `/admin` —
 * mesmo padrão de `diario/error.tsx`.
 */
export default function AdminAlunoTutoriaisError({
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
      titulo="Não foi possível carregar os tutoriais"
      descricao="A lista não veio agora. Tente de novo ou volte à ficha do parceiro."
      digest={error.digest}
    >
      <Button onClick={() => reset()}>Tentar de novo</Button>
      <Link href={voltarPara} className={buttonVariants({ variant: "outline" })}>
        {alunoId ? "Voltar à ficha do parceiro" : "Ir para o painel"}
      </Link>
    </ErroPainel>
  );
}
