-- gps.membros — todo membro nasce com o AMBIENTE e o titular nasce com a PESSOA.
--
-- O QUE QUEBROU (10/09/2026, relato do João: "a visão do aluno dá erro de rota
-- e aparece como não identificado")
--   Na war-room de 09/09, 33 ambientes foram provisionados à mão, direto em
--   gps.membros (todos `titular`, mesmo `criado_em` 20:38). Os caminhos SQL
--   (gps_handle_new_user, admin_adotar_login_existente, admin_adicionar_socio)
--   inserem TAMBÉM a linha de gps.ambientes — o insert manual não, e os dois
--   caminhos em TypeScript que fazem `upsert` em membros (aprovarSolicitacao e
--   o fallback de criarAcessoAluno, src/app/admin/actions.ts) TAMBÉM não: era
--   uma regra espalhada, e por isso já havia 1 caso anterior ao lote. Medido
--   antes desta migration:
--     * 28 membros sem linha em gps.ambientes (27 do lote + 1 anterior);
--     * 32 titulares com pessoa_aluno_id NULL (o backfill da ...154 rodou antes
--       do lote; a regra "titular = dono do ambiente" não estava no banco,
--       só na migration).
--   Efeito: toda página /admin/aluno/<id>/** faz `getAmbiente(alunoId)` e
--   `notFound()` quando não há linha — o Modo Assistência desses 28 respondia
--   404 ("erro de rota"); a Central mostrava "Cadastro não identificado" para
--   os 32 sem pessoa; e /pasta do próprio aluno abria sem ambiente.
--
-- O CONSERTO É DUPLO: o dado (backfill) e a REGRA NO BANCO (trigger), para que
-- o próximo insert à mão — e vai haver outro — não repita o estado. Regra que
-- vive só no TypeScript não protege contra SQL de war-room.
--
--   1. BEFORE INSERT OR UPDATE em gps.membros: titular sem pessoa recebe
--      pessoa_aluno_id := aluno_id (identidade, não inferência — é a mesma
--      regra da ...154). O índice membros_pessoa_uk (...160) continua sendo a
--      rede: se essa pessoa já for membro de outro ambiente, o insert falha
--      com 23505 em vez de criar estado partido.
--   2. AFTER INSERT em gps.membros: `insert into gps.ambientes (aluno_id) ...
--      on conflict do nothing`. SECURITY DEFINER porque quem insere membro pode
--      ser o gatilho de signup (postgres) ou o admin pela REST — e a policy de
--      ambientes é só-admin para insert.
--
-- O QUE NÃO FAZ: não mexe em user_id (19 do lote continuam sem login — é a
-- equipe que define acesso), não cria thb_alunos (os 33 existem lá, conferido),
-- não toca nos 6 ambientes que o lote criou corretamente.
--
-- REVERSÃO
--   drop trigger if exists trg_membros_garante_ambiente on gps.membros;
--   drop trigger if exists trg_membros_titular_e_pessoa on gps.membros;
--   drop function if exists gps.membros_garante_ambiente();
--   drop function if exists gps.membros_titular_e_pessoa();
--   (as linhas de ambientes e o pessoa_aluno_id preenchidos ficam — são o
--    estado que o código sempre presumiu.)

-- ─────────────────────────────────────────────────────────────────────────
-- 1) titular sem pessoa = o dono do ambiente
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.membros_titular_e_pessoa()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if new.papel = 'titular' and new.pessoa_aluno_id is null then
    new.pessoa_aluno_id := new.aluno_id;
  end if;
  return new;
end $function$;

comment on function gps.membros_titular_e_pessoa() is
  'BEFORE INSERT/UPDATE de gps.membros: titular sem pessoa_aluno_id recebe aluno_id (regra da ...154, agora no banco). Nao inventa pessoa para socio.';

drop trigger if exists trg_membros_titular_e_pessoa on gps.membros;
create trigger trg_membros_titular_e_pessoa
  before insert or update of papel, pessoa_aluno_id on gps.membros
  for each row execute function gps.membros_titular_e_pessoa();

-- ─────────────────────────────────────────────────────────────────────────
-- 2) membro novo garante a linha do ambiente
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.membros_garante_ambiente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into gps.ambientes (aluno_id)
  values (new.aluno_id)
  on conflict (aluno_id) do nothing;
  return new;
end $function$;

comment on function gps.membros_garante_ambiente() is
  'AFTER INSERT de gps.membros: garante gps.ambientes (1 linha por ambiente). SECURITY DEFINER porque o insert de membro pode vir de contexto sem policy de insert em ambientes. Idempotente (on conflict do nothing).';

revoke execute on function gps.membros_garante_ambiente() from public, anon, authenticated;
revoke execute on function gps.membros_titular_e_pessoa() from public, anon, authenticated;

drop trigger if exists trg_membros_garante_ambiente on gps.membros;
create trigger trg_membros_garante_ambiente
  after insert on gps.membros
  for each row execute function gps.membros_garante_ambiente();

-- ─────────────────────────────────────────────────────────────────────────
-- 3) backfill do que já está partido (medido: 28 ambientes, 32 pessoas)
-- ─────────────────────────────────────────────────────────────────────────
insert into gps.ambientes (aluno_id)
select distinct m.aluno_id
  from gps.membros m
 where not exists (select 1 from gps.ambientes a where a.aluno_id = m.aluno_id)
on conflict (aluno_id) do nothing;

update gps.membros m
   set pessoa_aluno_id = m.aluno_id
 where m.papel = 'titular'
   and m.pessoa_aluno_id is null
   and not exists (select 1 from gps.membros x where x.pessoa_aluno_id = m.aluno_id);

-- Conferência (tem de dar 0 e 0):
--   select count(*) from gps.membros m
--    where not exists (select 1 from gps.ambientes a where a.aluno_id = m.aluno_id);
--   select count(*) from gps.membros where papel = 'titular' and pessoa_aluno_id is null;
