-- Plantão — a equipe inscreve alguém direto pelo painel (09/09/2026).
--
-- POR QUE EXISTE
--   Hoje a única porta de entrada é `gps.plantao_inscrever` (rota pública),
--   que tem atrito de propósito: rate limit de IP, cut-off de 12:00 da
--   véspera, exige o slot PUBLICADO. Todos corretos para o aluno se
--   auto-inscrever — nenhum faz sentido para a EQUIPE resolver um caso na
--   mão (ex.: aluno ligou dizendo que não conseguiu se inscrever pelo
--   formulário, ou pediu para trocar de horário).
--
-- O QUE FAZ
--   gps.admin_plantao_inscrever(p_slot_id, p_email, p_nome default null):
--   mesma trava central de `plantao_inscrever` — **"1 inscrição ativa por
--   vez"**, com `for update` no slot para travar a corrida — mas SEM rate
--   limit, SEM exigir slot publicado, SEM exigir `inicio_em > now()` (a
--   equipe pode inscrever em slot rascunho ou já iniciado, se for o caso;
--   BLOQUEIO 2c da spec: nenhuma trava de horário aqui).
--
--   E-mail precisa estar em `gps.plantao_alunos`, `ativo` e **não**
--   `bloqueado_por_programa` — igual à rota pública. Se não estiver, o erro
--   é ESPECÍFICO (ao contrário da recusa genérica do fluxo público, que
--   existe para não vazar quem comprou o quê a um terceiro anônimo): aqui
--   quem chama já é admin autenticado, então a mensagem pode e deve dizer
--   "use Liberar aluno" — é a ferramenta que resolve exatamente isso
--   (`gps.admin_liberar_aluno_plantao`, migration `…175`).
--
--   Se já existir uma inscrição CANCELADA da mesma pessoa neste slot,
--   `on conflict (slot_id, aluno_plantao_id)` REATIVA em vez de duplicar
--   (unique da tabela, migration `…001`) — devolve `reativada: true` no
--   jsonb, para a tela poder dizer "reaberta" em vez de "criada".
--
-- O QUE NÃO FAZ
--   * NÃO valida `p_slot_id` publicado/futuro — ver acima (BLOQUEIO 2c).
--   * NÃO tem rate limit nem `ip_hash` — quem chama já passou por
--     `gp_is_admin()`, não é a rota anônima.
--   * NÃO manda e-mail de confirmação — mesmo comportamento de
--     `plantao_inscrever` (o único e-mail ao aluno sai 1h antes, pelo job).
--
-- GUARDAS
--   1. public.gp_is_admin()                              → 42501
--   2. gps.plantao_admin_edicao_liberada()                → 40001
--   3. e-mail com cara de e-mail                          → 22023
--   4. e-mail em plantao_alunos ativo e não bloqueado      → P0002, mensagem
--      específica orientando "Liberar aluno"
--   5. slot existe                                        → P0002
--   6. 1 inscrição ativa por vez (`for update` no slot)   → devolve o slot
--      conflitante no jsonb, sem lançar exceção (a tela decide o que
--      mostrar — é o mesmo padrão do retorno `ok/motivo` das RPCs públicas,
--      adaptado a jsonb para não multiplicar o formato de erro)
--
-- LOG
--   gps.plantao_eventos, acao = 'plantao_inscricao_criada_pela_equipe'.
--
-- REVERSÃO
--   drop function if exists gps.admin_plantao_inscrever(uuid, text, text);
--   (e remover a action inscreverAlunoNoSlot de
--   src/app/admin/plantao/inscritos-actions.ts)

begin;

create or replace function gps.admin_plantao_inscrever(
  p_slot_id uuid,
  p_email text,
  p_nome text default null
)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_nome text := nullif(btrim(coalesce(p_nome, '')), '');
  v_aluno_id uuid;
  v_slot gps.plantao_slots%rowtype;
  v_ativa_id uuid;
  v_ativa_slot_id uuid;
  v_inscricao_id uuid;
  v_reativada boolean;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if not gps.plantao_admin_edicao_liberada() then
    raise exception 'A edição do painel está temporariamente indisponível.' using errcode = '40001';
  end if;

  if v_email !~ '^[^\s@<>"'']+@[^\s@<>"'']+\.[a-zA-Z]{2,}$' then
    raise exception 'Informe um e-mail válido.' using errcode = '22023';
  end if;

  -- Coluna NUA no WHERE (o unique de plantao_alunos é sobre email cru) --
  -- mesma regra medida na migration `…043`: lower(btrim()) em variável,
  -- nunca envolvendo a coluna no predicado.
  select id into v_aluno_id
  from gps.plantao_alunos
  where email = v_email and ativo and not bloqueado_por_programa;

  if v_aluno_id is null then
    raise exception 'Este e-mail não está na base de compradores do Acelera (ou está bloqueado). Use "Liberar aluno" antes de inscrever.'
      using errcode = 'P0002';
  end if;

  -- `for update`: mesma trava de corrida de plantao_inscrever, mas SEM
  -- exigir publicado nem futuro (BLOQUEIO 2c).
  select * into v_slot from gps.plantao_slots where id = p_slot_id for update;
  if not found then
    raise exception 'Plantão não encontrado.' using errcode = 'P0002';
  end if;

  -- "1 inscrição ativa por vez": mesma checagem de plantao_inscrever,
  -- devolvida no jsonb em vez de lançar exceção -- a tela decide a copy.
  select i.id, i.slot_id into v_ativa_id, v_ativa_slot_id
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.aluno_plantao_id = v_aluno_id
    and i.cancelado_em is null
    and sl.inicio_em > now()
    and i.slot_id <> p_slot_id
  limit 1;

  if v_ativa_id is not null then
    return jsonb_build_object(
      'ok', false,
      'motivo', 'Este aluno já tem uma inscrição ativa em outro plantão.',
      'slot_conflitante_id', v_ativa_slot_id
    );
  end if;

  -- `xmax <> 0` identifica que a linha veio do braço UPDATE do
  -- `on conflict` (já existia, e portanto estava cancelada — é a única
  -- forma de colidir no unique) em vez do braço INSERT (nasceu agora).
  insert into gps.plantao_inscricoes (slot_id, aluno_plantao_id, nome_informado)
  values (p_slot_id, v_aluno_id, v_nome)
  on conflict (slot_id, aluno_plantao_id) do update
    set cancelado_em = null,
        inscrito_em = now(),
        nome_informado = coalesce(excluded.nome_informado, gps.plantao_inscricoes.nome_informado)
  returning id, (xmax <> 0) into v_inscricao_id, v_reativada;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, slot_id)
  values (v_aluno_id, 'plantao_inscricao_criada_pela_equipe', p_slot_id);

  return jsonb_build_object(
    'ok', true,
    'inscricao_id', v_inscricao_id,
    'reativada', coalesce(v_reativada, false)
  );
end $function$;

comment on function gps.admin_plantao_inscrever(uuid, text, text) is
  'Inscreve alguem num slot pelo painel do admin -- sem rate limit, sem exigir slot publicado/futuro (BLOQUEIO 2c). Mantem a trava "1 inscricao ativa por vez" (for update no slot) e a reativacao via on conflict(slot_id, aluno_plantao_id), devolvendo reativada=true. E-mail precisa estar em plantao_alunos ativo e nao bloqueado, com erro especifico orientando "Liberar aluno". Log em gps.plantao_eventos.';

revoke execute on function gps.admin_plantao_inscrever(uuid, text, text) from public, anon;
grant  execute on function gps.admin_plantao_inscrever(uuid, text, text) to authenticated;

commit;
