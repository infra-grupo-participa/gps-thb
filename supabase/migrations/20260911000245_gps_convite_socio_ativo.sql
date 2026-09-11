-- ═══════════════════════════════════════════════════════════════════════════
-- O parceiro precisa LER o interruptor da feature Equipe
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 🔴 Achado na integração front×banco (11/09/2026), antes de publicar.
--
-- A aba Equipe precisa saber se o convite está liberado para decidir se mostra
-- o botão "Convidar meu sócio". A primeira versão do front lia
-- `gps.config` direto — e **nunca funcionaria**: a única policy da tabela é
-- `gps_config_admin` (`gp_is_admin()`). Medido com JWT real de titular:
--
--     linhas de gps.config visíveis ao parceiro: 0
--
-- Ou seja, a leitura cairia no fallback seguro (`false`) para sempre, e o
-- botão não apareceria NEM COM A FEATURE LIGADA. Falha silenciosa: nenhum
-- erro na tela, nenhuma linha no log — só um botão que nunca aparece.
--
-- Esta função é o molde EXATO de `gps.chamados_abertos()` (Fase 6, 09/09),
-- que existe pelo mesmo motivo: expor UM booleano de configuração ao aluno
-- sem abrir a tabela inteira — onde moram `resend_api_key` e `email_from`
-- (o achado V11 da mega feature: a policy só-admin deixa 16 admins lerem a
-- chave da Resend pela REST; não é para crescer esse número).
--
-- Falha fechado nos dois lados: a função devolve `false` se a chave sumir, e
-- o `catch` do front esconde o botão se a chamada falhar.
--
-- REVERSÃO: `drop function gps.convite_socio_ativo();`

create or replace function gps.convite_socio_ativo()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (select valor = 'true' from gps.config where chave = 'convite_socio_ativo'),
    false
  );
$function$;

revoke execute on function gps.convite_socio_ativo() from public, anon;
grant  execute on function gps.convite_socio_ativo() to authenticated;

comment on function gps.convite_socio_ativo() is
  'Interruptor da feature Equipe, legivel por qualquer usuario autenticado. Existe porque gps.config so tem policy de admin e a tabela guarda segredos (resend_api_key, email_from) -- expor a linha inteira seria vazamento. Molde de gps.chamados_abertos(). Falha fechado: chave ausente devolve false.';
