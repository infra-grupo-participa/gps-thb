/**
 * Tipos da ficha do cliente que o módulo de Server Actions precisa declarar.
 *
 * 🔴 POR QUE ESTE ARQUIVO EXISTE
 *   `src/app/clientes/actions.ts` é `"use server"`, e **módulo `"use server"`
 *   só pode exportar `async function`**. `export type PatchCliente` passava
 *   pelo `tsc` e pelo `next build` e é **bomba armada**: o Turbopack emite no
 *   chunk do servidor uma referência ao VALOR do que foi exportado, o tipo
 *   não existe em runtime, e o módulo sai do build com zero exports — quem o
 *   importa recebe `undefined`. Já derrubou tela em produção 4 vezes (ver
 *   `CLAUDE.md`, seção `"use server" só exporta função async`), e
 *   `clientes/actions.ts` estava na lista dos 15 arquivos com a bomba viva.
 *   A regra da casa é migrar o arquivo QUANDO SE ENCOSTA NELE — foi o que a
 *   fatia dos campos PJ (24/09/2026) fez.
 *
 * ⚠️ `npm run build` NÃO pega: o erro é de execução do chunk. Só o log de
 *   runtime da Hostinger mostra. Não devolver `PatchCliente` para `actions.ts`.
 */

import type { ClienteEtapa1 } from "@/lib/types";

/**
 * Campos do cliente que a UI pode atualizar.
 *
 * `status` saiu da lista de propósito (migração 20260909000060): a coluna
 * ficou CONGELADA no banco e é o caminho de volta da Fase 4 — enquanto
 * nenhuma escrita a toca, `drop column fase` restaura o estado anterior sem
 * restore de backup. Se voltar aqui, o caminho de volta morre em silêncio.
 *
 * 🔴 Este tipo só vale em COMPILAÇÃO. A trava real é `CHAVES_PATCH_CLIENTE`
 * (a allowlist de runtime em `src/app/clientes/actions.ts`): Server Action é
 * endpoint HTTP, e uma chamada forjada manda a coluna que quiser. **Campo
 * novo aqui exige a MESMA linha lá** — só no `Pick`, o filtro de runtime o
 * descarta em silêncio e a feature nasce morta, sem erro nenhum (já quase
 * aconteceu com honorários, `grau_relacao` e os 3 campos de DISC).
 */
export type PatchCliente = Partial<
  Pick<
    ClienteEtapa1,
    | "nome"
    | "telefone"
    // 🔴 `nivel_relacionamento` e `perda_inercia` SAÍRAM daqui em 10/09/2026
    // (decisão do Marcio). Tirar da allowlist é o que CONGELA de verdade: o
    // tipo abaixo só vale em compilação, mas Server Action é endpoint HTTP e
    // uma chamada forjada mandaria a coluna direto. Sem esta remoção, o
    // congelamento seria só promessa. As colunas continuam no banco com o
    // dado histórico; nenhum caminho de escrita as toca.
    | "problemas"
    | "registro_contato"
    | "mensagem_padrao_enviada"
    | "estudo_caso_enviado"
    | "ligacao_realizada"
    | "fase"
    | "data_reuniao_preliminar"
    | "aderiu_reuniao"
    | "perfil_disc"
    | "valor_honorarios"
    | "contrato_url"
    | "grau_relacao"
    | "disc_consciencia"
    | "disc_gatilhos"
    | "disc_relacionamento"
    // Campos de PESSOA JURÍDICA (migração `…308`, 24/09/2026). Escrita normal
    // pelo PostgREST: são texto digitado pelo parceiro, como `registro_contato`
    // — NÃO são `contrato_*` (aquelas prometem que um arquivo existe, têm
    // trigger própria e só a RPC escreve).
    | "razao_social"
    | "cnpj"
    | "ramo_atividade"
    | "regime_tributario"
  >
>;
