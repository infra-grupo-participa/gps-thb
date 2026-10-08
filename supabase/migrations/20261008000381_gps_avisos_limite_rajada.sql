-- 20261008000381 — avisos da equipe: limite contra rajada (achado MÉDIO do pentest)
--
-- Provado em produção (08/10, transação desfeita): o mesmo aluno chamando
-- cliente_minuta_anexar 5× seguidas gerou 5 avisos → 5 pushes para TODOS os
-- admins. Rajada assim pode levar o serviço de push a 429 e, após 5 falhas
-- seguidas, push_resultado revoga a inscrição do admin sem ninguém ver.
--
-- Regra (só para aviso ligado a um aluno; plantao_inscricao tem aluno nulo,
-- não tem push nem pop-up e já é limitado por slot):
--   · mesmo tipo + mesma entidade nos últimos 10 min → não grava de novo;
--   · mesmo tipo + mesmo aluno: no máximo 3 em 10 min.
-- Serializado por advisory lock (tipo, aluno) para duas abas não furarem.
-- Sem índice novo: ~400 avisos/mês, expurgo em 90 dias (≈1.200 linhas) —
-- a conferência é um Seq Scan barato (medido no rodapé).
--
-- Reversão: recriar gps.aviso_registrar pela …379.

create or replace function gps.aviso_registrar(
  p_tipo        text,
  p_aluno_id    uuid,
  p_entidade_id uuid,
  p_url         text,
  p_resumo      text,
  p_origem_id   text
)
returns bigint
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_id bigint;
begin
  if not gps.avisos_ativo() then
    return null;
  end if;
  if not exists (select 1 from gps.aviso_tipos t where t.tipo = p_tipo and t.ativo) then
    return null;
  end if;

  -- 381: limite contra rajada (só aviso ligado a aluno).
  if p_aluno_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('gps.aviso:' || p_tipo || ':' || p_aluno_id::text, 0));

    if p_entidade_id is not null and exists (
      select 1 from gps.equipe_avisos a
       where a.tipo = p_tipo
         and a.entidade_id = p_entidade_id
         and a.criado_em > now() - interval '10 minutes'
    ) then
      return null;
    end if;

    if (select count(*) from gps.equipe_avisos a
         where a.tipo = p_tipo
           and a.aluno_id = p_aluno_id
           and a.criado_em > now() - interval '10 minutes') >= 3 then
      return null;
    end if;
  end if;

  insert into gps.equipe_avisos (tipo, aluno_id, entidade_id, url, resumo, origem_id)
  values (p_tipo, p_aluno_id, p_entidade_id, p_url,
          left(coalesce(nullif(btrim(regexp_replace(coalesce(p_resumo, ''), '[[:cntrl:]]', ' ', 'g')), ''),
                        'Novo aviso'), 300),
          p_origem_id)
  on conflict (origem_id) do nothing
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function gps.aviso_registrar(text, uuid, uuid, text, text, text) from public, anon, authenticated, service_role;

-- ═══ Prova (08/10/2026, produção, transação desfeita) ═══
-- ANTES (379): mesmo aluno, cliente_minuta_anexar 5× na mesma minuta → 5 avisos.
-- DEPOIS:      a mesma rajada → 1 aviso; 5 avisos diretos do mesmo aluno/tipo em
--              entidades distintas → 3 (teto). Custo da conferência: 0,164 ms.
-- Grants vivos: anon/PUBLIC nada; authenticated só SELECT em aviso_tipos (catálogo)
--   e equipe_avisos (RLS eh_admin); aviso_registrar só postgres.
