-- ═══════════════════════════════════════════════════════════════════════════
-- Correções do pentest da feature Equipe (REPROVADO → corrigido)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## MÉDIO — guarda cross-sistema incompleta
--
-- `gps.admin_alvo_e_equipe(uuid)` só olha `public.perfis` (equipe do GPS/sip)
-- e precisa de um `auth.users` para casar. Mas `auth.users` é compartilhado
-- pelos 7 sistemas, e as tabelas de equipe dos OUTROS guardam o e-mail mesmo
-- de quem nunca logou.
--
-- **O vetor:** um titular convida `admin-de-outro-sistema@…` que ainda não tem
-- `auth.users`. A guarda de equipe não dispara (só olha `perfis`); a guarda de
-- "já tem login" não dispara (não tem login). A pessoa vira sócia do ambiente
-- de um parceiro, com senha criada pelo convite.
--
-- 🔑 MEDIDO ANTES DE CORRIGIR — o vetor NÃO existe hoje:
--      perfis (GPS/sip)   19 de equipe · 0 sem auth.users
--      rede.perfis        19 admins    · 0 sem auth.users
--      workbook.perfis     1 de equipe · 0 sem auth.users
-- Toda a equipe já tem login e cairia na segunda trava. Os 1.476 registros de
-- `rede.perfis` sem `auth.users` são **alunos**, não equipe.
--
-- Corrigido assim mesmo: isso é um retrato, não uma garantia — basta cadastrar
-- um admin que ainda não logou. E a mesma classe de achado já custou correção
-- em `definirSenhaMembro`/`adicionarSocioAluno` (migração …218).
--
-- `gps.email_e_de_equipe(text)` casa por E-MAIL (não por `user_id`, como
-- `admin_programas_do_email`) — é exatamente o que falta: quem não tem login
-- não tem `user_id` para casar.
--
-- ## BAIXO — corrida no insert de auth.users
--
-- Dois aceites simultâneos do mesmo e-mail (convites de ambientes diferentes)
-- passam os dois pela checagem "já tem login", e o segundo estoura
-- `unique_violation` crua do GoTrue → "Já existe um registro com esses dados",
-- que não diz o que fazer. Agora o `exception when unique_violation` traduz
-- para a MESMA frase da checagem.
--
-- PROVA (em rollback, com o vetor construído de propósito):
--   admin da Rede SEM auth.users → criar recusou "Este e-mail é da equipe"
--   e-mail comum                 → continua funcionando (token gerado)
--   revalidação 6/6: teto · recusa genérica · não-adoção · aceite · reuso
--
-- REVERSÃO: `drop function gps.email_e_de_equipe(text)` e recriar as duas RPCs
-- sem a chamada (o corpo anterior está na migração …244).

create or replace function gps.email_e_de_equipe(p_email text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  with e as (select lower(trim(p_email)) as email)
  select
    exists (select 1 from public.perfis p, e
             where lower(trim(p.email)) = e.email
               and p.status = 'ativo' and p.cargo in ('dev','admin'))
    or exists (select 1 from rede.perfis r, e
                where lower(trim(r.email)) = e.email and r.papel = 'admin')
    or exists (select 1 from workbook.perfis w, e
                where lower(trim(w.email)) = e.email
                  and w.role in ('admin','dev','editor'));
$function$;

revoke execute on function gps.email_e_de_equipe(text) from public, anon, authenticated;

comment on function gps.email_e_de_equipe(text) is
  'Interna: o e-mail pertence a alguem de EQUIPE em algum sistema do grupo? Casa por E-MAIL (nao por user_id, como admin_programas_do_email) porque o vetor e justamente quem NAO tem auth.users ainda. Usada por socio_convite_criar e socio_convite_aceitar. Achado MEDIO do pentest de 11/09/2026.';

-- ⚠️ As duas RPCs foram atualizadas no banco por substituição textual sobre
-- `pg_get_functiondef` (nunca recopiando corpo de migration antiga — a regra
-- da …234). O que mudou em cada uma:
--
--   socio_convite_criar:
--     if gps.email_e_de_equipe(v_email) or exists ( … admin_alvo_e_equipe … )
--
--   socio_convite_aceitar (dentro da recusa genérica):
--     or gps.email_e_de_equipe(v_email)
--     or exists ( … admin_alvo_e_equipe … )
--
--   socio_convite_aceitar (volta do insert de auth.users):
--     begin insert into auth.users (…) … ;
--     exception when unique_violation then
--       raise exception 'Este e-mail já tem acesso aos sistemas do grupo. …';
--     end;
--
-- Conferência de que está no ar:
--   select p.proname, pg_get_functiondef(p.oid) ~ 'email_e_de_equipe'
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname in ('socio_convite_criar','socio_convite_aceitar');
--   -- ESPERADO: as duas com `true`.
