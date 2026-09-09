-- Bucket e policies do anexo de chamado.
--
-- BUCKET NOVO, não o `gps-documentos` órfão (B5-b): aquele está SEM
-- file_size_limit e SEM allowed_mime_types, e carrega o histórico do fichário
-- removido em 07/2026. Nascer com limite é mais barato do que endurecer o velho.
-- Esta migração NÃO apaga o gps-documentos (o Postgres do Supabase bloqueia
-- delete direto em storage.buckets; sai pelo dashboard) -- ele continua inerte,
-- sem policy nenhuma, e a remoção é tarefa à parte.
--
-- TRÊS CAMADAS, NA ORDEM EM QUE PEGAM:
--   1) o BUCKET recusa por tamanho (5 MB) e por MIME (4 tipos) -- vale para
--      qualquer caminho de upload, inclusive o direto do navegador;
--   2) a POLICY de insert recusa por CAMINHO (regex do formato + prefixo tem de
--      ser o ambiente do próprio aluno) e pelo INTERRUPTOR;
--   3) a RPC (...111) confere que o objeto existe de verdade, lê o tamanho e o
--      MIME REAIS de storage.objects.metadata e recusa se não casar com a
--      extensão. É a camada que impede anexo fantasma e Content-Type mentiroso.
--
-- SÓ O ALUNO ANEXA (B5-c). A equipe responde com texto e link -- ela já tem o
-- Drive. Isso é metade da superfície de upload e metade do crescimento de
-- storage. Reverter é UMA linha: `or public.gp_is_admin()` em
-- gps.pode_anexar_chamado.
--
-- AS DUAS GUARDAS FALHAM FECHADO (`exception when others then return false`):
-- uma policy que levanta erro no meio de um SELECT do storage é indistinguível,
-- para quem chama, de uma policy que autoriza -- e nome de objeto é entrada de
-- usuário (`../`, `%2e%2e`, byte nulo, 4 KB de nome). Qualquer imprevisto NEGA.
--
-- ⚠️ NÃO TOCAR nas policies `documentos_public_*` nem no bucket `documentos`:
-- são do sip. Esta migração só cria objetos com prefixo `gps_chamados_`.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ: não cria tabela, não escreve linha de anexo, não
-- apaga bucket nenhum, não concede nada a `anon` (nem select: bucket privado,
-- leitura só por URL assinada emitida com a sessão de quem tem a policy).
--
-- REVERSÃO: drop das 3 policies + das 2 funções. O bucket FICA, sem policy,
-- inacessível a todo mundo -- que é exatamente o estado seguro.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gps-chamados','gps-chamados', false, 5242880,
        array['image/png','image/jpeg','image/webp','application/pdf'])
on conflict (id) do update
   set public             = false,
       file_size_limit    = 5242880,
       allowed_mime_types = array['image/png','image/jpeg','image/webp','application/pdf'];

-- ─────────────────────────────────────────────────────────────────────────
-- Guardas — chamadas pelas policies de storage.objects
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.pode_ver_anexo_chamado(p_name text)
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
  return public.gp_is_admin() or gps.aluno_atual() = v_prefixo::uuid;
exception when others then
  return false;                          -- qualquer imprevisto NEGA
end;
$$;

comment on function gps.pode_ver_anexo_chamado(text) is
  'Quem le um anexo de chamado: admin ou membro do ambiente cujo aluno_id e o PREFIXO do caminho. SECURITY INVOKER (gps.aluno_atual() e gp_is_admin() ja resolvem pela sessao). Falha FECHADO: nome de objeto e entrada de usuario.';

create or replace function gps.pode_anexar_chamado(p_name text)
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
  -- SÓ O ALUNO ANEXA (B5-c). Para liberar a equipe: `or public.gp_is_admin()`
  -- aqui e nada mais -- é a reversão inteira da decisão.
  return gps.chamados_abertos()
     and gps.aluno_atual() = split_part(p_name, '/', 1)::uuid;
exception when others then
  return false;
end;
$$;

comment on function gps.pode_anexar_chamado(text) is
  'Quem ESCREVE no bucket gps-chamados: so o aluno do ambiente que e prefixo do caminho, e so com o interruptor aberto (gps.chamados_abertos()). Admin NAO anexa (B5-c) -- a equipe responde com texto e link. Exige o formato exato <uuid>/<uuid>.<ext>: sem isso `../` e nome arbitrario chegariam ate aqui. Falha FECHADO.';

revoke execute on function gps.pode_ver_anexo_chamado(text) from public, anon;
revoke execute on function gps.pode_anexar_chamado(text)  from public, anon;
grant  execute on function gps.pode_ver_anexo_chamado(text) to authenticated;
grant  execute on function gps.pode_anexar_chamado(text)  to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Policies em storage.objects — as três, e só estas
-- ─────────────────────────────────────────────────────────────────────────

drop policy if exists gps_chamados_anexo_select       on storage.objects;
drop policy if exists gps_chamados_anexo_insert       on storage.objects;
drop policy if exists gps_chamados_anexo_delete_admin on storage.objects;

create policy gps_chamados_anexo_select on storage.objects
  for select to authenticated
  using (bucket_id = 'gps-chamados' and gps.pode_ver_anexo_chamado(name));

create policy gps_chamados_anexo_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gps-chamados' and gps.pode_anexar_chamado(name));

-- DELETE só para o admin: é o que torna o expurgo de retenção possível pela
-- Storage API com a sessão do admin (ver ...113). O aluno NÃO apaga o próprio
-- anexo -- ele é prova de um problema e a thread é append-only.
-- SEM policy de UPDATE: ninguém sobrescreve um anexo depois de enviado
-- (`upsert: true` no mesmo caminho tem de falhar).
create policy gps_chamados_anexo_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'gps-chamados' and public.gp_is_admin());
