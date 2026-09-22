-- ═══════════════════════════════════════════════════════════════════════════
-- APLICADA EM PRODUÇÃO em 22/09/2026, em 3 partes (limite de tamanho por
-- chamada): `gps_sessao_resumo_dra_parte1_tabela_e_fila`, `_parte2_funcao`,
-- `_parte3_cron`. Registrada como `20260923000300` em schema_migrations.
--
-- ── MEDIDO DEPOIS DE APLICAR ───────────────────────────────────────────────
--   fila imediata: 8 → 6 ramos (2 lembretes da dra + os 4 do parceiro)
--   simulação do "parceiro indeciso" (3 marcações + 3 cancelamentos, rollback):
--     ANTES  6 e-mails imediatos para a doutora
--     AGORA  0 imediatos + 1 resumo às 18h
--   parceiro: continua recebendo na hora, 4 gatilhos intactos
--   cron `sessao-resumo-dra` ativo em '0 21 * * *' (= 18h America/Sao_Paulo)
--
-- ⚠️ Os nomes `agendou_dra` e `cancel_dra` AINDA aparecem no `order by` de
-- prioridade e nos `case` de assunto da função de disparo. São ramos
-- INALCANÇÁVEIS — a fila não os produz mais. Removê-los exigiria reescrever
-- mais texto sem ganho, e cada substituição a mais é uma chance de perder
-- comportamento sem perceber.
--
-- A doutora para de receber e-mail a CADA marcação/cancelamento.
-- Passa a receber UM resumo por dia, às 18h (America/Sao_Paulo).
--
-- Pedido do Marcio (22/09): *"no resend tá notificando toda hora sessão
-- marcada e cancelada… não vai ficar spammando no inbox do advogado"*.
--
-- ── O QUE FOI MEDIDO ANTES DE MEXER ────────────────────────────────────────
--
-- 🔑 O sistema NÃO estava repetindo aviso. Cada gatilho tem carimbo próprio
-- (`email_*_em`) e a fila exige `is null` — nenhum e-mail saiu duas vezes.
-- Dos 16 e-mails do dia, 14 eram da suíte E2E marcando e cancelando 7 vezes
-- seguidas; a única sessão real gerou 2 (1 por destinatário), que é o certo.
--
-- E o volume normal não é spam: 4 blocos/semana × 1 doutora = teto de ~12
-- e-mails/semana (confirmação + lembrete de 24h + lembrete de 1h).
--
-- O incômodo REAL, que sobrevive à medição: cada marcação e cada cancelamento
-- é um e-mail imediato e individual. Um parceiro indeciso que remarca 3× hoje
-- coloca 6 e-mails na caixa da doutora — todos "corretos", e ainda assim
-- ruído. É esse caso que esta migration resolve.
--
-- ── O QUE MUDA, E O QUE DELIBERADAMENTE NÃO MUDA ───────────────────────────
--
--   agendou_dra  → sai da fila imediata, entra no resumo diário
--   cancel_dra   → sai da fila imediata, entra no resumo diário
--
--   24h_dra      → CONTINUA imediato
--   1h_dra       → CONTINUA imediato
--   *_aluno (os 4) → CONTINUAM imediatos, todos
--
-- 🔴 Por que os lembretes ficam: são OPERACIONAIS, não informativos. "Em 1
-- hora: sessão com Fulano" dentro de um resumo das 18h do dia anterior é
-- inútil — quem precisa entrar numa sala às 14h não é avisado às 18h de
-- ontem. Agrupar tudo transformaria uma trava contra spam em falta à reunião.
--
-- 🔴 Por que o PARCEIRO continua recebendo na hora: ele acabou de clicar e
-- precisa da confirmação do que marcou. Um resumo diário para quem age uma
-- vez por mês não agrupa nada — só atrasa a única confirmação que importa.
--
-- ── REVERSÃO ───────────────────────────────────────────────────────────────
-- Desligar tudo: `gps.config.sessoes_email_ativo = 'false'` (já na tela de
-- Interruptores). Voltar ao imediato: `select cron.unschedule('sessao-resumo-dra')`
-- e reaplicar `gps.sessao_disparar_emails` sem os dois `and f.publico <> 'dra'`
-- acrescentados aqui.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1) Carimbo do resumo: uma linha por doutora por dia.
--
-- Mesmo desenho dos 8 carimbos da …293: `*_em` prova o envio e `*_req` guarda
-- o `request_id` do pg_net, porque `net.http_post` é ASSÍNCRONO e carimbar
-- logo depois do post marca como avisado quem levou 429 (lição de 09/09).
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists gps.sessao_resumo_diario (
  responsavel_id uuid        not null references auth.users(id) on delete cascade,
  dia            date        not null,
  enviado_em     timestamptz,
  request_id     bigint,
  itens          integer     not null default 0,
  criado_em      timestamptz not null default now(),
  primary key (responsavel_id, dia)
);

comment on table gps.sessao_resumo_diario is
  'Um resumo por doutora por dia (18h America/Sao_Paulo). A PK (responsavel_id, dia) e o que torna o envio idempotente: a 2a passada do cron no mesmo dia nao reenvia. `request_id` existe porque net.http_post e assincrono -- sem ele, um 429 da Resend ficaria carimbado como enviado.';

alter table gps.sessao_resumo_diario enable row level security;

-- Sem policy de leitura: ninguém lê isto pela API. É controle interno do
-- disparo, no mesmo espírito das colunas de carimbo da …293. O `revoke`
-- fecha o default do schema, que concede para `authenticated`.
--
-- ⚠️ O linter do Supabase marca isto como `rls_enabled_no_policy` (INFO).
-- É ESPERADO, não defeito — e NÃO se "corrige" criando uma policy, que abriria
-- leitura onde hoje não existe nenhuma. Provado em 22/09 com 1 linha plantada
-- (prova não-vacua): aluno, admin e anon, os três, recebem **42501**.
revoke all on gps.sessao_resumo_diario from anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 2) A fila imediata deixa de considerar os 2 gatilhos da doutora.
--
-- 🔑 Reescrita ANCORADA, não de memória: o corpo vivo foi lido com
-- `pg_get_functiondef` e só as duas linhas `and f.publico <> 'dra'` entram,
-- no `where` de `agendou_dra` e `cancel_dra`. Tudo o mais — teto de 8,
-- pg_sleep(0.15), ordem por urgência, LGPD, reconciliação — fica idêntico.
--
-- Em vez de recolar as ~400 linhas da função (onde se perde comportamento sem
-- perceber), removo os dois ramos da CTE por substituição textual verificada:
-- se a âncora não bater exatamente, a migration ABORTA sem aplicar nada.
-- ───────────────────────────────────────────────────────────────────────────
do $mig$
declare
  v_src  text;
  v_novo text;
  v_de   text;
  v_para text;
begin
  select pg_get_functiondef(p.oid) into v_src
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'gps' and p.proname = 'sessao_disparar_emails';

  if v_src is null then
    raise exception 'gps.sessao_disparar_emails nao existe -- nada a migrar';
  end if;

  v_novo := v_src;

  -- ── confirmação para a doutora ──
  -- 🔑 Texto EXATO de `pg_get_functiondef`, não o do arquivo da …293: o
  -- Postgres NORMALIZA o corpo ao armazenar (o `where` que a migration
  -- escreveu em 2 linhas está em 1 no banco). Conferido com os espaços
  -- marcados antes de escrever isto — a 1ª versão não casava e abortava.
  v_de := 'select a.id, ''agendou_dra''::text as gatilho,
             ''email_agendou_dra_em''::text as col_em, ''email_agendou_dra_req''::text as col_req,
             ''dra''::text as publico
        from gps.sessao_agendamentos a
       where a.estado = ''agendado'' and a.email_agendou_dra_em is null
         and a.criado_em >= now() - interval ''24 hours''
      union all
      ';
  if position(v_de in v_novo) = 0 then
    raise exception 'ancora do gatilho agendou_dra nao bateu -- a funcao mudou; migration ABORTADA sem aplicar';
  end if;
  v_novo := replace(v_novo, v_de, '');

  -- ── cancelamento para a doutora ──
  v_de := '      union all
      select a.id, ''cancel_dra'', ''email_cancel_dra_em'', ''email_cancel_dra_req'', ''dra''
        from gps.sessao_agendamentos a
       where a.estado = ''cancelado'' and a.email_cancel_dra_em is null
         and a.cancelado_em >= now() - interval ''24 hours''
';
  if position(v_de in v_novo) = 0 then
    raise exception 'ancora do gatilho cancel_dra nao bateu -- a funcao mudou; migration ABORTADA sem aplicar';
  end if;
  v_novo := replace(v_novo, v_de, '');

  -- Prova de que a remoção foi cirúrgica.
  --
  -- 🔑 Os dois nomes AINDA APARECEM na função depois da remoção, e está certo:
  -- sobram no `order by` de prioridade e nos `case` que montam assunto/corpo.
  -- São ramos INALCANÇÁVEIS — a fila não produz mais esses gatilhos, então
  -- nenhum `r.gatilho` chega neles. Removê-los exigiria reescrever mais texto
  -- sem ganho de comportamento, e cada substituição a mais é uma chance a mais
  -- de perder algo sem perceber.
  --
  -- O que precisa ser provado é que eles sumiram DA FILA (a CTE), e é isso que
  -- as duas âncoras acima garantem: elas casaram e foram removidas. A prova
  -- abaixo confere que os `from gps.sessao_agendamentos` da fila caíram de 8
  -- para 6 ramos.
  if (length(v_novo) - length(replace(v_novo, 'from gps.sessao_agendamentos a', ''))) 
     / length('from gps.sessao_agendamentos a') <> 6 then
    raise exception 'a fila deveria ficar com 6 ramos (4 do aluno + 2 lembretes da dra) -- ABORTADA';
  end if;
  if position('''1h_dra''' in v_novo) = 0 or position('''24h_dra''' in v_novo) = 0 then
    raise exception 'os lembretes da doutora sumiram junto -- ABORTADA (eles DEVEM continuar imediatos)';
  end if;
  if position('''agendou_aluno''' in v_novo) = 0 or position('''cancel_aluno''' in v_novo) = 0 then
    raise exception 'os gatilhos do aluno sumiram -- ABORTADA (o parceiro continua imediato)';
  end if;

  execute v_novo;
end $mig$;


-- ───────────────────────────────────────────────────────────────────────────
-- 3) `gps.sessao_resumo_dra_enviar()` — o resumo das 18h.
--
-- Não é endpoint: `revoke` de public/anon/authenticated. Quem chama é o cron.
-- ───────────────────────────────────────────────────────────────────────────
create or replace function gps.sessao_resumo_dra_enviar()
returns integer
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  c_portal  constant text := 'https://programa.timeholdingbrasil.com.br';
  c_teto    constant integer := 8;   -- Resend corta em 10 req/s (lição de 09/09)
  v_ativo   text;
  v_from    text;
  v_chave   text;
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_enviados integer := 0;
  v_req     bigint;
  r         record;
  v_html    text;
  v_linhas  text;
  v_ola     text;
  v_assunto text;
begin
  -- Interruptor único, o mesmo dos e-mails imediatos: quem desliga os avisos
  -- desliga TUDO, inclusive o resumo. Dois interruptores para a mesma coisa
  -- fariam a equipe desligar um e continuar recebendo pelo outro.
  select valor into v_ativo from gps.config where chave = 'sessoes_email_ativo';
  if coalesce(v_ativo, 'false') <> 'true' then return 0; end if;

  v_chave := gps.resend_api_key();          -- Vault, nunca gps.config direto
  if nullif(btrim(coalesce(v_chave, '')), '') is null then return 0; end if;

  select valor into v_from from gps.config where chave = 'email_sessoes_from';
  v_from := coalesce(nullif(btrim(coalesce(v_from, '')), ''),
                     'Time Holding Brasil <acesso@programa.timeholdingbrasil.com.br>');

  for r in
    -- Uma linha por doutora que teve MOVIMENTO hoje. Sem movimento, nenhum
    -- e-mail: resumo vazio ("nada mudou hoje") é exatamente o spam que esta
    -- migration existe para evitar.
    with movimento as (
      select a.responsavel_id,
             a.id, a.data, a.hora_inicio, a.estado, a.cancelado_motivo,
             c.nome as cliente_nome, al.nome as aluno_nome, t.nome as tipo_nome,
             case when a.estado = 'cancelado' then 'cancelada' else 'marcada' end as o_que
        from gps.sessao_agendamentos a
        join gps.sessao_tipos    t  on t.id = a.tipo_id
        join gps.etapa1_clientes c  on c.id = a.cliente_id
        join public.thb_alunos   al on al.id = a.aluno_id
       where (
              (a.estado = 'agendado'
                and (a.criado_em at time zone 'America/Sao_Paulo')::date = v_hoje)
           or (a.estado = 'cancelado'
                and (a.cancelado_em at time zone 'America/Sao_Paulo')::date = v_hoje)
             )
    )
    select m.responsavel_id,
           coalesce(nullif(btrim(coalesce(p.nome, '')), ''), '') as dra_nome,
           nullif(btrim(coalesce(p.email, u.email, '')), '')     as dra_email,
           count(*)                                              as itens,
           -- 🔴 LGPD: só data, hora, nomes e o que mudou. Nenhuma linha lê
           -- briefing_snapshot, descricao_caso, observacoes nem decisores —
           -- a mesma fronteira da …293. O motivo do cancelamento também NÃO
           -- entra: é texto livre do parceiro.
           string_agg(
             '<li style="margin:0 0 8px 0">' ||
             '<strong>' || m.o_que || '</strong> — ' ||
             to_char(m.data, 'DD/MM') || ' às ' ||
             to_char(m.hora_inicio, 'HH24:MI') || ' · ' ||
             coalesce(nullif(btrim(m.tipo_nome), ''), 'sessão') || ' · ' ||
             coalesce(nullif(btrim(m.aluno_nome), ''), 'parceiro') ||
             ' / ' || coalesce(nullif(btrim(m.cliente_nome), ''), 'cliente') ||
             '</li>',
             '' order by m.data, m.hora_inicio
           ) as linhas
      from movimento m
      left join public.perfis p on p.id = m.responsavel_id
      left join auth.users    u on u.id = m.responsavel_id
     where not exists (
       select 1 from gps.sessao_resumo_diario d
        where d.responsavel_id = m.responsavel_id
          and d.dia = v_hoje
          and d.enviado_em is not null)
     group by m.responsavel_id, p.nome, p.email, u.email
  loop
    exit when v_enviados >= c_teto;

    -- Sem e-mail: PULA sem carimbar. Carimbar marcaria como avisado quem
    -- nunca recebeu — a falha silenciosa que custou 11 e-mails em 09/09.
    if r.dra_email is null then continue; end if;

    v_ola := case when r.dra_nome <> ''
                  then 'Olá, ' || split_part(r.dra_nome, ' ', 1) || '!'
                  else 'Olá!' end;

    v_assunto := 'Sua agenda hoje: ' || r.itens ||
                 case when r.itens = 1 then ' mudança' else ' mudanças' end;

    v_html :=
      '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' ||
      'max-width:560px;margin:0 auto;padding:24px;color:#1c1917">' ||
      '<p style="font-size:16px;margin:0 0 16px">' || v_ola || '</p>' ||
      '<p style="font-size:14px;line-height:1.5;margin:0 0 16px">' ||
      'Este é o resumo do dia da sua agenda de sessões. ' ||
      'Você recebe um por dia, só quando algo muda.</p>' ||
      '<ul style="font-size:14px;line-height:1.5;padding-left:20px;margin:0 0 20px">' ||
      r.linhas || '</ul>' ||
      '<p style="margin:0 0 20px">' ||
      '<a href="' || c_portal || '/admin/sessoes" ' ||
      'style="background:#C74600;color:#fff;text-decoration:none;' ||
      'padding:10px 18px;border-radius:6px;font-size:14px;display:inline-block">' ||
      'Abrir a agenda</a></p>' ||
      '<p style="font-size:12px;color:#57534e;line-height:1.5;margin:0">' ||
      'Os lembretes de cada sessão (24 horas e 1 hora antes) continuam ' ||
      'chegando na hora, separadamente.</p></div>';

    select net.http_post(
      url     := 'https://api.resend.com/emails',
      headers := jsonb_build_object(
                   'Content-Type',  'application/json',
                   'Authorization', 'Bearer ' || v_chave),
      body    := jsonb_build_object(
                   'from',    v_from,
                   'to',      jsonb_build_array(r.dra_email),
                   'subject', v_assunto,
                   'html',    v_html)
    ) into v_req;

    insert into gps.sessao_resumo_diario (responsavel_id, dia, enviado_em, request_id, itens)
    values (r.responsavel_id, v_hoje, now(), v_req, r.itens)
    on conflict (responsavel_id, dia) do update
      set enviado_em = excluded.enviado_em,
          request_id = excluded.request_id,
          itens      = excluded.itens;

    v_enviados := v_enviados + 1;
    perform pg_sleep(0.15);   -- ~6,7 req/s; a Resend corta em 10
  end loop;

  return v_enviados;
end $fn$;

comment on function gps.sessao_resumo_dra_enviar() is
  'Resumo DIARIO da agenda para cada doutora, as 18h (America/Sao_Paulo). Substitui os e-mails imediatos de marcacao e cancelamento que iam para ela -- os lembretes de 24h e 1h e TODOS os avisos do parceiro continuam imediatos. So envia a quem teve movimento no dia (resumo vazio seria o proprio spam). Idempotente pela PK (responsavel_id, dia) de gps.sessao_resumo_diario. 🔴 LGPD: leva data, hora, nomes e o que mudou -- nunca briefing_snapshot, descricao_caso, observacoes, decisores nem o motivo do cancelamento. Desliga por gps.config.sessoes_email_ativo, o mesmo interruptor dos imediatos.';

revoke all on function gps.sessao_resumo_dra_enviar() from public, anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 4) Reconciliação do resumo (o 429 que o pg_net esconde).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function gps.sessao_resumo_dra_reconciliar()
returns integer
language plpgsql
security definer
set search_path to ''
as $fn$
declare v_limpos integer := 0;
begin
  -- Sem 2xx = não chegou. Limpa o carimbo para a próxima passada tentar de
  -- novo. Mesmo mecanismo de `gps.plantao_reconciliar_envios` (…174).
  with falhos as (
    select d.responsavel_id, d.dia
      from gps.sessao_resumo_diario d
      join net._http_response resp on resp.id = d.request_id
     where d.enviado_em is not null
       and d.request_id is not null
       and (resp.status_code is null or resp.status_code < 200 or resp.status_code >= 300)
  )
  update gps.sessao_resumo_diario d
     set enviado_em = null, request_id = null
    from falhos f
   where d.responsavel_id = f.responsavel_id and d.dia = f.dia;
  get diagnostics v_limpos = row_count;
  return v_limpos;
end $fn$;

revoke all on function gps.sessao_resumo_dra_reconciliar() from public, anon, authenticated;


-- ───────────────────────────────────────────────────────────────────────────
-- 5) Cron às 18h America/Sao_Paulo.
--
-- 🔑 pg_cron roda em UTC: 18h em São Paulo (UTC-3) = 21h UTC. O horário de
-- verão brasileiro está extinto desde 2019, então UTC-3 é estável; se voltar,
-- este número precisa mudar (registrado aqui para quem for procurar).
-- ───────────────────────────────────────────────────────────────────────────
select cron.unschedule('sessao-resumo-dra')
 where exists (select 1 from cron.job where jobname = 'sessao-resumo-dra');

select cron.schedule(
  'sessao-resumo-dra',
  '0 21 * * *',
  $cron$
    select gps.sessao_resumo_dra_reconciliar();
    select gps.sessao_resumo_dra_enviar();
  $cron$
);
