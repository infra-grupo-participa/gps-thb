"use server";

/**
 * Cadastro obrigatório do sócio convidado — Server Action do ALUNO.
 *
 * 🔴 Server Action é ENDPOINT HTTP. A fronteira real é a RPC `SECURITY
 * DEFINER` `gps.socio_cadastro_gravar` (migração `…256`), que resolve o
 * sócio por `auth.uid()` e lê o e-mail de `auth.users` no servidor — nunca
 * do parâmetro. As validações daqui existem só para o erro chegar em
 * português e para não gastar uma ida ao banco com entrada obviamente
 * inválida (mesmo raciocínio de `src/app/onboarding/actions.ts`).
 *
 * Contrato: `src/lib/socio-cadastro-tipos.ts` (tipos — módulo `"use server"`
 * só pode exportar `async function`).
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getContextoSessao } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";
import { soDigitos } from "@/lib/masks";
import type { SocioCadastroResultado } from "@/lib/socio-cadastro-tipos";

const texto = (formData: FormData, campo: string): string =>
  String(formData.get(campo) ?? "").trim();

export async function gravarCadastroSocio(
  _prev: SocioCadastroResultado,
  formData: FormData,
): Promise<SocioCadastroResultado> {
  const ctx = await getContextoSessao();
  if (ctx?.papel !== "aluno" || ctx.papelMembro !== "socio") {
    return { ok: false, erro: "Sem permissão para esta ação." };
  }

  const nome = texto(formData, "nome");
  const documento = texto(formData, "documento");
  const telefone = texto(formData, "telefone");
  const cep = texto(formData, "cep");
  const cidade = texto(formData, "cidade");
  const estado = texto(formData, "estado").toUpperCase();
  const bairro = texto(formData, "bairro");
  const logradouro = texto(formData, "logradouro");
  const numero = texto(formData, "numero");
  const pais = texto(formData, "pais");

  // Validação de forma no cliente do servidor — a mesma regra em português
  // que o banco reforça; não substitui as guardas da RPC.
  if (!nome || nome.length < 2) {
    return { ok: false, erro: "Escreva o nome completo." };
  }
  if (soDigitos(documento).length !== 11) {
    return { ok: false, erro: "CPF inválido." };
  }
  if (soDigitos(telefone).length < 10) {
    return { ok: false, erro: "Telefone inválido." };
  }
  if (soDigitos(cep).length !== 8) {
    return { ok: false, erro: "CEP inválido." };
  }
  if (!cidade) return { ok: false, erro: "Informe a cidade." };
  if (!/^[A-Z]{2}$/.test(estado)) {
    return { ok: false, erro: "Escolha o estado na lista." };
  }
  if (!bairro) return { ok: false, erro: "Informe o bairro." };
  if (!logradouro) return { ok: false, erro: "Informe o endereço." };
  if (!numero) return { ok: false, erro: "Informe o número." };
  if (!pais) return { ok: false, erro: "Informe o país." };

  const supabase = await createClient();

  // E-mail NÃO é parâmetro — mesmo se `formData` trouxesse um, a RPC não tem
  // onde recebê-lo. O e-mail sai de `auth.users` dentro da função.
  const { data, error } = await supabase.schema("gps").rpc("socio_cadastro_gravar", {
    p_nome: nome,
    p_documento: documento,
    p_telefone: telefone,
    p_cep: cep,
    p_cidade: cidade,
    p_estado: estado,
    p_bairro: bairro,
    p_logradouro: logradouro,
    p_numero: numero,
    p_pais: pais,
  });

  if (error) {
    return { ok: false, erro: traduzirErroBanco("gravarCadastroSocio", error) };
  }

  const d = (data ?? {}) as Record<string, unknown>;

  // Revalida o layout raiz: `getSocioPrecisaCadastro()` roda de novo e
  // `ctx.pessoaAlunoId` deixa de ser nulo, então o gate para de exibir o
  // diálogo. O componente controla a própria saída (ver comentário em
  // `src/components/socio-cadastro/index.tsx`) — este revalidate é só para
  // o restante do portal (home, clientes) já refletir o cadastro novo.
  revalidatePath("/", "layout");

  return {
    ok: true,
    cpfDeOutroMembro: Boolean(d.cpf_de_outro_membro),
  };
}
