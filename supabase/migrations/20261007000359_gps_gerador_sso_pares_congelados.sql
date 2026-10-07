-- ═══════════════════════════════════════════════════════════════════════════
-- 359 — SSO GPS → Gerador: `desde` antigo só para o par (conta, e-mail)
--       CONGELADO em 07/10/2026 (achado ALTO do kirad, 07/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- O gerador liga AUTOMATICAMENTE o parceiro a uma conta antiga dele com o
-- mesmo e-mail quando `desde` (no passe) é anterior ao corte 1791331200
-- (07/10/2026 00:00 UTC). Na 358, `desde` = auth.users.created_at: a idade da
-- CONTA, não do E-MAIL. A equipe troca o e-mail de login sem prova de posse
-- (`gps.admin_trocar_email_login` carimba `email_confirmed_at`), e a conta
-- continua "antiga". Pedido de suporte com e-mail de terceiro, ou erro de
-- digitação que caia num e-mail real do gerador, = entrar na conta de outra
-- pessoa.
--
-- Remédio: a lista de pares (user_id, e-mail) elegíveis HOJE fica congelada.
-- Só o par que continua igual leva `desde` = created_at; qualquer outro
-- (e-mail trocado depois, conta nova) leva `desde` = now() → o gerador cai na
-- confirmação por e-mail (409). Só o GPS muda; o gerador não precisa saber.
--
-- ── AS 5 PERGUNTAS ─────────────────────────────────────────────────────────
-- 1 Escala: tabela fixa de ~200 linhas, nunca cresce (só a carga desta
--   migração). 2 Índice: PK (user_id) — 1 lookup por passe. 3 Frequência:
--   dezenas/dia. 4 Repetição: 1 lookup a mais na RPC já existente.
-- 5 Reversão: recriar a função da 358 e `drop table gps.gerador_sso_pares_2026_10_07`.
--
-- 🔒 E-mail de parceiro: tabela sem grant e sem policy (só a função
--    SECURITY DEFINER lê).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '5s';
set local statement_timeout = '30s';

create table gps.gerador_sso_pares_2026_10_07 (
  user_id uuid primary key,
  email   text not null
);

comment on table gps.gerador_sso_pares_2026_10_07 is
  'SSO -> Gerador (359): pares (conta GPS, e-mail) elegiveis em 07/10/2026. So eles levam desde = created_at no passe (vinculo automatico no gerador). Congelada: nunca inserir depois. Sem grant/policy.';

alter table gps.gerador_sso_pares_2026_10_07 enable row level security;
revoke all on table gps.gerador_sso_pares_2026_10_07 from public, anon, authenticated, service_role;

-- Mesma elegibilidade de gps.gerador_sso_dados (358), sem o interruptor.
insert into gps.gerador_sso_pares_2026_10_07 (user_id, email)
select distinct on (m.user_id) m.user_id, lower(btrim(u.email))
  from gps.membros m
  join gps.ambientes amb on amb.aluno_id = m.aluno_id
  join auth.users u      on u.id = m.user_id
  join public.thb_alunos a
    on a.id = coalesce(m.pessoa_aluno_id,
                       case when m.papel = 'titular' then m.aluno_id end)
 where m.papel in ('titular', 'socio')
   and u.deleted_at is null
   and (u.banned_until is null or u.banned_until <= now())
   and u.email_confirmed_at is not null
   and u.created_at < to_timestamp(1791331200)
   and lower(btrim(a.email)) = lower(btrim(u.email))
   and lower(btrim(u.email)) ~ '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$'
   and not exists (select 1 from public.perfis p
                    where p.id = m.user_id and p.status = 'ativo');

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

  if v_email_cad is null or v_email_cad <> v_email then
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
  -- E-mail trocado depois (inclusive pela equipe) ou conta nova → now():
  -- o gerador exige confirmação por e-mail antes de ligar a conta antiga.
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

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVAS (07/10/2026, aplicada pela Management API em UTF-8)
-- ═══════════════════════════════════════════════════════════════════════════
-- - Carga: 199 pares (= os 199 elegíveis medidos no mesmo dia).
-- - ACL: função {postgres, authenticated}; tabela só postgres. Sem acento quebrado.
-- - Corpo vivo antes = arquivo da 358 (md5 do corpo sem comentários/espaços igual).
-- - Transação desfeita com JWT do parceiro de QA:
--     par congelado  → desde 1789144010 (< corte: vínculo automático)
--     e-mail trocado (auth.users + thb_alunos) → desde = now() (≥ corte: 409)
--   Depois do rollback: 0 linhas com o e-mail de teste.
