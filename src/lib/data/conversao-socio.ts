import { createClient } from "@/lib/supabase/server";
import { ehAdmin } from "@/lib/auth";
import { traduzirErroBanco } from "@/lib/erros";

// ─────────────────────────────────────────────────────────────────────────
// Converter um TITULAR de ambiente próprio em SÓCIO de outro ambiente — a
// LEITURA de prévia.
//
// POR QUE EXISTE (chamado do Jonas, 21/09/2026)
//   O sócio dele (Carlos Alberto) preencheu tudo, e o Jonas vê tela vazia.
//   O Carlos é TITULAR de um ambiente próprio, criado antes de a feature de
//   sócio existir; os 3 clientes em fase de fechamento estão lá. Os dois
//   caminhos existentes RECUSAM esse caso: o convite do titular recusa quem
//   já tem login, e "Adicionar sócio" recusa quem já pertence a outro
//   ambiente ("Remova o acesso anterior antes" — o que apagaria os clientes).
//
// 🔴 POR QUE A PRÉVIA É UMA RPC, E NÃO CONTA NO CLIENTE
//   O diálogo tem de dizer o que VAI e o que FICA com NÚMERO: quantos
//   clientes serão copiados, quantos já existem no destino (não serão
//   duplicados) e quanto progresso/nota/chamado fica para trás. A
//   deduplicação é por nome+telefone e acontece DENTRO da RPC de escrita
//   (`gps.admin_converter_titular_em_socio`): contar no navegador seria uma
//   SEGUNDA regra de deduplicação, que divergiria da do banco no dia em que
//   uma das duas mudasse — e o admin leria "3 clientes copiados" numa tela
//   que copiou 2. A mesma expressão que deduplica é a que conta.
//
// 🔑 É LEITURA, não promessa. Entre abrir o diálogo e confirmar, alguém pode
//   cadastrar um cliente. O número aqui é "o que existe agora"; o número que
//   vale é o que a escrita DEVOLVE, e é ele que sai no toast de sucesso.
//
// Regra do P6 (egress é teto DA ORGANIZAÇÃO, dividido com o sip): a prévia é
// UMA ida ao banco com contagens agregadas — nunca as linhas dos clientes.
// Nenhum `select("*")`, nenhuma lista de terceiros trafegada para contar.
// ─────────────────────────────────────────────────────────────────────────

/**
 * O que a conversão faria, medido pelo servidor ANTES de confirmar.
 *
 * `podeConverter` e `impedimento` vêm do banco: são as MESMAS guardas que a
 * RPC de escrita aplica. A tela não reimplementa nenhuma delas — ela desabilita
 * o botão e escreve `impedimento` ao lado, que é a regra do projeto ("nunca
 * deixar clicar e falhar").
 */
export interface PreviaConversaoSocio {
  /**
   * `gps.membros.id` do membro que a RPC RESOLVEU a partir do cadastro.
   *
   * 🔴 É informativo — serve para trilha e depuração, **nunca** para chamar a
   * RPC de volta. As duas RPCs (`admin_previa_converter_titular_em_socio` e
   * `admin_converter_titular_em_socio`) recebem `public.thb_alunos.id`, o
   * CADASTRO, e resolvem o membro por
   * `pessoa_aluno_id = X or (pessoa_aluno_id is null and aluno_id = X)`.
   * Devolver este campo ao banco produz P0002 ("Nenhum acesso encontrado para
   * este cadastro") para um cadastro que tem acesso — foi o defeito pego no
   * veredito de 21/09/2026, quando a prévia mandava o cadastro e a confirmação
   * mandava este id.
   */
  membroId: string;
  /** O ambiente que deixa de existir como ambiente próprio. */
  origem: { alunoId: string; nome: string | null; emailLogin: string | null };
  /** O ambiente que recebe a pessoa como sócia. */
  destino: { alunoId: string; nome: string | null };
  /** Clientes de `gps.etapa1_clientes` na origem, ao todo. */
  clientesNaOrigem: number;
  /** Quantos serão COPIADOS (os que não casam com nome+telefone no destino). */
  clientesACopiar: number;
  /** Quantos já existem no destino e NÃO serão duplicados. */
  clientesJaNoDestino: number;
  /** Tarefas concluídas na origem — FICAM para trás (não são copiadas). */
  progressoNaOrigem: number;
  /** Notas do Diário na origem — FICAM para trás. */
  notasNaOrigem: number;
  /** Chamados na origem — FICAM para trás. */
  chamadosNaOrigem: number;
  /** `false` quando alguma guarda da RPC já recusaria a conversão. */
  podeConverter: boolean;
  /**
   * Por que NÃO pode, em português, vindo do banco. `null` quando pode.
   * É a frase que a tela escreve ao lado do botão desabilitado.
   */
  impedimento: string | null;
}

type Json = Record<string, unknown>;

const texto = (v: unknown): string | null =>
  typeof v === "string" ? v : v == null ? null : String(v);
const inteiro = (v: unknown): number => Number(v ?? 0);

/**
 * `gps.admin_previa_converter_titular_em_socio(p_membro_id, p_ambiente_destino)`
 * → `PreviaConversaoSocio`. SÓ ADMIN.
 *
 * A guarda `ehAdmin()` não é a fronteira (a fronteira é `gp_is_admin()` na
 * primeira linha da RPC, que devolve 42501 sem JWT): ela evita uma viagem ao
 * banco à toa e devolve erro cedo.
 */
export async function getPreviaConversaoSocio(
  membroId: string,
  ambienteDestinoId: string,
): Promise<{ erro?: string; previa?: PreviaConversaoSocio }> {
  if (!(await ehAdmin())) return { erro: "Sem permissão." };
  if (!membroId || !ambienteDestinoId) {
    return { erro: "Membro ou ambiente de destino não informado." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("admin_previa_converter_titular_em_socio", {
      p_membro_id: membroId,
      p_ambiente_destino: ambienteDestinoId,
    });

  if (error) {
    return {
      erro: traduzirErroBanco("conversaoSocio/getPrevia", error, {
        membroId,
        ambienteDestinoId,
      }),
    };
  }

  const d = (data ?? {}) as Json;
  const origem = (d.origem ?? {}) as Json;
  const destino = (d.destino ?? {}) as Json;

  return {
    previa: {
      membroId: String(d.membro_id ?? membroId),
      origem: {
        alunoId: String(origem.aluno_id ?? ""),
        nome: texto(origem.nome),
        emailLogin: texto(origem.email_login),
      },
      destino: {
        alunoId: String(destino.aluno_id ?? ambienteDestinoId),
        nome: texto(destino.nome),
      },
      clientesNaOrigem: inteiro(d.clientes_na_origem),
      clientesACopiar: inteiro(d.clientes_a_copiar),
      clientesJaNoDestino: inteiro(d.clientes_ja_no_destino),
      progressoNaOrigem: inteiro(d.progresso_na_origem),
      notasNaOrigem: inteiro(d.notas_na_origem),
      chamadosNaOrigem: inteiro(d.chamados_na_origem),
      podeConverter: Boolean(d.pode_converter),
      impedimento: texto(d.impedimento),
    },
  };
}
