import { createClient } from "@/lib/supabase/server";
import { logErro } from "@/lib/log";

/**
 * Leituras da feature "Equipe" (11/09/2026) — convite de sócio.
 *
 * Contrato com o banco (outro agente, em paralelo):
 *   gps.socio_convite_do_ambiente() → o convite PENDENTE do ambiente (sem
 *   hash do token — ele só sai uma vez, no momento da criação).
 *
 * ⚠️ DIVERGÊNCIA REPORTADA: o shape exato do jsonb/linha devolvido pela RPC
 * não estava disponível no momento desta implementação (banco em paralelo).
 * O mapeamento abaixo assume colunas prováveis (`id`, `email`, `expira_em`,
 * `criado_em`) pelo mesmo padrão de nomeação do resto do schema `gps`
 * (`snake_case`, sufixo `_em` para timestamptz). Se a RPC devolver nomes
 * diferentes, ajustar SÓ `mapearConvite` — o resto da tela não muda.
 */
export interface ConvitePendente {
  id: string;
  email: string;
  criadoEm: string | null;
  expiraEm: string | null;
}

type Json = Record<string, unknown>;

const texto = (v: unknown): string | null =>
  typeof v === "string" ? v : v == null ? null : String(v);

function mapearConvite(bruto: unknown): ConvitePendente | null {
  if (!bruto) return null;
  const d = bruto as Json;
  const id = texto(d.id);
  // 🔴 `email_alvo` é o nome REAL da coluna e da chave que
  // `gps.socio_convite_do_ambiente()` devolve (conferido no banco em
  // 11/09/2026). Ler `d.email` — o palpite da primeira versão — deixava
  // `email` nulo, e o `return null` abaixo fazia o convite pendente
  // DESAPARECER da tela: o titular veria o estado "sem sócio" e tentaria
  // convidar de novo, batendo no teto de 1 sem entender por quê.
  // O `?? d.email` fica como rede, sem custo.
  const email = texto(d.email_alvo) ?? texto(d.email);
  if (!id || !email) return null;
  return {
    id,
    email,
    criadoEm: texto(d.criado_em),
    expiraEm: texto(d.expira_em),
  };
}

/**
 * O convite pendente do ambiente (titular ou sócio podem ler — é o mesmo
 * ambiente). `null` = sem convite pendente (nunca convidou, ou o sócio já
 * está ativo, ou o convite expirou/foi aceito/revogado).
 *
 * Erro de leitura devolve `null` (estado honesto: "não sei de convite
 * pendente"), nunca lança — a aba Equipe não pode quebrar por causa deste
 * card auxiliar quando a lista de membros já veio.
 */
export async function getConvitePendente(): Promise<ConvitePendente | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("socio_convite_do_ambiente");

  if (error) {
    logErro("equipe/getConvitePendente", error);
    return null;
  }

  return mapearConvite(data);
}

/**
 * 🔴 DIVERGÊNCIA DE CONTRATO (reportar ao arquiteto/backend-engineer):
 *
 * O interruptor `gps.config.convite_socio_ativo`, lido pela RPC
 * `gps.convite_socio_ativo()`.
 *
 * 🔴 NÃO trocar por `.from("config")`: a única policy de `gps.config` é
 * `gps_config_admin` (`gp_is_admin()`), então para o titular a tabela
 * responde VAZIO — a leitura direta cairia no fallback `false` para sempre e
 * o botão "Convidar meu sócio" nunca apareceria, com a feature ligada ou
 * desligada. Medido em 11/09/2026: parceiro autenticado enxerga 0 linhas.
 *
 * A RPC (SECURITY DEFINER, migração …245) existe pelo mesmo motivo de
 * `gps.chamados_abertos()`: devolver UM booleano sem abrir a tabela de
 * configuração, onde moram `resend_api_key` e `email_from`.
 *
 * Falha fechado nos dois lados: a função devolve `false` se a chave sumir, e
 * o `catch` aqui esconde o botão se a chamada falhar.
 */
export async function getConviteSocioAtivo(): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .rpc("convite_socio_ativo");

  if (error) return false;

  return data === true;
}
