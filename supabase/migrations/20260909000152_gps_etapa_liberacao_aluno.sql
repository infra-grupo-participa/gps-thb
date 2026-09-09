-- Central de resolução — liberação de etapa POR ALUNO.
--
-- POR QUE EXISTE (medido no código)
--   `gps.etapas.liberada` é GLOBAL: um interruptor para as 6 etapas e os 125
--   ambientes (src/app/admin/etapas-actions.ts:9). A equipe não tem como
--   destravar quem já está adiantado nem travar quem precisa refazer — a única
--   saída hoje é mexer no interruptor de todo mundo.
--
-- REGRA DE LEITURA: coalesce(override, global). O override VENCE NOS DOIS
--   SENTIDOS. A formulação "global OR override" só permitiria LIBERAR: travar
--   uma etapa que está liberada globalmente seria impossível, e travar é metade
--   do pedido ("trilha que não faz sentido para este aluno"). Ausência de linha
--   É o "segue o global" — não existe linha para os 125 ambientes.
--
-- MOTIVO OBRIGATÓRIO (CHECK 3..300)
--   A linha muda o que UMA pessoa vê no produto. Override sem motivo vira
--   mistério em 3 meses. O motivo aparece na trilha do Diário e no log.
--
-- O QUE NÃO FAZ
--   * não altera `gps.etapas` nem `definirEtapaLiberada` — o interruptor global
--     continua sendo o padrão e a regra de quem não tem override;
--   * não cria linha para ninguém (nasce vazia);
--   * não dá grant de insert/update/delete a `authenticated`: a escrita é SÓ
--     pela RPC. Grant largo sem policy foi o que deixou gps.acessos_log com
--     insert/update/delete concedidos e sem uso (baseline:602). Aqui nasce
--     apertado;
--   * não mexe em gps.progresso: liberar etapa não conclui nem reabre tarefa.
--
-- REVERSÃO
--   drop function if exists gps.admin_definir_liberacao_etapa(uuid, smallint, boolean, text);
--   drop function if exists gps.etapa_liberada_para(uuid, smallint);
--   drop table if exists gps.etapa_liberacao_aluno;
--   e voltar `etapasComLiberacaoDoAluno` para `getEtapas()` puro no TS. Todo
--   aluno volta ao global; nenhuma outra tabela é tocada.

create table if not exists gps.etapa_liberacao_aluno (
  -- aluno_id do AMBIENTE (titular) — igual a gps.progresso/etapa1_clientes. A
  -- liberação é do ambiente, não da pessoa: titular e sócio veem a mesma trilha.
  aluno_id uuid     not null references public.thb_alunos(id) on delete cascade,
  etapa    smallint not null references gps.etapas(id) on delete cascade,
  liberada boolean  not null,
  motivo   text     not null check (length(btrim(motivo)) between 3 and 300),
  -- `por`/`em`: quem mexeu por último e quando. Não há histórico aqui de
  -- propósito — o histórico é gps.acessos_log + gps.aluno_eventos, que são
  -- append-only. Esta tabela guarda o ESTADO vigente.
  por      uuid,
  em       timestamptz not null default now(),
  primary key (aluno_id, etapa)
);

comment on table gps.etapa_liberacao_aluno is
  'Override de liberacao de etapa POR ALUNO (ambiente). Ausencia de linha = segue gps.etapas.liberada. Presenca = manda, nos DOIS sentidos: coalesce(override, global) libera quem esta adiantado e trava quem precisa refazer. Leitura pela funcao gps.etapa_liberada_para() e, no TS, por getEtapasLiberadasPara() + etapasComLiberacaoDoAluno(). Escrita SO por gps.admin_definir_liberacao_etapa -- authenticated tem apenas SELECT nesta tabela.';
comment on column gps.etapa_liberacao_aluno.liberada is
  'Estado FORCADO para este aluno. true = liberada mesmo que gps.etapas.liberada seja false; false = travada mesmo que o global esteja liberado.';
comment on column gps.etapa_liberacao_aluno.motivo is
  'Obrigatorio (3..300). Aparece na trilha do Diario e em gps.acessos_log -- e o que responde "por que esta pessoa ve/nao ve esta etapa?" tres meses depois.';
comment on column gps.etapa_liberacao_aluno.por is
  'auth.users.id de quem definiu por ultimo (auth.uid() dentro da RPC). Sem FK: auth.users e compartilhada por 7 sistemas e um FK com restrict aqui impediria exclusao feita por outro portal.';

alter table gps.etapa_liberacao_aluno enable row level security;

do $$ begin
  create policy etapa_liberacao_admin_all on gps.etapa_liberacao_aluno
    for all to authenticated
    using (public.gp_is_admin()) with check (public.gp_is_admin());
exception when duplicate_object then null; end $$;

-- O aluno LÊ o próprio override: a tela dele precisa dizer "liberada para você
-- pela equipe" em vez de a etapa simplesmente aparecer sem explicação. Só
-- SELECT, e só da própria linha.
do $$ begin
  create policy etapa_liberacao_owner_select on gps.etapa_liberacao_aluno
    for select to authenticated
    using (aluno_id = gps.aluno_atual());
exception when duplicate_object then null; end $$;

revoke all on gps.etapa_liberacao_aluno from public, anon;
grant select on gps.etapa_liberacao_aluno to authenticated;
grant all    on gps.etapa_liberacao_aluno to service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- A REGRA, num lugar só
--
-- SECURITY INVOKER de propósito: a RLS acima continua sendo a fonte de verdade
-- de quem lê o quê. A guarda explícita existe para a falha ser BARULHENTA
-- (42501) em vez de virar resposta errada em silêncio — sem ela, perguntar pelo
-- override de OUTRO aluno devolveria o valor global (a linha alheia é invisível
-- pela RLS), e a tela mostraria uma resposta plausível e falsa.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.etapa_liberada_para(p_aluno_id uuid, p_etapa smallint)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $function$
declare v_liberada boolean;
begin
  if p_aluno_id is null or p_etapa is null then
    raise exception 'aluno ou etapa nao informado' using errcode = '22023';
  end if;
  -- coalesce(…, false): sem JWT, gps.aluno_atual() é NULL, `p_aluno_id = NULL`
  -- é NULL, `false or NULL` é NULL e `if not NULL` NÃO dispara — a função
  -- respondia para qualquer um sem sessão (pego no bloco B3 da conferência de
  -- 09/09, corrigido antes do primeiro push). Falha FECHADO agora.
  if not coalesce(public.gp_is_admin() or p_aluno_id = gps.aluno_atual(), false) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  select coalesce(o.liberada, e.liberada)
    into v_liberada
    from gps.etapas e
    left join gps.etapa_liberacao_aluno o
           on o.etapa = e.id and o.aluno_id = p_aluno_id
   where e.id = p_etapa;

  if not found then
    raise exception 'Etapa não encontrada.' using errcode = 'P0002';
  end if;
  return v_liberada;
end $function$;

comment on function gps.etapa_liberada_para(uuid, smallint) is
  'A etapa esta liberada PARA ESTE ALUNO? coalesce(override, global) -- a regra unica de liberacao individual, no banco. SECURITY INVOKER: a RLS de gps.etapa_liberacao_aluno continua valendo; a guarda (admin OU o proprio aluno) existe para a pergunta sobre ambiente alheio falhar com 42501 em vez de devolver o global em silencio. O espelho no TS e etapaLiberadaPara() em src/lib/etapas.ts, que recebe o mapa de overrides ja carregado (evita 6 idas ao banco por tela); esta funcao serve o SQL.';

revoke execute on function gps.etapa_liberada_para(uuid, smallint) from public, anon;
grant  execute on function gps.etapa_liberada_para(uuid, smallint) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- A ESCRITA — uma função só, porque `p_liberada is null` REMOVE o override
--
-- Duas funções (definir/remover) obrigariam a UI a decidir qual chamar a partir
-- do estado que ela acabou de ler, e a corrida entre ler e clicar produziria
-- "esta etapa já segue a regra geral" como erro para o admin. Com uma só, o
-- terceiro estado ("volta ao geral") é um valor, não outro caminho.
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.admin_definir_liberacao_etapa(
  p_aluno_id uuid, p_etapa smallint, p_liberada boolean, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_global boolean; v_nome text; v_antes boolean; v_motivo text;
  v_efetiva boolean; v_removido boolean := p_liberada is null;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_aluno_id is null or p_etapa is null then
    raise exception 'aluno ou etapa nao informado' using errcode = '22023';
  end if;
  v_motivo := btrim(coalesce(p_motivo, ''));
  if length(v_motivo) < 3 then
    raise exception 'Escreva o motivo — ele fica no histórico deste aluno.'
      using errcode = '22023';
  end if;
  if length(v_motivo) > 300 then
    -- Teto no SERVIDOR (o maxLength do textarea é só do cliente), e recusa em
    -- vez de corte silencioso: motivo cortado no meio vira meia explicação.
    raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
  end if;

  select e.liberada, e.nome into v_global, v_nome from gps.etapas e where e.id = p_etapa;
  if not found then
    raise exception 'Etapa não encontrada.' using errcode = 'P0002';
  end if;
  if not exists (select 1 from gps.membros m where m.aluno_id = p_aluno_id) then
    raise exception 'Este cadastro não tem ambiente no programa.' using errcode = 'P0002';
  end if;

  select o.liberada into v_antes from gps.etapa_liberacao_aluno o
   where o.aluno_id = p_aluno_id and o.etapa = p_etapa;

  if v_removido then
    if v_antes is null then
      raise exception 'Esta etapa já segue a regra geral para este aluno.'
        using errcode = '22023';
    end if;
    delete from gps.etapa_liberacao_aluno
     where aluno_id = p_aluno_id and etapa = p_etapa;
  else
    insert into gps.etapa_liberacao_aluno (aluno_id, etapa, liberada, motivo, por, em)
    values (p_aluno_id, p_etapa, p_liberada, v_motivo, auth.uid(), now())
    on conflict (aluno_id, etapa) do update
      set liberada = excluded.liberada, motivo = excluded.motivo,
          por = excluded.por, em = excluded.em;
  end if;

  -- O que a PESSOA passa a ver. É isto que a trilha conta — não o valor cru do
  -- parâmetro, que no caso de remoção não diz nada ao aluno.
  v_efetiva := coalesce(p_liberada, v_global);

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('etapa_liberacao_alterada', p_aluno_id,
          format('etapa %s (%s): %s para este aluno%s (regra geral: %s). Motivo: %s',
                 p_etapa, coalesce(v_nome, '?'),
                 case when v_efetiva then 'LIBERADA' else 'TRAVADA' end,
                 case when v_removido then ' — override REMOVIDO, volta ao geral' else '' end,
                 case when v_global then 'liberada' else 'bloqueada' end,
                 v_motivo),
          auth.uid());

  -- Toca a TRILHA (o que o aluno vê muda), então também é evento do Diário.
  -- Falha aqui ABORTA a operação de propósito: ao contrário das triggers de
  -- captura (blindadas para nunca travar a escrita do ALUNO), esta é uma ação
  -- da EQUIPE, e liberação sem rastro é exatamente o que a feature evita.
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe,
     ator, ator_user_id, origem)
  values (p_aluno_id, now(),
          case when v_efetiva then 'etapa_liberada_pela_equipe'
                              else 'etapa_travada_pela_equipe' end,
          'etapa', null,
          left(format('Etapa %s — %s', p_etapa, coalesce(v_nome, '?')), 300),
          jsonb_build_object('etapa', p_etapa, 'de', v_antes, 'para', p_liberada,
                             'global', v_global, 'removido', v_removido,
                             'motivo', v_motivo),
          'equipe', auth.uid(), 'app');

  return jsonb_build_object('etapa', p_etapa, 'nome', v_nome,
                            'liberada', v_efetiva, 'override', p_liberada,
                            'antes', v_antes, 'global', v_global,
                            'removido', v_removido);
end $function$;

comment on function gps.admin_definir_liberacao_etapa(uuid, smallint, boolean, text) is
  'Define (ou REMOVE) o override de liberacao de UMA etapa para UM ambiente. p_liberada = true/false grava o override; p_liberada = NULL apaga a linha e o aluno volta a seguir gps.etapas.liberada -- um caminho so para os tres estados, para a UI nao ter de escolher a funcao a partir de um estado que pode ter mudado entre ler e clicar. Motivo obrigatorio (3..300), imposto no servidor. Registra em gps.acessos_log (etapa_liberacao_alterada) e em gps.aluno_eventos (etapa_liberada_pela_equipe / etapa_travada_pela_equipe, entidade `etapa`, entidade_id NULL) com o estado EFETIVO resultante. NAO toca gps.etapas (interruptor global) nem gps.progresso.';

revoke execute on function gps.admin_definir_liberacao_etapa(uuid, smallint, boolean, text) from public, anon;
grant  execute on function gps.admin_definir_liberacao_etapa(uuid, smallint, boolean, text) to authenticated;
