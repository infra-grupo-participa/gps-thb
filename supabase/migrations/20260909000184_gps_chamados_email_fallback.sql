-- Chamados — o aviso de chamado novo nunca mais fica silencioso.
--
-- 🔴 O QUE FOI MEDIDO EM 09/09/2026
--   `gps.config.chamados_email_equipe` = VAZIA e a env `EMAIL_SUPORTE`
--   também. As duas, desde que a feature entrou. O código trata isso bem —
--   registra o chamado, chama `logErro` e mostra aviso vermelho em
--   `/admin/chamados` —, mas **esse aviso só aparece para quem ABRE aquela
--   tela**. Na prática: o aluno abre um chamado e a equipe só descobre se
--   alguém lembrar de olhar a fila. Ninguém olhou.
--
--   Hoje há 0 chamados, então nada foi perdido. Mas o canal está aberto
--   (`chamados_aberto = true`), e o primeiro chamado real cairia no vazio.
--
-- O QUE ESTA MIGRATION FAZ
--   Uma TERCEIRA fonte de destinatário, consultada só quando as duas
--   primeiras estão vazias: `gps.config.chamados_email_fallback`.
--
--   Ordem final em `avisarEquipe` (`src/app/chamados/actions.ts`):
--     1. gps.config.chamados_email_equipe   (a equipe edita em /admin/chamados)
--     2. env EMAIL_SUPORTE                   (painel da Hostinger)
--     3. gps.config.chamados_email_fallback  ← esta
--   Com as três vazias, aí sim `logErro` — mas aí é decisão, não descuido.
--
-- ⚠️ POR QUE UMA RPC, E NÃO UM SELECT DIRETO
--   Primeira tentativa foi ler `gps.config` direto da Server Action. NÃO
--   FUNCIONA: a policy da tabela é `gp_is_admin()`, e quem abre um chamado é
--   o ALUNO. A leitura voltaria vazia **em silêncio** — exatamente a falha
--   que este fallback existe para eliminar. Pego na conferência de grants,
--   antes de ir para produção.
--
--   A função é SECURITY DEFINER e expõe **SÓ esta chave**, nunca a tabela:
--   `gps.config` guarda a `resend_api_key`. Verificado depois de aplicar:
--   `authenticated` lê pela RPC, NÃO lê a tabela, e `anon` não executa nada.
--
-- O FALLBACK NÃO SUBSTITUI A CONFIGURAÇÃO CERTA. A equipe deve preencher
-- `chamados_email_equipe` em `/admin/chamados` (sem deploy). Ele existe para
-- o chamado nunca ficar SILENCIOSO enquanto isso não acontece.
--
-- REVERSÃO
--   drop function if exists gps.chamados_email_fallback();
--   delete from gps.config where chave = 'chamados_email_fallback';
--   (e remover o terceiro ramo de `avisarEquipe`)

begin;

insert into gps.config (chave, valor)
values ('chamados_email_fallback', 'marcio@advmais.com')
on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();

create or replace function gps.chamados_email_fallback()
returns text
language sql
stable
security definer
set search_path to ''
as $fn$
  select coalesce(
    (select c.valor from gps.config c where c.chave = 'chamados_email_fallback'),
    '');
$fn$;

comment on function gps.chamados_email_fallback() is
  'Ultimo destinatario do aviso de chamado novo, quando chamados_email_equipe e EMAIL_SUPORTE estao vazios. SECURITY DEFINER porque gps.config so e legivel por admin e quem abre chamado e o ALUNO -- ler direto devolveria vazio em silencio. Expoe SO esta chave: config guarda a resend_api_key.';

revoke execute on function gps.chamados_email_fallback() from public, anon;
grant  execute on function gps.chamados_email_fallback() to authenticated;

commit;
