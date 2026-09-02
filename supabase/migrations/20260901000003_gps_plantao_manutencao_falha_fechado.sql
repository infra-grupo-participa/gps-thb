-- Endurece a guarda das 3 funções de manutenção do plantão.
--
-- BUG CORRIGIDO (encontrado ao aplicar as migrations em 01/09/2026): a
-- checagem original era
--   if p_segredo is null or p_segredo <> current_setting('app.plantao_manutencao_segredo', true)
-- Se o setting NÃO existe, current_setting(...,true) devolve NULL, a comparação
-- `p_segredo <> NULL` avalia para NULL (não TRUE), o `if` NÃO dispara e a função
-- EXECUTA — ou seja, falhava ABERTO: qualquer requisição anônima ao PostgREST
-- (a anon key é pública no bundle do cliente) podia apagar todas as sessões e
-- toda a trilha de eventos.
--
-- Agora falha FECHADO: sem setting configurado (ou com menos de 16 caracteres),
-- ninguém executa. Verificado em 01/09/2026: chamada sem setting levanta 42501.
--
-- Configuração necessária no banco, com o MESMO valor de
-- PLANTAO_MANUTENCAO_SEGREDO no painel da Hostinger:
--   alter role authenticator set app.plantao_manutencao_segredo = '<valor >= 16 chars>';

create or replace function gps.plantao_conferir_segredo(p_segredo text)
returns void
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, gps
as $$
declare
  v_esperado text := coalesce(current_setting('app.plantao_manutencao_segredo', true), '');
begin
  -- Segredo não configurado no banco => ninguém passa (falha fechado).
  if length(v_esperado) < 16 then
    raise exception 'Manutenção do plantão indisponível: segredo não configurado.'
      using errcode = '42501';
  end if;

  if p_segredo is null or length(p_segredo) < 16 then
    raise exception 'Não autorizado' using errcode = '42501';
  end if;

  -- Comparação de tempo constante: hashes de mesmo tamanho, sem short-circuit
  -- por prefixo, para não vazar o segredo por timing.
  if encode(extensions.digest(p_segredo, 'sha256'), 'hex')
     <> encode(extensions.digest(v_esperado, 'sha256'), 'hex') then
    raise exception 'Não autorizado' using errcode = '42501';
  end if;
end;
$$;

revoke execute on function gps.plantao_conferir_segredo(text) from public;
-- Só as funções SECURITY DEFINER a chamam (rodam como owner). Nenhum papel
-- de cliente precisa executá-la diretamente.

create or replace function gps.plantao_nps_pendente(p_segredo text, p_limite int default 200)
returns table (
  inscricao_id uuid,
  email text,
  nome text,
  mentora_nome text
)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, gps
as $$
begin
  perform gps.plantao_conferir_segredo(p_segredo);

  return query
  select i.id, a.email, a.nome, m.nome
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  join gps.plantao_alunos a on a.id = i.aluno_plantao_id
  where i.presenca_em is not null
    and i.nps_em is null
    and i.nps_email_em is null
    and sl.inicio_em + make_interval(mins => sl.duracao_min) <= now()
    and sl.inicio_em + make_interval(mins => sl.duracao_min) >= now() - interval '48 hours'
  limit greatest(p_limite, 0);
end;
$$;

revoke execute on function gps.plantao_nps_pendente(text, int) from public;
grant execute on function gps.plantao_nps_pendente(text, int) to anon, authenticated;

create or replace function gps.plantao_marcar_nps_enviado(p_segredo text, p_inscricao_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, gps
as $$
begin
  perform gps.plantao_conferir_segredo(p_segredo);

  update gps.plantao_inscricoes
  set nps_email_em = now()
  where id = p_inscricao_id;
end;
$$;

revoke execute on function gps.plantao_marcar_nps_enviado(text, uuid) from public;
grant execute on function gps.plantao_marcar_nps_enviado(text, uuid) to anon, authenticated;

create or replace function gps.plantao_expurgar(p_segredo text)
returns table (sessoes_expurgadas int, eventos_expurgados int)
language plpgsql
security definer
set search_path = pg_catalog, extensions, public, gps
as $$
declare
  v_sessoes int;
  v_eventos int;
begin
  perform gps.plantao_conferir_segredo(p_segredo);

  delete from gps.plantao_sessoes where expira_em < now();
  get diagnostics v_sessoes = row_count;

  delete from gps.plantao_eventos where criado_em < now() - interval '90 days';
  get diagnostics v_eventos = row_count;

  return query select v_sessoes, v_eventos;
end;
$$;

revoke execute on function gps.plantao_expurgar(text) from public;
grant execute on function gps.plantao_expurgar(text) to anon, authenticated;
