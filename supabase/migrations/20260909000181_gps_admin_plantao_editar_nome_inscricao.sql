-- Plantão — a equipe corrige o nome exibido de uma inscrição (09/09/2026).
--
-- POR QUE EXISTE
--   `nome_informado` (o que a pessoa digitou no formulário público, migration
--   `…043`) às vezes vem torto — abreviado, com erro de digitação, em CAIXA
--   ALTA, ou vazio (a pessoa reaproveitou um link salvo sem preencher o
--   nome de novo). A equipe precisa corrigir isso pelo painel, sem SQL.
--
-- O QUE FAZ
--   gps.admin_plantao_editar_nome_inscricao(p_inscricao_id, p_nome):
--   escreve SÓ `plantao_inscricoes.nome_informado` (1..120 caracteres depois
--   de `btrim`; string vazia vira `NULL` — volta a cair no fallback
--   `plantao_alunos.nome`, ver `InscritoAdmin.nome` em plantao-tipos.ts).
--
-- O QUE NÃO FAZ
--   * NÃO toca `gps.plantao_alunos.nome` — o CADASTRO da pessoa (a base do
--     Acelera) é outra fonte, compartilhada por TODAS as inscrições dela;
--     mudar aqui mudaria o nome em inscrições passadas que nunca pediram
--     correção. `nome_informado` é por INSCRIÇÃO de propósito (comentário
--     original da coluna, migration `…043`).
--   * NÃO recusa inscrição cancelada — corrigir o nome de um registro
--     histórico (cancelado) é inofensivo e não devolve a vaga a ninguém;
--     diferente de marcar presença ou reinscrever, não há regra de negócio
--     que precise bloquear isso.
--
-- GUARDAS
--   1. public.gp_is_admin()                     → 42501
--   2. gps.plantao_admin_edicao_liberada()       → 40001
--   3. 1..120 caracteres depois de btrim          → 22023
--   4. inscrição existe                           → P0002
--
-- LOG
--   gps.plantao_eventos, acao = 'plantao_nome_editado_pela_equipe'.
--
-- REVERSÃO
--   drop function if exists gps.admin_plantao_editar_nome_inscricao(uuid, text);
--   (e remover a action editarNomeInscricao de
--   src/app/admin/plantao/inscritos-actions.ts)

begin;

create or replace function gps.admin_plantao_editar_nome_inscricao(
  p_inscricao_id uuid,
  p_nome text
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_aluno_id uuid;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if not gps.plantao_admin_edicao_liberada() then
    raise exception 'A edição do painel está temporariamente indisponível.' using errcode = '40001';
  end if;

  if v_nome is not null and length(v_nome) > 120 then
    raise exception 'O nome pode ter no máximo 120 caracteres.' using errcode = '22023';
  end if;

  update gps.plantao_inscricoes
     set nome_informado = v_nome
   where id = p_inscricao_id
  returning aluno_plantao_id into v_aluno_id;

  if v_aluno_id is null then
    raise exception 'Inscrição não encontrada.' using errcode = 'P0002';
  end if;

  insert into gps.plantao_eventos (aluno_plantao_id, acao)
  values (v_aluno_id, 'plantao_nome_editado_pela_equipe');

  return jsonb_build_object('inscricao_id', p_inscricao_id, 'nome', v_nome);
end $function$;

comment on function gps.admin_plantao_editar_nome_inscricao(uuid, text) is
  'Corrige o nome exibido de UMA inscricao (nome_informado), 1..120 caracteres; vazio vira NULL (cai no fallback plantao_alunos.nome). NAO toca plantao_alunos.nome -- e o cadastro compartilhado por todas as inscricoes da pessoa. Permitido em inscricao cancelada (correcao de historico e inofensiva). Log em gps.plantao_eventos.';

revoke execute on function gps.admin_plantao_editar_nome_inscricao(uuid, text) from public, anon;
grant  execute on function gps.admin_plantao_editar_nome_inscricao(uuid, text) to authenticated;

commit;
