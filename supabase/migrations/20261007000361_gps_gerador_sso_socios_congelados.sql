-- ═══════════════════════════════════════════════════════════════════════════
-- 361 — SSO GPS → Gerador: sócio SEM cadastro só se estiver na lista
--       CONGELADA em 07/10/2026 (achado ALTO do kirad sobre a 360)
-- ═══════════════════════════════════════════════════════════════════════════
-- A 360 liberou passe a todo membro sem cadastro (thb_alunos). Mas o convite
-- de sócio (`socio_convite_criar`/`_aceitar`, …244) deixa um TITULAR criar um
-- sócio com QUALQUER e-mail, já confirmado (`email_confirmed_at = now()`),
-- sem prova de posse. Com a 360, isso virava conta no gerador em nome de
-- terceiro, e o titular continuaria entrando nela pelo vínculo `sub` mesmo
-- depois de a vítima assumir a conta. Medido em 07/10: `convite_socio_ativo`
-- = 'true', 7 convites aceitos; dos 7 sócios sem cadastro, 5 vieram de convite.
--
-- Remédio: só os 7 sócios sem cadastro que EXISTEM hoje (convidados por
-- titulares reais semanas atrás, sem conta no gerador) recebem passe. Sócio
-- sem cadastro criado depois continua no login próprio do gerador até a
-- equipe vincular o cadastro dele (Central → Pessoas), o que o devolve à regra
-- normal (cadastro = e-mail do login).
--
-- 5 PERGUNTAS: tabela fixa de 7 linhas, lookup por PK; reversão = reaplicar a
-- função da 359 (mais restritiva) ou a 360.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table gps.gerador_sso_socios_2026_10_07 (
  user_id uuid primary key,
  email   text not null
);

comment on table gps.gerador_sso_socios_2026_10_07 is
  'SSO -> Gerador (361): socios SEM cadastro (pessoa_aluno_id nulo) existentes em 07/10/2026 que recebem passe. Congelada: nunca inserir depois (convite de socio nao prova posse do e-mail). Sem grant/policy.';

alter table gps.gerador_sso_socios_2026_10_07 enable row level security;
revoke all on table gps.gerador_sso_socios_2026_10_07 from public, anon, authenticated, service_role;

insert into gps.gerador_sso_socios_2026_10_07 (user_id, email)
select m.user_id, lower(btrim(u.email))
  from gps.membros m
  join auth.users u on u.id = m.user_id
 where m.papel = 'socio'
   and m.pessoa_aluno_id is null
   and u.deleted_at is null
   and u.created_at < to_timestamp(1791331200);

create or replace function gps.gerador_sso_dados()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid       uuid := auth.uid();
  v_email     text;
  v_conf      timestamptz;
  v_nome      text;
  v_email_cad text;
  v_desde     timestamptz;
begin
  if v_uid is null then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if exists (select 1 from public.perfis p where p.id = v_uid and p.status = 'ativo') then
    raise exception 'A equipe usa o gerador com o login próprio.' using errcode = '42501';
  end if;

  select lower(btrim(u.email)),
         u.email_confirmed_at,
         nullif(btrim(a.nome), ''),
         lower(btrim(a.email)),
         u.created_at
    into v_email, v_conf, v_nome, v_email_cad, v_desde
    from gps.membros m
    join gps.ambientes amb on amb.aluno_id = m.aluno_id
    join auth.users u      on u.id = m.user_id
    left join public.thb_alunos a
           on a.id = coalesce(m.pessoa_aluno_id,
                              case when m.papel = 'titular' then m.aluno_id end)
   where m.user_id = v_uid
     and m.papel in ('titular', 'socio')
     and u.deleted_at is null
     and (u.banned_until is null or u.banned_until <= now());

  if not found then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if v_email is null or v_email = '' then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if v_conf is null then
    raise exception 'Confirme seu e-mail para usar o gerador de minutas.' using errcode = '42501';
  end if;

  -- 361: sem cadastro → só os sócios congelados em 07/10 (mesmo e-mail).
  -- Cadastro presente → e-mail do login = e-mail do cadastro (358).
  if v_email_cad is null then
    if not exists (select 1 from gps.gerador_sso_socios_2026_10_07 s
                    where s.user_id = v_uid and s.email = v_email) then
      raise exception 'Use o login do gerador.' using errcode = '42501';
    end if;
  elsif v_email_cad <> v_email then
    raise exception 'Use o login do gerador.' using errcode = '42501';
  end if;

  if v_email !~ '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$' then
    raise exception 'Use o login do gerador.' using errcode = '42501';
  end if;

  if coalesce((select c.valor from gps.config c where c.chave = 'gerador_minutas_ativo'),
              'true') = 'false' then
    raise exception 'Gerador indisponível.' using errcode = 'P0001';
  end if;

  -- 359: `desde` antigo só se o par (conta, e-mail) é o congelado em 07/10.
  if not exists (select 1 from gps.gerador_sso_pares_2026_10_07 p
                  where p.user_id = v_uid and p.email = v_email) then
    v_desde := now();
  end if;

  return jsonb_build_object(
    'sub',   v_uid::text,
    'email', v_email,
    'nome',  v_nome,
    'desde', floor(extract(epoch from v_desde))::bigint
  );
end;
$function$;

revoke all on function gps.gerador_sso_dados() from public, anon, authenticated, service_role;
grant execute on function gps.gerador_sso_dados() to authenticated;

comment on function gps.gerador_sso_dados() is
  'SSO GPS -> Gerador (358-361): {sub,email,nome,desde} do PROPRIO caller. Membro titular/socio com ambiente e e-mail confirmado; cadastro presente exige o mesmo e-mail; sem cadastro so os socios congelados em 07/10 (361); equipe recusada; desde antigo so para o par congelado (359). Nunca logar o retorno.';

commit;
