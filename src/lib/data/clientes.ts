import { logErro } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";
import type { ClienteEtapa1 } from "@/lib/types";
import type { ClienteHonorarios } from "@/lib/etapa1";

// ─────────────────────────────────────────────────────────────────────────
// Clientes da Etapa 01 (`gps.etapa1_clientes`) e os dados da Etapa 03
// (agendamentos e revisão) — o CRM do aluno.
//
// Recortado de `src/lib/data.ts` (CD5) sem mudança de comportamento: as
// mesmas consultas, as mesmas colunas explícitas, os mesmos retornos.
// `src/lib/data.ts` reexporta tudo daqui, para os importadores não mudarem.
//
// ⚠️ CONTRATO das constantes `COLUNAS_*` (herdado do P6 do polimento): cada
// uma tem de listar TUDO que o tipo consumidor declara em `src/lib/types.ts`.
// Um `select` explícito NÃO falha quando falta coluna — o campo chega
// `undefined` e a tela mostra vazio em silêncio. `etapa1_clientes` é a tabela
// larga (879 linhas) e o egress do Supabase tem teto DA ORGANIZAÇÃO,
// dividido com o sip: consulta nova aqui declara colunas.
// ─────────────────────────────────────────────────────────────────────────

/**
 * `gps.etapa1_clientes` → `ClienteEtapa1`. As 33 colunas do tipo.
 *
 * 🔑 `status` entra de propósito, mesmo CONGELADO desde a migração ...060:
 * o marcador "Recusou" da UI ainda o lê (1 linha na base). Sai daqui quando
 * a coluna sair do banco, não antes.
 * 🔑 `fase`, `valor_honorarios` e `contrato_url` nasceram hoje (migrações
 * ...060/...090) — sem elas na lista, o quadro de fases e a coluna de
 * honorários ficariam vazios sem erro nenhum.
 * 🔑 As 5 colunas de `contrato_*` (migração ...214) são o contrato ANEXADO.
 * Vêm juntas porque o CHECK do banco é tudo-ou-nada e a ficha precisa das 4
 * primeiras para montar o botão de download (nome, tamanho e tipo aparecem
 * antes do clique; a URL assinada só nasce no clique). `contrato_path` NÃO é
 * segredo por si só — o que autoriza é a policy do bucket, com a sessão de
 * quem pede.
 * 🔑 `selecionado_entrevista` (migração ...261, 15/09/2026): um dos 5 da
 * entrevista prévia. Sem entrar aqui, a UI leria sempre `undefined` — a
 * mesma armadilha descrita acima para `fase`/`valor_honorarios`.
 * 🔑 As 4 colunas `entrevista_*` (migração ...262, 15/09/2026): resultado da
 * ligação, autor e data. `entrevista_observacoes` é LGPD (herda a regra de
 * `registro_contato`) mas continua saindo NESTA lista — é a ficha individual
 * de UM cliente sob RLS, o mesmo tratamento que `registro_contato` já tem
 * aqui; quem fica de fora é `gps.admin_clientes_lista` (agregado) e o CSV.
 * `criado_em`/`atualizado_em` NÃO entram: ninguém os lê. `criado_em` continua
 * servindo de critério de `.order()`, e o PostgREST ordena por coluna que não
 * está no `select`.
 */
const COLUNAS_CLIENTE_LISTA =
  "id, aluno_id, nome, telefone, problemas, registro_contato, mensagem_padrao_enviada, estudo_caso_enviado, ligacao_realizada, status, fase, data_reuniao_preliminar, aderiu_reuniao, perfil_disc, disc_consciencia, disc_gatilhos, disc_relacionamento, disc_atualizado_em, disc_atualizado_por, acompanhado_equipe, ordem, valor_honorarios, contrato_url, grau_relacao, acompanhamento_confirmado_em, acompanhamento_confirmado_por, contrato_path, contrato_nome, contrato_mime, contrato_tamanho, contrato_anexado_em, selecionado_entrevista, entrevista_resultado, entrevista_observacoes, entrevista_em, entrevista_por";

/**
 * `COLUNAS_CLIENTE_LISTA` + as 4 colunas de PESSOA JURÍDICA (migração `…308`,
 * 24/09/2026). Usada SÓ por `getClienteById` — a ficha de UM cliente.
 *
 * 🔴 POR QUE DUAS CONSTANTES, E NÃO UMA COM AS 4 DENTRO
 *   `getClientesEtapa1` traz a carteira INTEIRA do aluno (a base tem 1.710
 *   fichas em 24/09/2026) e nenhuma tela de lista mostra razão social, CNPJ,
 *   ramo ou regime — nem o card, nem o quadro de fases, nem o CSV. Deixar as
 *   4 na lista faria cada abertura de `/clientes` pagar egress por 4 colunas
 *   de texto que ninguém renderiza, multiplicado pelo número de clientes.
 *   O egress do Supabase tem teto DA ORGANIZAÇÃO, dividido com o sip.
 *   A ficha lê UMA linha: ali as 4 colunas custam uma linha, não 1.710.
 *
 * ⚠️ `getClienteEquipe` (o favorito, 1 linha) fica na LISTA de propósito: é
 *   um CARTÃO de destaque na home/etapa, não a ficha — não exibe PJ. Se um
 *   dia passar a exibir, troca a constante ali, não se funde as duas.
 *
 * ⚠️ Vale o MESMO contrato da lista: as duas têm de conter tudo que o
 *   consumidor declara. Campo que falta chega `undefined` e a tela mostra
 *   vazio EM SILÊNCIO — `select` explícito não erra por coluna ausente.
 *   Como `ClienteEtapa1` agora declara os 4 campos PJ, qualquer função que
 *   use `COLUNAS_CLIENTE_LISTA` devolve `ClienteEtapa1` com esses 4
 *   `undefined`: isso é deliberado (a lista não os usa), e é por isso que
 *   nenhuma tela de lista pode passar a lê-los sem trocar a constante.
 *
 * 🔴 É uma STRING LITERAL, não `COLUNAS_CLIENTE_LISTA + ", razao_social, …"`.
 *   O supabase-js tipa `.select()` a partir do LITERAL da string: concatenar
 *   em runtime degrada o tipo para `string` e o retorno vira
 *   `GenericStringError`, que o `as ClienteEtapa1` recusa (`TS2352`, medido
 *   em 24/09/2026). O preço é a duplicação abaixo — e o contrato das duas
 *   constantes é o que a mantém honesta.
 */
const COLUNAS_CLIENTE_FICHA =
  "id, aluno_id, nome, telefone, problemas, registro_contato, mensagem_padrao_enviada, estudo_caso_enviado, ligacao_realizada, status, fase, data_reuniao_preliminar, aderiu_reuniao, perfil_disc, disc_consciencia, disc_gatilhos, disc_relacionamento, disc_atualizado_em, disc_atualizado_por, acompanhado_equipe, ordem, valor_honorarios, contrato_url, grau_relacao, acompanhamento_confirmado_em, acompanhamento_confirmado_por, contrato_path, contrato_nome, contrato_mime, contrato_tamanho, contrato_anexado_em, selecionado_entrevista, entrevista_resultado, entrevista_observacoes, entrevista_em, entrevista_por, razao_social, cnpj, ramo_atividade, regime_tributario";
/** `gps.etapa3_agendamentos` → `Etapa3Agendamento`. */
const COLUNAS_ETAPA3_AGENDAMENTO =
  "id, aluno_id, cliente_id, descricao, data, horario, equipe_participa, criado_em";

/** `gps.etapa3_revisao` → `Etapa3Revisao`. */
const COLUNAS_ETAPA3_REVISAO = "aluno_id, duvidas, correcoes, atualizado_em";
export async function getClientesEtapa1(
  alunoId: string,
): Promise<ClienteEtapa1[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select(COLUNAS_CLIENTE_LISTA)
    .eq("aluno_id", alunoId)
    .order("ordem")
    .order("criado_em");
  return (data ?? []) as ClienteEtapa1[];
}
export async function getClienteById(
  clienteId: string,
): Promise<ClienteEtapa1 | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select(COLUNAS_CLIENTE_FICHA)
    .eq("id", clienteId)
    .maybeSingle();
  return (data as ClienteEtapa1) ?? null;
}

/**
 * Nome de vários clientes numa consulta só.
 *
 * 🔴 Existe para matar N+1. A tela de sessões precisa do nome do cliente de
 * cada linha; `Array.from(ids, getClienteById)` faz UMA ida ao PostgREST por
 * cliente distinto — a 8 sessões/semana isso vira ~400 requisições por
 * abertura de tela em um ano, custo que cresce com a base e não com o que a
 * tela mostra. É o padrão que motivou o protocolo de sustentabilidade.
 *
 * Só `id, nome`: quem precisa da ficha inteira usa `getClienteById`. A RLS
 * continua decidindo quais linhas voltam — esta função não amplia acesso.
 */
export async function getNomesDeClientes(
  clienteIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(clienteIds)].filter(Boolean);
  if (ids.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select("id, nome")
    .in("id", ids);

  if (error) {
    // Erro NÃO vira mapa vazio silencioso: a tela mostraria "—" no lugar de
    // todo nome e pareceria cadastro faltando, não falha de leitura.
    logErro("getNomesDeClientes", error);
    return new Map();
  }

  return new Map(
    ((data ?? []) as { id: string; nome: string | null }[])
      .filter((c) => c.nome)
      .map((c) => [c.id, c.nome as string]),
  );
}

/**
 * Nome + a LETRA do perfil DISC, numa consulta só.
 *
 * 🔑 Irmã de `getNomesDeClientes`, com UMA coluna a mais — e existe separada
 * porque aquela é usada em outras telas que não precisam do DISC; mudar a
 * assinatura delas para servir esta seria alargar o contrato de todas.
 *
 * 🔴 Só a LETRA (`perfil_disc`, 1 caractere). Os 3 campos ricos
 * (consciência/gatilhos/relacionamento) vão até 2.000 caracteres cada e
 * NÃO entram aqui: o egress do Supabase é teto da ORGANIZAÇÃO, dividido com
 * o `sip`, e quem precisa do texto completo usa o briefing da sessão.
 *
 * Motivo de existir (22/09): a tela do parceiro avisa "este cliente ainda não
 * tem perfil DISC" antes de ele marcar a Reunião Preliminar. Para isso basta
 * saber se a letra existe — medido naquele dia: 28 de 35 clientes favoritados
 * estavam sem ela.
 *
 * A RLS de `gps.etapa1_clientes` continua decidindo quais linhas voltam.
 */
export async function getNomesEDiscLeve(
  clienteIds: string[],
): Promise<Map<string, { nome: string | null; perfil_disc: string | null }>> {
  const ids = [...new Set(clienteIds)].filter(Boolean);
  if (ids.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select("id, nome, perfil_disc")
    .in("id", ids);

  if (error) {
    // Erro NÃO vira mapa vazio silencioso — a tela leria "sem DISC" sobre
    // clientes que TÊM, e mostraria um aviso falso. Mesma regra da irmã.
    logErro("getNomesEDiscLeve", error, { clientes: ids.length });
    return new Map();
  }

  return new Map(
    ((data ?? []) as { id: string; nome: string | null; perfil_disc: string | null }[])
      .map((c) => [c.id, { nome: c.nome, perfil_disc: c.perfil_disc }]),
  );
}

export async function getAgendamentosEtapa3(alunoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa3_agendamentos")
    .select(COLUNAS_ETAPA3_AGENDAMENTO)
    .eq("aluno_id", alunoId)
    .order("data", { ascending: true, nullsFirst: false })
    .order("criado_em");
  return data ?? [];
}

export async function getRevisaoEtapa3(alunoId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa3_revisao")
    .select(COLUNAS_ETAPA3_REVISAO)
    .eq("aluno_id", alunoId)
    .maybeSingle();
  return data ?? null;
}
/** Cliente marcado como acompanhado pela equipe (ou null). */
export async function getClienteEquipe(
  alunoId: string,
): Promise<ClienteEtapa1 | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select(COLUNAS_CLIENTE_LISTA)
    .eq("aluno_id", alunoId)
    .eq("acompanhado_equipe", true)
    .maybeSingle();
  return (data as ClienteEtapa1) ?? null;
}

/**
 * As 4 colunas que a meta de faturamento precisa — e só elas.
 *
 * A aba Financeiro soma honorários; não tem por que carregar
 * `registro_contato` ou `problemas`, que são anotação do aluno sobre TERCEIROS
 * (o cliente dele). Menos dado no payload é menos superfície e menos egress
 * (teto DA ORGANIZAÇÃO, dividido com o sip).
 *
 * 🔑 Sem `.eq("fase", "contratado")` de propósito: quem decide o que conta para
 * a meta é `resumoHonorarios` (src/lib/etapa1.ts), num lugar só. Filtrar aqui
 * copiaria a regra para o SQL e daria a ela liberdade de divergir da home e da
 * aba Clientes — e a função também precisa de `contratadosSemValor`, que é
 * contagem sobre o mesmo conjunto. São ≤ 30 linhas por ambiente.
 */
const COLUNAS_CLIENTE_HONORARIOS = "id, nome, fase, valor_honorarios";

export async function getClientesHonorarios(
  alunoId: string,
): Promise<ClienteHonorarios[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .schema("gps")
    .from("etapa1_clientes")
    .select(COLUNAS_CLIENTE_HONORARIOS)
    .eq("aluno_id", alunoId)
    .order("ordem")
    .order("criado_em");
  return (data ?? []) as ClienteHonorarios[];
}
