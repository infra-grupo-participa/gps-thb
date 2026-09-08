-- Job de reconciliação da elegibilidade do Plantão + cancelamento de
-- inscrição futura ao bloquear (achados 3 e 4 do arquiteto, 08/09/2026).
--
-- PROBLEMA: `bloqueado_por_programa` (migração ...034) é um SNAPSHOT — o
-- UPDATE rodou uma vez, contra o estado de `gps.membros` daquele instante.
-- Ninguém recalcula quando um novo aluno entra no Programa de Implementação
-- depois. Sem este job, a lista de bloqueados envelhece a partir do dia em
-- que o Plantão abrir para os 422.
--
-- `gps.plantao_reconciliar_elegibilidade(p_segredo text)` roda 1×/dia, chamada
-- como nova etapa do job existente (`/api/plantao/manutencao`), mesma guarda
-- de segredo das demais RPCs de manutenção (falha FECHADO quando
-- `app.plantao_manutencao_segredo` não está setado).
--
-- 🔑 CUIDADO CRÍTICO — já erramos isso uma vez (migração ...031): o job roda
-- como `anon` (pg_cron → HTTP → anon key), NUNCA `authenticated`. Por isso o
-- GRANT abaixo já nasce `to anon, authenticated`, igual às 3 RPCs de
-- manutenção originais (`plantao_nps_pendente` etc., migração ...003) — não
-- repetir o erro de dar só para `authenticated`.
--
-- ── Exceção de bloqueio ──────────────────────────────────────────────────
-- `plantao_alunos.bloqueio_excecao` (novo, default false): quando true, o
-- job NUNCA toca aquela pessoa — nem bloqueia nem desbloqueia por
-- reconciliação. Sem isso, o admin desbloqueia manualmente alguém hoje
-- (`update ... set bloqueado_por_programa = false`) e o job rebloqueia na
-- próxima madrugada, silenciosamente, porque a pessoa CONTINUA em
-- `gps.membros` — a exceção é o jeito de o admin expressar "sei que ela está
-- no Programa, deixa participar mesmo assim" de forma que sobrevive ao job.
--
-- ── Cancelar inscrição ao bloquear (achado 3) ───────────────────────────
-- Decisão do Marcio: bloquear cancela as inscrições FUTURAS da pessoa
-- (`cancelado_em = now()`), para não deixar inscrição órfã — um plantão
-- "cheio" de gente que não pode mais entrar, ou uma mentora avisada por
-- alguém que já perdeu o direito. Hoje são 0 inscrições de aluno bloqueado
-- (o produto nunca foi usado); a regra é para o FUTURO, quando a base já
-- estiver em uso e alguém migrar para o Programa com plantão já marcado.
-- Implementada AQUI (não em outro ponto de escrita) porque este é o único
-- lugar do sistema, daqui em diante, que marca `bloqueado_por_programa = true`
-- fora da carga inicial em massa da migração ...034.
--
-- Reversão:
--   drop function gps.plantao_reconciliar_elegibilidade(text);
--   alter table gps.plantao_alunos drop column bloqueio_excecao;
--   (e remover a chamada nova em src/app/api/plantao/manutencao/route.ts)

alter table gps.plantao_alunos
  add column if not exists bloqueio_excecao boolean not null default false;

comment on column gps.plantao_alunos.bloqueio_excecao is
  'true = o job de reconciliacao NUNCA toca bloqueado_por_programa desta pessoa (nem bloqueia nem desbloqueia). Existe para o admin desbloquear alguem manualmente sem o job rebloquear na madrugada seguinte, enquanto ela continuar em gps.membros.';

create or replace function gps.plantao_reconciliar_elegibilidade(p_segredo text)
returns table (
  bloqueados_novos int,
  desbloqueados int,
  inscricoes_canceladas int
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_esperado text;
  v_bloqueados_novos int := 0;
  v_desbloqueados int := 0;
  v_inscricoes_canceladas int := 0;
begin
  -- Mesma guarda das demais RPCs de manutenção: current_setting(..., true)
  -- devolve NULL quando não configurado; comparar direto com NULL faria o
  -- `if` não disparar e liberar geral — por isso o teste explícito contra
  -- nulo/vazio ANTES da comparação com o segredo recebido.
  v_esperado := current_setting('app.plantao_manutencao_segredo', true);
  if v_esperado is null or btrim(v_esperado) = ''
     or p_segredo is null or p_segredo <> v_esperado then
    raise exception 'Manutencao nao autorizada.' using errcode = '42501';
  end if;

  -- ── 1. BLOQUEAR quem entrou no Programa depois da carga inicial ────────
  -- Mesmo casamento por e-mail da migração ...034 (nunca por documento —
  -- CNPJ pode ser compartilhado por duas pessoas distintas, caso Marisa
  -- Tiedt / Gilton Silva já registrado no projeto).
  create temporary table if not exists _recem_bloqueados (id uuid) on commit drop;
  delete from _recem_bloqueados;

  with recem as (
    update gps.plantao_alunos pa
       set bloqueado_por_programa = true
     where pa.ativo
       and not pa.bloqueado_por_programa
       and not pa.bloqueio_excecao
       and exists (
         select 1
           from public.thb_alunos a
           join gps.membros m on m.aluno_id = a.id
          where lower(btrim(a.email)) = lower(btrim(pa.email))
       )
    returning pa.id
  )
  insert into _recem_bloqueados (id) select id from recem;

  select count(*) into v_bloqueados_novos from _recem_bloqueados;

  -- ── 2. CANCELAR inscrições futuras de quem acabou de ser bloqueado ─────
  -- Só as ATIVAS e de slot ainda no futuro — presença/NPS já registrados
  -- (plantão passado) não são histórico para apagar.
  --
  -- 🔑 Filtra pelos RECEM-bloqueados desta rodada, nao por
  -- `pa.bloqueado_por_programa` em geral. A diferenca importa: com o filtro
  -- amplo, todo desbloqueio manual seguido de rebloqueio automatico (pessoa
  -- sem `bloqueio_excecao` que continua em `gps.membros`) cancelaria de novo
  -- uma inscricao que o proprio admin acabou de liberar. Cancelar e
  -- destrutivo; so acontece no instante da transicao.
  with canceladas as (
    update gps.plantao_inscricoes i
       set cancelado_em = now()
      from gps.plantao_slots sl
     where i.slot_id = sl.id
       and i.aluno_plantao_id in (select id from _recem_bloqueados)
       and i.cancelado_em is null
       and sl.inicio_em > now()
    returning i.id
  )
  select count(*) into v_inscricoes_canceladas from canceladas;

  -- ── 3. DESBLOQUEAR quem saiu de `gps.membros` (ex.: cadastro corrigido) ─
  -- Reversível pelo mesmo caminho automático — sem isso, uma remoção do
  -- Programa feita por engano nunca devolveria o Plantão sozinha.
  -- Nunca mexe em quem tem `bloqueio_excecao` (a exceção do admin é a favor
  -- de MANTER acesso, então também vale contra um desbloqueio automático
  -- que ele não pediu — quem marcou exceção já está fora do alcance do job).
  with recem_desbloqueados as (
    update gps.plantao_alunos pa
       set bloqueado_por_programa = false
     where pa.bloqueado_por_programa
       and not pa.bloqueio_excecao
       and not exists (
         select 1
           from public.thb_alunos a
           join gps.membros m on m.aluno_id = a.id
          where lower(btrim(a.email)) = lower(btrim(pa.email))
       )
    returning pa.id
  )
  select count(*) into v_desbloqueados from recem_desbloqueados;

  return query select v_bloqueados_novos, v_desbloqueados, v_inscricoes_canceladas;
end;
$function$;

revoke execute on function gps.plantao_reconciliar_elegibilidade(text) from public, anon;
grant execute on function gps.plantao_reconciliar_elegibilidade(text) to anon, authenticated;

comment on function gps.plantao_reconciliar_elegibilidade(text) is
  'Job diario (1x/dia, via /api/plantao/manutencao chamado por pg_cron como anon): recalcula bloqueado_por_programa contra gps.membros (quem entrou/saiu do Programa desde a ultima rodada) e cancela as inscricoes FUTURAS de quem acabou de ser bloqueado. Ignora quem tem bloqueio_excecao=true. Falha FECHADO sem app.plantao_manutencao_segredo. GRANT para anon desde a criacao — o job roda sem sessao (pg_cron fala com o PostgREST como anon), so o p_segredo protege.';

-- Serve o `exists` das duas direções (bloquear/desbloquear): casamento por
-- e-mail normalizado contra `thb_alunos` já usa `thb_alunos_email_uidx`
-- (lower(trim(email))); do lado de `gps.membros`, a busca é por `aluno_id`
-- (FK, já indexada pela PK de `thb_alunos` no join). Sem índice novo aqui:
-- `gps.membros` já tem poucas linhas (só quem está no Programa) e
-- `plantao_alunos` são 422 no total — nenhuma das duas cresce por varredura
-- sem teto, e o corte fica sempre dentro dessas duas tabelas pequenas.
