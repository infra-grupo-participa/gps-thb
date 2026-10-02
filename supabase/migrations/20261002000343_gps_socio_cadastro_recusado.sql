-- ============================================================
-- 343 — O sócio recusado por CPF de outro cadastro não fica preso no formulário
-- ============================================================
-- Achado da aprovação final da 338 (UX, queixa C41): a saída
-- `cpf_de_outro_membro` de gps.socio_cadastro_gravar deixa pessoa_aluno_id
-- NULO de propósito (a Central resolve). Como o gate do portal decide pelo
-- pessoa_aluno_id, o formulário obrigatório reabria a cada visita, para
-- sempre — o sócio nunca entrava.
--
-- Esta função diz ao gate "este login já tentou e foi recusado". Fonte: a
-- trilha que a RPC JÁ grava em gps.acessos_log (acao
-- 'socio_cadastro_preenchido'), nos dois textos que a …256 e a …338 escrevem
-- quando NÃO ligam a pessoa:
--   · 'sócio informou CPF que já pertence a outra pessoa do programa; nada foi gravado'
--   · 'sócio preencheu o cadastro (documento …) — CPF já é de outra pessoa do programa; vínculo NÃO criado'
-- Os dois contêm 'outra pessoa do programa'. Zero escrita, zero tabela nova.
--
-- Só responde sobre o PRÓPRIO auth.uid() (nenhum parâmetro): não serve para
-- sondar terceiros. Quando a Central liga a pessoa, pessoa_aluno_id deixa de
-- ser nulo e o gate nem chama esta função.
--
-- Índice: idx_acessos_log_aluno (aluno_id, criado_em desc) — a busca fixa
-- aluno_id = ambiente do membro (é o aluno_id que a RPC grava no log).
--
-- ── PRÉ-CHECAGEM (PARAR se divergir) ───────────────────────────────────────
-- P1. As frases de recusa vivas no corpo da RPC (depois da 338):
--   select pg_get_functiondef('gps.socio_cadastro_gravar(text,text,text,text,text,text,text,text,text,text)'::regprocedure)
--          ~ 'outra pessoa do programa' as frase_no_ar;
--   PARAR se false.
-- P2. select indexdef from pg_indexes where indexname = 'idx_acessos_log_aluno';
--   PARAR se não for (aluno_id, criado_em DESC).
--
-- ── ENSAIO EM PRODUÇÃO (02/10/2026, begin…rollback junto com a 338) ────────
-- sócio de prova sem pessoa: antes = false · socio_cadastro_gravar com CPF de
-- outro cadastro → {"ok": false, "cpf_de_outro_membro": true} · depois = true ·
-- titular = false · anon = 42501.
-- explain (analyze, buffers) select gps.socio_cadastro_recusado():
--   Result (actual time=0.263..0.263 rows=1 loops=1) · Buffers: shared hit=5
--   Planning Time: 0.005 ms · Execution Time: 0.270 ms
--
-- ── REVERSÃO ───────────────────────────────────────────────────────────────
--   drop function if exists gps.socio_cadastro_recusado();
--   (o front trata erro da RPC como "não recusado": volta ao formulário)
-- ============================================================

begin;

set local lock_timeout = '2s';
set local statement_timeout = '30s';

create or replace function gps.socio_cadastro_recusado()
returns boolean
language plpgsql
stable
security definer
set search_path to ''
as $fn$
declare
  v_user uuid := auth.uid();
  v_amb  uuid;
begin
  if v_user is null then return false; end if;

  -- Só sócio sem pessoa: é o único estado em que a pergunta faz sentido.
  select m.aluno_id into v_amb
    from gps.membros m
   where m.user_id = v_user and m.papel = 'socio' and m.pessoa_aluno_id is null;
  if v_amb is null then return false; end if;

  return coalesce(exists (
    select 1 from gps.acessos_log l
     where l.aluno_id = v_amb
       and l.user_id_alvo = v_user
       and l.acao = 'socio_cadastro_preenchido'
       and l.detalhe like '%outra pessoa do programa%'
  ), false);
end
$fn$;

revoke all     on function gps.socio_cadastro_recusado() from public, anon, authenticated;
grant  execute on function gps.socio_cadastro_recusado() to authenticated;

comment on function gps.socio_cadastro_recusado() is
  'true quando o PROPRIO socio logado (auth.uid(), sem parametro) ainda sem pessoa_aluno_id ja teve o cadastro recusado por CPF de outro cadastro (trilha socio_cadastro_preenchido em gps.acessos_log, frase "outra pessoa do programa"). O gate troca o formulario obrigatorio por um aviso dispensavel. Leitura pura; false em qualquer outro caso.';

commit;
