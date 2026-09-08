-- Corrige o GRANT das 2 RPCs do aviso à mentora (migração ...030).
--
-- 🔴 Sem isto, a metade "avisar a mentora" da migração ...030 estava MORTA em
-- produção, e pior: morta EM SILÊNCIO.
--
-- O que aconteceu: dei `grant execute ... to authenticated` nas duas funções
-- novas. Mas o job diário (`/api/plantao/manutencao`) é chamado por `pg_cron`
-- via HTTP, SEM sessão — ele fala com o PostgREST usando a
-- `NEXT_PUBLIC_SUPABASE_ANON_KEY`, ou seja, no papel **anon**, nunca
-- `authenticated`. Toda chamada morreria com 42501 no PostgREST antes mesmo de
-- chegar na checagem de segredo.
--
-- E o route trata esse erro como não-fatal (`console.error` e segue, para o
-- expurgo rodar de todo jeito), então o job responderia **ok:true todo dia sem
-- avisar mentora nenhuma** — exatamente o modo de falha que o comentário do
-- próprio route (linhas ~78-82) chama de o pior para rotina automática:
-- ninguém investiga o que diz que deu certo.
--
-- As 3 RPCs de manutenção anteriores (`plantao_nps_pendente`,
-- `plantao_marcar_nps_enviado`, `plantao_expurgar`, migração
-- 20260901000003) já tinham `grant ... to anon, authenticated`. O padrão do
-- projeto estava certo; as duas novas é que saíram fora dele.
--
-- ⚠️ Dar execute a `anon` NÃO afrouxa a segurança aqui — é o desenho do
-- módulo. `anon` é o papel de qualquer chamada ao PostgREST do schema
-- exposto; a proteção real destas funções é o `p_segredo` conferido contra
-- `app.plantao_manutencao_segredo` no banco, que falha FECHADO quando o
-- setting não existe. Sem o segredo certo, `anon` não consegue nada.
--
-- Achado do `security-pentester` em 08/09/2026, antes de abrir para os 421.
--
-- Reversão: trocar `to anon, authenticated` por `to authenticated`
-- (não recomendado — volta a matar o aviso em silêncio).

grant execute on function gps.plantao_aviso_mentora_pendente(text)
  to anon, authenticated;

grant execute on function gps.plantao_marcar_aviso_mentora(text, uuid)
  to anon, authenticated;
