-- Plantão — a equipe marca (ou desmarca) presença de um inscrito (09/09/2026).
--
-- POR QUE EXISTE
--   Hoje a ÚNICA forma de gravar `presenca_em` é o próprio aluno clicar em
--   "revelar sala" dentro da janela (`gps.plantao_revelar_link`). Quando
--   alguém participa por outro caminho (entrou direto no Zoom pelo convite
--   que a mentora reenviou, por exemplo) a equipe não tinha como registrar
--   isso pelo painel — só por SQL direto. Decisão do Marcio: presença
--   marcada pela equipe VALE IGUAL à do portal; a ORIGEM fica visível
--   (`presenca_origem`, migration `…179`).
--
-- O QUE FAZ
--   gps.admin_plantao_marcar_presenca(p_inscricao_id, p_presente):
--   `p_presente = true`  → grava `presenca_em = now()`, `presenca_origem =
--     'equipe'`. Idempotente: chamar de novo com uma presença já marcada
--     apenas MANTÉM o carimbo antigo (não pisa o instante nem a origem —
--     a equipe pode ter aberto o modal, visto que já tinha presença
--     'portal', e confirmado sem querer sobrescrever a origem real).
--   `p_presente = false` → LIMPA `presenca_em` e `presenca_origem`, os dois
--     juntos. Desmarcar é para corrigir engano ("marquei sem querer"), não
--     para apagar metade do registro e a UI mostrar presença sem origem.
--
--   ⚠️ Permitido em QUALQUER inscrição ativa, mesmo ANTES do início do
--   plantão (decisão do Marcio — sem trava de horário: a equipe pode
--   precisar corrigir a lista antes da sessão começar, ex. import errado).
--
-- GUARDAS (antes de qualquer escrita)
--   1. public.gp_is_admin()                                    → 42501
--   2. gps.plantao_admin_edicao_liberada()                     → 40001
--      (interruptor PRÓPRIO deste painel — ver o comentário da função)
--   3. inscrição existe e `cancelado_em is null`                → P0002
--      (inscrição cancelada não se edita por aqui: ver BLOQUEIO 2b da
--      spec — o caminho é reinscrever, não "marcar presença de quem
--      desistiu")
--
-- O QUE NÃO FAZ
--   * NÃO mexe em `nps_nota`/`nps_em` — desmarcar presença não invalida uma
--     nota já dada (é outro ato, `gps.plantao_registrar_nps`, e o vínculo
--     "só avalia quem participou" já foi checado na hora daquele registro).
--   * NÃO manda e-mail. Isto é correção de registro, não evento que avisa o
--     aluno.
--
-- LOG
--   gps.plantao_eventos, acao = 'plantao_presenca_marcada_pela_equipe' ou
--   'plantao_presenca_desmarcada_pela_equipe'. `aluno_plantao_id` vem da
--   PRÓPRIA inscrição (não é a equipe quem "tem" o evento).
--
-- REVERSÃO
--   drop function if exists gps.admin_plantao_marcar_presenca(uuid, boolean);
--   (e remover a action marcarPresencaInscrito de
--   src/app/admin/plantao/inscritos-actions.ts)

begin;

-- ── Interruptor próprio do painel de edição do admin ──────────────────────
--
-- 🔴 NÃO reusar gps.plantao_escrita_liberada(): aquele interruptor é do
-- ALUNO (rota pública `/p/plantao` — inscrever, cancelar, revelar link,
-- NPS). Se as 4 novas RPCs deste painel checassem o MESMO interruptor, a
-- equipe pausar as inscrições públicas (situação normal, por exemplo
-- enquanto reorganiza a agenda) TIRARIA da própria equipe a ferramenta de
-- corrigir a lista existente — o pior momento possível para isso acontecer.
--
-- Mesmo padrão de gps.plantao_escrita_liberada(): ausente = ABERTO. Chave
-- em gps.config, sem chave de compatibilidade (este painel é novo, não há
-- app anterior gravando em outro lugar).
create or replace function gps.plantao_admin_edicao_liberada()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (select c.valor from gps.config c where c.chave = 'plantao_admin_edicao_liberada'),
    'true') <> 'false';
$function$;

comment on function gps.plantao_admin_edicao_liberada() is
  'Interruptor de emergencia das 4 RPCs de edicao do painel admin do Plantao (marcar presenca, editar nome, cancelar, inscrever). Independente de gps.plantao_escrita_liberada() (aquele e do ALUNO, rota publica) -- pausar as inscricoes publicas nao pode tirar da equipe a ferramenta de corrigir a lista. Chave gps.config(plantao_admin_edicao_liberada). Ausente = ABERTO.';

revoke execute on function gps.plantao_admin_edicao_liberada() from public, anon;
grant  execute on function gps.plantao_admin_edicao_liberada() to authenticated;

-- ── A ação ─────────────────────────────────────────────────────────────

create or replace function gps.admin_plantao_marcar_presenca(
  p_inscricao_id uuid,
  p_presente boolean
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_aluno_id uuid;
  v_linhas int;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if not gps.plantao_admin_edicao_liberada() then
    raise exception 'A edição do painel está temporariamente indisponível.' using errcode = '40001';
  end if;

  if p_presente then
    update gps.plantao_inscricoes
       set presenca_em = coalesce(presenca_em, now()),
           presenca_origem = coalesce(presenca_origem, 'equipe')
     where id = p_inscricao_id
       and cancelado_em is null
    returning aluno_plantao_id into v_aluno_id;
  else
    update gps.plantao_inscricoes
       set presenca_em = null,
           presenca_origem = null
     where id = p_inscricao_id
       and cancelado_em is null
    returning aluno_plantao_id into v_aluno_id;
  end if;

  get diagnostics v_linhas = row_count;
  if v_linhas = 0 then
    raise exception 'Inscrição não encontrada, ou já cancelada.' using errcode = 'P0002';
  end if;

  insert into gps.plantao_eventos (aluno_plantao_id, acao)
  values (
    v_aluno_id,
    case when p_presente
      then 'plantao_presenca_marcada_pela_equipe'
      else 'plantao_presenca_desmarcada_pela_equipe'
    end
  );

  return jsonb_build_object('inscricao_id', p_inscricao_id, 'presente', p_presente);
end $function$;

comment on function gps.admin_plantao_marcar_presenca(uuid, boolean) is
  'Marca ou desmarca presenca de um inscrito pelo painel do admin. presenca_origem=equipe quando marca (idempotente: nao pisa presenca/origem ja gravadas pelo portal); desmarcar limpa presenca_em E presenca_origem juntos. Permitido em qualquer horario (sem trava de inicio -- decisao do Marcio). Recusa inscricao cancelada (BLOQUEIO 2b: o caminho e reinscrever). Log em gps.plantao_eventos.';

revoke execute on function gps.admin_plantao_marcar_presenca(uuid, boolean) from public, anon;
grant  execute on function gps.admin_plantao_marcar_presenca(uuid, boolean) to authenticated;

commit;
