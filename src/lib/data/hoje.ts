import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { logAviso, logErro } from "@/lib/log";
import { hojeSaoPaulo } from "@/lib/datas";
import {
  validarAtalhos,
  type AtalhoHome,
  type HojeNoPrograma,
  type MinhaInscricaoHoje,
  type PlantaoHoje,
  type PlantaoSlotHoje,
  type SessaoHoje,
} from "@/components/home/hoje-tipos";

// ─────────────────────────────────────────────────────────────────────────
// "Hoje no programa" — a home do parceiro diz o que acontece hoje e onde
// fica cada coisa (item 1.6; reclamação de ~45 parceiros perdidos entre
// plataformas, e da Acacia, que achou o Plantão por acaso).
//
// 🔑 4 chamadas, TODAS no mesmo `Promise.all` (nunca em série, nunca uma por
// item): 2 RPCs do Plantão, 1 select de sessão, 1 RPC de atalhos.
//
// 🔑 Cada parte falha SOZINHA: erro numa fonte → `logErro` + a parte vira
// `null` e some da tela. A home nunca quebra por causa deste bloco.
//
// 🔴 Identidade: as RPCs do Plantão resolvem a pessoa NO BANCO
// (`gps.pessoa_atual()`, a partir do JWT) — nenhuma recebe e-mail/id. A
// sessão é do AMBIENTE (`alunoId` vem de `getContextoSessao()`, no servidor;
// titular e sócio veem a mesma), e a RLS de `sessao_agendamentos` continua
// sendo a fronteira — o `.eq("aluno_id")` é só para o plano.
//
// 🔴 Nunca lê `zoom_url` nem chama `plantao_revelar_link_logado`: revelar o
// link GRAVA PRESENÇA. A home manda para `/plantao`, que é onde se entra.
//
// ⚠️ Não usa `plantao_calendario_logado`: ela grava
// `plantao_bloqueio_exibido` (…315) e poluiria o log do João a cada abertura
// da home. A leitura do próximo é `plantao_proximo_logado` (…340), STABLE.
// ─────────────────────────────────────────────────────────────────────────

type Supabase = Awaited<ReturnType<typeof createClient>>;

interface LinhaProximo {
  qual: string;
  slot_id: string;
  data: string;
  hora_inicio: string;
  duracao_min: number;
  mentora_nome: string;
  inicio_em: string;
  fim_em: string;
  prazo_em: string | null;
  inscricao_aberta: boolean;
  em_intervalo: boolean;
}

function mapearSlot(r: LinhaProximo): PlantaoSlotHoje {
  return {
    slotId: r.slot_id,
    data: r.data,
    horaInicio: r.hora_inicio.slice(0, 5),
    duracaoMin: r.duracao_min,
    mentoraNome: r.mentora_nome,
    inicioEm: r.inicio_em,
    fimEm: r.fim_em,
    prazoEm: r.prazo_em,
    inscricaoAberta: r.inscricao_aberta,
    emIntervalo: r.em_intervalo,
  };
}

async function lerPlantao(supabase: Supabase, agoraMs: number): Promise<PlantaoHoje | null> {
  try {
    const [proximo, inscricao] = await Promise.all([
      supabase.schema("gps").rpc("plantao_proximo_logado"),
      supabase.schema("gps").rpc("plantao_minha_inscricao_logado"),
    ]);
    if (proximo.error) {
      logErro("hoje.plantao_proximo_logado", proximo.error);
      return null;
    }
    if (inscricao.error) {
      logErro("hoje.plantao_minha_inscricao_logado", inscricao.error);
      return null;
    }

    const linhas = (Array.isArray(proximo.data) ? proximo.data : []) as LinhaProximo[];
    const p = linhas.find((l) => l.qual === "proximo");
    const a = linhas.find((l) => l.qual === "aberto");

    // A RPC devolve a ÚLTIMA inscrição não cancelada, inclusive de plantão
    // que já passou — só conta como "inscrito" enquanto não terminou.
    let minhaInscricao: MinhaInscricaoHoje | null = null;
    const i = (Array.isArray(inscricao.data) ? inscricao.data[0] : null) as
      | {
          data: string;
          hora_inicio: string;
          mentora_nome: string;
          inicio_em: string;
          fim_em: string;
          duracao_min: number;
        }
      | null
      | undefined;
    if (i && new Date(i.fim_em).getTime() > agoraMs) {
      minhaInscricao = {
        data: i.data,
        horaInicio: i.hora_inicio.slice(0, 5),
        duracaoMin: i.duracao_min,
        mentoraNome: i.mentora_nome,
        inicioEm: i.inicio_em,
        fimEm: i.fim_em,
      };
    }

    return {
      proximo: p ? mapearSlot(p) : null,
      abertoParaVoce: a ? mapearSlot(a) : null,
      minhaInscricao,
    };
  } catch (e) {
    logErro("hoje.plantao", e);
    return null;
  }
}

function nomeDoEmbed(v: unknown): string | null {
  const o = Array.isArray(v) ? v[0] : v;
  if (!o || typeof o !== "object") return null;
  const nome = (o as { nome?: unknown }).nome;
  return typeof nome === "string" && nome.trim() ? nome.trim() : null;
}

async function lerProximaSessao(
  supabase: Supabase,
  alunoId: string,
  agoraIso: string,
): Promise<{ proxima: SessaoHoje | null } | null> {
  try {
    // Colunas dentro do grant de coluna de `authenticated` (…291 §6) —
    // nunca `briefing_snapshot`/`resumo`. Os nomes vêm por embed das FKs
    // `tipo_id` → sessao_tipos e `cliente_id` → etapa1_clientes (a RLS de
    // cada tabela vale no embed): 1 ida ao banco, não 3.
    const { data, error } = await supabase
      .schema("gps")
      .from("sessao_agendamentos")
      .select("data, hora_inicio, inicio_em, sessao_tipos(nome), etapa1_clientes(nome)")
      .eq("aluno_id", alunoId)
      .eq("estado", "agendado")
      .gt("fim_em", agoraIso)
      .order("inicio_em", { ascending: true })
      .limit(1);
    if (error) {
      logErro("hoje.sessao_agendamentos", error, { alunoId });
      return null;
    }
    // Sem tipos gerados, o supabase-js tipa todo embed como array; em
    // runtime, FK muitos-para-um volta objeto. `nomeDoEmbed` aceita os dois.
    const r = (data ?? [])[0] as unknown as
      | {
          data: string;
          hora_inicio: string;
          inicio_em: string;
          sessao_tipos: unknown;
          etapa1_clientes: unknown;
        }
      | undefined;
    if (!r) return { proxima: null };
    return {
      proxima: {
        tipoNome: nomeDoEmbed(r.sessao_tipos),
        clienteNome: nomeDoEmbed(r.etapa1_clientes),
        data: r.data,
        horaInicio: r.hora_inicio.slice(0, 5),
        inicioEm: r.inicio_em,
      },
    };
  } catch (e) {
    logErro("hoje.sessao", e, { alunoId });
    return null;
  }
}

async function lerAtalhos(supabase: Supabase): Promise<AtalhoHome[] | null> {
  try {
    const { data, error } = await supabase.schema("gps").rpc("home_atalhos");
    if (error) {
      logErro("hoje.home_atalhos", error);
      return null;
    }
    const v = validarAtalhos(data);
    if (v.invalido) {
      logAviso("hoje.home_atalhos", "gps.config.home_atalhos não é um array JSON");
      return null;
    }
    if (v.descartados || v.cortados) {
      logAviso("hoje.home_atalhos", "itens recusados na validação", {
        descartados: v.descartados,
        cortados: v.cortados,
      });
    }
    return v.atalhos;
  } catch (e) {
    logErro("hoje.atalhos", e);
    return null;
  }
}

/**
 * Tudo do bloco "Hoje no programa" para o parceiro logado. Memoizada por
 * requisição (`cache()` do React — escopo de requisição, não vaza entre
 * alunos; NUNCA `unstable_cache`). Nunca lança.
 */
export const getHojeNoPrograma = cache(async function getHojeNoPrograma(
  alunoId: string,
  temPessoaAluno: boolean,
): Promise<HojeNoPrograma> {
  const agoraMs = Date.now();
  const hoje = hojeSaoPaulo();
  let supabase: Supabase;
  try {
    supabase = await createClient();
  } catch (e) {
    logErro("hoje.createClient", e);
    return { plantao: null, sessoes: null, atalhos: null, agoraMs, hoje };
  }
  const [plantao, sessoes, atalhos] = await Promise.all([
    // Sem `pessoa_aluno_id` as 2 RPCs do Plantão respondem 42501 "Sem sessão do
    // Programa" — estado esperado, não falha: não chama e não loga. O bloco
    // do Plantão simplesmente não aparece (`null`).
    temPessoaAluno ? lerPlantao(supabase, agoraMs) : Promise.resolve(null),
    lerProximaSessao(supabase, alunoId, new Date(agoraMs).toISOString()),
    lerAtalhos(supabase),
  ]);
  return { plantao, sessoes, atalhos, agoraMs, hoje };
});
