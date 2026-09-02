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
 * `plantao_inscricoes`/`plantao_sessoes`/`plantao_eventos` só têm policy de
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
 * Três tarefas, todas IDEMPOTENTES (rodar de novo no mesmo dia não duplica
 * nem corrompe nada):
 *  (a) envia NPS pendente e marca `nps_email_em`;
 *  (b) expurga sessões expiradas;
 *  (c) expurga eventos com mais de 90 dias (retenção decidida pelo Marcio).
 */

import { NextResponse, type NextRequest } from "next/server";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { enviarPlantaoNps } from "@/lib/email-plantao";

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
    console.error("[plantao/manutencao] PLANTAO_MANUTENCAO_SEGREDO ausente.");
    return NextResponse.json({ erro: "Não configurado." }, { status: 500 });
  }
  if (request.headers.get("x-plantao-segredo") !== segredo) {
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  const supabase = clientePublico();
  const resultado = {
    npsEnviados: 0,
    npsFalhas: 0,
    sessoesExpurgadas: 0,
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
    console.error("[plantao/manutencao] RPC recusada:", erroPendentes.message);
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

  // (b) e (c) — expurgo de sessões expiradas e eventos com mais de 90 dias.
  const { data: expurgo, error: erroExpurgo } = await supabase.rpc(
    "plantao_expurgar",
    { p_segredo: segredo },
  );
  if (erroExpurgo) {
    console.error("[plantao/manutencao] expurgo recusado:", erroExpurgo.message);
    return NextResponse.json(
      { ok: false, erro: "O expurgo foi recusado pelo banco.", ...resultado },
      { status: 503 },
    );
  }
  const linhaExpurgo = Array.isArray(expurgo) ? expurgo[0] : expurgo;
  resultado.sessoesExpurgadas = linhaExpurgo?.sessoes_expurgadas ?? 0;
  resultado.eventosExpurgados = linhaExpurgo?.eventos_expurgados ?? 0;

  return NextResponse.json({ ok: true, ...resultado });
}
