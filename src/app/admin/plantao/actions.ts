/**
 * Plantão de Dúvidas — AGREGADOR das Server Actions do admin.
 *
 * Este arquivo tinha 959 linhas e quatro assuntos misturados (CD5 da rodada
 * final). O código foi para os arquivos abaixo POR RESPONSABILIDADE, sem uma
 * linha de lógica nova — mesmas consultas, mesmas guardas `ehAdmin()`, mesmos
 * `revalidatePath`. Aqui ficou só o reexporte, para que
 * `src/components/admin/plantao-*.tsx` continuem escrevendo
 * `from "@/app/admin/plantao/actions"`.
 *
 *   ./slots-actions.ts      criar, editar, publicar, trocar mentora, cancelar,
 *                           remover e gravação dos slots
 *   ./mentoras-actions.ts   `gps.plantao_mentoras`
 *   ./alunos-actions.ts     carga do lote do Acelera, revogar e reativar acesso
 *   ./config-actions.ts     o interruptor de inscrições (`gps.config`)
 *   ./inscritos-actions.ts  marcar presença, editar nome, cancelar e
 *                           inscrever pelo painel (lista de inscritos) —
 *                           importado DIRETO pelos componentes, sem passar
 *                           por este barril
 *
 * 🔑 Cada arquivo de destino tem o seu próprio `"use server"` — é lá que a
 * action é DEFINIDA e é de lá que sai o id que o cliente invoca.
 *
 * 🔴 Este arquivo NÃO leva `"use server"`, e isso é medido, não estilo: com a
 * diretiva, o compilador trata o módulo como fronteira e reescreve os
 * exports — um módulo `"use server"` que só REEXPORTA sai do build com
 * ZERO exports ("The export trocarMentoraSlot was not found… The module has
 * no exports at all", `npm run build` de 09/09). Sem a diretiva ele é um
 * barril comum: o import segue até o arquivo de origem, que é `"use server"`,
 * e o cliente recebe a referência da action de lá. Se alguém acrescentar
 * `"use server"` aqui, a tela de `/admin/plantao` para de compilar.
 *
 * Reexporta nome a nome, nunca `export *`: um `export *` arrastaria para os
 * componentes qualquer export novo dos arquivos de origem.
 */

export {
  criarSlot,
  editarSlot,
  trocarMentoraSlot,
  publicarSlot,
  cancelarSlot,
  removerSlot,
  salvarGravacao,
} from "./slots-actions";
export type { CriarSlotInput, EditarSlotInput } from "./slots-actions";

export {
  criarMentora,
  editarMentora,
  alternarAtivaMentora,
} from "./mentoras-actions";
export type { CriarMentoraInput, EditarMentoraInput } from "./mentoras-actions";

export {
  revogarAcessoPlantao,
  reativarAcessoPlantao,
} from "./alunos-actions";

export { definirInscricoesAbertas } from "./config-actions";

// ⚠️ `./inscritos-actions` NÃO é reexportado aqui (war-room 10/09): os dois
// consumidores reais — `plantao-inscritos/index.tsx` e
// `plantao-inscritos/inscrever-form.tsx` — importam direto do arquivo de
// origem. O barril duplicava quatro nomes que ninguém pegava por aqui, e cada
// reexporte de Server Action é uma referência a mais para o cliente invocar.
