/**
 * Plantão de Dúvidas — Acelera Holding. Job diário de manutenção.
 *
 * ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
 * (commit b457005) e PROIBIDO de reconstruir.
 *
 * Protegido por segredo em header (`x-plantao-segredo`), comparado ao env
 * `PLANTAO_MANUTENCAO_SEGREDO`. Chamado 1×/dia por `pg_cron` (ver SQL de
 * `cron.schedule` no relatório do backend-engineer — NÃO agendado por este
 * arquivo, o cron é aplicado manualmente após revisão).
 *
 * Roda sem sessão de aluno/admin (chamado via HTTP pelo pg_cron), então lê
 * e escreve por RPCs SECURITY DEFINER dedicadas (`plantao_nps_pendente`,
 * `plantao_marcar_nps_enviado`, `plantao_expurgar`) — as tabelas
 * `plantao_inscricoes`/`plantao_eventos` só têm policy de
 * admin, então leitura/escrita direta via `.from()` seria sempre vazia.
 *
 * ⚠️ Essas 3 RPCs fazem DELETE em massa e disparo de e-mail; como estão
 * `grant to anon` (exigido pelo PostgREST para o schema exposto), TAMBÉM
 * exigem o MESMO `PLANTAO_MANUTENCAO_SEGREDO` como parâmetro `p_segredo`,
 * comparado no banco contra `current_setting('app.plantao_manutencao_segredo')`
 * — sem os dois segredos batendo (header desta rota + parâmetro da RPC),
 * qualquer chamada anônima ao PostgREST poderia derrubar sessões de todo
 * mundo ou martelar envio de NPS.
 *
 * Cinco tarefas, todas IDEMPOTENTES (rodar de novo no mesmo dia não duplica
 * nem corrompe nada):
 *  (a) envia NPS pendente e marca `nps_email_em`;
 *  (a2) avisa a MENTORA na véspera (quem vai, que horas, quantos) e carimba
 *       `plantao_slots.aviso_mentora_em`;
 *  (a3) reconcilia `bloqueado_por_programa` contra `gps.membros` (quem entrou
 *       ou saiu do Programa de Implementação desde a última rodada) e
 *       cancela as inscrições futuras de quem acabou de ser bloqueado;
 *  (a4) manda o e-mail com o LINK DA SALA 1h antes do inicio (unico e-mail
 *       ao aluno) e carimba `plantao_inscricoes.email_sala_em`;
 *  (c) expurga eventos com mais de 90 dias (retenção decidida pelo Marcio).
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { logErro } from "@/lib/log";
import {
  enviarPlantaoNps,
  enviarPlantaoAvisoMentora,
  enviarPlantaoSala,
} from "@/lib/email-plantao";

/**
 * Comparação do segredo em tempo CONSTANTE.
 *
 * `a !== b` sai no primeiro byte diferente: o tempo de resposta cresce com o
 * tamanho do prefixo acertado, o que permite descobrir o segredo byte a byte
 * com amostragem suficiente. Esta é a única rota do portal sem sessão — vale
 * fechar mesmo com risco baixo (segredo longo, chamador é o `pg_cron`).
 *
 * Compara os DIGESTS SHA-256, não os textos: `timingSafeEqual` LANÇA quando os
 * buffers têm tamanhos diferentes, e tratar isso com um `return false` cedo
 * reintroduziria o vazamento — o tempo passaria a revelar o TAMANHO do
 * segredo. Digest tem sempre 32 bytes, então a comparação é sempre a mesma
 * operação, para qualquer entrada. Hash aqui não é para guardar senha; é só
 * para normalizar o comprimento.
 */
function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const a = createHash("sha256").update(recebido, "utf8").digest();
  const b = createHash("sha256").update(esperado, "utf8").digest();
  return timingSafeEqual(a, b);
}

function clientePublico() {
  return createStatelessClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  ).schema("gps");
}

export async function POST(request: NextRequest) {
  const segredo = process.env.PLANTAO_MANUTENCAO_SEGREDO;
  if (!segredo) {
    logErro("plantao/manutencao", "PLANTAO_MANUTENCAO_SEGREDO ausente", {
      efeito: "rota recusa tudo com 500",
    });
    return NextResponse.json({ erro: "Não configurado." }, { status: 500 });
  }
  if (!segredoConfere(request.headers.get("x-plantao-segredo"), segredo)) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const supabase = clientePublico();
  const resultado = {
    npsEnviados: 0,
    npsFalhas: 0,
    avisosMentoraEnviados: 0,
    avisosMentoraFalhas: 0,
    elegibilidadeBloqueadosNovos: 0,
    elegibilidadeDesbloqueados: 0,
    elegibilidadeInscricoesCanceladas: 0,
    emailsSalaEnviados: 0,
    emailsSalaFalhas: 0,
    eventosExpurgados: 0,
  };

  // (a) NPS pendente — a RPC já filtra presença registrada, sem NPS e sem
  // e-mail de NPS, com slot terminado nas últimas 48h.
  const { data: pendentes, error: erroPendentes } = await supabase.rpc(
    "plantao_nps_pendente",
    { p_segredo: segredo, p_limite: 200 },
  );

  if (erroPendentes) {
    // A RPC recusa quando `app.plantao_manutencao_segredo` não está setado no
    // banco (`alter role authenticator set ...`). Sem este ramo, o job
    // responderia `ok:true` com tudo zerado — reportando sucesso sem ter
    // feito nada, que é o pior modo de falha para uma rotina automática:
    // ninguém investiga o que diz que deu certo.
    logErro("plantao/manutencao", erroPendentes, {
      rpc: "plantao_nps_pendente",
      efeito: "job aborta com 503",
    });
    return NextResponse.json(
      {
        ok: false,
        erro:
          "As funções de manutenção recusaram a chamada. Confira se " +
          "`app.plantao_manutencao_segredo` está setado no banco com o mesmo " +
          "valor de PLANTAO_MANUTENCAO_SEGREDO.",
      },
      { status: 503 },
    );
  }

  {
    for (const row of (pendentes ?? []) as Array<{
      inscricao_id: string;
      email: string;
      nome: string;
      mentora_nome: string;
    }>) {
      const envio = await enviarPlantaoNps({
        para: row.email,
        nome: row.nome,
        mentoraNome: row.mentora_nome,
      }).catch(() => ({ ok: false as const }));

      if (envio.ok) resultado.npsEnviados++;
      else resultado.npsFalhas++;

      // Marca mesmo em falha de envio: evita reprocessar indefinidamente o
      // mesmo e-mail quebrado; NPS falho vira dado perdido, não travamento.
      await supabase.rpc("plantao_marcar_nps_enviado", {
        p_segredo: segredo,
        p_inscricao_id: row.inscricao_id,
      });
    }
  }

  // (a2) Aviso de véspera à MENTORA: quem vai participar, que horas e
  // quantas pessoas. A RPC já filtra por "amanhã" no fuso de São Paulo,
  // publicado, ainda não avisado, com mentora que tem e-mail cadastrado e
  // com pelo menos 1 inscrito.
  //
  // Falha aqui NÃO derruba o job: o expurgo (b/c) precisa rodar de todo
  // jeito. Diferente do NPS, o carimbo só é gravado quando o envio dá certo
  // — um aviso de véspera perdido não tem segunda chance no dia seguinte
  // (o plantão já terá acontecido), então vale reprocessar na próxima
  // execução em vez de marcar como feito.
  const { data: avisos, error: erroAvisos } = await supabase.rpc(
    "plantao_aviso_mentora_pendente",
    { p_segredo: segredo },
  );

  if (erroAvisos) {
    logErro("plantao/manutencao", erroAvisos, { rpc: "plantao_aviso_mentora_pendente" });
  } else {
    for (const row of (avisos ?? []) as Array<{
      slot_id: string;
      mentora_nome: string;
      mentora_email: string;
      data: string;
      hora_inicio: string;
      participantes: { nome: string | null; email: string }[];
    }>) {
      const envio = await enviarPlantaoAvisoMentora({
        para: row.mentora_email,
        mentoraNome: row.mentora_nome,
        data: row.data,
        horaInicio: row.hora_inicio,
        participantes: row.participantes ?? [],
      }).catch(() => ({ ok: false as const }));

      if (envio.ok) {
        resultado.avisosMentoraEnviados++;
        await supabase.rpc("plantao_marcar_aviso_mentora", {
          p_segredo: segredo,
          p_slot_id: row.slot_id,
        });
      } else {
        resultado.avisosMentoraFalhas++;
      }
    }
  }

  // (a3) Reconciliação de elegibilidade: recalcula `bloqueado_por_programa`
  // contra `gps.membros` (o snapshot da migração ...034 não se atualiza
  // sozinho) e cancela as inscrições futuras de quem acabou de ser
  // bloqueado. Falha aqui NÃO derruba o job — o expurgo (b/c) precisa rodar
  // de todo jeito, e a próxima execução (amanhã) reconcilia de novo.
  const { data: reconciliacao, error: erroReconciliacao } = await supabase.rpc(
    "plantao_reconciliar_elegibilidade",
    { p_segredo: segredo },
  );

  if (erroReconciliacao) {
    logErro("plantao/manutencao", erroReconciliacao, {
      rpc: "plantao_reconciliar_elegibilidade",
    });
  } else {
    const linha = Array.isArray(reconciliacao) ? reconciliacao[0] : reconciliacao;
    resultado.elegibilidadeBloqueadosNovos = linha?.bloqueados_novos ?? 0;
    resultado.elegibilidadeDesbloqueados = linha?.desbloqueados ?? 0;
    resultado.elegibilidadeInscricoesCanceladas = linha?.inscricoes_canceladas ?? 0;
  }

  // (a4) E-mail com o LINK DA SALA, 1 hora antes do inicio.
  //
  // 🔑 Este e o UNICO e-mail que o aluno recebe (decisao do Marcio,
  // 08/09/2026): a inscricao deixou de disparar aviso. O e-mail no ato nao
  // podia carregar o link — a sala so e revelada dentro da janela, porque
  // revelar grava presenca — entao era um aviso sem acao. Concentrar num
  // envio, na hora que importa, resolve as duas pontas.
  //
  // A RPC filtra: inscricao ativa, ainda sem `email_sala_em`, slot publicado,
  // aluno nao bloqueado, e **slot COM `zoom_url`**. Sem sala nao ha o que
  // entregar, e o aluno nao perde o direito de cancelar por falha da equipe
  // (o cancelamento so trava quando o link de fato saiu).
  //
  // ⚠️ Este job roda 1x/dia, mas a janela de envio e de 1 HORA. Enquanto o
  // agendamento for diario, so pega os plantoes que comecam na hora seguinte
  // a execucao — ver a nota de frequencia no ATIVAR-PLANTAO-AGORA.md.
  //
  // O carimbo so e gravado quando o envio DA CERTO: um e-mail de sala perdido
  // nao tem segunda chance (o plantao ja tera comecado), entao vale
  // reprocessar na proxima execucao em vez de marcar como feito.
  const { data: salas, error: erroSalas } = await supabase.rpc(
    "plantao_email_sala_pendente",
    { p_segredo: segredo },
  );

  if (erroSalas) {
    logErro("plantao/manutencao", erroSalas, { rpc: "plantao_email_sala_pendente" });
  } else {
    for (const row of (salas ?? []) as Array<{
      inscricao_id: string;
      email: string;
      nome: string | null;
      data: string;
      hora_inicio: string;
      mentora_nome: string;
      zoom_url: string;
    }>) {
      const envio = await enviarPlantaoSala({
        para: row.email,
        nome: row.nome,
        data: row.data,
        horaInicio: row.hora_inicio,
        mentoraNome: row.mentora_nome,
        zoomUrl: row.zoom_url,
      }).catch(() => ({ ok: false as const }));

      if (envio.ok) {
        resultado.emailsSalaEnviados++;
        await supabase.rpc("plantao_marcar_email_sala", {
          p_segredo: segredo,
          p_inscricao_id: row.inscricao_id,
        });
      } else {
        resultado.emailsSalaFalhas++;
      }
    }
  }

  // (c) — expurgo de eventos com mais de 90 dias. O expurgo de sessões saiu
  // junto com o login (08/09/2026): não há mais `plantao_sessoes`.
  const { data: expurgo, error: erroExpurgo } = await supabase.rpc(
    "plantao_expurgar",
    { p_segredo: segredo },
  );
  if (erroExpurgo) {
    logErro("plantao/manutencao", erroExpurgo, {
      rpc: "plantao_expurgar",
      efeito: "job aborta com 503",
    });
    return NextResponse.json(
      { ok: false, erro: "O expurgo foi recusado pelo banco.", ...resultado },
      { status: 503 },
    );
  }
  const linhaExpurgo = Array.isArray(expurgo) ? expurgo[0] : expurgo;
  resultado.eventosExpurgados = linhaExpurgo?.eventos_expurgados ?? 0;

  return NextResponse.json({ ok: true, ...resultado });
}
