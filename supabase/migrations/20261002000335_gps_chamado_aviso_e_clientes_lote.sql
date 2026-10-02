-- ═══════════════════════════════════════════════════════════════════════════
-- Onda 1 do polimento pelas reclamações do Digisac (02/10/2026)
--   1.1  Chamados: a equipe é avisada também quando o parceiro escreve de novo
--        num chamado que JÁ está aberto — agrupado, 1 e-mail por chamado a
--        cada 30 min, citando quantas mensagens chegaram.
--   1.2  Clientes: cadastro em lote (colar lista), até 50 por chamada.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⚠️ NOME DO ARQUIVO: o plano pedia `…333`, mas `20261002000333_gps_cliente_
-- link_drive_um_por_cliente.sql` já existe no repo (outro agente, mesma tarde).
-- Duas migrations com a mesma versão abortam o `db push` (PK de
-- `supabase_migrations.schema_migrations`). Esta é a `…335`.
--
-- ── 1.1 O BURACO ──────────────────────────────────────────────────────────
-- Até aqui a equipe só recebia e-mail na TRANSIÇÃO de status (o parceiro
-- escreve num chamado `respondido`/`fechado`). A 2ª, 3ª… mensagem do parceiro
-- num chamado `aberto` não avisava ninguém — e era ali que ele dizia "e aí?".
--
-- ── 1.1 A REGRA NOVA (decisão do arquiteto, 02/10) ────────────────────────
--   * Transição de status: avisa SEMPRE, como antes (não muda).
--   * Mensagem num chamado já `aberto`: avisa se
--       gps.config.chamados_aviso_por_mensagem <> 'false'   (default 'true')
--       E o último aviso à equipe deste chamado foi há 30 min ou mais.
--     O "último aviso" é `chamados.ultimo_aviso_equipe_em` (coluna NOVA); nulo
--     = a abertura do chamado (que já avisou, via gps.chamado_abrir), então
--     cai em `criado_em`. Assim `chamado_abrir` não precisa ser recriada.
--   * Dentro da janela: NÃO avisa. A próxima mensagem depois da janela avisa,
--     e o e-mail cita quantas chegaram desde o último aviso (ou desde a
--     última resposta da equipe, o que for mais recente — o que veio antes da
--     resposta a equipe já leu).
--   * Uma chamada da RPC = no máximo UM aviso: transição e "nova mensagem"
--     nunca saem os dois na mesma ação.
--   * Resend (10 req/s): no pior caso, 1 e-mail por chamado aberto a cada 30
--     min; o teto de 5 chamados abertos por ambiente segue de pé. Sem vetor
--     de rajada.
--
-- ── 1.1 CONTRATO DA RPC MUDA (por isso drop + create) ─────────────────────
-- `gps.chamado_responder` ganha 2 colunas de retorno: `avisar_equipe boolean`
-- e `mensagens_novas integer`. Postgres não deixa `create or replace` mudar o
-- tipo de retorno (42P13), então é drop + create na MESMA transação, com o
-- ACL refeito igual ao vivo da …319 (authenticated, service_role; sem anon,
-- sem PUBLIC). As 2 colunas antigas ficam iguais em nome, tipo e ordem: a
-- action velha (antes do deploy) continua funcionando.
--   `avisar` (text) continua sendo a lista de `chamados_email_equipe` para o
--   ramo do aluno; `avisar_equipe` diz "avise a equipe" MESMO com essa lista
--   vazia — antes, lista vazia virava `avisar = null` e a action não chegava
--   ao fallback (EMAIL_SUPORTE → chamados_email_fallback) no responder.
--
-- Corpo recriado a partir da …319 (última definição no repo; a …320 só trocou
-- comentário). ⚠️ Conferir antes de aplicar que a VIVA bate com a …319:
--   select md5(pg_get_functiondef('gps.chamado_responder(uuid,text,text,text,text,integer)'::regprocedure));
-- e ler o corpo — se divergir, PARAR.
--
-- ── 1.2 CADASTRO EM LOTE ──────────────────────────────────────────────────
-- `gps.cadastrar_clientes_lote(p_linhas jsonb)`, SECURITY INVOKER: a policy
-- `clientes_owner_insert` (with check aluno_id = gps.aluno_atual()) é a
-- MESMA que autoriza o insert unitário de `criarCliente` hoje — o lote passa
-- pela mesma porta, sem segundo lugar para a regra viver. O ambiente é
-- DERIVADO (`gps.aluno_atual()`), nunca recebido.
--   * 1..50 linhas por chamada (mais que 50 → recusa a chamada inteira).
--   * nome: obrigatório, espaço/controle aparado, até 200 (o teto de
--     `criarCliente`). Linha sem nome → ignorada com motivo.
--   * telefone: opcional, normalizado SÓ DÍGITOS; vazio → null; >15 dígitos
--     (acima do E.164) → linha ignorada com motivo.
--   * Nasce como o unitário sem `inicial`: fase 'prospeccao' (default),
--     grau_relacao null. `ordem` continua a sequência do ambiente (max+1, +2…),
--     sob `pg_advisory_xact_lock` por ambiente para 2 lotes simultâneos não
--     repetirem números.
--   * UM insert para todas as linhas válidas.
--   * Interruptor `gps.config.clientes_lote_ativo` ('true'). O parceiro NÃO lê
--     `gps.config` (policy só-admin: leria vazio em silêncio), então a chave
--     é lida por `gps.clientes_lote_ativo()`, DEFINER, que expõe só ela — o
--     mesmo molde de `gps.chamados_abertos()`.
-- CHECKs da tabela conferidos nas migrations (não há CHECK em nome/telefone/
-- ordem): `chk_etapa1_clientes_fase` (…060, o default 'prospeccao' passa) e
-- `chk_etapa1_clientes_grau_relacao` (…202/…334, null passa). Triggers de
-- INSERT: contrato_travado (…214) e entrevista_travada (…297) só olham as
-- colunas deles (nulas aqui); `trg_aluno_eventos_etapa1_clientes` (AFTER, por
-- linha) grava `cliente_cadastrado` no Diário — 1 evento por cliente, como
-- no unitário.
--
-- ── REVERSÃO ──────────────────────────────────────────────────────────────
--   Sem deploy:  update gps.config set valor = 'false'
--                 where chave in ('chamados_aviso_por_mensagem','clientes_lote_ativo');
--                (aviso volta a ser só na transição; o lote recusa)
--   Com SQL:     drop function gps.cadastrar_clientes_lote(jsonb);
--                drop function gps.clientes_lote_ativo();
--                recriar gps.chamado_responder com o corpo e o retorno da …319
--                (drop + create — o retorno muda de novo);
--                a coluna `ultimo_aviso_equipe_em` pode ficar (nulo, inerte).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '3s';
set local statement_timeout = '20s';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Chaves de configuração (não sobrescreve valor que a equipe já tenha)
-- ═══════════════════════════════════════════════════════════════════════════
insert into gps.config (chave, valor) values
  ('chamados_aviso_por_mensagem', 'true'),
  ('clientes_lote_ativo',         'true')
on conflict (chave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. 1.1 — coluna do último aviso à equipe
--    `add column` nulo e sem default: só catálogo, sem reescrever a tabela.
--    O `revoke all … grant select` da …110 é de TABELA: a coluna nova herda
--    o `select` de authenticated e nenhum verbo de escrita.
-- ═══════════════════════════════════════════════════════════════════════════
alter table gps.chamados
  add column if not exists ultimo_aviso_equipe_em timestamptz;

comment on column gps.chamados.ultimo_aviso_equipe_em is
  'Quando a EQUIPE foi avisada por e-mail pela ultima vez sobre este chamado por causa de mensagem do parceiro (…335). Nulo = so o aviso da abertura (conta como criado_em). Escrita SO por gps.chamado_responder. Serve a janela de 30 min do aviso agrupado.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. 1.1 — gps.chamado_responder com aviso por mensagem, agrupado
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists gps.chamado_responder(uuid, text, text, text, text, integer);

create function gps.chamado_responder(
  p_chamado_id uuid,
  p_texto text,
  p_anexo_path text default null,
  p_anexo_nome text default null,
  p_anexo_mime text default null,
  p_anexo_tamanho integer default null
)
returns table(status_novo text, avisar text, avisar_equipe boolean, mensagens_novas integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_chamado       gps.chamados%rowtype;
  v_papel         text;
  v_status_ant    text;
  v_novo          text;
  v_avisar        text;
  v_avisar_equipe boolean := false;
  v_novas         integer := 0;
  v_desde         timestamptz;
begin
  select * into v_chamado from gps.chamados c where c.id = p_chamado_id for update;
  if v_chamado.id is null then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if public.gp_is_admin() then
    v_papel := 'equipe';
  elsif gps.aluno_atual() = v_chamado.aluno_id then
    v_papel := 'aluno';
  else
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if v_papel = 'aluno' then
    if not gps.chamados_abertos() then
      raise exception 'o suporte por chamado esta temporariamente fechado' using errcode = '42501';
    end if;
    if v_chamado.status = 'fechado' then
      if v_chamado.fechado_em is null or v_chamado.fechado_em <= now() - interval '7 days' then
        raise exception 'este chamado foi fechado ha mais de 7 dias; abra um novo chamado'
          using errcode = '42501';
      end if;
    end if;
  end if;
  v_status_ant := v_chamado.status;
  perform gps.chamado_gravar_mensagem(
    p_chamado_id, v_papel, p_texto,
    p_anexo_path, p_anexo_nome, p_anexo_mime, p_anexo_tamanho);
  v_novo := case when v_papel = 'aluno' then 'aberto' else 'respondido' end;

  if v_papel = 'aluno' then
    if v_status_ant <> 'aberto' then
      -- Transição: avisa sempre (regra de antes da …335).
      v_avisar_equipe := true;
    elsif coalesce(
            (select c.valor from gps.config c where c.chave = 'chamados_aviso_por_mensagem'),
            'true') <> 'false' then
      -- (…335) Chamado já aberto: aviso agrupado, 1 por chamado a cada 30 min.
      v_avisar_equipe :=
        coalesce(v_chamado.ultimo_aviso_equipe_em, v_chamado.criado_em)
          <= now() - interval '30 minutes';
    end if;

    if v_avisar_equipe then
      -- Quantas mensagens do parceiro a equipe ainda não "viu": desde o último
      -- aviso OU a última resposta da equipe, o que for mais recente. Inclui a
      -- desta chamada. Lê só a thread (≤ 20 linhas, idx_chamado_mensagens_thread).
      v_desde := greatest(
        coalesce(v_chamado.ultimo_aviso_equipe_em, v_chamado.criado_em),
        (select max(m.criado_em) from gps.chamado_mensagens m
          where m.chamado_id = p_chamado_id and m.autor_papel = 'equipe'));
      select count(*)::int into v_novas
        from gps.chamado_mensagens m
       where m.chamado_id = p_chamado_id
         and m.autor_papel = 'aluno'
         and m.criado_em > v_desde;
      v_novas := greatest(v_novas, 1);

      update gps.chamados c
         set ultimo_aviso_equipe_em = now()
       where c.id = p_chamado_id;

      v_avisar := nullif(btrim(coalesce(
        (select c.valor from gps.config c where c.chave = 'chamados_email_equipe'), '')), '');
    end if;
  -- (…319, 28/09) Equipe: avisa SEMPRE o parceiro, não só na transição.
  elsif v_papel = 'equipe' then
    v_avisar := coalesce(
      (select u.email from auth.users u where u.id = v_chamado.aberto_por),
      (select a.email from public.thb_alunos a where a.id = v_chamado.aluno_id));
  end if;

  return query select v_novo, v_avisar, v_avisar_equipe, v_novas;
end;
$function$;

comment on function gps.chamado_responder(uuid, text, text, text, text, integer) is
  'Responde na thread. Papel DERIVADO no servidor (gp_is_admin -> equipe; membro do ambiente -> aluno; ninguem mais -> 42501): o cliente nunca informa quem e. O aluno so responde com o interruptor aberto e, se o chamado estiver fechado, dentro de 7 dias (responder REABRE). Aviso a EQUIPE (avisar_equipe=true; avisar = chamados_email_equipe, pode vir nulo e a action cai no fallback): sempre na transicao de status; com o chamado ja aberto, se config.chamados_aviso_por_mensagem <> false e o ultimo aviso foi ha 30 min ou mais (…335) -- mensagens_novas = quantas do parceiro desde o ultimo aviso/resposta da equipe. Aviso ao PARCEIRO (avisar = e-mail dele) a CADA resposta da equipe (…319).';

revoke all     on function gps.chamado_responder(uuid, text, text, text, text, integer) from public, anon;
grant  execute on function gps.chamado_responder(uuid, text, text, text, text, integer) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. 1.2 — interruptor legível pelo parceiro (só esta chave)
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.clientes_lote_ativo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
           (select c.valor from gps.config c where c.chave = 'clientes_lote_ativo'),
           'true'
         ) <> 'false';
$$;

comment on function gps.clientes_lote_ativo() is
  'Interruptor do cadastro de clientes em lote (…335). Ausente = LIGADO. SECURITY DEFINER porque o parceiro nao le gps.config (policy so-admin; guarda segredo). Expoe SO esta chave.';

revoke all     on function gps.clientes_lote_ativo() from public, anon;
grant  execute on function gps.clientes_lote_ativo() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. 1.2 — gps.cadastrar_clientes_lote
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function gps.cadastrar_clientes_lote(p_linhas jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_aluno     uuid := gps.aluno_atual();
  v_total     int;
  v_ordem     int;
  v_inseridos int := 0;
  v_ignorados jsonb;
begin
  -- Admin não tem ambiente próprio (aluno_atual() nulo): o lote é do parceiro.
  -- A RLS recusaria de qualquer jeito; aqui a frase é a certa.
  if v_aluno is null then
    raise exception 'sem ambiente' using errcode = '42501';
  end if;
  if not gps.clientes_lote_ativo() then
    raise exception 'cadastro em lote desativado' using errcode = '42501';
  end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'lista invalida' using errcode = '22023';
  end if;
  v_total := jsonb_array_length(p_linhas);
  if v_total = 0 then
    raise exception 'lista vazia' using errcode = '22023';
  end if;
  if v_total > 50 then
    raise exception 'no maximo 50 clientes por vez' using errcode = '22023';
  end if;

  -- Serializa lotes do MESMO ambiente: sem isto, dois envios simultâneos
  -- leriam o mesmo max(ordem). Trava de transação, solta no commit.
  perform pg_advisory_xact_lock(hashtextextended('gps.cadastrar_clientes_lote:' || v_aluno::text, 0));

  select coalesce(max(c.ordem), 0) into v_ordem
    from gps.etapa1_clientes c
   where c.aluno_id = v_aluno;

  with entrada as (
    select e.n::int as linha,
           -- `[[:space:][:cntrl:]]`: btrim() só tira espaço; tab/quebra de
           -- linha colados de planilha passariam como nome.
           regexp_replace(
             case when jsonb_typeof(e.v -> 'nome') = 'string' then e.v ->> 'nome' else '' end,
             '^[[:space:][:cntrl:]]+|[[:space:][:cntrl:]]+$', '', 'g') as nome,
           regexp_replace(
             case when jsonb_typeof(e.v -> 'telefone') in ('string','number')
                  then e.v ->> 'telefone' else '' end,
             '[^0-9]', '', 'g') as fone
      from jsonb_array_elements(p_linhas) with ordinality as e(v, n)
  ),
  avaliada as (
    select linha, nome, nullif(fone, '') as fone,
           case
             when nome = ''                 then 'nome vazio'
             when char_length(nome) > 200   then 'nome com mais de 200 caracteres'
             when nome ~ '[[:cntrl:]]'      then 'nome com caractere invalido'
             when char_length(fone) > 15    then 'telefone com mais de 15 digitos'
           end as motivo
      from entrada
  ),
  ins as (
    insert into gps.etapa1_clientes (aluno_id, nome, telefone, ordem)
    select v_aluno, a.nome, a.fone,
           v_ordem + row_number() over (order by a.linha)
      from avaliada a
     where a.motivo is null
     order by a.linha
    returning 1
  )
  select (select count(*)::int from ins),
         coalesce(
           (select jsonb_agg(jsonb_build_object('linha', a.linha, 'motivo', a.motivo)
                             order by a.linha)
              from avaliada a where a.motivo is not null),
           '[]'::jsonb)
    into v_inseridos, v_ignorados;

  return jsonb_build_object('inseridos', v_inseridos, 'ignorados', v_ignorados);
end;
$function$;

comment on function gps.cadastrar_clientes_lote(jsonb) is
  'Cadastro de clientes em lote do PARCEIRO (…335). SECURITY INVOKER: quem autoriza e a policy clientes_owner_insert (aluno_id = gps.aluno_atual()), a mesma do insert unitario. p_linhas = [{nome, telefone?}], 1..50. Nome obrigatorio (aparado, <= 200); telefone opcional, so digitos, <= 15. Linha invalida e IGNORADA com motivo (linha = posicao 1-based no array), as validas entram num INSERT unico com ordem = max+1.. do ambiente. Devolve {inseridos, ignorados:[{linha, motivo}]}. Interruptor gps.config.clientes_lote_ativo.';

revoke all     on function gps.cadastrar_clientes_lote(jsonb) from public, anon;
grant  execute on function gps.cadastrar_clientes_lote(jsonb) to authenticated;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVAS A RODAR DEPOIS DE APLICAR (nada disto foi rodado: o executor não tem
-- acesso ao banco)
-- ═══════════════════════════════════════════════════════════════════════════
-- ACL (esperado: sem anon e sem entrada PUBLIC "=X/"):
--   select p.proname, p.proacl, p.prosecdef from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps'
--      and p.proname in ('chamado_responder','clientes_lote_ativo','cadastrar_clientes_lote');
--   select has_function_privilege('anon','gps.cadastrar_clientes_lote(jsonb)','execute'),
--          has_function_privilege('anon','gps.chamado_responder(uuid,text,text,text,text,integer)','execute');
-- Sobrecargas (esperado 1 cada):
--   select proname, count(*) from pg_proc where pronamespace = 'gps'::regnamespace
--    and proname in ('chamado_responder','cadastrar_clientes_lote') group by 1;
