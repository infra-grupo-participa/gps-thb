-- ═══════════════════════════════════════════════════════════════════════════
-- Minuta da ficha ganha STATUS e PARECER da equipe (02/10/2026, card 86akryphf)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ORIGEM (decisão do João, 02/10): o anexo de minuta é a ponte com o GERADOR
-- DE MINUTAS (sistema à parte, SEM integração — esta migração não integra
-- nada com ele). Hoje o parceiro anexa e não vê retorno: a análise volta por
-- fora, no WhatsApp. Uso real: 10 minutas, 9 parceiros, desde 21/09.
--
-- O QUE MUDA
--   * gps.cliente_minutas ganha 4 colunas: status (enviada|em_analise|
--     revisada, default 'enviada'), parecer (≤ 4000), parecer_em, parecer_por.
--   * gps.minuta_registrar_parecer(p_minuta_id, p_status, p_parecer):
--     SECURITY DEFINER, SÓ EQUIPE (gp_is_admin, senão 42501). Parecer
--     obrigatório quando 'revisada'. Devolve o e-mail do parceiro para a
--     action avisar (molde do ramo equipe de gps.chamado_responder, …335):
--     quem enviou a versão (se NÃO foi a equipe), senão o titular do
--     ambiente (thb_alunos.email).
--   * cliente_minuta_anexar NÃO muda: o INSERT dela não cita `status`, então
--     a versão nova nasce 'enviada' pelo default. Nada a recriar.
--
-- GRANTS DE TABELA (conferido lendo as migrações):
--   …259: `revoke all … from public, anon; grant select … to authenticated`.
--   …273 bloco 6: `revoke insert, update, delete on gps.cliente_minutas from
--   authenticated` (o `grant select` não revogava o default do schema).
--   Única policy da tabela: `cliente_minutas_select` (FOR SELECT).
--   ⇒ `authenticated` não tem UPDATE na TABELA; coluna nova herda o ACL de
--   tabela (nenhum grant de coluna aqui). O bloco 3 abaixo REPETE o revoke
--   (idempotente) para a prova não depender de nenhuma migração entre a …273
--   e esta ter mexido no ACL — e a prova SQL do relatório confere o efeito.
--
-- ÍNDICE: nenhum novo. A RPC acessa por PK (`where id = $1`), a leitura da
--   ficha segue `cliente_minutas_cliente_idx (cliente_id, enviado_em desc)`.
--   Nenhuma coluna nova entra em WHERE/ORDER BY.
--
-- TRILHA: parecer_em/parecer_por na própria linha. NÃO grava em
--   gps.aluno_eventos — exigiria reescrever aluno_eventos_tipo_check (lista
--   longa, risco de apagar tipo em silêncio) por um evento que a ficha já
--   mostra. Fica para quando o Diário precisar dele.
--
-- REVERSÃO (nesta ordem):
--   drop function gps.minuta_registrar_parecer(uuid, text, text);
--   alter table gps.cliente_minutas
--     drop constraint chk_cliente_minutas_status,
--     drop constraint chk_cliente_minutas_parecer_tam,
--     drop column status, drop column parecer,
--     drop column parecer_em, drop column parecer_por;
--   (o revoke do bloco 3 fica: é o estado correto desde a …273)
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '3s';
set local statement_timeout = '20s';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Colunas novas
--    `status` com default constante: Postgres 11+ grava o default no catálogo,
--    sem reescrever a tabela, e as linhas existentes já LEEM 'enviada'. O
--    UPDATE abaixo é o backfill explícito pedido (no-op lógico; 10 linhas).
-- ═══════════════════════════════════════════════════════════════════════════
alter table gps.cliente_minutas
  add column if not exists status      text not null default 'enviada',
  add column if not exists parecer     text,
  add column if not exists parecer_em  timestamptz,
  add column if not exists parecer_por uuid references auth.users(id) on delete set null;

-- Backfill: o `default 'enviada'` do ADD COLUMN NOT NULL já preenche todas as
-- linhas existentes. A asserção prova isso em vez de um UPDATE que não casaria
-- nada (coluna NOT NULL) e só gastaria WAL.
do $$
begin
  if exists (select 1 from gps.cliente_minutas where status is distinct from 'enviada') then
    raise exception 'backfill de status falhou: ha minuta com status <> enviada';
  end if;
end $$;

alter table gps.cliente_minutas
  add constraint chk_cliente_minutas_status
  check (status in ('enviada', 'em_analise', 'revisada'));

-- Tamanho em CHECK próprio (mesmo motivo da …273: a mensagem não mente sobre
-- qual regra caiu). "Revisada exige parecer" mora na RPC, não aqui: assim um
-- status antigo sem parecer nunca vira violação retroativa.
alter table gps.cliente_minutas
  add constraint chk_cliente_minutas_parecer_tam
  check (parecer is null or char_length(parecer) <= 4000);

comment on column gps.cliente_minutas.status is
  'Andamento da analise desta versao pela EQUIPE (…341, 02/10/2026): enviada (default, nasce assim) | em_analise | revisada. Escrita SO por gps.minuta_registrar_parecer (so admin). Sem integracao com o gerador de minutas.';
comment on column gps.cliente_minutas.parecer is
  'Parecer da equipe sobre ESTA versao, texto puro (a tela renderiza como texto, nunca HTML). Ate 4000 caracteres. Obrigatorio para status revisada (regra da RPC). NAO vai no e-mail ao parceiro.';
comment on column gps.cliente_minutas.parecer_em is
  'Quando a equipe mudou status/parecer pela ultima vez (gps.minuta_registrar_parecer).';
comment on column gps.cliente_minutas.parecer_por is
  'Admin que mudou status/parecer pela ultima vez (auth.uid() na RPC).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. gps.minuta_registrar_parecer — só equipe
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.minuta_registrar_parecer(
  p_minuta_id uuid,
  p_status    text,
  p_parecer   text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_status   text := btrim(coalesce(p_status, ''));
  v_parecer  text := nullif(btrim(coalesce(p_parecer, '')), '');
  v_m            record;
  v_aluno_id     uuid;
  v_cliente_nome text;
  v_email        text;
begin
  -- AUTORIZAÇÃO primeiro: o parceiro não descobre nem se a minuta existe.
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if p_minuta_id is null then
    raise exception 'Minuta não informada.' using errcode = '22023';
  end if;
  if v_status not in ('enviada', 'em_analise', 'revisada') then
    raise exception 'Status de minuta inválido.' using errcode = '22023';
  end if;
  if v_parecer is not null and char_length(v_parecer) > 4000 then
    raise exception 'O parecer passa de 4000 caracteres.' using errcode = '22023';
  end if;
  if v_status = 'revisada' and v_parecer is null then
    raise exception 'Escreva o parecer para marcar a minuta como revisada.' using errcode = '22023';
  end if;

  update gps.cliente_minutas m
     set status      = v_status,
         parecer     = v_parecer,
         parecer_em  = now(),
         parecer_por = auth.uid()
   where m.id = p_minuta_id
  returning m.id, m.cliente_id, m.enviado_por, m.enviado_pela_equipe
    into v_m;

  if not found then
    raise exception 'Minuta não encontrada.' using errcode = 'P0002';
  end if;

  select c.aluno_id, c.nome
    into v_aluno_id, v_cliente_nome
    from gps.etapa1_clientes c
   where c.id = v_m.cliente_id;

  -- Destinatário (molde do ramo equipe de gps.chamado_responder, …335): quem
  -- enviou a versão, se foi o PARCEIRO (titular ou sócio) E ainda é membro do
  -- ambiente; se foi a equipe, a conta sumiu ou a pessoa saiu do ambiente,
  -- o titular (thb_alunos.email).
  v_email := coalesce(
    case when not v_m.enviado_pela_equipe
              and v_m.enviado_por is not null
              -- Pentest (02/10, BAIXO): só se AINDA é membro deste ambiente.
              -- Sócio movido/removido não recebe aviso de caso que não é mais dele.
              and exists (select 1 from gps.membros mb
                           where mb.user_id = v_m.enviado_por
                             and mb.aluno_id = v_aluno_id)
         then (select u.email from auth.users u where u.id = v_m.enviado_por) end,
    (select a.email from public.thb_alunos a where a.id = v_aluno_id));

  return jsonb_build_object(
    'id',           v_m.id,
    'cliente_id',   v_m.cliente_id,
    'aluno_id',     v_aluno_id,
    'cliente_nome', v_cliente_nome,
    'status',       v_status,
    'avisar',       nullif(btrim(coalesce(v_email, '')), ''));
end $function$;

comment on function gps.minuta_registrar_parecer(uuid, text, text) is
  'Equipe registra status (enviada|em_analise|revisada) e parecer de UMA versao de minuta (…341, 02/10/2026). SO ADMIN (gp_is_admin, senao 42501 -- antes de qualquer leitura). Parecer obrigatorio para revisada, ate 4000. Sobrescreve status/parecer e carimba parecer_em/parecer_por. Devolve jsonb {id, cliente_id, aluno_id, cliente_nome, status, avisar}: avisar = e-mail de quem enviou a versao (se foi o parceiro e ainda e membro do ambiente) senao o do titular (thb_alunos) -- a action manda o aviso quando status = revisada; falha de e-mail nao desfaz o parecer.';

revoke all     on function gps.minuta_registrar_parecer(uuid, text, text) from public, anon;
grant  execute on function gps.minuta_registrar_parecer(uuid, text, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. ACL de tabela — reafirma a …273 (idempotente). Escrita SÓ por RPC.
-- ═══════════════════════════════════════════════════════════════════════════
revoke insert, update, delete, truncate on gps.cliente_minutas from public, anon, authenticated;

commit;

-- ═══ MEDIDO em produção, 02/10/2026 (begin … rollback) ═══
-- P1 parceiro → RPC 42501 · P2 parceiro UPDATE direto 42501 · P3 parceiro lê a própria
-- minuta (1 linha) · P4 revisada sem parecer 22023 · P5 status inválido 22023 · P6 admin
-- grava, avisar preenchido, aluno certo · P7 admin UPDATE direto 42501 · P8 authenticated
-- sem UPDATE na tabela, anon sem EXECUTE · P9 outras minutas intactas (0).
-- explain (analyze, buffers) — leitura da ficha (2ª passada):
--   Index Scan using cliente_minutas_cliente_idx on cliente_minutas (actual rows=1)
--     Index Cond: (cliente_id = (InitPlan 1).col1) · Buffers: shared hit=4
--   Execution Time: 0.054 ms
-- explain (analyze, buffers) — UPDATE da RPC:
--   Update on cliente_minutas m → Index Scan using cliente_minutas_pkey (Index Cond: id = …)
--   Buffers: shared hit=31 · Execution Time: 0.704 ms
-- (o Seq Scan do InitPlan é só do seletor "minuta mais recente" da prova, 10 linhas.)
