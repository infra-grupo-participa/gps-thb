-- Diário do aluno — Fase 2: liga uma nota da equipe (gps.aluno_notas) a um
-- evento do log (gps.aluno_eventos) — ex.: a equipe comenta em cima de
-- "Listou 15 clientes" ou de um "tarefa_concluida" específico.
--
-- ON DELETE SET NULL (não CASCADE): a NOTA é o dado valioso — texto que a
-- equipe escreveu. Se o evento referenciado um dia deixar de existir (hoje
-- gps.aluno_eventos não tem policy de delete nenhuma para ninguém, então só
-- aconteceria via gps.admin_excluir_acesso, que apaga o ambiente inteiro —
-- neste caso a nota TAMBÉM seria apagada por aluno_id, então o SET NULL é
-- teórico por ora, mas é a postura correta por padrão), a nota sobrevive.
alter table gps.aluno_notas
  add column evento_id uuid references gps.aluno_eventos(id) on delete set null;

comment on column gps.aluno_notas.evento_id is
  'Liga esta nota a um evento específico do log (gps.aluno_eventos) — ex.: comentário da equipe em cima de "Listou 15 clientes". Nulo = nota solta, sem evento associado (maioria dos casos). ON DELETE SET NULL: a nota é o dado valioso, não deve sumir se o evento sumir.';

-- Índice PARCIAL: só as notas que de fato apontam para um evento entram no
-- índice — a query que o usa (`notas por evento_id`, resolvida por
-- comNomesDeAutor/log-agregacao ao fundir nota+evento) SEMPRE filtra
-- `evento_id is not null` (via `.in("evento_id", [...])`, nunca busca notas
-- com evento_id nulo por este caminho). Prova do predicado: a leitura em
-- `src/lib/data.ts` nunca faz `where evento_id is null`; quem quer "notas
-- soltas" já usa `getDiarioDoAluno`/`getPendenciasAbertasDoAluno`, que não
-- filtram por evento_id.
create index idx_aluno_notas_evento on gps.aluno_notas (evento_id)
  where evento_id is not null;

comment on index gps.idx_aluno_notas_evento is
  'Índice parcial: serve select ... from gps.aluno_notas where evento_id in (...) para fundir notas com eventos na trilha. Parcial porque a query sempre filtra evento_id is not null (a maioria das notas não tem evento associado).';

-- ─────────────────────────────────────────────────────────────────────────
-- 🔴 Reescreve gps.aluno_notas_bloquear_edicao (migração 20260908000001).
--
-- A versão anterior enumerava colunas imutáveis uma a uma — não conhecia
-- `evento_id`, então esta coluna nasceria EDITÁVEL por UPDATE: furo no
-- append-only da Fase 1 (qualquer admin, ou bug de cliente, poderia religar
-- uma nota antiga a outro evento sem deixar rastro).
--
-- Reescrita: compara `to_jsonb(new)` com `to_jsonb(old)` inteiros, excluindo
-- só as duas colunas que a baixa de pendência legitimamente muda
-- (resolvido_em, resolvido_por). Assim TODA COLUNA FUTURA nasce imutável por
-- padrão — ninguém precisa lembrar de atualizar esta trigger de novo quando
-- a tabela ganhar uma coluna nova.
--
-- Assinatura idêntica à original (`returns trigger`, sem argumentos) de
-- propósito: `create or replace function` SUBSTITUI a função existente (o
-- trigger `trg_aluno_notas_append_only` continua apontando para o mesmo
-- nome/OID, não precisa recriar o trigger). Se a assinatura divergisse,
-- Postgres criaria uma SOBRECARGA nova em vez de substituir, e a função
-- antiga ficaria viva e esquecida.
create or replace function gps.aluno_notas_bloquear_edicao()
returns trigger
language plpgsql
as $$
begin
  if (to_jsonb(new) - 'resolvido_em' - 'resolvido_por')
     is distinct from
     (to_jsonb(old) - 'resolvido_em' - 'resolvido_por')
  then
    raise exception 'gps.aluno_notas é append-only: só resolvido_em/resolvido_por podem ser alterados após o insert'
      using errcode = '42501'; -- insufficient_privilege
  end if;
  return new;
end;
$$;

comment on function gps.aluno_notas_bloquear_edicao() is
  'Impõe append-only real comparando new/old inteiros via to_jsonb (menos resolvido_em/resolvido_por), em vez de enumerar colunas imutáveis uma a uma — assim toda coluna futura (ex.: evento_id, migração 20260909000003) nasce imutável por padrão, sem depender de lembrar de atualizar esta trigger.';
