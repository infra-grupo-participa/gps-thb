"use client";

/**
 * Folha 4 da pasta — **FECHAMENTO DA HOLDING**: honorários, contrato assinado
 * e o histórico de minutas.
 *
 * Casca fina sobre `ficha-contrato.tsx` (que já é a seção do contrato, sem
 * cabeçalho próprio) e `minutas-anexo.tsx`. Existe para o `ClienteFicha` ter
 * **uma** prop por folha, em vez de 20 linhas de JSX no meio do index.
 *
 * 🔑 **As duas peças escrevem por RPC, não pelo "Salvar ficha".** O anexo do
 * contrato e cada minuta vão direto ao banco e voltam por `router.refresh()`.
 * Por isso nada aqui vira estado do formulário — um espelho local criaria duas
 * verdades sobre o mesmo arquivo. Os únicos campos desta folha que passam pelo
 * botão são `valor_honorarios` e `contrato_url` (o link legado), e esses moram
 * no `ClienteFicha`, como os demais.
 *
 * ⚠️ **`MinutasAnexo` tem estado PRÓPRIO** (o contexto obrigatório: caso, o que
 * foi feito, ponto de ajuda, o que mudou). É a razão de `FichaAbas` montar os
 * painéis com `keepMounted` — sem isso, sair para conferir um problema na aba
 * 2 e voltar apagaria o texto sem aviso nenhum.
 */

import { FileText } from "lucide-react";

import type { ClienteEtapa1 } from "@/lib/types";
import type { ClienteMinuta } from "@/lib/minutas-tipos";
import { Secao } from "@/components/ui/secao";
import { FichaContrato } from "@/components/clientes/ficha-contrato";
import { MinutasAnexo } from "@/components/clientes/minutas-anexo";

export function FichaAbaFechamento({
  cliente,
  admin,
  contratado,
  honorarios,
  onHonorarios,
  honorariosValor,
  contratoUrl,
  onContratoUrl,
  contratoLimpo,
  contratoInvalido,
  faseRotulo,
  minutas,
  contextoObrigatorio,
  pending,
  aoMudar,
}: {
  cliente: ClienteEtapa1;
  admin: boolean;
  /** `fase === "contratado"` — só aí os campos são editáveis. */
  contratado: boolean;
  honorarios: string;
  onHonorarios: (v: string) => void;
  honorariosValor: number | null;
  contratoUrl: string;
  onContratoUrl: (v: string) => void;
  contratoLimpo: string;
  contratoInvalido: boolean;
  faseRotulo: string | undefined;
  minutas: readonly ClienteMinuta[];
  contextoObrigatorio: boolean;
  pending: boolean;
  /** `router.refresh()` do index — o dado do anexo vem do servidor. */
  aoMudar: () => void;
}) {
  return (
    <div className="grid gap-8">
      <FichaContrato
        contratado={contratado}
        honorarios={honorarios}
        onHonorarios={onHonorarios}
        honorariosValor={honorariosValor}
        contratoUrl={contratoUrl}
        onContratoUrl={onContratoUrl}
        contratoLimpo={contratoLimpo}
        contratoInvalido={contratoInvalido}
        faseRotulo={faseRotulo}
        clienteId={cliente.id}
        // Vem do SERVIDOR, sempre: a escrita do anexo é por RPC e não passa
        // pelo "Salvar ficha" — manter um espelho local só criaria duas
        // verdades sobre o mesmo arquivo.
        contratoAnexo={
          cliente.contrato_path
            ? {
                nome: cliente.contrato_nome,
                mime: cliente.contrato_mime,
                tamanho: cliente.contrato_tamanho,
                anexadoEm: cliente.contrato_anexado_em,
              }
            : null
        }
        // 🔴 Só o aluno anexa: `gps.pode_anexar_onboarding` exige que o
        // ambiente do prefixo seja o de quem chama, e o admin não tem
        // ambiente. A equipe baixa e remove.
        podeAnexar={!admin}
        anexoDesabilitado={pending}
        aoMudarAnexo={aoMudar}
      />

      {/* Minutas — perto do contrato assinado, decisão do Marcio (15/09).
          Mesma regra do anexo acima: dado do SERVIDOR, sem espelho local.
          🔑 Diferente do contrato: aqui a EQUIPE TAMBÉM anexa, com o MESMO
          formulário (decisão do Marcio, 17/09) — `podeAnexar` não depende de
          `admin`. */}
      <Secao
        icone={<FileText />}
        titulo="Minutas"
        nivel="h3"
        classeConteudo="grid gap-5"
      >
        <MinutasAnexo
          clienteId={cliente.id}
          minutas={[...minutas]}
          podeAnexar
          contextoObrigatorio={contextoObrigatorio}
          desabilitado={pending}
          aoMudar={aoMudar}
        />
      </Secao>
    </div>
  );
}
