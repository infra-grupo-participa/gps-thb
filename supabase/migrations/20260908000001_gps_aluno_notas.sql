-- Diário do aluno — linha do tempo da EQUIPE sobre cada aluno.
--
-- ⚠️ Visualização EXCLUSIVA do admin. O aluno NUNCA vê, o sócio NUNCA vê.
-- Não é preferência de produto, é LGPD: 10 das 21 notas reais levantadas na
-- planilha trazem dado pessoal de TERCEIROS (IRPF item a item, bens
-- declarados abaixo do mercado, filho com processo de pensão, cliente
-- vereador/PEP, patrimônios com nomes de herdeiros). Se um dia alguém achar
-- que "o aluno merece ver o histórico dele", ISSO NÃO PODE virar uma policy
-- de SELECT para `gps.aluno_atual()` nesta tabela — a informação sensível de
-- terceiros embutida no texto livre não tem como ser filtrada depois. Uma
-- visão para o aluno, se um dia for decidida, precisa de campo/tabela
-- separada com dado curado, não desta.
--
-- Reversão: `drop table gps.aluno_notas cascade`.
--
-- `aluno_id` é o AMBIENTE (titular), igual a etapa1_clientes/progresso — mas
-- SEM foreign key para thb_alunos ou gps.membros de propósito:
-- `public.thb_alunos` é compartilhada com o `sip` ao vivo, e um `on delete
-- restrict` do lado do gps travaria uma exclusão feita por outro sistema
-- que nem sabe que este schema existe.
create table gps.aluno_notas (
  id            uuid primary key default gen_random_uuid(),
  aluno_id      uuid not null,
  autor_id      uuid not null references auth.users(id) on delete restrict,
  criado_em     timestamptz not null default now(),
  voz           text not null check (voz in ('equipe','aluno')),
  tipo          text not null check (tipo in ('observacao','duvida','combinado','pendencia')),
  origem        text not null check (origem in ('reuniao','email','whatsapp','plataforma','planilha')),
  texto         text not null check (length(btrim(texto)) between 1 and 8000),
  resolvido_em  timestamptz,
  resolvido_por uuid references auth.users(id) on delete restrict,
  constraint chk_baixa_so_em_pendencia check (resolvido_em is null or tipo = 'pendencia'),
  constraint chk_baixa_tem_autor check ((resolvido_em is null) = (resolvido_por is null))
);

comment on table gps.aluno_notas is
  'Diário/linha do tempo da EQUIPE sobre cada aluno. Visualização EXCLUSIVA do admin — LGPD (dado pessoal de terceiros embutido no texto livre). Ver comentário completo no topo da migration 20260908000001. Append-only imposto por trigger: só resolvido_em/resolvido_por podem mudar depois do insert.';

comment on column gps.aluno_notas.aluno_id is
  'aluno_id do AMBIENTE (titular), igual a gps.etapa1_clientes/gps.progresso. SEM foreign key de propósito: thb_alunos é compartilhada com o sip ao vivo, e um FK com restrict aqui impediria exclusão feita por outro sistema.';

comment on column gps.aluno_notas.voz is
  'De quem é a fala registrada nesta nota: equipe (observação da equipe) ou aluno (o que o aluno disse/perguntou, registrado pela equipe).';

comment on column gps.aluno_notas.resolvido_em is
  'Baixa de pendência. Só pode ser preenchido quando tipo=pendencia (chk_baixa_so_em_pendencia) e sempre junto com resolvido_por (chk_baixa_tem_autor). É a ÚNICA coisa que um UPDATE pode alterar — ver trg_aluno_notas_append_only.';

-- ─────────────────────────────────────────────────────────────────────────
-- Índices
-- ─────────────────────────────────────────────────────────────────────────
create index idx_aluno_notas_timeline on gps.aluno_notas (aluno_id, criado_em desc);

comment on index gps.idx_aluno_notas_timeline is
  'Serve a timeline do diário: select ... from gps.aluno_notas where aluno_id = $1 order by criado_em desc limit 50 (getDiarioDoAluno) e a derivação de ResumoDiario (última nota) a partir da mesma query.';

create index idx_aluno_notas_pendencia_aberta on gps.aluno_notas (aluno_id)
  where tipo = 'pendencia' and resolvido_em is null;

comment on index gps.idx_aluno_notas_pendencia_aberta is
  'Índice parcial correto porque a query SEMPRE filtra por ambos os predicados do WHERE: select aluno_id from gps.aluno_notas where tipo=''pendencia'' and resolvido_em is null (getPendenciasPorAluno, base inteira) e a contagem de pendências abertas de um aluno em getResumoDiario/darBaixaPendencia.';

-- ─────────────────────────────────────────────────────────────────────────
-- Trigger de append-only real — imposto pelo banco, não pela UI.
--
-- As policies de UPDATE (abaixo) autorizam o admin a fazer UPDATE na linha,
-- mas "poder fazer UPDATE" não deveria significar "poder reescrever o
-- texto/tipo/autor". Sem esta trigger, qualquer admin (ou um bug de
-- cliente) reescreveria `texto` pelo PostgREST sem deixar rastro — a nota
-- deixaria de ser um diário confiável. A trigger permite update SÓ quando a
-- ÚNICA mudança é em resolvido_em/resolvido_por (a baixa de pendência);
-- qualquer outra coluna tocada é rejeitada.
-- ─────────────────────────────────────────────────────────────────────────
create function gps.aluno_notas_bloquear_edicao()
returns trigger
language plpgsql
as $$
begin
  if new.id is distinct from old.id
    or new.aluno_id is distinct from old.aluno_id
    or new.autor_id is distinct from old.autor_id
    or new.criado_em is distinct from old.criado_em
    or new.voz is distinct from old.voz
    or new.tipo is distinct from old.tipo
    or new.origem is distinct from old.origem
    or new.texto is distinct from old.texto
  then
    raise exception 'gps.aluno_notas é append-only: só resolvido_em/resolvido_por podem ser alterados após o insert'
      using errcode = '42501'; -- insufficient_privilege
  end if;
  return new;
end;
$$;

comment on function gps.aluno_notas_bloquear_edicao() is
  'Impõe append-only real: rejeita qualquer UPDATE que toque coluna diferente de resolvido_em/resolvido_por. Sem isso, a policy de UPDATE do admin (necessária para dar baixa em pendência) permitiria reescrever o texto do diário sem rastro.';

create trigger trg_aluno_notas_append_only
  before update on gps.aluno_notas
  for each row execute function gps.aluno_notas_bloquear_edicao();

-- ─────────────────────────────────────────────────────────────────────────
-- RLS — só admin, e SEM policy de delete (sem policy = delete negado).
-- NÃO usar `for all`: concederia DELETE e quebraria o append-only.
-- ─────────────────────────────────────────────────────────────────────────
alter table gps.aluno_notas enable row level security;

create policy gps_aluno_notas_admin_select on gps.aluno_notas
  for select
  using (public.gp_is_admin());

create policy gps_aluno_notas_admin_insert on gps.aluno_notas
  for insert
  with check (public.gp_is_admin() and autor_id = auth.uid());

create policy gps_aluno_notas_admin_update on gps.aluno_notas
  for update
  using (public.gp_is_admin())
  with check (public.gp_is_admin());

-- NENHUMA policy de delete: sem policy, delete é negado (mesmo para admin).

grant select, insert, update on gps.aluno_notas to authenticated;
-- ZERO grant para anon.
