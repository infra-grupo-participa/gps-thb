-- Central de resolução — `gps.membros` passa a saber QUAL PESSOA é cada membro.
--
-- POR QUÊ (medido no código, não suposto)
--   `gps.admin_adicionar_socio(p_ambiente_aluno_id, p_socio_aluno_id, …)` recebe
--   o cadastro do sócio e JOGA FORA: usa `p_socio_aluno_id` só para copiar o
--   documento para o `raw_user_meta_data` e para escrever um texto no log
--   (migração ...118, linhas 212 e 228-229). O repo já paga o preço disso em
--   dois lugares quentes:
--     * src/lib/auth.ts:95-106 — para todo sócio, TODA requisição faz um `ilike`
--       em thb_alunos.email só para descobrir de quem é a sessão;
--     * src/app/admin/senha-actions.ts:268-277 — o comentário registra que, com
--       o casamento por e-mail falhando, o admin recebia a senha certa SEM nome
--       e SEM telefone, e a tela sumia com o botão de WhatsApp.
--   "Sócio não vinculado" e "sócio não encontrado" não são bug de tela: é ESTA
--   coluna faltando.
--
-- BACKFILL (dois passos, nenhum deles adivinha)
--   1. TITULAR — identidade, não inferência: `gps.membros.aluno_id` É o
--      `thb_alunos.id` do titular por definição do modelo (o ambiente é dele).
--   2. SÓCIO — só quando o e-mail do login casa com EXATAMENTE 1 cadastro.
--      `public.thb_alunos` tem índice único em lower(trim(email)), então o
--      count é sempre <= 1; a condição fica escrita mesmo assim, porque o dia
--      em que esse índice mudar o backfill não pode passar a grudar gente na
--      linha errada em silêncio.
--   Quem não casar nasce NULL — e NULL é o resultado CORRETO: é a lacuna
--   ficando visível em vermelho no diagnóstico, em vez de um palpite gravado.
--   O UPDATE dispara `trg_membros_touch` e bumpa `atualizado_em` das linhas
--   tocadas; ninguém lê esse campo de `gps.membros` (conferido: nenhuma
--   ordenação nem filtro por membros.atualizado_em em src/).
--
-- 🔴 O ÍNDICE ÚNICO NÃO ENTRA NESTA RODADA (decisão do orquestrador, M5).
--   `create unique index membros_pessoa_uk on gps.membros (pessoa_aluno_id)
--    where pessoa_aluno_id is not null` só pode nascer depois de MEDIR se
--   existe pessoa em dois ambientes. Se existir, é gente real e a decisão é do
--   João — criar o índice às cegas faria a migração abortar no meio do
--   backfill. A RPC abaixo já recusa dois membros no mesmo cadastro, então a
--   regra vale para toda escrita NOVA; o que falta é a rede do banco para o
--   que já existe. A query de medição está no bloco de conferência da rodada.
--
-- O QUE NÃO FAZ
--   * NÃO cria linha em public.thb_alunos;
--   * NÃO muda papel, user_id, aluno_id, RLS nem policy;
--   * NÃO ganha grant de update para `authenticated` — o grant de `gps.membros`
--     é POR COLUNA (só `perfil` e `atualizado_em`, retrato do schema em
--     docs/audits/2026-09-09-polimento/schema-gps-dump.md). Escrita aqui é só
--     por RPC, e continua assim;
--   * NÃO exige pessoa_aluno_id = aluno_id no titular como CHECK: a igualdade é
--     imposta pela RPC, e um CHECK amarraria o banco a uma regra que a troca de
--     titular (...155) precisa poder discutir;
--   * NÃO altera gps.admin_adicionar_socio (fica para a rodada seguinte, junto
--     com o corte do `ilike` de auth.ts — este é o dado, não o consumidor).
--
-- REVERSÃO
--   drop function if exists gps.admin_vincular_pessoa_membro(uuid, uuid);
--   drop index if exists gps.membros_pessoa_aluno_idx;
--   alter table gps.membros drop column pessoa_aluno_id;
--   (a coluna é aditiva; nenhum caminho existente lê ela antes do deploy do TS)

alter table gps.membros
  add column if not exists pessoa_aluno_id uuid
    references public.thb_alunos(id) on delete set null;

comment on column gps.membros.pessoa_aluno_id is
  'Cadastro (public.thb_alunos) da PESSOA deste membro. Para o TITULAR e igual a aluno_id -- o ambiente e dele. Para o SOCIO e o cadastro proprio: o dado que gps.admin_adicionar_socio recebia e jogava fora (migracao ...118). NULL = a equipe ainda nao vinculou, e aparece em vermelho na Central de resolucao -- e a lacuna visivel, nao um palpite. Escrita SO por gps.admin_vincular_pessoa_membro: nao ha grant de update nesta coluna para authenticated (o grant de gps.membros e por coluna, so perfil e atualizado_em).';

-- Índice PARCIAL: a leitura é sempre "quem é a pessoa deste membro?" e
-- "existe outro membro nesta pessoa?" — as duas com pessoa_aluno_id not null.
-- Linha NULL (a lacuna) não precisa entrar no índice.
create index if not exists membros_pessoa_aluno_idx
  on gps.membros (pessoa_aluno_id) where pessoa_aluno_id is not null;

-- ── backfill 1: titular (identidade) ─────────────────────────────────────
update gps.membros m
   set pessoa_aluno_id = m.aluno_id
 where m.papel = 'titular' and m.pessoa_aluno_id is null;

-- ── backfill 2: sócio, só com casamento único pelo e-mail do login ───────
update gps.membros m
   set pessoa_aluno_id = a.id
  from auth.users u
  join public.thb_alunos a
    on lower(btrim(a.email)) = lower(btrim(u.email))
 where m.user_id = u.id
   and m.papel   = 'socio'
   and m.pessoa_aluno_id is null
   and (select count(*) from public.thb_alunos a2
         where lower(btrim(a2.email)) = lower(btrim(u.email))) = 1;

-- ─────────────────────────────────────────────────────────────────────────
-- A RPC de conserto. `p_pessoa_aluno_id is null` DESVINCULA (a mesma função
-- para os dois sentidos, pelo mesmo motivo da liberação de etapa: a UI não
-- escolhe caminho a partir de um estado que pode ter mudado entre ler e clicar).
-- ─────────────────────────────────────────────────────────────────────────
create or replace function gps.admin_vincular_pessoa_membro(
  p_membro_id uuid, p_pessoa_aluno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  -- `v_nome`/`v_email_cadastro` como TEXT, e não um `record` de thb_alunos: no
  -- caminho de desvincular não há linha para carregar, e ler campo de record
  -- não atribuído levanta erro em plpgsql antes de a mensagem certa aparecer.
  m record; v_email text; v_antes uuid;
  v_nome text; v_email_cadastro text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_membro_id is null then
    raise exception 'membro nao informado' using errcode = '22023';
  end if;

  select * into m from gps.membros where id = p_membro_id;
  if not found then
    raise exception 'Membro não encontrado.' using errcode = 'P0002';
  end if;
  v_antes := m.pessoa_aluno_id;

  if p_pessoa_aluno_id is null then
    -- Desvincular: só sócio. O titular sem cadastro deixaria o ambiente sem
    -- dono identificável — e o ambiente É o cadastro dele.
    if m.papel = 'titular' then
      raise exception 'O titular não pode ficar sem cadastro — o ambiente é dele.'
        using errcode = '42501';
    end if;
    if v_antes is null then
      raise exception 'Este membro já está sem cadastro vinculado.'
        using errcode = '22023';
    end if;
  else
    select t.nome, t.email into v_nome, v_email_cadastro
      from public.thb_alunos t where t.id = p_pessoa_aluno_id;
    if not found then
      raise exception 'Cadastro não encontrado.' using errcode = 'P0002';
    end if;

    -- O titular É o dono do ambiente. Apontar o titular para outro cadastro não
    -- é "vincular": é trocar o titular, que tem consequência no Financeiro e
    -- função própria (gps.admin_trocar_titular). Recusar aqui é o que impede a
    -- troca de acontecer pela porta errada, sem confirmação e sem log próprio.
    if m.papel = 'titular' and p_pessoa_aluno_id <> m.aluno_id then
      raise exception 'Para o titular, o cadastro é o dono do ambiente. Use "Trocar titular".'
        using errcode = '42501';
    end if;

    -- Uma pessoa, um membro. O índice único de gps.membros(pessoa_aluno_id)
    -- ainda NÃO existe (ver cabeçalho, M5), então esta guarda é, hoje, a única
    -- que impede o mesmo cadastro em dois ambientes. Sem dizer de QUEM é o
    -- outro ambiente — mesma regra de aprovarSolicitacao (actions.ts:311):
    -- quem resolve não precisa do dado alheio para decidir.
    if exists (select 1 from gps.membros x
                where x.pessoa_aluno_id = p_pessoa_aluno_id
                  and x.id <> p_membro_id) then
      raise exception 'Este cadastro já está vinculado a outra pessoa do programa.'
        using errcode = '23505';
    end if;

    if v_antes = p_pessoa_aluno_id then
      raise exception 'Este membro já está vinculado a este cadastro.'
        using errcode = '22023';
    end if;
  end if;

  update gps.membros set pessoa_aluno_id = p_pessoa_aluno_id where id = p_membro_id;

  if m.user_id is not null then
    select u.email into v_email from auth.users u where u.id = m.user_id;
  end if;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('membro_pessoa_vinculada', m.aluno_id, m.user_id, v_email,
          case
            when p_pessoa_aluno_id is null then
              format('membro %s DESVINCULADO do cadastro (antes: %s)',
                     coalesce(m.papel, '?'), v_antes::text)
            else
              format('membro %s vinculado ao cadastro %s (%s)%s',
                     coalesce(m.papel, '?'), coalesce(v_nome, 'sem nome'),
                     coalesce(v_email_cadastro, 'sem e-mail'),
                     case when v_antes is null then ''
                          else ' — antes: ' || v_antes::text end)
          end,
          auth.uid());

  return jsonb_build_object('membro_id', m.id, 'papel', m.papel,
                            'pessoa_aluno_id', p_pessoa_aluno_id,
                            'nome', v_nome, 'email', v_email_cadastro,
                            'antes', v_antes);
end $function$;

comment on function gps.admin_vincular_pessoa_membro(uuid, uuid) is
  'Liga um membro do ambiente ao cadastro da PESSOA em public.thb_alunos -- o remedio para "socio nao vinculado". p_pessoa_aluno_id NULL desvincula (so socio: o titular sem cadastro deixaria o ambiente sem dono). Recusa apontar o titular para cadastro diferente do dono do ambiente (isso e trocar titular, funcao propria com confirmacao e log proprios) e recusa dois membros no mesmo cadastro com 23505 -- enquanto o indice unico membros_pessoa_uk nao existir (M5), esta guarda e a unica rede. Registra em gps.acessos_log (membro_pessoa_vinculada), sem revelar de quem e o outro ambiente. Reversao: chamar de novo com o cadastro certo, ou com NULL.';

revoke execute on function gps.admin_vincular_pessoa_membro(uuid, uuid) from public, anon;
grant  execute on function gps.admin_vincular_pessoa_membro(uuid, uuid) to authenticated;
