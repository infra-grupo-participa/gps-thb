-- Plantão de Dúvidas — CANCELAR um plantão publicado + INTERRUPTOR de
-- inscrições com tela (Fase 8, 09/09/2026).
--
-- ⚠️ NÃO é o "agendamento de reunião com a equipe", removido em 10/08/2026
-- (commit b457005) e PROIBIDO de reconstruir. As tabelas `gps.reuniao_*`
-- seguem órfãs e esta migração não as toca.
--
-- ── MOTIVAÇÃO ────────────────────────────────────────────────────────────
-- Duas lacunas que hoje só se resolvem com SQL direto no banco — e o pedido
-- do Marcio é justamente que as operadoras (Isabela, Cristiane, Ilan) toquem
-- a agenda sem depender do dev:
--
-- L3 — Não existe CANCELAR um plantão publicado que já tem inscritos.
--   `removerSlot` é bloqueado por inscrito ativo DE PROPÓSITO: a FK de
--   `plantao_inscricoes` é `on delete cascade`, então apagar o slot levaria
--   junto presença e NPS. Resultado prático: quem precisa desmarcar um dia
--   fica sem caminho na tela. Cancelar não é apagar — o slot FICA, marcado,
--   para o histórico continuar legível e para o e-mail aos inscritos ter de
--   onde sair (data, hora, mentora, motivo).
--
-- L4 — Pausar as inscrições do plantão inteiro depende de
--   `alter role authenticator set app.plantao_inscricao_aberta = 'false'`,
--   que só um dev com acesso ao banco executa. O interruptor de emergência
--   existe desde a ...043 e nunca teve tela.
--
-- ── DECISÃO: CANCELADO = DESPUBLICADO + INSCRIÇÕES CANCELADAS ────────────
-- ZERO mudança de contrato público. Nenhuma RPC é recriada aqui porque todas
-- já filtram pelas duas condições (corpos vigentes conferidos no repo):
--   plantao_calendario ............... where sl.publicado
--   plantao_inscrever ................ `if not found or not v_slot.publicado` -> recusa
--   plantao_minha_inscricao .......... i.cancelado_em is null
--   plantao_email_sala_pendente ...... i.cancelado_em is null and sl.publicado
--   plantao_aviso_mentora_pendente ... i.cancelado_em is null and sl.publicado
-- `cancelado_em` é, portanto, MARCA DE HISTÓRICO e insumo do e-mail — não é
-- uma segunda fonte de verdade sobre visibilidade. Um slot cancelado some do
-- calendário porque `publicado` virou false, não porque a data foi carimbada.
-- Fosse o contrário, teríamos duas regras para o mesmo fato e uma delas
-- ficaria esquecida na próxima RPC que alguém escrever.
--
-- ── A TABELA MANDA; O SETTING VIRA FALLBACK ──────────────────────────────
-- Corpo VIGENTE de gps.plantao_escrita_liberada() (migrations ...043/...044):
--   select coalesce(current_setting('app.plantao_inscricao_aberta', true),
--                   'true') <> 'false';
-- O novo corpo lê a TABELA primeiro e mantém o setting como segundo degrau:
-- o desligamento sem deploy continua existindo para emergência e a tela
-- passa a ser o caminho normal. O `coalesce(..., 'true')` final preserva a
-- regra que já valia — AUSENTE = ABERTO. O default tem de ser funcionar,
-- senão o produto morre no dia em que alguém esquecer de popular a linha.
--
-- ⚠️ Ordem dos degraus: com a linha em 'true' e o setting em 'false', as
-- escritas ficam ABERTAS. É deliberado — a tela é a autoridade do dia a dia.
-- Para a emergência prevalecer sobre a tela, desliga-se PELA tela (ou
-- `delete from gps.plantao_config where chave = 'inscricao_aberta'`, que faz
-- o setting voltar a decidir sozinho).
--
-- ── O QUE ESTA MIGRAÇÃO NÃO FAZ ──────────────────────────────────────────
--   * não recria plantao_calendario / plantao_minha_inscricao /
--     plantao_inscrever / plantao_cancelar — ver acima;
--   * não cria índice para `cancelado_em`: a leitura do admin é sempre por
--     mês (`inicio_em >= $1 and inicio_em < $2`, já servida pelo scan de
--     mês) e devolve dezenas de linhas; a tabela tem ordem de centenas.
--     Índice aqui seria peso morto de escrita sem plano que o justifique;
--   * não mexe nos GRANTs de gps.plantao_escrita_liberada(): `create or
--     replace` preserva os existentes e as ...043/...044 não declaram nenhum
--     para ela (segue o default do Postgres, `execute to public`). A função
--     devolve um booleano de estado do produto, não dado de pessoa;
--   * não apaga slot nenhum e não apaga inscrição nenhuma — cancelar carimba;
--   * não avisa ninguém: o e-mail aos inscritos é da aplicação
--     (`cancelarSlot` -> `enviarPlantaoCancelamento`), não do banco. Envio de
--     e-mail dentro de transação de banco é acoplamento que trava escrita
--     quando a Resend cai;
--   * não muda a política de quem enxerga o quê: `plantao_config` é só-admin
--     e `anon` não recebe grant nenhum (a RPC lê por SECURITY DEFINER).
--
-- ── REVERSÃO (literal, nesta ordem) ──────────────────────────────────────
--   1) create or replace function gps.plantao_escrita_liberada()
--        returns boolean language sql stable security definer
--        set search_path to '' as $$
--          select coalesce(current_setting('app.plantao_inscricao_aberta', true),
--                          'true') <> 'false';
--        $$;
--      (é o corpo VIGENTE colado acima, textual);
--   2) drop table gps.plantao_config;
--   3) alter table gps.plantao_slots
--        drop constraint if exists plantao_slots_cancelado_motivo_check,
--        drop constraint if exists plantao_slots_cancelado_coerente_check,
--        drop column if exists cancelado_motivo,
--        drop column if exists cancelado_em;
--      ⚠️ O passo 3 PERDE o registro de QUAIS plantões foram cancelados e por
--      quê. O estado operacional sobrevive (os slots seguem com
--      publicado=false e as inscrições seguem canceladas) — some só a
--      explicação. Se a reversão for temporária, pare no passo 1.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. plantao_slots: cancelamento
-- ─────────────────────────────────────────────────────────────────────────

alter table gps.plantao_slots
  add column if not exists cancelado_em timestamptz,
  add column if not exists cancelado_motivo text;

comment on column gps.plantao_slots.cancelado_em is
  'Instante em que a equipe cancelou o plantao. Cancelado = despublicado (publicado=false) + inscricoes ativas canceladas; NUNCA apagado — o slot fica para o historico continuar legivel e para o e-mail aos inscritos ter de onde sair. Nenhuma RPC publica le esta coluna: quem tira o slot do calendario e `publicado`.';

comment on column gps.plantao_slots.cancelado_motivo is
  'Motivo opcional, digitado pela equipe, mostrado no e-mail que avisa os inscritos. Teto de 300 caracteres — e texto livre que vai por e-mail para dezenas de pessoas, nao campo de anotacao interna.';

-- Constraints NOMEADAS (o `check` inline geraria nome automático e a
-- reversão viraria adivinhação). `drop if exists` antes torna a migração
-- reaplicável sem erro.
alter table gps.plantao_slots
  drop constraint if exists plantao_slots_cancelado_motivo_check;

alter table gps.plantao_slots
  add constraint plantao_slots_cancelado_motivo_check
  check (cancelado_motivo is null or length(cancelado_motivo) between 1 and 300);

-- Coerência: motivo sem cancelamento é estado que nenhuma tela sabe exibir e
-- que faria um e-mail citar a justificativa de um plantão que está de pé. A
-- aplicação sempre grava os dois juntos; a constraint garante que continue
-- assim depois do próximo `update` escrito às pressas.
alter table gps.plantao_slots
  drop constraint if exists plantao_slots_cancelado_coerente_check;

alter table gps.plantao_slots
  add constraint plantao_slots_cancelado_coerente_check
  check (cancelado_motivo is null or cancelado_em is not null);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. plantao_config — o interruptor com tela
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists gps.plantao_config (
  chave text primary key
    check (length(chave) between 1 and 64),
  valor text not null
    check (length(valor) between 1 and 200),
  atualizado_em timestamptz not null default now(),
  -- `on delete set null` EXPLÍCITO: sem ele a FK impediria a exclusão de um
  -- `auth.users` que um dia tocou a config (gps.admin_excluir_acesso apaga
  -- linha de auth.users). Quem mexeu é rastro útil, não pode virar tranca.
  atualizado_por uuid references auth.users(id) on delete set null
);

comment on table gps.plantao_config is
  'Configuracao operacional do Plantao, editavel pela equipe SEM deploy e SEM SQL. Hoje uma chave: inscricao_aberta (''true''/''false''), lida por gps.plantao_escrita_liberada(). Tabela de 1 linha — PK lookup e o plano correto, sem indice alem da PK. `anon` NAO tem grant: a leitura publica acontece dentro da RPC SECURITY DEFINER, nunca por SELECT direto.';

comment on column gps.plantao_config.valor is
  'Texto, nao boolean: a tabela e generica de proposito (a proxima chave pode ser um numero ou um horario). A leitura compara com a string ''false'', mesma semantica do current_setting que ela substitui.';

alter table gps.plantao_config enable row level security;

drop policy if exists gps_plantao_config_admin on gps.plantao_config;

create policy gps_plantao_config_admin on gps.plantao_config
  for all
  to authenticated
  using (public.gp_is_admin())
  with check (public.gp_is_admin());

-- `revoke` ANTES do `grant` — mesma ordem da estrutura do plantão, antídoto
-- explícito ao incidente do CNHF (o GRANT que passou antes do RLS).
revoke all on gps.plantao_config from anon;
revoke all on gps.plantao_config from public;

-- Sem `delete` para `authenticated`: a aplicação faz upsert (select/insert/
-- update) e nunca apaga. Apagar a linha é operação de reversão, do dono do
-- banco — não um caminho que uma tela possa acionar por engano.
grant select, insert, update on gps.plantao_config to authenticated;
-- ALTER DEFAULT PRIVILEGES do schema gps concede DELETE a authenticated em tabela nova
-- (conferido no banco em 08/09): revogar explicitamente, apagar a linha e passo de reversao.
revoke delete on gps.plantao_config from authenticated;
grant select, insert, update, delete on gps.plantao_config to service_role;

drop trigger if exists trg_plantao_config_atualizado_em on gps.plantao_config;

create trigger trg_plantao_config_atualizado_em
  before update on gps.plantao_config
  for each row execute function gps.touch_atualizado_em();

-- Estado inicial explícito. `on conflict do nothing` para a migração ser
-- reaplicável sem sobrescrever uma pausa que a equipe tenha ligado.
insert into gps.plantao_config (chave, valor)
values ('inscricao_aberta', 'true')
on conflict (chave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. plantao_escrita_liberada() — a tabela manda, o setting é fallback
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.plantao_escrita_liberada()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (select c.valor from gps.plantao_config c where c.chave = 'inscricao_aberta'),
    current_setting('app.plantao_inscricao_aberta', true),
    'true') <> 'false';
$function$;

comment on function gps.plantao_escrita_liberada() is
  'Interruptor de TODAS as escritas publicas do plantao: inscrever, cancelar, revelar_link (grava presenca) e registrar_nps. Leitura (calendario, minha_inscricao) continua liberada de proposito. Fonte primaria: gps.plantao_config(chave=''inscricao_aberta''), editavel pela equipe em /admin/plantao sem deploy. Fallback: o setting app.plantao_inscricao_aberta (alter role authenticator set ...), mantido para emergencia. Ausente nos dois = ABERTO: o default tem de ser funcionar.';
