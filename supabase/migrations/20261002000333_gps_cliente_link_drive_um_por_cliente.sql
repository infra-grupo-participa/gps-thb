-- ═══════════════════════════════════════════════════════════════════════════
-- Links do Drive na ficha: UM link por cliente (decisão do João, 02/10/2026:
-- "é um link de drive só"). Corrige a …332, que aceitava até 20.
-- ═══════════════════════════════════════════════════════════════════════════
-- * Índice único parcial (cliente_id) where removido_em is null: no máximo 1
--   ativo por cliente, garantido pelo banco (0 linhas na tabela em 02/10).
-- * `cliente_link_drive_adicionar` passa a TROCAR: se já há link ativo, ele é
--   removido (soft) e o novo entra, na mesma transação. O parceiro não troca
--   link posto pela equipe (42501), mesma regra do remover. Mesmo link → 23505.
--   Assinatura e retorno iguais à …332 (a action não muda de contrato).
-- * Evento de remoção do antigo é gravado antes do de adição.
--
-- REVERSÃO: drop index gps.cliente_links_drive_um_ativo_uq; recriar os 2 índices da …332 (ver o fim) e a função
-- com o corpo da …332.

set local lock_timeout = '3s';
set local statement_timeout = '20s';

create unique index if not exists cliente_links_drive_um_ativo_uq
  on gps.cliente_links_drive (cliente_id)
  where removido_em is null;

create or replace function gps.cliente_link_drive_adicionar(p_cliente_id uuid, p_nome text, p_url text)
returns jsonb language plpgsql security definer set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_admin boolean := coalesce(public.gp_is_admin(), false);
  v_ambiente uuid := gps.aluno_atual();
  v_c record; v_atual record; v_nome text; v_url text; v_por_nome text; v_origem text; v_id uuid; v_em timestamptz;
begin
  if v_uid is null then raise exception 'Sessão expirada. Entre de novo.' using errcode = '42501'; end if;
  if p_cliente_id is null then raise exception 'cliente nao informado' using errcode = '22023'; end if;
  select c.id, c.aluno_id, c.nome into v_c from gps.etapa1_clientes c where c.id = p_cliente_id for no key update;
  if not found then raise exception 'Cliente não encontrado.' using errcode = 'P0002'; end if;
  if not v_admin and (v_ambiente is null or v_ambiente <> v_c.aluno_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  v_nome := btrim(coalesce(p_nome, ''), E' \t\r\n');
  if v_nome = '' then raise exception 'Dê um nome ao link.' using errcode = '22023'; end if;
  if char_length(v_nome) > 120 then raise exception 'O nome do link tem no máximo 120 caracteres.' using errcode = '22023'; end if;
  if v_nome ~ '[[:cntrl:]]' then raise exception 'O nome do link tem caractere inválido.' using errcode = '22023'; end if;
  v_url := gps.drive_url_normalizar(p_url);
  if v_url is null then
    raise exception 'Cole o link do Drive (Compartilhar > Copiar link). Ele começa com drive.google.com/ ou docs.google.com/.' using errcode = '22023';
  end if;

  select l.id, l.url, l.origem into v_atual
    from gps.cliente_links_drive l
   where l.cliente_id = p_cliente_id and l.removido_em is null
   for update;
  if found then
    if v_atual.url = v_url then
      raise exception 'Este link já está na ficha.' using errcode = '23505';
    end if;
    if not v_admin and v_atual.origem is distinct from 'parceiro' then
      raise exception 'Este link foi colocado pela equipe; peça a ela para trocar.' using errcode = '42501';
    end if;
    update gps.cliente_links_drive set removido_em = now(), removido_por = v_uid where id = v_atual.id;
    insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
    values (v_c.aluno_id, now(), 'cliente_link_drive_removido', 'cliente', p_cliente_id,
            left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
            jsonb_build_object('link_id', v_atual.id, 'cliente_id', p_cliente_id),
            case when v_admin then 'equipe' else 'aluno' end, v_uid, 'app');
  end if;

  if v_admin then
    v_por_nome := 'Equipe'; v_origem := 'equipe';
  else
    v_origem := 'parceiro';
    select nullif(btrim(t.nome), '') into v_por_nome
      from gps.membros m
      left join public.thb_alunos t on t.id = coalesce(m.pessoa_aluno_id, case when m.papel = 'titular' then m.aluno_id end)
     where m.user_id = v_uid and m.aluno_id = v_c.aluno_id limit 1;
    v_por_nome := coalesce(v_por_nome, 'Parceiro');
  end if;
  begin
    insert into gps.cliente_links_drive (cliente_id, aluno_id, nome, url, origem, criado_por, criado_por_nome)
    values (p_cliente_id, v_c.aluno_id, v_nome, v_url, v_origem, v_uid, v_por_nome)
    returning id, criado_em into v_id, v_em;
  exception when unique_violation then
    raise exception 'O link mudou enquanto você editava; recarregue.' using errcode = '40001';
  end;
  insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values (v_c.aluno_id, now(), 'cliente_link_drive_adicionado', 'cliente', p_cliente_id,
          left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
          jsonb_build_object('link_id', v_id, 'cliente_id', p_cliente_id),
          case when v_admin then 'equipe' else 'aluno' end, v_uid, 'app');
  return jsonb_build_object('id', v_id, 'nome', v_nome, 'url', v_url, 'criado_em', v_em, 'criado_por_nome', v_por_nome, 'origem', v_origem);
end;
$function$;
comment on function gps.cliente_link_drive_adicionar(uuid, text, text) is
  'Define o link do Google Drive da ficha do cliente (UM por cliente desde a ...333): se ja houver um ativo, troca (soft remove + insert, mesma transacao). Guarda: admin OU gps.aluno_atual() = aluno_id do cliente; parceiro nao troca link da equipe (42501). Mesmo link 23505. Eventos removido/adicionado com {link_id, cliente_id}, nunca url nem nome.';
revoke all     on function gps.cliente_link_drive_adicionar(uuid, text, text) from public, anon;
grant  execute on function gps.cliente_link_drive_adicionar(uuid, text, text) to authenticated;

-- ── Índices da …332 que a regra "1 por cliente" tornou redundantes (veredito
-- 02/10): o único parcial (cliente_id) cobre a leitura da ficha, a do briefing
-- e o `for update` da troca. Aplicado em produção como
-- `gps_cliente_links_drive_indices_redundantes`.
-- Reversão: recriar com o DDL de …332 (cliente_links_drive_ativos_idx e
-- cliente_links_drive_url_ativa_uq).
drop index if exists gps.cliente_links_drive_ativos_idx;
drop index if exists gps.cliente_links_drive_url_ativa_uq;

-- ═══════════════════════════════════════════════════════════════════════════
-- RESULTADO MEDIDO EM PRODUÇÃO — 02/10/2026 (provas em bloco DO desfeito)
-- ═══════════════════════════════════════════════════════════════════════════
-- tabela com 0 linhas reais; índices finais: pkey + cliente_links_drive_um_ativo_uq
-- parceiro cola A, depois B ........... 1 ativo (B); mesmo link → 23505
-- equipe troca ........................ origem equipe
-- parceiro sobre link da equipe ....... 42501
-- 3 linhas no total (soft) · 5 eventos, nenhum com a url
-- explain (analyze, buffers) do `select … for update` da troca:
--   com 1 linha: Seq Scan (correto nesse tamanho) · 0.051 ms
--   enable_seqscan=off: Index Scan using cliente_links_drive_um_ativo_uq ·
--   Index Cond: cliente_id · shared hit=2 · 0.034 ms
