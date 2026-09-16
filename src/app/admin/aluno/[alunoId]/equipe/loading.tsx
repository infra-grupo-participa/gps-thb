import { PageHeader } from "@/components/ui/page-header";
import { HeaderSkeleton, ListaSkeleton } from "@/components/ui/lista-skeleton";

/**
 * Título e linha de apoio são estáticos — já são conhecidos antes de
 * qualquer query (mesmo texto de `src/app/equipe/loading.tsx`, a irmã do
 * aluno). Só a lista de membros é esqueleto, na MESMA largura da página real
 * (`max-w-3xl`) — esqueleto de largura errada faz a coluna saltar de lado
 * quando o conteúdo chega (CLS).
 */
export default function AdminAlunoEquipeLoading() {
  return (
    <>
      <HeaderSkeleton />
      <main id="conteudo" className="mx-auto w-full max-w-3xl px-4 pt-8 pb-16">
        <PageHeader
          voltar={
            <span className="text-sm text-muted-foreground">
              ← Voltar ao ambiente do parceiro
            </span>
          }
          titulo="Equipe do ambiente"
          descricao="Quem divide este ambiente — os mesmos clientes, tarefas e progresso."
        />
        <ListaSkeleton linhas={2} />
      </main>
    </>
  );
}
