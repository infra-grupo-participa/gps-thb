-- 🔴 A chave da API da Resend estava em TEXTO PURO em `gps.config`, legível
-- pelos 16 admins via API REST. Corrigido em 16/09/2026.
--
-- PROVADO antes de corrigir, com JWT de um admin comum:
--   select valor from gps.config where chave = 'resend_api_key'
--     → devolveu a chave inteira.
--
-- NÃO era falha de configuração: `gps.config` tem RLS e a policy é
-- `gp_is_admin()` — o desenho é que admin VÊ a tabela. O erro foi guardar um
-- SEGREDO na mesma tabela dos INTERRUPTORES, que admin deve mesmo ver.
--
-- Com essa chave, qualquer um dos 16 dispara e-mail em nome de
-- `acesso@programa.timeholdingbrasil.com.br`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ⚠️ ESTE ARQUIVO NÃO É EXECUTÁVEL DE PONTA A PONTA — E ISSO É DE PROPÓSITO
-- ═══════════════════════════════════════════════════════════════════════════
-- O passo 1 (pôr o segredo no Vault) foi executado à mão em 16/09/2026 e NÃO
-- é versionado: gravar `vault.create_secret('re_...')` aqui recolocaria a
-- chave em texto puro num arquivo do git — exatamente o problema que esta
-- migração existe para resolver.
--
-- O comando que foi rodado, com o valor OMITIDO:
--
--   select vault.create_secret(
--     '<a chave, lida de gps.config naquele momento>',
--     'gps_resend_api_key',
--     'Chave da API Resend usada por gps.plantao_disparar_emails_sala e
--      gps.plantao_verificar_saude_envio. Movida de gps.config em 16/09/2026.
--      Rotacionar na Resend e atualizar AQUI, nunca em gps.config.'
--   );
--
-- Para recriar o ambiente do zero: crie o segredo `gps_resend_api_key` no
-- Vault com a chave vigente ANTES de aplicar o resto deste arquivo.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- O que ESTE arquivo aplica: a porta única de leitura. Ela busca no Vault e,
-- SÓ durante a transição, cai de volta para `gps.config` — assim o envio do
-- Plantão não para enquanto a linha velha existir.
--
-- ⏭️ PARA FECHAR O CICLO (pendente do Marcio, 16/09/2026):
--    1. rotacionar a chave no painel da Resend (a atual já vazou em print)
--    2. select vault.update_secret(<id>, '<chave nova>')
--    3. delete from gps.config where chave = 'resend_api_key'
--    Aí o fallback deixa de ter o que ler e o ciclo fecha.
--
-- ⚠️ `gps.config.whatsapp_secretaria` guarda um TELEFONE REAL em texto puro,
--    na mesma tabela e com a mesma exposição. Mesmo tratamento — NÃO feito.
--
-- CONFERIDO DEPOIS de aplicar:
--   - vault.secrets tem 1 linha (`gps_resend_api_key`)
--   - gps.resend_api_key() devolve valor IDÊNTICO ao de gps.config
--   - anon e authenticated NÃO executam a função (false / false)
--   - as 2 consumidoras leem do Vault e nenhuma lê mais de gps.config
--   - security definer mantido, grants intactos (postgres, service_role)
--   - cron job 39 (a cada minuto) rodando `succeeded` depois da mudança
--
-- REVERSÃO: drop function gps.resend_api_key(); e devolver às consumidoras a
-- linha `select valor into v_chave from gps.config where chave='resend_api_key';`
-- (o valor segue em gps.config até alguém apagá-lo à mão).

create or replace function gps.resend_api_key()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_chave text;
begin
  -- Vault primeiro: é onde a chave deve viver.
  select decrypted_secret into v_chave
    from vault.decrypted_secrets
   where name = 'gps_resend_api_key'
   limit 1;

  -- Fallback de TRANSIÇÃO: enquanto a linha antiga existir em gps.config, o
  -- envio não pode parar. Apagar essa linha (depois de rotacionar a chave na
  -- Resend) é o que fecha o ciclo — e aí este ramo deixa de achar valor.
  if v_chave is null or btrim(v_chave) = '' then
    select valor into v_chave from gps.config where chave = 'resend_api_key';
  end if;

  return nullif(btrim(coalesce(v_chave, '')), '');
end;
$function$;

comment on function gps.resend_api_key() is
  'Porta UNICA de leitura da chave da Resend (16/09/2026). Le do vault.decrypted_secrets (nome gps_resend_api_key) e, so enquanto durar a transicao, cai para gps.config. 🔴 NUNCA conceder a authenticated/anon: quem precisa e funcao security definer, que roda como dono. Rotacionar a chave = vault.update_secret, nunca voltar a gravar em gps.config.';

-- 🔴 Segredo não se lê pela API. Só o dono (e as funções definer dele).
revoke all on function gps.resend_api_key() from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- As 2 consumidoras passam a ler da porta única.
-- ═══════════════════════════════════════════════════════════════════════════
-- 🔑 Aplicadas por REESCRITA PROGRAMÁTICA, não à mão: são funções longas (a
--    de disparo tem ~600 linhas) e reescrever manualmente é onde se perde
--    comportamento sem perceber. O bloco pega `pg_get_functiondef`, troca só
--    a linha da leitura e ABORTA se o trecho não existir — garantindo que o
--    resto do corpo fica idêntico ao que estava no ar.
--
-- Idempotente: se as funções já leem de gps.resend_api_key(), o `replace` não
-- encontra o trecho antigo e o bloco aborta com mensagem clara em vez de
-- aplicar mudança cega.

do $$
declare v_def text; v_nova text; v_fn text;
begin
  foreach v_fn in array array['plantao_verificar_saude_envio','plantao_disparar_emails_sala']
  loop
    select pg_get_functiondef(p.oid) into v_def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'gps' and p.proname = v_fn;

    if v_def is null then
      raise exception 'gps.% nao existe -- abortado', v_fn;
    end if;

    v_nova := replace(v_def,
      'select valor into v_chave from gps.config where chave = ''resend_api_key'';',
      'v_chave := gps.resend_api_key();  -- Vault (16/09/2026), nao mais gps.config');

    if v_nova = v_def then
      raise exception
        'trecho de leitura da chave nao encontrado em gps.% -- abortado para nao aplicar mudanca cega (ja migrada?)',
        v_fn;
    end if;

    execute v_nova;
  end loop;
end $$;
