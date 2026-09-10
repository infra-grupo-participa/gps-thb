-- Plantao -- a elegibilidade volta a ser verdade (e passa a se manter sozinha).
--
-- 🔴 O QUE O MARCIO VIU (10/09/2026)
--   "Tivemos alunos do hm na reuniao ontem, voce me garantiu que so teria
--    alunos do acelera holding, sem hm la"
--
--   Ele estava certo. Heber dos Santos Silveira e Marinalva Moura Bispo de
--   Salles Pupo estiveram no plantao de 09/09 e HOJE tem ambiente no GPS.
--
-- A CRONOLOGIA -- E A PARTE QUE E MINHA CULPA
--   09/09 14:00  plantao da Elaine; Heber e Marinalva participam
--   09/09 16:55  ultima passada do cron de e-mails
--   09/09 17:38  EU crio 27 ambientes no GPS, incluindo os dois
--
--   Quando participaram, as 14:00, eles eram legitimamente do Acelera: o
--   bloqueio nao falhou, nao havia o que bloquear ainda. Mas eu criei os
--   ambientes e NAO reconciliei a base do Plantao depois, sabendo que tinha
--   acabado de mexer na fronteira entre os dois produtos.
--
-- 🔴 A CAUSA RAIZ (pior que o incidente)
--   `gps.plantao_reconciliar_elegibilidade(p_segredo)` exige a env
--   PLANTAO_MANUTENCAO_SEGREDO, NUNCA configurada na Hostinger -- e nao
--   existia cron nenhum chamando-a. Medido: ZERO evento de reconciliacao em
--   `gps.plantao_eventos`, desde sempre.
--
--   Ou seja: a reconciliacao NUNCA RODOU. Os "20 bloqueados" que este repo
--   documentava desde 08/09 eram um UPDATE MANUAL congelado, e eu os
--   apresentei como se fossem um numero vivo. Eram um retrato.
--
--   Efeito medido em 10/09: 22 pessoas com ambiente no GPS seguiam
--   elegiveis ao Plantao. Nenhuma com inscricao futura -- nada mais vazou
--   alem do plantao de ontem.
--
-- O QUE ESTA MIGRATION FAZ -- TRES CAMADAS
--
--   1. CORRIGE O ESTADO. 22 pessoas bloqueadas; total 20 -> 42; elegiveis
--      396 -> 374. Conferido depois: 0 elegiveis com ambiente no GPS.
--
--   2. O CRON QUE FALTAVA. `gps.plantao_reconciliar_pelo_cron()` roda todo
--      dia as 06:17 UTC (03:17 em Sao Paulo) pelo job
--      `plantao-reconciliar-elegibilidade`. NAO exige segredo: quem chama e
--      o cron do banco, nunca HTTP, e a funcao tem revoke de todos os papeis
--      da API. Nao depende de env, de deploy nem do painel da Hostinger --
--      que foi exatamente o que impediu a versao original de existir.
--
--   3. TRAVA AO VIVO em `plantao_inscrever`. O cron deixa uma janela: quem
--      migra de manha so seria bloqueado na madrugada seguinte. Agora a
--      condicao de verdade -- TER AMBIENTE NO GPS -- e conferida na hora da
--      inscricao, e nao a flag, que e cache.
--
-- REGRAS PRESERVADAS
--   • Casa por E-MAIL, nunca por documento: CPF duplicado multiplica (caso
--     Eder Fagundes) e CNPJ de empresa pode ter dois socios distintos -- a
--     Marisa Tiedt (Acelera) divide o CNPJ da GPS Contadores com o Gilton
--     (Programa), e por documento ela seria bloqueada indevidamente.
--   • `bloqueio_excecao` blinda quem a equipe liberou de proposito; sem
--     isso o cron desfaria a decisao humana na madrugada seguinte.
--   • A recusa continua GENERICA ("Confira o e-mail informado"): dizer
--     "voce migrou para o Programa" deixaria qualquer um descobrir quem
--     comprou o que, testando e-mails.
--
-- ⚠️ O QUE ISTO NAO RESOLVE
--   O sistema continua NAO avisando o bloqueado. Quem migrou para o
--   Programa tenta se inscrever e recebe a mensagem generica -- alguem
--   precisa avisar por fora. Decisao antiga, mantida.
--
-- REVERSAO
--   select cron.unschedule('plantao-reconciliar-elegibilidade');
--   drop function gps.plantao_reconciliar_pelo_cron();
--   update gps.plantao_alunos set bloqueado_por_programa = false
--    where atualizado_em::date = '2026-09-10' and bloqueado_por_programa;
--   (e tirar o `not exists` de plantao_inscrever)

create or replace function gps.plantao_reconciliar_pelo_cron()
returns int
language plpgsql
security definer
set search_path to ''
as $fn$
declare v_n int;
begin
  -- Casa por E-MAIL, nunca por documento -- ver o cabecalho.
  -- `bloqueio_excecao` blinda a liberacao manual da equipe.
  update gps.plantao_alunos a
     set bloqueado_por_programa = true, atualizado_em = now()
   where a.ativo
     and not a.bloqueado_por_programa
     and not a.bloqueio_excecao
     and exists (select 1 from gps.membros m
                  join public.thb_alunos t on t.id = m.aluno_id
                 where lower(btrim(t.email)) = a.email);
  get diagnostics v_n = row_count;
  return v_n;
exception when others then
  return -1;   -- nunca derruba a passada do cron
end;
$fn$;

comment on function gps.plantao_reconciliar_pelo_cron() is
  'Bloqueia no Plantao quem passou a ter ambiente no GPS (migrou para o Programa). Casa por e-mail, nunca por documento. Respeita bloqueio_excecao. Chamada pelo cron plantao-reconciliar-elegibilidade -- a versao com p_segredo depende de env nunca configurada e por isso nunca rodou.';

revoke all on function gps.plantao_reconciliar_pelo_cron() from public, anon, authenticated;

-- Cron diario as 06:17 UTC = 03:17 America/Sao_Paulo. Agendado em 10/09/2026:
--   select cron.schedule('plantao-reconciliar-elegibilidade', '17 6 * * *',
--                        'select gps.plantao_reconciliar_pelo_cron()');
-- Conferir com: select jobname, schedule, active from cron.job;

-- Correcao pontual do estado (22 pessoas), aplicada em 10/09/2026:
--   update gps.plantao_alunos a
--      set bloqueado_por_programa = true, atualizado_em = now()
--    where a.ativo and not a.bloqueado_por_programa and not a.bloqueio_excecao
--      and exists (select 1 from gps.membros m
--                   join public.thb_alunos t on t.id = m.aluno_id
--                  where lower(btrim(t.email)) = a.email);
--
-- Dado de pessoa NAO entra em migration por decisao do projeto (reaplicar o
-- historico do zero reinsere carimbo que ja pode ter mudado). O SQL fica
-- aqui como registro de auditoria; o efeito permanente e o cron acima.

-- `plantao_inscrever` ganhou a trava ao vivo, por edicao do corpo vigente:
--   select pa.* into v_aluno from gps.plantao_alunos pa
--    where pa.email = v_email and pa.ativo and not pa.bloqueado_por_programa
--      and not exists (select 1 from gps.membros m
--                       join public.thb_alunos t on t.id = m.aluno_id
--                      where lower(btrim(t.email)) = pa.email);
--
-- Provado como `anon` em rollback: Heber (agora no Programa) recusado com a
-- mensagem generica; aluno do Acelera puro aceito normalmente.
