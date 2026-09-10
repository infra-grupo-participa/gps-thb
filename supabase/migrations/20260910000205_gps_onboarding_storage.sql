-- Bucket e policies do anexo do questionário inicial.
--
-- MOLDE: `gps-chamados` (migração ...112), que já foi auditado duas vezes.
-- Privado, 5 MB, 4 MIMEs, caminho `<uuid>/<uuid>.<ext>`, policies por prefixo,
-- MIME/tamanho conferidos em `storage.objects.metadata` pela RPC, `download=`
-- em todo link. BUCKET NOVO e não o `gps-documentos` órfão: aquele está SEM
-- file_size_limit e SEM allowed_mime_types e carrega o histórico do fichário
-- removido em 07/2026 (M8 confirmou que segue órfão — não tocar).
--
-- C-2 — O CONTRATO É PROVA, NÃO FICHÁRIO
--   A decisão de 07/2026 ("documento do cliente vive no Drive") CONTINUA
--   VALENDO. O que entra aqui é a PROVA que destrava "execução em andamento",
--   porque o João pediu o gate ("sem isso ele não pode avançar") e um gate
--   satisfeito por link colável não é gate. `etapa1_clientes.contrato_url`
--   (link do Drive) continua sendo o lugar do documento.
--
-- PREFIXO = `ambiente_aluno_id`, NÃO a pessoa
--   Mantém as guardas idênticas às do chamado (`gps.aluno_atual()`), que já
--   foram auditadas. Consequência assumida: quem lê é o admin e OS MEMBROS DO
--   AMBIENTE — o sócio lê o contrato do titular. É o mesmo ambiente e o mesmo
--   cliente 1; o Financeiro é exceção por ser contrato do titular com a
--   EMPRESA, e aqui não é o caso.
--
-- TRÊS CAMADAS, NA ORDEM EM QUE PEGAM (idêntico ao chamado):
--   1) o BUCKET recusa por tamanho (5 MB) e por MIME (4 tipos) — vale para
--      qualquer caminho de upload, inclusive o direto do navegador;
--   2) a POLICY de insert recusa por CAMINHO (regex + prefixo tem de ser o
--      ambiente do próprio aluno) e por ESTADO (só quem tem questionário em
--      andamento anexa: depois de concluído, o bucket fecha para aquela pessoa);
--   3) a RPC (...206) confere que o objeto EXISTE, lê tamanho e MIME REAIS de
--      storage.objects.metadata e recusa se não casar com a extensão. É a
--      camada que impede anexo fantasma e Content-Type mentiroso.
--
-- SÓ O ALUNO ANEXA. A equipe não anexa aqui (B5-c do chamado, mesma regra):
--   ela responde com texto e link, já tem o Drive. Reverter é `or
--   public.gp_is_admin()` em gps.pode_anexar_onboarding.
--
-- AS DUAS GUARDAS FALHAM FECHADO (`exception when others then return false`):
--   policy que levanta erro no meio de um SELECT do storage é indistinguível,
--   para quem chama, de policy que autoriza — e nome de objeto é entrada de
--   usuário (`../`, `%2e%2e`, byte nulo, 4 KB de nome). Qualquer imprevisto NEGA.
--
-- RETENÇÃO — B-R1, pendente do João. Padrão provisório em vigor: o arquivo
--   fica enquanto a pessoa estiver no programa; o expurgo é POR CLIQUE DO
--   ADMIN, nunca por pg_cron (apagar a linha de storage.objects por SQL NÃO
--   apaga o byte no object store — um cron reportaria sucesso e deixaria o
--   arquivo). O botão de expurgo em massa fica FORA desta rodada; a policy de
--   DELETE para admin já existe, que é o que o expurgo precisa quando vier.
--
-- ⚠️ NÃO TOCAR nas policies `documentos_public_*` nem no bucket `documentos`:
--   são do sip. Esta migração só cria objetos com prefixo `gps_onboarding_`.
--
-- O QUE NÃO FAZ: não cria tabela, não escreve linha de anexo, não apaga bucket
--   nenhum, não concede nada a `anon` (nem select: bucket privado, leitura só
--   por URL assinada emitida com a sessão de quem passa na policy).
--
-- REVERSÃO: drop das 3 policies + das 2 funções. O bucket FICA, sem policy,
--   inacessível a todo mundo — que é exatamente o estado seguro.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gps-onboarding','gps-onboarding', false, 5242880,
        array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do update
   set public             = false,
       file_size_limit    = 5242880,
       allowed_mime_types = array['image/png','image/jpeg','image/webp','application/pdf'];

-- ─────────────────────────────────────────────────────────────────────────
-- Guardas — chamadas pelas policies de storage.objects
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.pode_ver_anexo_onboarding(p_name text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare v_prefixo text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if v_prefixo !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;                        -- nome fora do formato: nem tenta
  end if;
  return coalesce(public.gp_is_admin(), false)
      or gps.aluno_atual() = v_prefixo::uuid;
exception when others then
  return false;                          -- qualquer imprevisto NEGA
end;
$$;

comment on function gps.pode_ver_anexo_onboarding(text) is
  'Quem le um anexo do questionario inicial: admin ou membro do AMBIENTE cujo aluno_id e o PREFIXO do caminho (titular e socio, portanto). SECURITY INVOKER -- gps.aluno_atual() e gp_is_admin() ja resolvem pela sessao. Falha FECHADO: nome de objeto e entrada de usuario.';

create or replace function gps.pode_anexar_onboarding(p_name text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(p_name, '') !~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|pdf)$'
  then
    return false;
  end if;

  -- SÓ O ALUNO ANEXA. Para liberar a equipe: `or public.gp_is_admin()` aqui e
  -- nada mais — é a reversão inteira da decisão.
  --
  -- E SÓ ENQUANTO O QUESTIONÁRIO ESTIVER EM ANDAMENTO: o bucket não é
  -- armazenamento livre do aluno. Depois de concluído, a pessoa não sobe mais
  -- nada por aqui (trocar o contrato depois é assunto da equipe, pelo
  -- Suporte). É o equivalente ao interruptor `gps.chamados_abertos()` do
  -- chamado, mas por PESSOA em vez de global.
  return gps.aluno_atual() = split_part(p_name, '/', 1)::uuid
     and exists (
           select 1 from gps.onboarding_respostas r
            where r.pessoa_aluno_id = gps.pessoa_atual()
              and r.concluido_em is null
         );
exception when others then
  return false;
end;
$$;

comment on function gps.pode_anexar_onboarding(text) is
  'Quem ESCREVE no bucket gps-onboarding: so o aluno do ambiente que e prefixo do caminho, e so enquanto o questionario DAQUELA PESSOA estiver em andamento (concluido_em is null). Admin NAO anexa (mesma regra do chamado, B5-c). Exige o formato exato <uuid>/<uuid>.<ext>: sem isso `../` e nome arbitrario chegariam ate aqui. Falha FECHADO.';

revoke execute on function gps.pode_ver_anexo_onboarding(text) from public, anon;
revoke execute on function gps.pode_anexar_onboarding(text)   from public, anon;
grant  execute on function gps.pode_ver_anexo_onboarding(text) to authenticated;
grant  execute on function gps.pode_anexar_onboarding(text)   to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Policies em storage.objects — as três, e só estas
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists gps_onboarding_anexo_select       on storage.objects;
drop policy if exists gps_onboarding_anexo_insert       on storage.objects;
drop policy if exists gps_onboarding_anexo_delete_admin on storage.objects;

create policy gps_onboarding_anexo_select on storage.objects
  for select to authenticated
  using (bucket_id = 'gps-onboarding' and gps.pode_ver_anexo_onboarding(name));

create policy gps_onboarding_anexo_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gps-onboarding' and gps.pode_anexar_onboarding(name));

-- DELETE só para o admin: é o que torna o expurgo de retenção (B-R1) possível
-- pela Storage API com a sessão do admin — o GPS não usa `service_role`.
-- O aluno NÃO apaga o próprio anexo: `gps.onboarding_remover_anexo` tira a
-- LINHA da lista, e o BYTE fica até o expurgo. A UI diz isso; fingir que o
-- arquivo sumiu seria mentira (SQL não apaga byte no object store).
-- SEM policy de UPDATE: ninguém sobrescreve um anexo depois de enviado
-- (`upsert: true` no mesmo caminho tem de falhar).
create policy gps_onboarding_anexo_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'gps-onboarding' and coalesce(public.gp_is_admin(), false));
