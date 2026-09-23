-- ═══════════════════════════════════════════════════════════════════════════
-- Entrevista Prévia 2.0 — formulário guiado, DISC automático, trava de
-- decisores. APLICADA EM PRODUÇÃO em 23/09/2026, em 4 blocos por MCP:
--   gps_entrevista_previa_estrutura · _rpcs · _concluir
--   + gps.cliente_decisores_pendentes
--
-- Pedido do Marcio (23/09): *"typeform ao vivo com as perguntas ao vivo"*,
-- 20-30 perguntas FECHADAS, *"ao final, eh gerado um relatorio geral do perfil
-- disc dele, automatico, sem precisar informar, anexar"*, entrevistas
-- ILIMITADAS, e *"para realizar a reunião preliminar, todos os decisores
-- precisam"*.
--
-- ── DECISÕES DE DESENHO ────────────────────────────────────────────────────
--
-- 🔑 REUSA `gps.cliente_decisores` (já existia, 0 linhas) em vez de criar
-- tabela nova: ela já é lida por `sessao_briefing_montar`, `entrevista_gravar`
-- e `dossie_do_cliente`. Gravar ali faz o decisor aparecer no briefing da
-- doutora sem uma linha de código a mais.
--
-- 🔑 O DISC vai para `gps.etapa1_clientes` — de onde o briefing lê AO VIVO.
-- Era o pedido literal: *"sem precisar informar, anexar"*.
--
-- 🔑 O CÁLCULO vive no TypeScript (`src/lib/entrevista-previa-calculo.ts`),
-- não em plpgsql. Os pesos estão no roteiro; duplicá-los aqui criaria duas
-- fontes de verdade que divergem no primeiro ajuste de pergunta. O banco
-- valida a FORMA (letra no catálogo, tamanhos), nunca o mérito.
--
-- 🔴 SEM unique em `cliente_id`: entrevistas ILIMITADAS é requisito, não
-- descuido. O histórico inteiro fica; a ficha usa a mais recente.
--
-- 🔴 NÃO é `gps.entrevista_gravar` (…266/…268), que é da esteira de ligações
-- da EQUIPE (`gps.eh_equipe()`, 0 registros). Esta é do PARCEIRO, na ficha do
-- cliente dele. Públicos diferentes, guardas diferentes.
--
-- ── MEDIDO EM PRODUÇÃO (8 passos, em transação com rollback) ───────────────
--   1. iniciar                      → ok
--   2. iniciar de novo              → MESMO id (retoma, não duplica)
--   3. salvar progresso             → ok
--   4. concluir                     → perfil D, 2 decisores, exige_todos=true
--   5. DISC chegou na FICHA         → 'D' + relatório gravado
--   6. cliente_decisores_pendentes  → total 2, exige_todos true, tem_disc true
--   7. concluir 2×                  → recusado "Esta entrevista já foi concluída."
--   8. nova entrevista mesmo cliente→ id diferente (ilimitadas ✓)
--
-- Sem `explain analyze`: são INSERT/UPDATE por chave primária e um SELECT por
-- `idx_entrevista_previa_cliente`. O volume é de unidades por cliente, e a
-- tela abre uma entrevista por vez. Nenhum índice além do criado se justifica.
--
-- REVERSÃO: `drop table gps.entrevista_previa cascade` + drop das 5 funções.
-- `gps.cliente_decisores` e o DISC da ficha ficam — são dado de negócio, não
-- artefato desta feature.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⚠️ As 5 FUNÇÕES aplicadas estão em `pg_get_functiondef` — confira a versão
-- VIVA antes de reescrever qualquer uma:
--   gps.entrevista_previa_pode(uuid)
--   gps.entrevista_previa_iniciar(uuid, text)
--   gps.entrevista_previa_salvar(uuid, jsonb)
--   gps.entrevista_previa_concluir(uuid, jsonb, text, jsonb, text, text, text, jsonb)
--   gps.cliente_decisores_pendentes(uuid)
-- Todas SECURITY DEFINER, `search_path=''`, revoke de public/anon, grant só a
-- `authenticated` — a guarda real é `entrevista_previa_pode` dentro de cada uma.

create table if not exists gps.entrevista_previa (
  id            uuid primary key default gen_random_uuid(),
  cliente_id    uuid not null references gps.etapa1_clientes(id) on delete cascade,
  aluno_id      uuid not null,
  entrevistado  text,
  respostas     jsonb not null default '{}'::jsonb,
  perfil_disc   text,
  disc_pontos   jsonb,
  decisores_total smallint,
  concluida_em  timestamptz,
  criado_em     timestamptz not null default now(),
  criado_por    uuid,
  atualizado_em timestamptz not null default now(),
  constraint chk_entrevista_previa_disc
    check (perfil_disc is null or perfil_disc in ('D','I','S','C')),
  constraint chk_entrevista_previa_entrevistado
    check (entrevistado is null or char_length(btrim(entrevistado)) between 2 and 120),
  constraint chk_entrevista_previa_decisores
    check (decisores_total is null or decisores_total between 1 and 20)
);

create index if not exists idx_entrevista_previa_cliente
  on gps.entrevista_previa (cliente_id, criado_em desc);

alter table gps.entrevista_previa enable row level security;

-- Molde de `gps.cliente_decisores`: admin tudo, parceiro só no próprio
-- ambiente. Escrita só por RPC, então aqui só SELECT.
drop policy if exists gps_entrevista_previa_select on gps.entrevista_previa;
create policy gps_entrevista_previa_select on gps.entrevista_previa
  for select using (
    public.gp_is_admin()
    or exists (select 1 from gps.etapa1_clientes c
                where c.id = entrevista_previa.cliente_id
                  and c.aluno_id = gps.aluno_atual())
  );

revoke all on gps.entrevista_previa from anon;
grant select on gps.entrevista_previa to authenticated;
