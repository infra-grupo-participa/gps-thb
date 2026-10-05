-- ═══════════════════════════════════════════════════════════════════════════
-- 346 — Dois tipos novos na agenda de sessões: "Sessão de Viabilidade" (id 3)
--       e "Croqui Estrutural" (id 4), conduzidos pela Cristiane, cada um com
--       grade PRÓPRIA. Por enquanto SEM horário publicado.
-- ═══════════════════════════════════════════════════════════════════════════
-- NÃO use `etapa_id = 3`: a etapa 3 está travada e colide com
-- `etapa3_agendamentos`. `etapa_id null` = tipo sem exigência de etapa
-- (…292 §0; `sessao_pode_agendar` pula o gate de etapa quando é null).
--
-- 🔴 SEM HORÁRIO NASCE POR CONSTRUÇÃO, não por sorte: `sessao_horarios_livres`
-- só oferece faixa com `tipo_id = <tipo>` ou `tipo_id is null`. Faixa ativa com
-- `tipo_id null` serviria os tipos novos sem grade — por isso a GUARDA abaixo
-- aborta se existir (medido em 05/10: nenhuma). Faixas atuais: tipo 1 = 25,
-- tipo 2 = 4.
--
-- id é `smallint primary key` SEM identity/serial (…291): não há sequence.
-- exige_briefing: copiado do tipo 2 (a flag não é lida por nenhuma função das
-- migrations — o snapshot é montado sempre; o conteúdo do briefing é genérico
-- do cliente, não da Preliminar).
--
-- IDEMPOTENTE: on conflict do nothing + aborta se o id já existir com outro nome.
-- DOWN (nunca apagar): update gps.sessao_tipos set ativo = false where id in (3,4);
-- ═══════════════════════════════════════════════════════════════════════════
begin;

set local lock_timeout = '2s';
set local statement_timeout = '20s';

do $mig$
declare
  v_briefing boolean;
  v_n_null   int;
  v_conflito text;
begin
  -- GUARDA 1: faixa sem tipo, ainda em vigor (inclui as de vigência futura,
  -- que passariam a servir os tipos novos assim que começassem).
  select count(*) into v_n_null
    from gps.sessao_disponibilidade d
   where d.ativo
     and d.tipo_id is null
     and (d.vigencia_fim is null or d.vigencia_fim >= (now() at time zone 'America/Sao_Paulo')::date);
  if v_n_null > 0 then
    raise exception 'ha % faixa(s) ativa(s) com tipo_id null: dariam horario aos tipos 3/4 sem grade -- ABORTADA', v_n_null;
  end if;

  -- GUARDA 2: ids 3/4 já ocupados por outra coisa.
  select string_agg(t.id || '=' || t.nome, ', ') into v_conflito
    from gps.sessao_tipos t
   where (t.id = 3 and t.nome <> 'Sessão de Viabilidade')
      or (t.id = 4 and t.nome <> 'Croqui Estrutural');
  if v_conflito is not null then
    raise exception 'ids 3/4 ja existem com outro nome (%) -- ABORTADA', v_conflito;
  end if;

  select t.exige_briefing into v_briefing from gps.sessao_tipos t where t.id = 2;
  if v_briefing is null then
    raise exception 'tipo 2 ausente do catalogo -- ABORTADA';
  end if;

  insert into gps.sessao_tipos
    (id, nome, duracao_min, intervalo_min, exige_briefing, etapa_id, ativo)
  values
    (3, 'Sessão de Viabilidade', 120, 10, v_briefing, null, true),
    (4, 'Croqui Estrutural',     120, 10, v_briefing, null, true)
  on conflict (id) do nothing;

  if (select count(*) from gps.sessao_tipos where id in (3, 4) and etapa_id is null and ativo) <> 2 then
    raise exception 'tipos 3/4 nao ficaram como esperado (ativos, etapa_id null) -- ABORTADA';
  end if;
end
$mig$;

commit;
