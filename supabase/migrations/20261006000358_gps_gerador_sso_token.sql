-- ═══════════════════════════════════════════════════════════════════════════
-- 358 — Acesso único ao Gerador de Minutas (sistema à parte, Supabase próprio,
--       Lovable) quando o PARCEIRO abre /gerador-de-minutas no GPS
-- ═══════════════════════════════════════════════════════════════════════════
-- Os dois sistemas seguem independentes. Cooperam por um JWT ES256 (ECDSA
-- P-256) de 60 s. A CHAVE PRIVADA fica só no GPS (env GERADOR_SSO_PRIVADA da
-- edge `gerador-sso`); o gerador confere com a chave PÚBLICA fixa no código
-- dele (recusa HS256/none/assinatura inválida com 401) e queima o jti.
-- Nenhum segredo compartilhado, nada no Vault.
--
-- Caminho: page.tsx (servidor) ou /gerador-de-minutas/abrir (route handler)
--   → edge `gerador-sso` (verify_jwt = true) com o JWT do parceiro
--   → gps.gerador_sso_dados() com o MESMO JWT (guardas abaixo)
--   → a edge assina e devolve o token
--   → https://gmthb.holdingmasters.com.br/sso#t=<token>&next=/dashboard
--   (FRAGMENTO: não vai a log de servidor nem a Referer).
--
-- Esta função NÃO assina nada: só decide QUEM pode e devolve
-- {sub, email, nome}. Regras:
--   - sem auth.uid() → 42501;
--   - equipe (gp_is_admin) → 42501: o login do gerador é PESSOAL do parceiro;
--   - só membro do GPS (titular ou sócio) com ambiente existente;
--   - e-mail confirmado no login;
--   - e-mail do login = e-mail do cadastro (thb_alunos) — ver o 🔴 no corpo;
--   - interruptor gerador_minutas_ativo = 'false' → P0001 (defesa em
--     profundidade: a RPC é chamável direto pelo PostgREST).
--
-- 🔒 Devolve e-mail e nome do PRÓPRIO caller — nada de terceiro. Nunca logar.
--
-- ── AS 5 PERGUNTAS ─────────────────────────────────────────────────────────
-- 1 Escala: uma chamada por abertura da aba / clique em "tela cheia" —
--   dezenas por dia. Sem escrita.
-- 2 Índice: gps.membros por user_id (unique → índice), gps.ambientes por PK
--   (aluno_id), public.thb_alunos por PK, auth.users por PK,
--   gps.config por PK (chave), perfis por PK.
-- 3 Lock: nenhum (só leitura).
-- 4 Volume de resposta: 1 jsonb de ~150 bytes.
-- 5 Reversão: drop function gps.gerador_sso_dados(); — a edge devolve erro e
--   o Next cai no /dashboard com login manual.
--
-- ROLLBACK:
--   drop function if exists gps.gerador_sso_dados();
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

  -- kirad 06/10: QUALQUER perfil ativo da equipe (não só dev/admin) fica fora.
  if exists (select 1 from public.perfis p where p.id = v_uid and p.status = 'ativo') then
    raise exception 'A equipe usa o gerador com o login próprio.' using errcode = '42501';
  end if;

  -- Membro do GPS (titular ou sócio) com ambiente existente. user_id é unique.
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

  -- 🔴 (06/10) O GPS tem mailer_autoconfirm=true: email_confirmed_at NÃO prova
  -- posse do e-mail, e o gerador casa a conta por e-mail. Só emite passe quando
  -- o e-mail do login = o do cadastro (thb_alunos). Medido: 199 de 207 batem;
  -- os 8 restantes (7 sócios sem cadastro, 1 titular) seguem com login manual.
  if v_email_cad is null or v_email_cad <> v_email then
    raise exception 'Use o login do gerador.' using errcode = '42501';
  end if;

  -- kirad 06/10: formato estrito (homóglifo/espaço divergiriam entre lower() do PG e do JS).
  if v_email !~ '^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$' then
    raise exception 'Use o login do gerador.' using errcode = '42501';
  end if;

  if coalesce((select c.valor from gps.config c where c.chave = 'gerador_minutas_ativo'),
              'true') = 'false' then
    raise exception 'Gerador indisponível.' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'sub',   v_uid::text,
    'email', v_email,
    'nome',  v_nome,
    -- 'desde' (epoch da conta GPS): o gerador só liga AUTOMATICAMENTE a uma conta
    -- antiga dele se a conta GPS existia antes do SSO (anti tomada de conta).
    'desde', floor(extract(epoch from v_desde))::bigint
  );
end;
$function$;

revoke all on function gps.gerador_sso_dados() from public, anon, authenticated, service_role;
grant execute on function gps.gerador_sso_dados() to authenticated;

comment on function gps.gerador_sso_dados() is
  'SSO GPS -> Gerador de Minutas (358): devolve {sub, email, nome} do PROPRIO caller para a edge gerador-sso assinar o JWT ES256. So parceiro membro (titular/socio) com ambiente, e-mail confirmado e e-mail do login = thb_alunos.email; equipe recusada (login pessoal). Nunca logar o retorno.';

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVAS (rodar à mão, em begin … rollback; NADA aqui é aplicado)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1) ACL: só authenticated executa (anon sem execute; PUBLIC fora).
--   select r.rolname,
--          has_function_privilege(r.rolname, 'gps.gerador_sso_dados()', 'execute')
--     from pg_roles r where r.rolname in ('anon','authenticated','service_role');
--   -- esperado: anon f · authenticated t · service_role f
--   select p.proacl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname = 'gerador_sso_dados';
--   -- esperado: sem entrada "=X/…" (PUBLIC)
--
-- 2) Sem JWT → 42501.
--   begin;
--   set local role authenticated;
--   select set_config('request.jwt.claims', '', true);
--   select gps.gerador_sso_dados();   -- ERROR 42501 Sem permissão.
--   rollback;
--
-- 3) Parceiro real (e-mail do login = cadastro) → {sub, email, nome} + tempo.
--   begin;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', m.user_id, 'role', 'authenticated')::text, true)
--     from gps.membros m
--     join auth.users u on u.id = m.user_id
--     join public.thb_alunos a on a.id = m.aluno_id
--    where m.papel = 'titular' and u.email_confirmed_at is not null
--      and lower(btrim(u.email)) = lower(btrim(a.email))
--      and not exists (select 1 from public.perfis p where p.id = m.user_id)
--    limit 1;
--   set local role authenticated;
--   select gps.gerador_sso_dados();
--   -- esperado: sub = user_id, email minúsculo, nome do cadastro.
--   explain (analyze, buffers) select gps.gerador_sso_dados();
--   rollback;
--
-- 4) E-mail do login ≠ cadastro → 42501 "Use o login do gerador."
--   (mesmo bloco do 3 com `lower(btrim(u.email)) <> lower(btrim(a.email))`)
--
-- 5) Admin → 42501 "A equipe usa o gerador com o login próprio."
--   begin;
--   select set_config('request.jwt.claims',
--     json_build_object('sub', p.id, 'role', 'authenticated')::text, true)
--     from public.perfis p where p.status = 'ativo' and p.cargo in ('dev','admin') limit 1;
--   set local role authenticated;
--   select gps.gerador_sso_dados();
--   rollback;
