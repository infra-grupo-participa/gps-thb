import { soDigitos } from "@/lib/masks";

/**
 * Busca de endereço por CEP (ViaCEP) — decisão do Marcio, 15/09/2026,
 * revertendo o que estava registrado em `socio-cadastro/index.tsx` (ver o
 * comentário datado lá).
 *
 * 🔑 Função pura, sem JSX, sem hook: dá para testar isolada e reusar fora do
 * cadastro do sócio se algum dia precisar.
 *
 * 🔴 **Nunca lança.** Toda falha — CEP incompleto, `{"erro":true}` da API,
 * HTTP diferente de 200, rede fora, timeout, JSON malformado, `AbortError` —
 * devolve `null`. Quem chama trata `null` como "não achei", em silêncio: a
 * busca automática de endereço é conveniência, não pode travar nem avisar
 * com alarme o preenchimento manual de quem está tentando entrar no produto.
 *
 * 🔴 **O corte para os tetos de tamanho do formulário acontece AQUI**
 * (opção A, decisão do Marcio): logradouro 200, bairro/cidade 120, estado 2.
 * A RPC `gps.socio_cadastro_gravar` continua recusando o que passar do teto
 * dela — o corte aqui é só para não preencher um campo com um valor que o
 * próprio formulário (e depois o banco) vai rejeitar.
 */
export interface EnderecoDoCep {
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
}

const VIACEP_TIMEOUT_MS = 3000;

interface ViaCepResposta {
  erro?: boolean;
  logradouro?: string;
  bairro?: string;
  localidade?: string;
  uf?: string;
}

export async function buscarCep(
  cep: string,
  sinal: AbortSignal,
): Promise<EnderecoDoCep | null> {
  const digitos = soDigitos(cep);
  if (digitos.length !== 8) return null;

  try {
    const resposta = await fetch(
      `https://viacep.com.br/ws/${digitos}/json/`,
      {
        signal: AbortSignal.any([sinal, AbortSignal.timeout(VIACEP_TIMEOUT_MS)]),
      },
    );

    if (!resposta.ok) return null;

    const dado = (await resposta.json()) as ViaCepResposta;
    if (dado.erro) return null;

    return {
      logradouro: (dado.logradouro ?? "").slice(0, 200),
      bairro: (dado.bairro ?? "").slice(0, 120),
      cidade: (dado.localidade ?? "").slice(0, 120),
      estado: (dado.uf ?? "").slice(0, 2),
    };
  } catch {
    // AbortError (cancelamento ou timeout), rede fora, JSON malformado —
    // tudo cai aqui. Falha de busca de CEP é sempre silenciosa.
    return null;
  }
}
