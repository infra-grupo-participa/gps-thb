-- ═══════════════════════════════════════════════════════════════════════════
-- 360 — SSO GPS → Gerador: sócio SEM cadastro próprio também entra sozinho
-- ═══════════════════════════════════════════════════════════════════════════
-- Decisão do João (07/10): "quem entrar no sistema tem que receber um novo
-- acesso, no mínimo" e "de forma indolor para os parceiros".
--
-- Na 358, o passe exigia e-mail do login = e-mail do cadastro (thb_alunos),
-- porque o gerador ligava conta antiga POR E-MAIL. Desde a 359 essa ligação
-- automática só vale para os 199 pares congelados; qualquer outro recebe
-- `desde` = now(), e o gerador nunca liga conta antiga sozinho (409 →
-- confirmação por e-mail). Para conta NOVA não há tomada possível.
--
-- Então a igualdade deixa de ser exigida quando NÃO EXISTE cadastro (os 7
-- sócios sem `pessoa_aluno_id`, medidos em 07/10). Cadastro presente e e-mail
-- DIFERENTE continua recusado (caso Wagner: o e-mail do login pertence, no
-- gerador, a outra pessoa — aguarda conferência da equipe).
--
-- Corpo vivo = arquivo da 359 (conferido antes de aplicar). Só muda a guarda
-- do cadastro.
--
-- 5 PERGUNTAS: escala/índice/frequência iguais à 359 (nenhuma leitura nova).
-- Reversão: reaplicar a função da 359.
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

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

  -- 360: sem cadastro (sócio sem pessoa) passa; cadastro com OUTRO e-mail não.
  if v_email_cad is not null and v_email_cad <> v_email then
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
  'SSO GPS -> Gerador (358/359/360): {sub,email,nome,desde} do PROPRIO caller. Parceiro membro (titular/socio) com ambiente e e-mail confirmado; cadastro presente exige o mesmo e-mail; equipe recusada; desde antigo so para o par congelado em 07/10. Nunca logar o retorno.';

commit;
