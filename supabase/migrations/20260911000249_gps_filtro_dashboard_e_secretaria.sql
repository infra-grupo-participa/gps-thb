-- ═══════════════════════════════════════════════════════════════════════════
-- Demandas 1, 2 e 4 do Marcio (11/09/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## 2. `gps.admin_dashboard` — acesso por PAPEL no bloco `equipe`
--
-- > "o dashboard exiba o total de acessos, porém em submétricas quem é
-- >  titular de quem é sócio"
--
-- O bloco `acesso` conta AMBIENTES; este conta PESSOAS por papel. Acrescenta
-- `titulares_ja_entraram`, `socios_ja_entraram`, `titulares_ativos_30d` e
-- `nunca_entraram` à MESMA varredura de `gps.membros` que o bloco `equipe`
-- já fazia — nenhuma consulta nova.
--
-- Medido: **1,12 ms quente**. ⚠️ A primeira medição deu 114 ms e era CACHE
-- FRIO (`users_pkey` a 0,7 ms por linha); a segunda, com o mesmo plano, deu
-- 1,12 ms. Registro porque quase virou uma otimização desnecessária.
--
-- 🔑 `nunca_entraram` usa exatamente o mesmo corte do filtro `nunca_entrou`
-- da lista (tem `user_id` e `last_sign_in_at is null`) — os dois números
-- nunca podem divergir, senão o card manda a equipe procurar gente que o
-- filtro não acha.
--
-- ## 4. Contato da secretaria
--
-- `gps.config.whatsapp_secretaria` = 5521988656552, com
-- `gps.whatsapp_secretaria()` para o PARCEIRO ler.
--
-- 🔴 Sem a função, o botão nunca apareceria: a única policy de `gps.config` é
-- `gp_is_admin()`, e o parceiro enxerga **0 linhas** (medido). É o mesmo erro
-- que quase foi ao ar na aba Equipe, e a mesma solução de
-- `chamados_abertos()` / `convite_socio_ativo()` — devolver UM valor sem
-- abrir a tabela onde moram `resend_api_key` e `email_from`.
--
-- Falha fechado: sem número, devolve NULL e o botão some (melhor ausente do
-- que abrindo conversa vazia).
--
-- ## 1. Filtro "Nunca entrou" — só no TypeScript
--
-- Nada de banco: `ultimoAcesso` já vem da RPC do painel e `ordenacao.ts` já
-- trata `null` como "nunca entrou". O filtro entrou na allowlist de
-- `estado-na-url.ts` e em `filtros.ts`.
--
-- ⚠️ NÃO confundir com o `sem_login` que já existia: aquele é "conta nem
-- existe" (1 hoje), este é "tem conta e nunca abriu o portal". Dois estados,
-- duas ações da equipe.
--
-- REVERSÃO: remover as 4 chaves do bloco `equipe`; `drop function
-- gps.whatsapp_secretaria()`; tirar `nunca_entrou` da allowlist.
--
-- ⚠️ Retrato: `admin_dashboard` foi atualizada por substituição textual sobre
-- `pg_get_functiondef` (padrão da casa). Conferência:
--   select pg_get_functiondef(p.oid) ~ 'titulares_ja_entraram'
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='gps' and p.proname='admin_dashboard';  -- true

insert into gps.config (chave, valor)
values ('whatsapp_secretaria', '5521988656552')
on conflict (chave) do nothing;

create or replace function gps.whatsapp_secretaria()
returns text
language sql
stable
security definer
set search_path to ''
as $function$
  select nullif(btrim(coalesce(
    (select valor from gps.config where chave = 'whatsapp_secretaria'), '')), '');
$function$;

revoke execute on function gps.whatsapp_secretaria() from public, anon;
grant  execute on function gps.whatsapp_secretaria() to authenticated;

comment on function gps.whatsapp_secretaria() is
  'Numero de WhatsApp da secretaria para o botao flutuante do portal. Existe porque gps.config so tem policy de admin e a tabela guarda segredos. Devolve NULL quando nao configurado: o botao some em vez de abrir conversa vazia.';
