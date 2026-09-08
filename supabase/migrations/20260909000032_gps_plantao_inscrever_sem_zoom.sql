-- Remove a SEGUNDA trava de `zoom_url`, dentro de `gps.plantao_inscrever`.
--
-- 🔴 A trava de "não publicar sem Zoom" existia em DOIS lugares, e a migração
-- ...030 só tratou do primeiro:
--
--   1. `publicarSlot` (src/app/admin/plantao/actions.ts) — removida em ...030;
--   2. `gps.plantao_inscrever` (esta) — passou despercebida.
--
-- Com só a primeira removida, o estado ficava PIOR que antes: o admin publica
-- o plantão, o aluno o VÊ no calendário com a contagem de participantes,
-- clica em "Inscrever" e leva `Este plantão ainda não está pronto para
-- inscrição.` — uma recusa que ele não tem como resolver nem entender, num
-- botão que a própria tela ofereceu.
--
-- Achado ao exercitar o fluxo real como `anon` (08/09/2026), não pela leitura
-- do código: as duas travas tinham textos e camadas diferentes, então nada
-- ligava uma à outra em busca por palavra-chave.
--
-- A decisão original (Marcio, 08/09/2026) vale para o fluxo INTEIRO: o aluno
-- agenda primeiro, a sala é definida depois. A intenção de "não mandar
-- ninguém para uma sala que não existe" segue honrada onde de fato importa —
-- `plantao_revelar_link` continua exigindo `zoom_url` (não dá para revelar o
-- que não existe), e o card do aluno não oferece "Entrar na sala" sem
-- `tem_sala` (migração ...030), avisando que o link aparece quando a equipe
-- publicar.
--
-- O resto da função fica IDÊNTICO: trava de 1 inscrição ativa, lock do slot
-- (`for update`) contra corrida, recusa de slot não publicado e de slot que
-- já começou.
--
-- Reversão: reaplicar o corpo com o bloco `if v_slot.zoom_url is null ...`
-- (definição integral na migração 20260901000002).

create or replace function gps.plantao_inscrever(p_token text, p_slot_id uuid)
returns table (
  ok boolean,
  motivo text,
  inscricao_id uuid,
  email text,
  nome text,
  data date,
  hora_inicio time without time zone,
  mentora_nome text
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_aluno_id uuid;
  v_slot gps.plantao_slots%rowtype;
  v_ativa_id uuid;
  v_nova_id uuid;
  v_aluno gps.plantao_alunos%rowtype;
  v_mentora_nome text;
begin
  select s.aluno_plantao_id into v_aluno_id from gps.plantao_sessao(p_token) s;
  if v_aluno_id is null then
    return query select false, 'Sessão expirada. Entre novamente.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  select * into v_slot from gps.plantao_slots where id = p_slot_id for update;
  if not found or not v_slot.publicado then
    return query select false, 'Este plantão não está disponível.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  if v_slot.inicio_em <= now() then
    return query select false, 'Este plantão já começou ou já passou.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  -- (Aqui ficava a segunda trava de `zoom_url`. Ver o cabeçalho desta
  -- migração: agendar não depende mais da sala existir.)

  -- Trava "1 inscrição ativa por vez": depende de now(), não vira índice
  -- único. Checagem em transação, com o lock do slot acima evitando corrida
  -- de duas inscrições simultâneas no MESMO slot; a trava "só 1 no total" é
  -- lida aqui dentro da mesma tx.
  select i.id into v_ativa_id
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.aluno_plantao_id = v_aluno_id
    and i.cancelado_em is null
    and sl.inicio_em > now()
  limit 1;

  if v_ativa_id is not null then
    return query select false, 'Você já tem um plantão marcado. Cancele-o antes de escolher outro.'::text,
      null::uuid, null::text, null::text, null::date, null::time, null::text;
    return;
  end if;

  insert into gps.plantao_inscricoes (slot_id, aluno_plantao_id)
  values (p_slot_id, v_aluno_id)
  returning id into v_nova_id;

  insert into gps.plantao_eventos (aluno_plantao_id, acao)
    values (v_aluno_id, 'plantao_inscricao');

  select * into v_aluno from gps.plantao_alunos where id = v_aluno_id;
  select m.nome into v_mentora_nome
    from gps.plantao_mentoras m where m.id = v_slot.mentora_id;

  return query select true, null::text, v_nova_id,
    v_aluno.email, v_aluno.nome, v_slot.data, v_slot.hora_inicio, v_mentora_nome;
end;
$function$;

revoke execute on function gps.plantao_inscrever(text, uuid) from public;
grant execute on function gps.plantao_inscrever(text, uuid) to anon, authenticated;

comment on function gps.plantao_inscrever(text, uuid) is
  'Inscreve o aluno do plantao (resolvido pelo token, nunca por id do cliente) num slot publicado e futuro. NAO exige zoom_url — agendar nao depende da sala existir (decisao 08/09/2026); revelar o link continua exigindo. Trava 1 inscricao ativa por vez, com for update no slot contra corrida.';
