-- ════════════════════════════════════════════════════════════════════════
-- A prévia "como o aluno vê" não mostrava os vídeos (11/09/2026)
-- ════════════════════════════════════════════════════════════════════════
--
-- Relato do Marcio: subiu o vídeo e, na visão simulada do aluno, ele não
-- apareceu. DUAS causas somadas:
--
-- 1. `src/app/admin/aluno/[alunoId]/materiais/page.tsx` — o espelho da tela
--    de materiais no Modo Assistência — nunca recebeu a `<GravacoesSecao>`.
--    A biblioteca de vídeos entregou a seção só em `src/app/materiais/
--    page.tsx`, a rota do aluno. Feature nova entregue em UM dos dois
--    espelhos: a classe de defeito que o CLAUDE.md registra em "2 agentes no
--    mesmo arquivo".
--
-- 2. Copiar a seção não bastaria: `gps.videos_do_aluno()` resolve o aluno por
--    `gps.aluno_atual()` e RECUSA com 42501 quando é nulo. No Modo
--    Assistência quem chama é o ADMIN, que não é aluno de ambiente nenhum —
--    a chamada morreria calada (`logErro` + lista vazia), que é exatamente
--    "o vídeo não apareceu", sem erro na tela.
--
-- Esta é a irmã administrativa: MESMO corte (publicado + etapa liberada, com
-- o override do aluno vencendo o global) para um `p_aluno_id` EXPLÍCITO.
--
-- ⚠️ REGRA DUPLICADA DE PROPÓSITO: se a visibilidade mudar em uma, tem de
-- mudar na outra — senão a prévia deixa de ser prévia.
--
-- Provado em rollback (11/09/2026): mostra o publicado, esconde o rascunho,
-- esconde vídeo de etapa bloqueada, e aluno real chamando recebe 42501.

create or replace function gps.videos_do_aluno_admin(
  p_aluno_id uuid,
  p_etapa smallint default null
)
returns table(id uuid, titulo text, descricao text, youtube_id text,
              etapa smallint, ordem integer)
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_aluno_id is null then
    raise exception 'Informe o ambiente do parceiro.' using errcode = '22023';
  end if;

  if not gps.videos_ativo() then
    return;
  end if;

  return query
    select v.id, v.titulo, v.descricao, v.youtube_id, v.etapa, v.ordem
      from gps.videos v
     where v.publicado = true
       and (p_etapa is null or v.etapa is null or v.etapa = p_etapa)
       and (
         v.etapa is null
         or coalesce(
              (select o.liberada from gps.etapa_liberacao_aluno o
                where o.aluno_id = p_aluno_id and o.etapa = v.etapa),
              (select e.liberada from gps.etapas e where e.id = v.etapa),
              false
            )
       )
     order by v.etapa nulls first, v.ordem, v.criado_em;
end;
$function$;

comment on function gps.videos_do_aluno_admin(uuid, smallint) is
  'Irma administrativa de gps.videos_do_aluno: MESMO corte (publicado + etapa liberada, override do aluno vencendo o global) para um p_aluno_id EXPLICITO. Existe porque videos_do_aluno resolve por gps.aluno_atual() e recusa (42501) quando quem chama e admin -- o que deixava a previa "como o aluno ve" do Modo Assistencia SEM a secao de gravacoes (achado de 11/09/2026). Guarda: gp_is_admin() ou 42501. Se a regra de visibilidade mudar em uma, tem de mudar na outra.';

revoke execute on function gps.videos_do_aluno_admin(uuid, smallint) from public, anon;
grant  execute on function gps.videos_do_aluno_admin(uuid, smallint) to authenticated;
