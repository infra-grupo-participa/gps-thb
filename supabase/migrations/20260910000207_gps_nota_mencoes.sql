-- Mega feature — @menção no Diário (a notificação sai no Slack, do Node).
--
-- Pedido literal do João: "Na parte do diário, quando alguém mencionar outra
-- pessoa (igual no whatsapp) a notificação cai no slack."
--
-- ═══════════════════════════════════════════════════════════════════════════
-- C-6 — A MENÇÃO NÃO CRIA LEITOR NOVO
-- ═══════════════════════════════════════════════════════════════════════════
--   O Diário é só-admin por LGPD (o texto livre carrega dado pessoal de
--   TERCEIRO: cliente do aluno, situação familiar, patrimônio). O universo de
--   mencionáveis é, portanto, exatamente quem JÁ PODE LER: `public.gp_is_admin()`
--   = perfil `ativo` com cargo dev/admin. MEDIDO na Onda 0 (M7): são **19**
--   (16 admin + 3 dev), não 20 — o 1 gestor ativo NÃO passa no guarda, e
--   mencioná-lo mandaria um aviso sobre uma nota que ele não consegue abrir.
--   Notificação que não leva a lugar nenhum é o que treina o time a fechar
--   tudo sem ler.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- A MENÇÃO É GRAVADA, NÃO REPARSEADA
-- ═══════════════════════════════════════════════════════════════════════════
--   Nome muda, apelido colide, `@` aparece em e-mail dentro do texto. Reler a
--   nota para descobrir quem foi mencionado devolveria respostas diferentes ao
--   longo do tempo. Tabela LATERAL: `gps.aluno_notas` continua append-only e
--   esta tabela não a edita.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- POR QUE UMA RPC ESCREVE, E NÃO A ACTION (decisão pedida e justificada)
-- ═══════════════════════════════════════════════════════════════════════════
--   Duas razões, as duas medidas:
--   1. A REVALIDAÇÃO do destinatário (ativo + cargo dev/admin) precisa ler
--      `public.perfis` INTEIRO. `public.perfis` é tabela de outro sistema
--      (sip) e a leitura ampla pelo PostgREST não é garantida ao admin do GPS
--      — é exatamente por isso que `gps.admin_mencionaveis()` existe como
--      SECURITY DEFINER. Fazer a revalidação no Node exigiria uma segunda
--      fonte de verdade sobre quem é da equipe.
--   2. Sem RPC, `gps.nota_mencoes` precisaria de `grant insert` + policy de
--      insert para `authenticated`. Com eles, um admin (ou qualquer chamada
--      com JWT de admin) grava menção em nota que não é dele, com qualquer
--      perfil_id — inclusive de perfil inativo. Com a RPC, a tabela fica
--      append-only por RPC, como `gps.chamados` e `gps.aluno_eventos`.
--   O cliente ESCOLHE destinatário; nunca AUTORIZA. Teto de 10 por nota: uma
--   nota não vira disparo em massa.
--
-- ⚠️ O SEGREDO DO SLACK NÃO ENTRA NO BANCO (C-7). Medido em 10/09:
--   `gps.config` tem policy única `gps_config_admin [ALL]`, logo qualquer um
--   dos 16 admins lê `resend_api_key` pela REST. Repetir o padrão com o
--   webhook seria repetir um furo conhecido. O webhook mora na env
--   `SLACK_WEBHOOK_MENCOES` (painel da Hostinger) e o POST sai do Node, dentro
--   da própria Server Action. Aqui entra só o INTERRUPTOR
--   `gps.config.slack_mencoes_ativo`, que não é segredo e desliga o canal para
--   todos sem deploy (padrão de `chamados_aberto`).
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ
--   * não manda nada para lugar nenhum (quem posta é `src/lib/slack.ts`);
--   * não muda `gps.aluno_notas`, nem a trava LGPD, nem cria tela para o aluno;
--   * não guarda o texto da nota em lugar nenhum novo.
--
-- REVERSÃO:
--   drop function gps.registrar_mencoes(uuid, uuid[]);
--   drop function gps.admin_mencionaveis();
--   drop table gps.nota_mencoes;
--   delete from gps.config where chave = 'slack_mencoes_ativo';

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Tabela
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists gps.nota_mencoes (
  nota_id   uuid not null references gps.aluno_notas(id) on delete cascade,
  -- `on delete cascade`, NÃO o default (no action): `public.perfis` é tabela
  -- COMPARTILHADA e já foi limpa em massa uma vez (1.245 linhas, 31/07/2026).
  -- Um restrict aqui faria a próxima limpeza falhar por causa de um rastro de
  -- menção — a mesma razão pela qual as FKs de gps.chamados para auth.users
  -- são `set null` e não `restrict`. A NOTA fica; some só o vínculo.
  perfil_id uuid not null references public.perfis(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (nota_id, perfil_id)
);

comment on table gps.nota_mencoes is
  'Quem foi mencionado em cada nota do Diario. Tabela LATERAL: gps.aluno_notas continua append-only e esta nao a edita. A mencao e GRAVADA, nunca reparseada do texto (nome muda, apelido colide, @ aparece em e-mail). Universo de destinatarios = quem JA PODE LER o Diario (public.perfis ativo com cargo dev/admin -- 19 pessoas em 10/09/2026): a mencao nao cria leitor novo (C-6). Append-only por RPC: authenticated tem so select.';
comment on column gps.nota_mencoes.perfil_id is
  'public.perfis.id do mencionado. Revalidado no BANCO por gps.registrar_mencoes (ativo + cargo dev/admin) -- o cliente escolhe destinatario, nunca autoriza.';

create index if not exists nota_mencoes_perfil_idx
  on gps.nota_mencoes (perfil_id, criado_em desc);
comment on index gps.nota_mencoes_perfil_idx is
  'Serve "as mencoes a mim", a leitura que a tela do Diario faz por pessoa. A leitura por nota usa a PK (nota_id, perfil_id).';

alter table gps.nota_mencoes enable row level security;

drop policy if exists gps_nota_mencoes_admin_select on gps.nota_mencoes;
create policy gps_nota_mencoes_admin_select on gps.nota_mencoes
  for select to authenticated
  using (public.gp_is_admin());

-- NENHUMA policy de insert/update/delete: a única escrita é
-- gps.registrar_mencoes (SECURITY DEFINER). Sem policy, o RLS nega.

revoke all on gps.nota_mencoes from anon, public;
revoke all on gps.nota_mencoes from authenticated;
grant select on gps.nota_mencoes to authenticated;
-- ZERO grant para anon.

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Interruptor (NÃO é segredo) — nasce DESLIGADO (B-W1)
-- ─────────────────────────────────────────────────────────────────────────
-- Enquanto o João não der a URL do webhook e o canal, a menção é gravada e
-- aparece na tela do Diário; nada sai do perímetro.

insert into gps.config (chave, valor) values ('slack_mencoes_ativo', 'false')
on conflict (chave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. gps.admin_mencionaveis — a lista, SEM e-mail
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.admin_mencionaveis()
returns table (id uuid, nome text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  return query
  select p.id, coalesce(nullif(btrim(p.nome), ''), 'Sem nome') as nome
    from public.perfis p
   where p.status = 'ativo'
     and p.cargo in ('dev','admin')
   order by 2, 1;
end $function$;

comment on function gps.admin_mencionaveis() is
  'Lista de quem pode ser mencionado no Diario: public.perfis ativo com cargo dev/admin -- exatamente quem gp_is_admin() deixa LER a nota (19 em 10/09/2026; o gestor ativo fica fora de proposito). Devolve id e NOME e mais nada: e-mail nao entra em lista de autocompletar, que vai parar no payload do cliente. gp_is_admin() ou 42501. SECURITY DEFINER porque a leitura ampla de public.perfis (tabela do sip) nao e garantida ao admin do GPS pelo PostgREST.';

revoke execute on function gps.admin_mencionaveis() from public, anon;
grant  execute on function gps.admin_mencionaveis() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. gps.registrar_mencoes — a ÚNICA escritora
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.registrar_mencoes(
  p_nota_id uuid,
  p_perfis  uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_gravadas jsonb;
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_nota_id is null then
    raise exception 'nota nao informada' using errcode = '22023';
  end if;
  if not exists (select 1 from gps.aluno_notas n where n.id = p_nota_id) then
    raise exception 'Nota não encontrada.' using errcode = 'P0002';
  end if;

  -- REVALIDA cada id contra ativo + dev/admin e descarta o que não passar —
  -- silenciosamente, porque a lista veio de um autocompletar que pode ter
  -- ficado velho na tela; abortar a nota inteira por um colega desativado
  -- ontem seria pior. Quem passou volta no retorno, e a action diz quantos.
  -- Teto de 10 aplicado no BANCO: mandar 500 ids grava no máximo 10.
  with candidatos as (
    select distinct e.perfil_id
      from unnest(coalesce(p_perfis, array[]::uuid[])) as e(perfil_id)
     where e.perfil_id is not null
  ),
  validos as (
    select c.perfil_id, p.nome
      from candidatos c
      join public.perfis p on p.id = c.perfil_id
     where p.status = 'ativo'
       and p.cargo in ('dev','admin')
     order by p.nome, c.perfil_id
     limit 10
  ),
  gravadas as (
    insert into gps.nota_mencoes (nota_id, perfil_id)
    select p_nota_id, v.perfil_id from validos v
    on conflict (nota_id, perfil_id) do nothing
    returning perfil_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('perfil_id', v.perfil_id, 'nome', v.nome)
                            order by v.nome), '[]'::jsonb)
    into v_gravadas
    from validos v
   where v.perfil_id in (select perfil_id from gravadas);

  return jsonb_build_object('mencionados', v_gravadas,
                            'quantidade', jsonb_array_length(v_gravadas));
end $function$;

comment on function gps.registrar_mencoes(uuid, uuid[]) is
  'Grava as mencoes de UMA nota. Revalida cada id contra public.perfis (ativo + cargo dev/admin) e DESCARTA o que nao passar -- perfil inativo, gestor, id que nem e perfil: o cliente escolhe destinatario, nunca autoriza. Teto de 10 no BANCO (mandar 500 grava 10). Idempotente (on conflict do nothing). Devolve id e NOME dos gravados, para a action montar a mensagem do Slack sem uma segunda consulta a public.perfis -- e sem e-mail. gp_is_admin() ou 42501.';

revoke execute on function gps.registrar_mencoes(uuid, uuid[]) from public, anon;
grant  execute on function gps.registrar_mencoes(uuid, uuid[]) to authenticated;
