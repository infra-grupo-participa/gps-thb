-- A checagem em plpgsql da mensagem boa, mas NAO e a trava: dois requests
-- simultaneos em slots DIFERENTES da mesma semana travam linhas diferentes
-- no `for update` e passam os dois. Teto de cardinalidade por grupo nao vira
-- CHECK em Postgres (CHECK nao aceita subquery -- erro 0A000), entao a trava
-- real e um indice unico sobre (aluno, semana).
--
-- A semana precisa estar materializada na propria linha de inscricoes para
-- o indice existir, e ela mora em plantao_slots. Coluna gerada nao pode ler
-- outra tabela, entao e coluna comum preenchida por trigger.

alter table gps.plantao_inscricoes
  add column if not exists semana date;

create or replace function gps.plantao_inscricoes_semana_sync()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  select gps.plantao_semana(sl.data) into new.semana
    from gps.plantao_slots sl where sl.id = new.slot_id;
  return new;
end;
$$;

drop trigger if exists trg_plantao_inscricoes_semana on gps.plantao_inscricoes;
create trigger trg_plantao_inscricoes_semana
  before insert or update of slot_id on gps.plantao_inscricoes
  for each row execute function gps.plantao_inscricoes_semana_sync();

-- Se a data de um slot mudar, a semana das inscricoes dele precisa seguir.
create or replace function gps.plantao_slots_semana_sync()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.data is distinct from old.data then
    update gps.plantao_inscricoes i
       set semana = gps.plantao_semana(new.data)
     where i.slot_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_plantao_slots_semana on gps.plantao_slots;
create trigger trg_plantao_slots_semana
  after update of data on gps.plantao_slots
  for each row execute function gps.plantao_slots_semana_sync();

-- Backfill das linhas que ja existem.
update gps.plantao_inscricoes i
   set semana = gps.plantao_semana(sl.data)
  from gps.plantao_slots sl
 where sl.id = i.slot_id and i.semana is distinct from gps.plantao_semana(sl.data);
