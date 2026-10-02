import { revalidatePath } from "next/cache";

/**
 * Caches que uma mudança na lista de clientes do parceiro invalida. Módulo
 * próprio (sem "use server") porque é síncrona e tem dois chamadores:
 * `actions.ts` (cadastro unitário, ficha) e `lote-actions.ts` (colar lista).
 *
 * `/etapa/1` é a rota de verdade do guia da Etapa 01. Até 09/09 esta lista
 * revalidava o nome da pasta `clientes`, que nunca teve `page.tsx`: rota
 * inexistente, e o cache do guia só caía pelo `revalidatePath("/etapa",
 * "layout")` (CD3).
 */
export function revalidarClientes(alunoId: string) {
  revalidatePath("/etapa/1");
  revalidatePath("/clientes");
  revalidatePath("/clientes", "layout");
  revalidatePath("/etapa", "layout");
  revalidatePath("/", "layout");
  revalidatePath(`/admin/aluno/${alunoId}`, "layout");
}
