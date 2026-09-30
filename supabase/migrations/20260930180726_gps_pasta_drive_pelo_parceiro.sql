-- ═══════════════════════════════════════════════════════════════════════════
-- Pasta do Drive: o PARCEIRO (titular ou sócio) passa a poder definir o link
-- do próprio ambiente; a equipe continua podendo tudo. Escrita SÓ pela RPC
-- `gps.pasta_drive_definir` — o UPDATE direto em `pasta_drive_url` sai.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── NUMERAÇÃO ──────────────────────────────────────────────────────────────
-- Versão = a que o apply_migration registrou em produção (20260930180726);
-- antes dela, a última APLICADA era 20260930170950 (medido pela sessão
-- principal em schema_migrations), maior que a última do repo (…000323).
-- Um `20260930000324` ficaria ANTES dela e a CLI trataria como fora de ordem.
--
-- ── O BURACO QUE ESTA MIGRAÇÃO FECHA ───────────────────────────────────────
-- Baseline: `grant delete, select, update on gps.ambientes to authenticated`
-- + policy `ambientes_owner_update` (aluno_id = gps.aluno_atual()). Ou seja,
-- HOJE qualquer membro já consegue `PATCH /rest/v1/ambientes` e gravar
-- QUALQUER texto em `pasta_drive_url`. `/pasta/abrir` redireciona para o
-- valor gravado, e a única barreira era `ehUrlDoDrive` no app — que aceitava
-- `https://docs.google.com/url?q=<qualquer site>`, o redirecionador do Google
-- (redirect aberto a partir do nosso domínio).
--
-- ── O QUE MUDA ─────────────────────────────────────────────────────────────
--  1. 4 colunas de trilha (por/nome/em/origem), null default. Backfill: link
--     existente → origem 'equipe' (quem gravou até hoje foi a equipe: a única
--     action que escrevia a coluna era admin-only). por/nome/em ficam null.
--  2. CHECK de formato, já VALIDADO (medido 30/09: 160 ambientes, 1 com link,
--     0 fora da regex). Expressão INLINE, sem função: a CHECK roda também no
--     UPDATE de `data_agendamento_disponivel` feito pela sessão do aluno, e
--     função em CHECK exige EXECUTE de quem grava — revogar a função de
--     `authenticated` quebraria a data de agendamento.
--  3. UPDATE de `authenticated` vira POR COLUNA: só `data_agendamento_
--     disponivel` e `atualizado_em` (grep em src/: os únicos `.update()` em
--     `ambientes` são `salvarDataAgendamento` — data — e `salvarPastaDriveUrl`
--     — pasta, que passa a ir pela RPC). `atualizado_em` é bumpado pela
--     trigger `ambientes_touch`; trigger não precisa de privilégio de coluna,
--     o grant fica só para não quebrar quem mandar a coluna no SET.
--  4. RPC `gps.pasta_drive_definir` (SECURITY DEFINER, search_path '').
--
-- ── O QUE NÃO MUDA ─────────────────────────────────────────────────────────
--   * policies (as 3 continuam); DELETE/SELECT de authenticated; INSERT
--     continua sem grant (linha nasce por caminho administrativo).
--
-- ── REVERSÃO ───────────────────────────────────────────────────────────────
--   drop function if exists gps.pasta_drive_definir(uuid, text, text);
--   grant update on gps.ambientes to authenticated;
--   alter table gps.ambientes drop constraint if exists ambientes_pasta_drive_url_formato;
--   alter table gps.ambientes drop constraint if exists ambientes_pasta_drive_origem_check;
--   alter table gps.ambientes drop column if exists pasta_drive_origem,
--     drop column if exists pasta_drive_em, drop column if exists pasta_drive_por_nome,
--     drop column if exists pasta_drive_por;
--   (o app novo chama a RPC: reverter o banco exige reverter o deploy junto)
-- ═══════════════════════════════════════════════════════════════════════════

set local lock_timeout = '3s';
set local statement_timeout = '20s';

-- ── 1. colunas de trilha ─────────────────────────────────────────────────
alter table gps.ambientes
  add column if not exists pasta_drive_por      uuid references auth.users(id) on delete set null,
  add column if not exists pasta_drive_por_nome text,
  add column if not exists pasta_drive_em       timestamptz,
  add column if not exists pasta_drive_origem   text
    constraint ambientes_pasta_drive_origem_check
    check (pasta_drive_origem in ('equipe', 'parceiro'));

comment on column gps.ambientes.pasta_drive_por is
  'auth.users de quem gravou o link por ultimo (trilha interna; o app NAO expoe ao cliente). Escrita so por gps.pasta_drive_definir.';
comment on column gps.ambientes.pasta_drive_por_nome is
  'Nome exibido de quem gravou: literal ''Equipe'' quando foi a equipe (o aluno nao ve nome de funcionario); nome do cadastro da pessoa quando foi o parceiro.';
comment on column gps.ambientes.pasta_drive_em is 'Quando o link foi gravado pela ultima vez.';
comment on column gps.ambientes.pasta_drive_origem is
  '''equipe'' | ''parceiro''. Link de origem equipe o parceiro NAO troca nem remove (regra de gps.pasta_drive_definir).';

-- Backfill: dispara `ambientes_touch` (bumpa atualizado_em) só nas linhas com
-- link — medido: 1.
update gps.ambientes
   set pasta_drive_origem = 'equipe'
 where pasta_drive_url is not null
   and pasta_drive_origem is null;

-- ── 2. CHECK de formato ──────────────────────────────────────────────────
-- 🔗 MESMA regra em três lugares, mantê-los idênticos:
--    este CHECK · o IF de gps.pasta_drive_definir · `ehUrlDoDrive` em
--    src/lib/pasta.ts.
alter table gps.ambientes
  add constraint ambientes_pasta_drive_url_formato check (
    pasta_drive_url is null
    or (
          pasta_drive_url ~ '^https://(drive|docs)\.google\.com/'
      and pasta_drive_url !~ '^https://(drive|docs)\.google\.com/url'
      -- segmento de ponto (`/x/../url` vira `/url` no navegador), `%2e` e `\`
      and pasta_drive_url !~* '(/\.{1,2}(/|\?|#|$)|%2e|\\)'
      and pasta_drive_url !~ '\s'
      and length(pasta_drive_url) <= 2048
    )
  );
-- Se um dia precisar nascer NOT VALID (tabela com legado fora da regra):
--   alter table gps.ambientes validate constraint ambientes_pasta_drive_url_formato;

-- ── 3. UPDATE por coluna ─────────────────────────────────────────────────
-- Revogar UPDATE de tabela revoga também os privilégios de coluna.
revoke update on gps.ambientes from public, anon, authenticated;
grant update (data_agendamento_disponivel, atualizado_em) on gps.ambientes to authenticated;

-- ── 4. RPC ───────────────────────────────────────────────────────────────
create or replace function gps.pasta_drive_definir(
  p_aluno_id     uuid,
  p_url          text,
  p_url_anterior text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := auth.uid();
  v_url    text := nullif(btrim(p_url), '');
  v_ant    text := nullif(btrim(p_url_anterior), '');
  v_admin  boolean;
  v_atual  text;
  v_origem text;
  v_nome   text;
begin
  if v_uid is null then
    raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501';
  end if;
  if p_aluno_id is null then
    raise exception 'Ambiente não informado.' using errcode = '22023';
  end if;

  -- 🔗 idêntico ao CHECK ambientes_pasta_drive_url_formato
  if v_url is not null and not (
        v_url ~ '^https://(drive|docs)\.google\.com/'
    and v_url !~ '^https://(drive|docs)\.google\.com/url'
    and v_url !~* '(/\.{1,2}(/|\?|#|$)|%2e|\\)'
    and v_url !~ '\s'
    and length(v_url) <= 2048
  ) then
    raise exception 'Informe um link válido do Google Drive.' using errcode = '22023';
  end if;

  v_admin := public.gp_is_admin();

  if not v_admin and not exists (
    select 1 from gps.membros m
     where m.user_id = v_uid and m.aluno_id = p_aluno_id
  ) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select a.pasta_drive_url, a.pasta_drive_origem
    into v_atual, v_origem
    from gps.ambientes a
   where a.aluno_id = p_aluno_id
   for update;

  if not found then
    raise exception 'Ambiente não encontrado.' using errcode = 'P0002';
  end if;

  if not v_admin then
    -- Link sem origem (legado anterior ao backfill) conta como da equipe.
    if v_atual is not null and v_origem is distinct from 'parceiro' then
      raise exception 'A pasta já foi definida pela equipe.' using errcode = '42501';
    end if;
    if v_url is null then
      raise exception 'Informe o link da pasta.' using errcode = '22023';
    end if;
  end if;

  if v_atual is distinct from v_ant then
    raise exception 'O link mudou enquanto você editava; recarregue.' using errcode = 'P0001';
  end if;

  if v_url is not distinct from v_atual then
    return; -- nada muda; não reescreve a trilha
  end if;

  if v_url is null then
    -- só chega aqui a equipe (parceiro com url vazia já saiu acima)
    update gps.ambientes
       set pasta_drive_url = null, pasta_drive_por = null,
           pasta_drive_por_nome = null, pasta_drive_em = null,
           pasta_drive_origem = null
     where aluno_id = p_aluno_id;
    return;
  end if;

  if v_admin then
    v_nome := 'Equipe';
  else
    -- Nome da PESSOA (membros.pessoa_aluno_id → thb_alunos). Titular sem
    -- pessoa vinculada cai no próprio ambiente (é ele); sócio sem pessoa NÃO
    -- cai no titular — gravaria o nome errado — e vira 'Parceiro'.
    select nullif(btrim(t.nome), '')
      into v_nome
      from gps.membros m
      left join public.thb_alunos t
        on t.id = coalesce(m.pessoa_aluno_id,
                           case when m.papel = 'titular' then m.aluno_id end)
     where m.user_id = v_uid
       and m.aluno_id = p_aluno_id
     limit 1;
    v_nome := coalesce(v_nome, 'Parceiro');
  end if;

  update gps.ambientes
     set pasta_drive_url      = v_url,
         pasta_drive_por      = v_uid,
         pasta_drive_por_nome = v_nome,
         pasta_drive_em       = now(),
         pasta_drive_origem   = case when v_admin then 'equipe' else 'parceiro' end
   where aluno_id = p_aluno_id;
end;
$$;

comment on function gps.pasta_drive_definir(uuid, text, text) is
  'Unico caminho de escrita de gps.ambientes.pasta_drive_url para authenticated. Equipe (gp_is_admin): insere/troca/remove, origem equipe, nome ''Equipe''. Membro do ambiente: insere quando vazio, troca so link de origem parceiro, nao remove. p_url_anterior e trava otimista (P0001 se divergir).';

revoke all on function gps.pasta_drive_definir(uuid, text, text) from public, anon;
grant execute on function gps.pasta_drive_definir(uuid, text, text) to authenticated;
