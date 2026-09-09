-- Plantão — a equipe cancela a inscrição de alguém pelo painel (09/09/2026).
--
-- POR QUE EXISTE
--   O único cancelamento hoje é o do PRÓPRIO aluno (`gps.plantao_cancelar`,
--   rota pública), e ele TRAVA a partir de 1h antes do início (o link já foi
--   liberado, a vaga está consumida). A equipe às vezes precisa cancelar por
--   outro motivo — pediu para tirar o nome da lista, e-mail errado, duplicata
--   — a qualquer momento, inclusive depois daquela trava (é o caminho da
--   EQUIPE, não o do aluno; a trava de 1h não se aplica aqui).
--
-- O QUE FAZ
--   gps.admin_plantao_cancelar_inscricao(p_inscricao_id, p_motivo default
--   null): `update ... where id = $1 and cancelado_em is null`. Zero linhas
--   afetadas é SEMPRE erro (P0002) — nunca sucesso silencioso: se a
--   inscrição já estava cancelada, a equipe precisa saber que o clique não
--   fez nada, não ler "ok" e achar que acabou de cancelar agora.
--
-- O QUE NÃO FAZ
--   * SEM a trava de 1h de `gps.plantao_cancelar` — é o ponto central desta
--     RPC (BLOQUEIO 2 da spec): o caminho da equipe existe justamente para
--     poder agir depois que o aluno não pode mais.
--   * NÃO manda e-mail. `cancelarSlot` (Server Action já existente) cancela
--     o SLOT inteiro e avisa todo mundo por e-mail porque o PLANTÃO deixou
--     de acontecer; esta RPC cancela UMA inscrição porque a PESSOA não vai
--     mais — não há evento que justifique avisá-la de que ela mesma foi
--     tirada da lista.
--   * NÃO apaga a linha (`cancelado_em` é carimbo, igual a todo outro
--     cancelamento do módulo) — histórico de quem passou pela lista continua
--     legível.
--
-- GUARDAS
--   1. public.gp_is_admin()                     → 42501
--   2. gps.plantao_admin_edicao_liberada()       → 40001
--   3. motivo ≤ 300 caracteres (mesmo teto de `cancelarSlot`/`MOTIVO_MAX`)
--                                                 → 22023
--   4. `where id=$1 and cancelado_em is null`, 0 linhas → 40001 (nunca
--      sucesso silencioso — ver acima)
--
-- LOG
--   gps.plantao_eventos, acao = 'plantao_inscricao_cancelada_pela_equipe'.
--   O motivo NÃO vai para `plantao_eventos` (schema sem coluna de detalhe
--   livre); fica só no retorno da RPC, para a tela poder ecoar/confirmar.
--
-- REVERSÃO
--   drop function if exists gps.admin_plantao_cancelar_inscricao(uuid, text);
--   (e remover a action cancelarInscricaoPeloAdmin de
--   src/app/admin/plantao/inscritos-actions.ts)

begin;

create or replace function gps.admin_plantao_cancelar_inscricao(
  p_inscricao_id uuid,
  p_motivo text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_aluno_id uuid;
  v_linhas int;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if not gps.plantao_admin_edicao_liberada() then
    raise exception 'A edição do painel está temporariamente indisponível.' using errcode = '40001';
  end if;

  if v_motivo is not null and length(v_motivo) > 300 then
    raise exception 'O motivo pode ter no máximo 300 caracteres.' using errcode = '22023';
  end if;

  update gps.plantao_inscricoes
     set cancelado_em = now()
   where id = p_inscricao_id
     and cancelado_em is null
  returning aluno_plantao_id into v_aluno_id;

  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    raise exception 'Esta inscrição já estava cancelada, ou não existe.' using errcode = '40001';
  end if;

  insert into gps.plantao_eventos (aluno_plantao_id, acao)
  values (v_aluno_id, 'plantao_inscricao_cancelada_pela_equipe');

  return jsonb_build_object('inscricao_id', p_inscricao_id, 'motivo', v_motivo);
end $function$;

comment on function gps.admin_plantao_cancelar_inscricao(uuid, text) is
  'Cancela UMA inscricao pelo painel do admin, SEM a trava de 1h de plantao_cancelar (e o caminho da equipe, valido mesmo depois de o aluno nao poder mais cancelar sozinho). 0 linhas afetadas e SEMPRE erro (40001) -- nunca sucesso silencioso. Motivo <=300 chars, so ecoado no retorno (nao ha coluna de detalhe em plantao_eventos). Nao manda e-mail (diferente de cancelarSlot, que cancela o SLOT inteiro). Log em gps.plantao_eventos.';

revoke execute on function gps.admin_plantao_cancelar_inscricao(uuid, text) from public, anon;
grant  execute on function gps.admin_plantao_cancelar_inscricao(uuid, text) to authenticated;

commit;
