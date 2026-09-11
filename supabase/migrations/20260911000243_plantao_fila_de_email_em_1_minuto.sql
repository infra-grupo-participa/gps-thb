-- ═══════════════════════════════════════════════════════════════════════════
-- A fila de e-mail do Plantão passa a esvaziar em 1 MINUTO (era até 15)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Reclamação do Marcio, 11/09/2026, com o plantão acontecendo: *"de 5 em 5
-- min? isso eh mt longo cara, o pessoal tem q entrar na hora"*. Ele está certo:
-- o e-mail "começou agora" é justamente o que não pode chegar atrasado.
--
-- ESTADO ANTERIOR (medido no plantão de 11/09, 22 inscritos):
--   cron */5  +  teto 8  ->  10:00 = 8 · 10:05 = 8 · 10:10 = 6
--   o 22º só receberia às 10:10, com a live correndo há 10 minutos.
--
-- POR QUE O TETO ERA 8: em 09/09 a Resend devolveu 429 em 11 de 20 envios
-- (limite de 10 req/s) e o carimbo dizia "enviado". A resposta na época foi
-- pausa de 150 ms + teto por passada. A pausa resolveu o 429; o teto foi
-- escolhido por precaução, sem medir.
--
-- A MEDIÇÃO QUE FALTAVA (cron.job_run_details, passadas com 8 envios):
--   1,56 s para 8 envios = 0,195 s por envio
--   com teto 30: 30 × 0,195 = 5,9 s, dentro do statement_timeout de 8 s
--   do `authenticator` — a folga que o teto 8 protegia continua de pé.
--
--   Maior plantão da história: 25 inscritos -> cabe em UMA passada.
--   Taxa efetiva: 30 envios / 5,9 s = 5,1 req/s, metade do limite da Resend.
--
-- A ARITMÉTICA (regra do CLAUDE.md: conferir teto × intervalo × janela):
--   janela do "começou agora" = 30 min · cron 1 min · teto 30
--   -> alcance de 900 pessoas. Antes eram 8 × 6 = 48, e o 22º chegava tarde.
--
-- ⚠️ `c_pausa` NÃO muda. É ela que impede o 429, não o teto.
--
-- Só as duas constantes mudam. O corpo veio de `pg_get_functiondef` do banco
-- (regra: nunca recopiar de migration antiga — já reverteu feature em
-- silêncio), com substituição textual provada: a aplicação abortava se as
-- duas trocas não ocorressem.
--
-- Efeito imediato, medido no plantão em curso: os 6 que ainda faltavam
-- receberam às 10:06, na primeira passada com o teto novo. 22 de 22, todos
-- HTTP 200, zero 429.
--
-- REVERSÃO: voltar as constantes para 8/7 e `cron.alter_job(..., '*/5 * * * *')`.

do $migra$
declare v_def text; v_novo text; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'gps' and p.proname = 'plantao_disparar_emails_sala';

  if v_def is null then
    raise exception 'gps.plantao_disparar_emails_sala nao existe';
  end if;

  v_novo := replace(v_def, 'c_teto  constant int := 8;',
                           'c_teto  constant int := 30;');
  v_novo := replace(v_novo, 'c_reserva_alunos constant int := 7;',
                            'c_reserva_alunos constant int := 29;');

  -- Idempotente: se já está com os valores novos, não faz nada.
  if v_novo = v_def then
    select count(*) into v_n
      from regexp_matches(v_def, 'c_teto  constant int := 30;', 'g');
    if v_n = 1 then
      raise notice 'ja aplicado';
      return;
    end if;
    raise exception 'nada substituido e o teto nao e 30 — conferir o corpo';
  end if;

  execute v_novo;
end $migra$;

-- De 5 em 5 minutos para DE MINUTO EM MINUTO.
select cron.alter_job(
  (select jobid from cron.job where jobname = 'plantao-emails-sala'),
  schedule := '* * * * *'
);
