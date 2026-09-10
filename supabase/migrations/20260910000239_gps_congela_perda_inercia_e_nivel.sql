-- A perda pela inércia e o nível de relacionamento saem do sistema.
--
-- Decisão do Marcio (10/09/2026): *"Dentro do sistema tem uma parte que fala
-- sobre a gente identificar a perda pela inércia. Remove tudo relacionado a
-- isso, inclusive da criação do cliente... o que quero que saia em definitivo
-- é essa parada de lead morno, frio ou quente e a perda pela inércia."*
--
-- Sai junto a tarefa **1.2** ("Identificar a perda pela inércia"), e com ela a
-- numeração 1.1/1.2: o passo volta a ser o **1**.
--
-- ⚠️ A `data_reuniao_preliminar` **FICA** (decisão explícita do Marcio no
--    mesmo turno) — ela alimenta `agendados`, que a tela do aluno e o painel
--    do admin usam.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔑 CONGELAR, NÃO APAGAR
-- ═══════════════════════════════════════════════════════════════════════
--
-- As colunas continuam na tabela com o dado já gravado — medido em 10/09:
--
--   nivel_relacionamento ... 595 clientes (219 frio, 206 morno, 175 quente)
--   perda_inercia .......... 101 clientes
--
-- É o mesmo caminho já usado com `status` (migração `…060`): some da tela,
-- fica no histórico. `drop column` é irreversível sem restore de backup, e
-- ninguém pediu para destruir o trabalho de 60 ambientes — pediram para tirar
-- da frente. A trigger abaixo garante que nenhum caminho de escrita as toque
-- de novo, o que é o que "sair em definitivo" precisa significar no banco.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 A CONTA DOS 30 MUDA — e este é o efeito que importa
-- ═══════════════════════════════════════════════════════════════════════
--
-- `clientes_com_dados` era `nome + telefone + nivel_relacionamento`, e é ela
-- que decide a trava da fase Inicial (migração `…238`). Sem o nível, passa a
-- ser **nome + telefone**.
--
-- ⚠️ O `grau_relacao` NÃO entrou no lugar. Medido antes de decidir:
--
--      ficha completa exigindo NÍVEL (hoje) ....  5 ambientes com os 30
--      ficha completa exigindo GRAU ............  0 ambientes  🔴
--      ficha completa = nome + telefone ........ 11 ambientes
--
--    O grau é campo novo (27 clientes preenchidos contra 595 do nível):
--    exigi-lo zeraria todo mundo e obrigaria 60 ambientes a revisitar 30
--    fichas para reinformar algo que já tinham informado. Decisão do Marcio:
--    **ficha completa = nome + telefone**; o grau continua obrigatório ao
--    CRIAR cliente novo, mas não retroage.
--
-- EFEITO MEDIDO (simulado com o dado real antes de aplicar):
--   captacao -> captacao ....  5
--   inicial  -> captacao ....  6   (tinham nome+telefone dos 30, faltava nível)
--   inicial  -> inicial ..... 126
--   **Ninguém desce de fase.** Captação vai de 5 para 11.
--
-- REVERSÃO
--   drop trigger trg_etapa1_clientes_perda_nivel_congelados on gps.etapa1_clientes;
--   e reaplicar a `…238` (que tem a conta com `nivel_relacionamento`).

-- ═════════════════════════════════════════════════════════════════════════
-- 1. A trava de escrita — no banco, não só no TypeScript
-- ═════════════════════════════════════════════════════════════════════════

create or replace function gps.etapa1_clientes_perda_nivel_congelados()
returns trigger language plpgsql set search_path to ''
as $function$
begin
  -- Molde de `gps.etapa1_clientes_status_congelado` (migração ...060).
  -- `is distinct from` (e não `<>`) para pegar também a troca de/para null.
  if new.perda_inercia is distinct from old.perda_inercia then
    raise exception 'etapa1_clientes.perda_inercia esta congelada desde 10/09/2026 (a perda pela inercia saiu do sistema)'
      using errcode = '42501';
  end if;
  if new.nivel_relacionamento is distinct from old.nivel_relacionamento then
    raise exception 'etapa1_clientes.nivel_relacionamento esta congelado desde 10/09/2026 (o quente/morno/frio saiu do sistema); use grau_relacao'
      using errcode = '42501';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_etapa1_clientes_perda_nivel_congelados on gps.etapa1_clientes;

-- Só em UPDATE: o INSERT continua livre para nascer com null (é o que a
-- criação de cliente faz agora, já sem os campos no formulário).
create trigger trg_etapa1_clientes_perda_nivel_congelados
  before update on gps.etapa1_clientes
  for each row execute function gps.etapa1_clientes_perda_nivel_congelados();

comment on column gps.etapa1_clientes.perda_inercia is
  'CONGELADA em 10/09/2026 (decisao do Marcio): a perda pela inercia saiu do sistema - ficha, criacao de cliente, tarefa 1.2 e KPI. 101 valores preservados. Trigger recusa escrita com 42501.';

comment on column gps.etapa1_clientes.nivel_relacionamento is
  'CONGELADO em 10/09/2026 (decisao do Marcio): o quente/morno/frio saiu do sistema. 595 valores preservados. NAO foi convertido para grau_relacao - sao perguntas diferentes (temperatura x tipo de vinculo). Trigger recusa escrita com 42501.';

-- ═════════════════════════════════════════════════════════════════════════
-- 2. A conta dos 30 sem o nível
-- ═════════════════════════════════════════════════════════════════════════

drop function if exists gps.admin_painel_alunos(integer, integer);

create function gps.admin_painel_alunos(p_limite integer default 200, p_offset integer default 0)
returns table(
  aluno_id uuid, qtd_membros integer, tem_login boolean, desde timestamptz,
  ultimo_acesso timestamptz, clientes_preenchidos integer, clientes_com_dados integer,
  clientes_com_perda integer, agendados integer, tarefas_concluidas integer[],
  honorarios_contratados numeric, contratados integer, contratados_sem_valor integer,
  total_ambientes integer, onboarding_status text, em_fechamento integer,
  apto_ao_saldo boolean, classe text,
  favorito_nome text, favorito_fase text, favorito_confirmado boolean
)
language plpgsql stable security definer set search_path to ''
as $function$
declare v_limite integer := least(greatest(coalesce(p_limite, 200), 1), 1000); v_offset integer := greatest(coalesce(p_offset, 0), 0);
begin
  if not public.gp_is_admin() then raise exception 'apenas administradores' using errcode = '42501'; end if;
  return query
  with amb as (
    select m.aluno_id as aluno_id, count(*)::integer as qtd_membros, bool_or(m.user_id is not null) as tem_login,
           min(m.criado_em) as desde, max(m.criado_em) as ultimo_membro_em, max(u.last_sign_in_at) as ultimo_acesso
      from gps.membros m left join auth.users u on u.id = m.user_id group by m.aluno_id
  ),
  cli as (
    select c.aluno_id as aluno_id,
           count(*) filter (where coalesce(btrim(c.nome), '') <> '')::integer as preenchidos,
           -- 🔴 FICHA COMPLETA = NOME + TELEFONE (10/09/2026). O
           -- `nivel_relacionamento` saiu; o `grau_relacao` NAO entrou no
           -- lugar (zeraria os 30 de todo mundo - ver o cabecalho).
           count(*) filter (where coalesce(btrim(c.nome), '') <> '' and coalesce(btrim(c.telefone), '') <> '')::integer as com_dados,
           -- Mantida no retorno so para nao quebrar o contrato da RPC; a UI
           -- nao le mais este numero. Sai na proxima migracao que mexer aqui.
           count(*) filter (where c.perda_inercia is not null)::integer as com_perda,
           count(*) filter (where c.data_reuniao_preliminar is not null or c.aderiu_reuniao)::integer as agendados,
           sum(c.valor_honorarios) filter (where c.fase = 'contratado') as honorarios_contratados,
           count(*) filter (where c.fase = 'contratado')::integer as contratados,
           count(*) filter (where c.fase = 'contratado' and c.valor_honorarios is null)::integer as contratados_sem_valor,
           count(*) filter (where c.fase = 'fechamento')::integer as em_fechamento,
           bool_or(c.fase = 'contratado' and c.valor_honorarios is not null) as tem_contratado_com_valor,
           count(*) filter (where c.valor_honorarios is not null)::integer as com_honorarios,
           max(c.nome) filter (where c.acompanhado_equipe) as fav_nome,
           max(c.fase) filter (where c.acompanhado_equipe) as fav_fase,
           bool_or(c.acompanhado_equipe and c.acompanhamento_confirmado_em is not null) as fav_confirmado
      from gps.etapa1_clientes c group by c.aluno_id
  ),
  prog as (select p.aluno_id as aluno_id, array_agg(p.tarefa order by p.tarefa)::integer[] as tarefas from gps.progresso p where p.etapa = 1 and p.concluida group by p.aluno_id),
  entregues as (select p.aluno_id as aluno_id from gps.progresso p where p.etapa = 6 and p.concluida group by p.aluno_id),
  onb as (
    select m.aluno_id as aluno_id, max(case when r.pessoa_aluno_id is null then 0 when r.concluido_em is not null then 2 else 1 end) as estado
      from gps.membros m left join gps.onboarding_respostas r on r.pessoa_aluno_id = m.pessoa_aluno_id
     where m.papel = 'titular' group by m.aluno_id
  ),
  anx as (
    select m.aluno_id as aluno_id, true as tem_contrato from gps.membros m join gps.onboarding_anexos a on a.pessoa_aluno_id = m.pessoa_aluno_id
     where a.tipo = 'contrato_honorarios' group by m.aluno_id
  )
  select a.aluno_id, a.qtd_membros, a.tem_login, a.desde, a.ultimo_acesso,
         coalesce(cl.preenchidos, 0), coalesce(cl.com_dados, 0), coalesce(cl.com_perda, 0), coalesce(cl.agendados, 0),
         coalesce(pr.tarefas, '{}'::integer[]), cl.honorarios_contratados, coalesce(cl.contratados, 0), coalesce(cl.contratados_sem_valor, 0),
         (count(*) over ())::integer,
         case coalesce(ob.estado, 0) when 2 then 'concluido' when 1 then 'em_andamento' else 'nao_iniciado' end,
         coalesce(cl.em_fechamento, 0),
         coalesce(cl.tem_contratado_com_valor, false) and coalesce(ax.tem_contrato, false),
         case
           when coalesce(cl.honorarios_contratados, 0) >= 150000 then 'finalizado'
           when coalesce(cl.com_dados, 0) < 30 then 'inicial'
           when en.aluno_id is not null then 'orientacao'
           when coalesce(cl.contratados, 0) > 0 and coalesce(cl.com_honorarios, 0) > 0 then 'execucao'
           else 'captacao'
         end,
         cl.fav_nome, cl.fav_fase, coalesce(cl.fav_confirmado, false)
    from amb a
    left join cli cl on cl.aluno_id = a.aluno_id
    left join prog pr on pr.aluno_id = a.aluno_id
    left join onb ob on ob.aluno_id = a.aluno_id
    left join anx ax on ax.aluno_id = a.aluno_id
    left join entregues en on en.aluno_id = a.aluno_id
   order by a.ultimo_membro_em desc, a.aluno_id
   limit v_limite offset v_offset;
end;
$function$;

revoke execute on function gps.admin_painel_alunos(integer, integer) from public, anon;
grant execute on function gps.admin_painel_alunos(integer, integer) to authenticated;

comment on function gps.admin_painel_alunos(integer, integer) is
  'Painel /admin: uma linha por ambiente, ja agregada. Ficha completa = nome + telefone (o nivel_relacionamento saiu em 10/09/2026 e o grau_relacao nao entrou no lugar: exigi-lo zeraria os 30 de todos). A fase INICIAL so se deixa com 30 fichas completas.';
