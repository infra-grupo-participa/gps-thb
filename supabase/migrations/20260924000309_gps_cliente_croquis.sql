-- Croquis da ficha do cliente — histórico de folhas apresentadas, só PDF.
--
-- MOLDE: a migração …259 (`gps.cliente_minutas`), LITERAL. Mesma forma de
-- tabela, mesmas 3 camadas de defesa (bucket → policies de storage → RPC que
-- lê o metadata REAL), mesmo par de funções-guarda, mesmo par de RPCs
-- SECURITY DEFINER, mesmo regime de GRANT. O que NÃO é cópia está declarado
-- nos 3 desvios abaixo — qualquer outra diferença em relação à …259 é erro,
-- não decisão.
--
-- ═══ DESVIO 1 — BUCKET PRÓPRIO `gps-croquis` ═══════════════════════════
--   Privado, 5 MB, `array['application/pdf']` — a MESMA configuração de
--   `gps-minutas`, em um bucket SEPARADO. Não é duplicação por descuido: o
--   `bucket_id` é o que uma policy de `storage.objects` consegue discriminar,
--   e uma policy única cobrindo dois buckets teria de afrouxar a guarda de
--   um para caber o outro. Buckets separados também deixam o expurgo (B-R1)
--   e uma eventual mudança de allowlist acontecerem em um sem tocar o outro:
--   croqui é desenho técnico (pode um dia aceitar imagem); minuta é peça
--   jurídica (PDF para sempre). Hoje as allowlists coincidem; amanhã não
--   precisam coincidir.
--   ⚠️ NÃO reaproveitar `gps-onboarding` (aceita 4 MIMEs, incluindo imagem —
--   perderíamos a recusa do bucket), nem `gps-documentos` (órfão, sem
--   `file_size_limit` e sem `allowed_mime_types`, medido em 15/09/2026).
--
-- ═══ DESVIO 2 — SEM O CONTEXTO OBRIGATÓRIO DA …273 ═════════════════════
--   A …273 acrescentou 4 colunas (`caso`, `o_que_foi_feito`,
--   `ponto_de_ajuda`, `o_que_mudou`), um CHECK de 3 ramos, um interruptor em
--   `gps.config` e uma trava de "é a primeira?" dentro da RPC. NADA disso
--   entra aqui. Aquele pedido era específico da MINUTA ("descreva o caso, o
--   que foi feito e qual o primeiro ponto que precisa de ajuda" — revisão
--   jurídica assistida). O croqui é uma FOLHA APRESENTADA ao cliente; não há
--   pedido de negócio de contexto obrigatório, e copiar a regra criaria uma
--   obrigatoriedade que ninguém decidiu, com um interruptor a mais para
--   manter. 👉 Por consequência, esta migração NÃO toca
--   `gps.config_definir` (a allowlist viva de 15 chaves fica intacta) e NÃO
--   cria chave nenhuma em `gps.config`.
--
-- ═══ DESVIO 3 — `apresentado_em` E `observacoes` NA VERSÃO ═════════════
--   Decisão do arquiteto (24/09/2026): as duas colunas ficam na TABELA DE
--   VERSÕES (`gps.cliente_croquis`), não na ficha do cliente.
--     · `apresentado_em date` — a data pertence ao ATO daquela folha. Se
--       morasse na ficha, a segunda apresentação sobrescreveria a data da
--       primeira e o histórico mentiria sobre quando cada folha foi mostrada.
--     · `observacoes text` — texto no cliente seria uma CAIXA COMPARTILHADA
--       entre N versões: quem escrevesse sobre o croqui 3 apagaria o que foi
--       dito do croqui 1, sem aviso.
--   👉 `apresentado_em` é `date` (não `timestamptz`): o que se registra é o
--      DIA da apresentação, não o instante. E aceita QUALQUER data — sem
--      teto de "não pode ser futuro": o parceiro pode registrar uma
--      apresentação já agendada, e inventar essa regra aqui seria criar
--      critério de negócio que ninguém pediu. `null` = não informado.
--   `observacoes` tem CHECK ≤ 2000, mesmo teto de `notas` da minuta.
--
-- ═══ O QUE É CÓPIA LITERAL DA …259 (e por quê) ═════════════════════════
--   · TRÊS CAMADAS, nesta ordem: (1) o BUCKET recusa por tamanho e MIME;
--     (2) as POLICIES de `storage.objects` recusam por CAMINHO (o prefixo
--     tem de ser o ambiente de quem chama) — SEM policy de UPDATE (ninguém
--     sobrescreve; `upsert:true` no mesmo caminho falha) e DELETE só para
--     admin (é o expurgo, B-R1, ainda sem botão); (3) a RPC confere que o
--     objeto EXISTE e lê MIME e TAMANHO REAIS de `storage.objects.metadata`,
--     nunca o que o navegador declarou.
--   · QUEM ANEXA: dono do ambiente (titular ou sócio, via `gps.aluno_atual()`)
--     OU admin — mesmo critério da minuta e do contrato (…214). O croqui é
--     material trabalhado entre parceiro e equipe; os dois lados sobem folha.
--   · LEITURA: admin ou membro do AMBIENTE do cliente. Nunca `anon`.
--   · SEM CATRACA DE FASE OU DE FAVORITO: croqui é FICHA, não VÍNCULO.
--   · SEM coluna "versão" numérica: a ORDEM é `enviado_em`; o número de
--     exibição é derivado na leitura. Contador gravado seria mais um lugar
--     para uma corrida colidir.
--   · DELETE físico da LINHA em `_remover` (não soft-delete): o BYTE fica no
--     bucket até o expurgo do admin — SQL não apaga arquivo no object store.
--
-- ═══ 🔴 O ERRO QUE A …259 PAGOU E ESTA MIGRAÇÃO NÃO REPETE ═════════════
--   A …259 escreveu `revoke all ... from public, anon;` e
--   `grant select ... to authenticated;` — e a tabela NASCEU com
--   INSERT/UPDATE/DELETE para `authenticated`, herdados do default do schema
--   `gps`. O `revoke` não cobria `authenticated`, e `grant select` NÃO
--   REVOGA ESCRITA. Só foi corrigido na …273, 2 dias depois. A RLS segurou
--   (só existe policy de SELECT), mas era defesa única: bastaria alguém
--   criar uma policy de INSERT para a porta abrir com o GRANT já esperando.
--   👉 Aqui o `revoke all ... from public, anon, authenticated` vem ANTES do
--      `grant select ... to authenticated`. Alvo: `authenticated = SELECT
--      apenas`, exatamente o estado vivo de `gps.cliente_minutas` hoje.
--   👉 E o `revoke` das FUNÇÕES inclui `public` — não só `anon`: quando a
--      permissão vem de PUBLIC (entrada `=X/postgres` no `proacl`),
--      `revoke from anon` executa sem erro e SEM EFEITO (memória de
--      19/08/2026, as 3 funções `fn_fin_*`). Função nova nasce executável
--      por PUBLIC; a prova é o `proacl`, não o sucesso do comando.
--
-- ═══ ÍNDICE ════════════════════════════════════════════════════════════
--   `cliente_croquis_cliente_idx (cliente_id, enviado_em desc)` — EXATAMENTE
--   o predicado da única listagem (`where cliente_id = $1 order by
--   enviado_em desc`, `getCroquisDoCliente`). Não é índice especulativo:
--   a coluna do WHERE e a do ORDER BY são as duas do índice, nessa ordem.
--   A tabela NASCE VAZIA — não há "antes/depois" contra dado existente; o
--   roteiro de prova no rodapé semeia ~20 linhas em `begin; … rollback;`
--   para o plano sair real.
--
-- ═══ ESCALA / FREQUÊNCIA (as 5 perguntas) ══════════════════════════════
--   1. Escala: N croquis por cliente, N pequeno por natureza (folhas de UM
--      caso). A leitura é sempre por UM `cliente_id` — o custo é por item
--      novo, nunca por base inteira. Sem `limit` de propósito (a tela mostra
--      o histórico inteiro de um cliente); se N crescer, a paginação entra
--      na função de leitura, não na tela.
--   2. Índice: ver acima — predicado idêntico, provado no rodapé.
--   3. Frequência: por clique humano (anexar/remover/abrir a ficha). Não há
--      cron, não há job, não há Realtime nesta tabela.
--   4. Repetição: uma leitura por renderização da ficha; nenhum outro
--      componente consulta `cliente_croquis`.
--   5. Reversão: bloco REVERSÃO abaixo, sem restore de backup.
--
-- ═══ REVERSÃO (nesta ordem) ════════════════════════════════════════════
--   drop policy if exists gps_croquis_select       on storage.objects;
--   drop policy if exists gps_croquis_insert       on storage.objects;
--   drop policy if exists gps_croquis_delete_admin on storage.objects;
--   drop function if exists gps.cliente_croqui_anexar(uuid, text, text, integer, date, text);
--   drop function if exists gps.cliente_croqui_remover(uuid);
--   drop function if exists gps.pode_ver_croqui(text);
--   drop function if exists gps.pode_anexar_croqui(text);
--   drop table if exists gps.cliente_croquis;
--   -- o bucket gps-croquis FICA (storage.protect_delete bloqueia DELETE
--   -- direto); sem policy nenhuma ele fica inacessível, que é seguro.
--   -- O CHECK de gps.aluno_eventos.tipo: ver o corpo ANTERIOR comentado no
--   -- bloco 7 (os 36 valores vivos em 24/09/2026, sem os 2 novos). Reverter
--   -- o CHECK com linhas 'cliente_croqui_*' já gravadas FALHA na validação
--   -- — apagar essas linhas de trilha antes, ou deixar o CHECK largo.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Bucket `gps-croquis`
-- ═════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gps-croquis', 'gps-croquis', false, 5242880, array['application/pdf'])
on conflict (id) do update
   set public             = false,
       file_size_limit    = 5242880,
       allowed_mime_types = array['application/pdf'];

-- ═════════════════════════════════════════════════════════════════════════
-- 2. A tabela — N folhas por cliente, sem UPDATE de conteúdo
-- ═════════════════════════════════════════════════════════════════════════

create table if not exists gps.cliente_croquis (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references gps.etapa1_clientes(id) on delete cascade,
  path                 text not null,
  nome                 text not null,
  tamanho              integer not null,
  apresentado_em       date,
  observacoes          text,
  enviado_em           timestamptz not null default now(),
  enviado_por          uuid references auth.users(id) on delete set null,
  enviado_pela_equipe  boolean not null default false
);

comment on table gps.cliente_croquis is
  'Historico de CROQUIS (PDF) de um cliente da Etapa 01. Cada linha e uma folha apresentada -- nao ha UPDATE de conteudo, so INSERT (folha nova) e DELETE (gps.cliente_croqui_remover, tira a linha; o byte fica no bucket ate o expurgo do admin). Escrita SO por gps.cliente_croqui_anexar/_remover -- authenticated tem SELECT apenas (bloco 2, revoke ANTES do grant). Molde de gps.cliente_minutas (...259), SEM as 4 colunas de contexto obrigatorio da ...273.';
comment on column gps.cliente_croquis.path is
  'Caminho no bucket gps-croquis, formato <ambiente_aluno_id>/<uuid>.pdf. O PREFIXO e a credencial de leitura (policies gps_croquis_*).';
comment on column gps.cliente_croquis.nome is
  'Nome ORIGINAL do arquivo, so para exibir e para o `download=` da URL assinada. 1..120, sem / nem \.';
comment on column gps.cliente_croquis.tamanho is
  'Tamanho REAL em bytes (1..5 MB), lido de storage.objects.metadata pela RPC -- nunca o que o navegador declarou.';
comment on column gps.cliente_croquis.apresentado_em is
  'DIA em que ESTA folha foi apresentada ao cliente (date, nao timestamptz -- o que se registra e o dia, nao o instante). Mora na VERSAO e nao na ficha por decisao do arquiteto (24/09/2026): a data pertence ao ATO daquela folha, e na ficha a segunda apresentacao sobrescreveria a data da primeira. ACEITA QUALQUER DATA, inclusive futura -- registrar apresentacao agendada e uso valido e nenhuma regra de negocio foi definida sobre isso. NULL = nao informado.';
comment on column gps.cliente_croquis.observacoes is
  'Texto livre de quem enviou sobre ESTA folha. Mora na VERSAO e nao na ficha (decisao do arquiteto, 24/09/2026): na ficha seria caixa COMPARTILHADA entre N versoes e quem escrevesse sobre a folha 3 apagaria o que foi dito da folha 1. NAO validado nem comparado pelo sistema. Ate 2000 caracteres (CHECK). NUNCA entra no detalhe do evento do diario -- pode conter texto sensivel sobre o cliente do aluno.';
comment on column gps.cliente_croquis.enviado_pela_equipe is
  'true quando quem chamou gps.cliente_croqui_anexar era admin (modo assistencia). O historico mostra quem enviou cada folha -- aluno ou equipe.';

alter table gps.cliente_croquis
  add constraint chk_cliente_croquis_path
  check (path ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$');

alter table gps.cliente_croquis
  add constraint chk_cliente_croquis_nome
  check (char_length(nome) between 1 and 120 and nome !~ '[/\\]');

alter table gps.cliente_croquis
  add constraint chk_cliente_croquis_tamanho
  check (tamanho between 1 and 5242880);

alter table gps.cliente_croquis
  add constraint chk_cliente_croquis_observacoes
  check (observacoes is null or char_length(observacoes) <= 2000);

-- Único índice desta migração: EXATAMENTE o predicado da listagem por
-- cliente (`where cliente_id = $1 order by enviado_em desc`). Tabela nasce
-- vazia — ver o roteiro de prova no rodapé (semeia ~20 linhas em rollback).
create index if not exists cliente_croquis_cliente_idx
  on gps.cliente_croquis (cliente_id, enviado_em desc);

alter table gps.cliente_croquis enable row level security;

-- RLS: leitura para admin ou para quem é dono do AMBIENTE do cliente
-- (titular ou sócio, via `gps.aluno_atual()` contra `etapa1_clientes.aluno_id`
-- — mesma regra de leitura da ficha inteira). Sem policy de INSERT/UPDATE/
-- DELETE: authenticated só lê; toda escrita é pela RPC (SECURITY DEFINER),
-- que valida o objeto no bucket antes de gravar.
drop policy if exists cliente_croquis_select on gps.cliente_croquis;
create policy cliente_croquis_select on gps.cliente_croquis
  for select to authenticated
  using (
    public.gp_is_admin()
    or exists (
      select 1 from gps.etapa1_clientes c
       where c.id = cliente_croquis.cliente_id
         and c.aluno_id = gps.aluno_atual()
    )
  );

-- 🔴 A ORDEM IMPORTA, E ESTE É O CONSERTO DO ERRO DA …259.
-- Tabela nova no schema `gps` NASCE com INSERT/UPDATE/DELETE para
-- `authenticated` (default do schema). `grant select` NÃO revoga escrita —
-- é preciso revogar explicitamente ANTES. Alvo: authenticated = SELECT.
revoke all on gps.cliente_croquis from public, anon, authenticated;
grant select on gps.cliente_croquis to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Guardas de storage.objects — pode_ver_croqui / pode_anexar_croqui
-- ═════════════════════════════════════════════════════════════════════════
--
-- CÓPIA LITERAL de gps.pode_ver_minuta/gps.pode_anexar_minuta (texto vivo
-- extraído do banco em 24/09/2026), trocando SÓ o nome — o corpo não muda
-- porque a regra não muda: o formato do caminho é o mesmo, a extensão é a
-- mesma (.pdf) e quem pode é o mesmo (dono do ambiente OU admin).
-- AS DUAS FALHAM FECHADO: nome de objeto é entrada de usuário.

create or replace function gps.pode_ver_croqui(p_name text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare v_prefixo text := split_part(coalesce(p_name, ''), '/', 1);
begin
  if v_prefixo !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return coalesce(public.gp_is_admin(), false)
      or gps.aluno_atual() = v_prefixo::uuid;
exception when others then
  return false;
end;
$$;

comment on function gps.pode_ver_croqui(text) is
  'Quem le um anexo do bucket gps-croquis: admin ou membro do AMBIENTE cujo aluno_id e o PREFIXO do caminho (titular e socio). SECURITY INVOKER -- gps.aluno_atual() e gp_is_admin() ja resolvem pela sessao. Falha FECHADO. Copia literal de gps.pode_ver_minuta (...259). Toda URL assinada sai com download=, nunca inline.';

create or replace function gps.pode_anexar_croqui(p_name text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(p_name, '') !~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
  then
    return false;
  end if;

  -- Dono do ambiente (titular ou sócio) OU admin -- mesma regra da minuta e
  -- de gps.cliente_definir_contrato. O croqui é trabalhado entre o parceiro
  -- e a equipe; os dois lados sobem folha.
  return coalesce(public.gp_is_admin(), false)
      or gps.aluno_atual() = split_part(p_name, '/', 1)::uuid;
exception when others then
  return false;
end;
$$;

comment on function gps.pode_anexar_croqui(text) is
  'Quem ESCREVE no bucket gps-croquis: dono do ambiente (titular ou socio, via gps.aluno_atual()) OU admin. Formato exato <ambiente_aluno_id>/<uuid>.pdf. Falha FECHADO. Copia literal de gps.pode_anexar_minuta (...259). ⚠️ DIVIDA HERDADA DO MOLDE: para ADMIN, aceita QUALQUER prefixo -- um admin pode subir arquivo no prefixo de um ambiente que nao abriu. O objeto fica ORFAO (a RPC valida split_part(p_path,1) contra o ambiente DO CLIENTE e recusa vincular). Mesmo achado ja registrado na ...273 para a minuta; conserto, quando vier, e para as DUAS: exists (select 1 from gps.etapa1_clientes where aluno_id = prefixo).';

-- 🔴 `from public` e NÃO só `from anon`: função nova nasce executável por
-- PUBLIC, e `revoke from anon` não tem efeito quando a permissão é herdada
-- de PUBLIC (memória de 19/08/2026). Alvo do `proacl`, igual às funções da
-- minuta: {postgres=X/postgres, authenticated=X/postgres, service_role=X/postgres}.
revoke execute on function gps.pode_ver_croqui(text)    from public, anon;
revoke execute on function gps.pode_anexar_croqui(text) from public, anon;
grant  execute on function gps.pode_ver_croqui(text)    to authenticated;
grant  execute on function gps.pode_anexar_croqui(text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 4. Policies em storage.objects — as três, e só estas
-- ═════════════════════════════════════════════════════════════════════════
--
-- SEM policy de UPDATE (ninguém sobrescreve; `upsert:true` no mesmo caminho
-- tem de falhar -- cada folha nasce com um `randomUUID()` novo). DELETE só
-- para admin: é a policy que o expurgo (B-R1, ainda sem botão) vai precisar
-- quando vier.

drop policy if exists gps_croquis_select       on storage.objects;
drop policy if exists gps_croquis_insert       on storage.objects;
drop policy if exists gps_croquis_delete_admin on storage.objects;

create policy gps_croquis_select on storage.objects
  for select to authenticated
  using (bucket_id = 'gps-croquis' and gps.pode_ver_croqui(name));

create policy gps_croquis_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gps-croquis' and gps.pode_anexar_croqui(name));

create policy gps_croquis_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'gps-croquis' and coalesce(public.gp_is_admin(), false));

-- ═════════════════════════════════════════════════════════════════════════
-- 5. gps.cliente_croqui_anexar — grava a folha DEPOIS de conferir o objeto
-- ═════════════════════════════════════════════════════════════════════════
--
-- Esqueleto de gps.cliente_minuta_anexar: o que o objeto REALMENTE é
-- (storage.objects.metadata) vence o que o cliente declarou. SEM o bloco de
-- contexto obrigatório da …273 (desvio 2) — e por isso SEM leitura de
-- gps.config e SEM `count(*)` de "é a primeira?".
--
-- 🔑 O `for update` FICA, mesmo sem a trava de "é a primeira?": ele serializa
-- por cliente e, principalmente, é o que garante que o cliente ainda EXISTE
-- no instante do INSERT. Sem ele, um cliente excluído entre o SELECT inicial
-- e o INSERT faria a FK estourar com erro CRU, sem frase traduzida por
-- `traduzirErroBanco`. E `perform` NÃO levanta erro em zero linhas — daí o
-- `if not found then raise ... P0002` logo abaixo (achado do pentester em
-- 17/09/2026, …273).

create or replace function gps.cliente_croqui_anexar(
  p_cliente_id     uuid,
  p_path           text,
  p_nome           text,
  p_tamanho        integer,
  p_apresentado_em date default null,
  p_observacoes    text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_c           record;
  v_admin       boolean := coalesce(public.gp_is_admin(), false);
  v_ambiente    uuid    := gps.aluno_atual();
  v_existe      boolean;
  v_meta_size   bigint;
  v_meta_mime   text;
  v_tamanho     integer;
  v_nome        text;
  v_observacoes text;
  v_id          uuid;
begin
  if p_cliente_id is null then
    raise exception 'cliente nao informado' using errcode = '22023';
  end if;

  select c.id, c.aluno_id, c.nome
    into v_c
    from gps.etapa1_clientes c
   where c.id = p_cliente_id;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  -- AUTORIZAÇÃO: dono do ambiente OU admin. Nada vindo do cliente escolhe de
  -- quem é a ficha -- `v_ambiente` sai do JWT, dentro do banco.
  if not v_admin and (v_ambiente is null or v_ambiente <> v_c.aluno_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_nome := btrim(coalesce(p_nome, ''));
  if v_nome = '' or char_length(v_nome) > 120 or v_nome ~ '[/\\]' then
    raise exception 'Nome de arquivo inválido.' using errcode = '22023';
  end if;

  v_observacoes := nullif(btrim(coalesce(p_observacoes, '')), '');
  if v_observacoes is not null and char_length(v_observacoes) > 2000 then
    raise exception 'As observações do croqui estão muito longas.' using errcode = '22023';
  end if;

  -- `p_apresentado_em` NÃO é validado: aceita qualquer date, inclusive
  -- futura (desvio 3 do cabeçalho). Não inventar regra de negócio aqui.

  -- (1) POSSE: o prefixo tem de ser o AMBIENTE DESTE CLIENTE -- não o de
  -- quem chama. Para o aluno é o mesmo valor; para o ADMIN, é o que impede
  -- vincular na ficha de um aluno um arquivo que vive no prefixo de outro.
  if coalesce(p_path,'') !~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$'
  then
    raise exception 'anexo em caminho invalido' using errcode = '22023';
  end if;
  if split_part(p_path, '/', 1) <> v_c.aluno_id::text then
    raise exception 'anexo nao pertence a este ambiente' using errcode = '42501';
  end if;

  -- (2)/(3) EXISTÊNCIA e METADADOS REAIS.
  begin
    select true,
           nullif(o.metadata->>'size','')::bigint,
           nullif(o.metadata->>'mimetype','')
      into v_existe, v_meta_size, v_meta_mime
      from storage.objects o
     where o.bucket_id = 'gps-croquis'
       and o.name = p_path;
  exception when insufficient_privilege then
    raise exception 'nao foi possivel validar o anexo' using errcode = '42501';
  end;

  if not coalesce(v_existe, false) then
    raise exception 'anexo nao encontrado' using errcode = '42501';
  end if;

  if coalesce(v_meta_mime, 'application/pdf') <> 'application/pdf' then
    raise exception 'formato de anexo nao aceito' using errcode = '22023';
  end if;

  v_tamanho := coalesce(v_meta_size, p_tamanho::bigint)::integer;
  if v_tamanho is null or v_tamanho < 1 or v_tamanho > 5242880 then
    raise exception 'anexo maior que 5 MB' using errcode = '22023';
  end if;

  -- Extensão já é garantida pelo CHECK do path (só aceita .pdf).

  -- Serializa por cliente e garante que a ficha ainda existe no instante do
  -- INSERT. `perform` não levanta erro em zero linhas -- o `if not found` é
  -- obrigatório (achado do pentester, ...273).
  perform 1 from gps.etapa1_clientes where id = p_cliente_id for update;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  insert into gps.cliente_croquis
    (cliente_id, path, nome, tamanho, apresentado_em, observacoes,
     enviado_por, enviado_pela_equipe)
  values
    (p_cliente_id, p_path, v_nome, v_tamanho, p_apresentado_em, v_observacoes,
     auth.uid(), v_admin)
  returning id into v_id;

  -- Evento na trilha. `rotulo` é o nome do CLIENTE (padrão da trigger de
  -- captura, ...092); `detalhe` NÃO leva o nome do arquivo nem as
  -- observações (podem conter texto sensível sobre o cliente do aluno).
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_c.aluno_id, now(), 'cliente_croqui_anexado', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('croqui_id', v_id, 'tamanho', v_tamanho),
     case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');

  return jsonb_build_object('id', v_id, 'cliente_id', p_cliente_id, 'path', p_path,
                            'nome', v_nome, 'tamanho', v_tamanho);
end $function$;

comment on function gps.cliente_croqui_anexar(uuid, text, text, integer, date, text) is
  'Grava uma FOLHA NOVA de croqui na ficha do cliente DEPOIS de conferir o objeto: prefixo do caminho = aluno_id do AMBIENTE DO CLIENTE, objeto existe no bucket gps-croquis, e tamanho/MIME lidos de storage.objects.metadata (o que o cliente declara e fallback, nunca a fonte). Autorizacao: dono do ambiente (gps.aluno_atual()) OU admin. NAO substitui -- cada chamada INSERE uma linha nova (historico); para tirar uma folha existe gps.cliente_croqui_remover. p_apresentado_em aceita QUALQUER date (inclusive futura) -- nenhuma regra de negocio foi definida. Grava o evento cliente_croqui_anexado com detalhe {croqui_id, tamanho} -- NUNCA nome nem observacoes. SEM o contexto obrigatorio da ...273 (aquilo e da MINUTA). A trava do favorito NAO bloqueia aqui: croqui e FICHA, nao VINCULO.';

revoke execute on function gps.cliente_croqui_anexar(uuid, text, text, integer, date, text) from public, anon;
grant  execute on function gps.cliente_croqui_anexar(uuid, text, text, integer, date, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 6. gps.cliente_croqui_remover — tira UMA folha da lista
-- ═════════════════════════════════════════════════════════════════════════
--
-- DELETE físico da LINHA (mesmo padrão de gps.cliente_minuta_remover): o
-- BYTE fica no bucket até o expurgo do admin. Não é soft-delete: exigiria a
-- UI filtrar `removido_em is null` em toda leitura, e o histórico de folhas
-- já é a rastreabilidade pedida — tirar uma folha errada (PDF corrompido)
-- não precisa deixar marca visível, só sumir da lista.

create or replace function gps.cliente_croqui_remover(p_croqui_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_k        record;
  v_admin    boolean := coalesce(public.gp_is_admin(), false);
  v_ambiente uuid    := gps.aluno_atual();
begin
  if p_croqui_id is null then
    raise exception 'croqui nao informado' using errcode = '22023';
  end if;

  select k.id, k.cliente_id, k.tamanho, c.aluno_id, c.nome as cliente_nome
    into v_k
    from gps.cliente_croquis k
    join gps.etapa1_clientes c on c.id = k.cliente_id
   where k.id = p_croqui_id;
  if not found then
    raise exception 'Croqui não encontrado.' using errcode = 'P0002';
  end if;

  if not v_admin and (v_ambiente is null or v_ambiente <> v_k.aluno_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  delete from gps.cliente_croquis where id = p_croqui_id;

  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_k.aluno_id, now(), 'cliente_croqui_removido', 'cliente', v_k.cliente_id,
     left(coalesce(nullif(btrim(v_k.cliente_nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('croqui_id', p_croqui_id, 'tamanho', v_k.tamanho),
     case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');

  return jsonb_build_object('cliente_id', v_k.cliente_id, 'removido', true);
end $function$;

comment on function gps.cliente_croqui_remover(uuid) is
  'Tira uma FOLHA da lista de croquis do cliente (DELETE fisico da linha). O ARQUIVO continua no bucket gps-croquis ate o expurgo do admin (B-R1): a policy de delete de storage.objects e so de admin, o GPS nao usa service_role, e apagar a linha de storage.objects por SQL NAO apaga o byte. Autorizacao: dono do ambiente OU admin -- mesma regra de gps.cliente_croqui_anexar. Grava o evento cliente_croqui_removido com detalhe {croqui_id, tamanho}. A trava do favorito NAO bloqueia aqui.';

revoke execute on function gps.cliente_croqui_remover(uuid) from public, anon;
grant  execute on function gps.cliente_croqui_remover(uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 7. Catálogo do Diário — 2 tipos novos, POR CONTEÚDO
-- ═════════════════════════════════════════════════════════════════════════
--
-- Mesma técnica das ...092/...151/...201/...214/...231/...259: acha o CHECK
-- pelo CONTEÚDO de um valor recente conhecido, nunca pelo nome da
-- constraint. A tabela tem VÁRIOS CHECKs — por isso o filtro pelo conteúdo,
-- e por isso os outros 4 NÃO são tocados: aluno_eventos_ator_check
-- (aluno|equipe|sistema), aluno_eventos_entidade_check (cliente|tarefa|
-- conta|etapa|onboarding|nota), aluno_eventos_origem_check (app|backfill),
-- aluno_eventos_rotulo_check (1..300).
--
-- 🔴 A LISTA ABAIXO É A VIVA DO BANCO (36 valores, extraídos em 24/09/2026),
--    NÃO a da …259 (que tinha 27). Entre a …259 e hoje entraram 9 valores
--    por migrações posteriores (entrevista prévia, reunião preliminar).
--    Copiar a lista da …259 APAGARIA esses 9 em silêncio — é exatamente o
--    modo de falha que este catálogo já causou duas vezes neste projeto.
--
-- 🔴 A ÂNCORA É 'cliente_entrevista_sem_contato' (o valor mais recente da
--    lista viva). Se ela não existir, a lista mudou desde a extração de
--    24/09 e a migração ABORTA: reler o CHECK vigente antes de reescrever.

do $$
declare v_nome text;
begin
  select con.conname into v_nome
    from pg_constraint con
    join pg_class     c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'gps' and c.relname = 'aluno_eventos' and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%cliente_entrevista_sem_contato%';

  if v_nome is null then
    raise exception
      'CHECK de gps.aluno_eventos.tipo nao encontrado (procurado pelo conteudo cliente_entrevista_sem_contato, extraido do banco vivo em 24/09/2026) -- migracao abortada. A lista mudou: leia o CHECK vigente (select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid=''gps.aluno_eventos''::regclass and contype=''c'') e reescreva o bloco abaixo A PARTIR DELE, nunca de memoria.';
  end if;

  execute format('alter table gps.aluno_eventos drop constraint %I', v_nome);
end;
$$;

-- CORPO ANTERIOR, PARA REVERSÃO (os 36 valores vivos em 24/09/2026, na
-- ordem do banco, SEM os 2 desta migração):
--   alter table gps.aluno_eventos
--     add constraint aluno_eventos_tipo_check check (tipo = any (array[
--       'cliente_cadastrado', 'cliente_favoritado', 'cliente_desfavoritado',
--       'cliente_status_mudou', 'cliente_fase_mudou', 'cliente_mensagem_padrao',
--       'cliente_estudo_caso', 'cliente_ligacao', 'cliente_aderiu_reuniao',
--       'cliente_reuniao_agendada', 'cliente_excluido',
--       'cliente_honorarios_definidos', 'tarefa_concluida', 'tarefa_reaberta',
--       'conta_criada', 'email_confirmado', 'primeiro_acesso',
--       'entrou_no_programa', 'etapa_liberada_pela_equipe',
--       'etapa_travada_pela_equipe', 'onboarding_iniciado',
--       'onboarding_concluido', 'favorito_confirmado_pela_equipe',
--       'favorito_liberado_pela_equipe', 'cliente_contrato_anexado',
--       'cliente_contrato_removido', 'nota_apagada', 'cliente_minuta_anexada',
--       'cliente_minuta_removida', 'cliente_selecionado_entrevista',
--       'cliente_removido_entrevista', 'cliente_entrevista_registrada',
--       'reuniao_preliminar_proposta', 'reuniao_preliminar_aceita',
--       'reuniao_preliminar_contestada', 'cliente_entrevista_sem_contato'
--     ]));
--   ⚠️ Reverter com linhas 'cliente_croqui_*' já gravadas FALHA na validação
--      do `add constraint`. Apagar essas linhas de trilha antes, ou deixar o
--      CHECK largo.

alter table gps.aluno_eventos
  add constraint aluno_eventos_tipo_check check (tipo = any (array[
    'cliente_cadastrado',
    'cliente_favoritado',
    'cliente_desfavoritado',
    'cliente_status_mudou',
    'cliente_fase_mudou',
    'cliente_mensagem_padrao',
    'cliente_estudo_caso',
    'cliente_ligacao',
    'cliente_aderiu_reuniao',
    'cliente_reuniao_agendada',
    'cliente_excluido',
    'cliente_honorarios_definidos',
    'tarefa_concluida',
    'tarefa_reaberta',
    'conta_criada',
    'email_confirmado',
    'primeiro_acesso',
    'entrou_no_programa',
    'etapa_liberada_pela_equipe',
    'etapa_travada_pela_equipe',
    'onboarding_iniciado',
    'onboarding_concluido',
    'favorito_confirmado_pela_equipe',
    'favorito_liberado_pela_equipe',
    'cliente_contrato_anexado',
    'cliente_contrato_removido',
    'nota_apagada',
    'cliente_minuta_anexada',
    'cliente_minuta_removida',
    'cliente_selecionado_entrevista',
    'cliente_removido_entrevista',
    'cliente_entrevista_registrada',
    'reuniao_preliminar_proposta',
    'reuniao_preliminar_aceita',
    'reuniao_preliminar_contestada',
    'cliente_entrevista_sem_contato',
    -- ── Croquis da ficha do cliente (24/09/2026, migração ...309) ──
    'cliente_croqui_anexado',
    'cliente_croqui_removido'
  ]::text[]));

comment on constraint aluno_eventos_tipo_check on gps.aluno_eventos is
  'Catalogo fechado de tipos de evento do diario. Espelha TIPOS_EVENTO em src/lib/types.ts. 36 valores VIVOS em 24/09/2026 (extraidos do banco, NAO copiados da ...259 que so tinha 27) + 2 desta migracao: cliente_croqui_anexado/cliente_croqui_removido, gravados so por gps.cliente_croqui_anexar/_remover. Ao acrescentar valor, LEIA O CHECK VIGENTE NO BANCO antes (pg_get_constraintdef, filtrando por conname -- a tabela tem 5 CHECKs) -- reescrever a lista de memoria apaga valores em silencio, e ja aconteceu duas vezes neste projeto.';

-- ═════════════════════════════════════════════════════════════════════════
-- 8. ROTEIRO DE PROVA — a colar depois de aplicar (Marcio roda)
-- ═════════════════════════════════════════════════════════════════════════
--
-- ⚠️ NENHUM plano abaixo foi executado por quem escreveu esta migração: o
-- executor NÃO tem acesso ao banco. Os blocos `-- a colar:` ficam VAZIOS até
-- a medição real — não preencher com plano plausível.
--
-- ⚠️ `explain analyze` em INSERT/UPDATE/DELETE EXECUTA o comando (memória de
-- 15/09/2026, SIC-HF). A prova P1 SEMEIA linhas: rodar o bloco inteiro numa
-- STRING ÚNICA `begin; ... rollback;` — o MCP do Supabase é AUTOCOMMIT, e
-- `begin`/`rollback` em chamadas separadas NÃO protegem.
--
-- ── P1. O índice serve o predicado da listagem (EM ROLLBACK, ~20 linhas) ─
--   begin;
--     insert into gps.cliente_croquis (cliente_id, path, nome, tamanho, enviado_em)
--     select '<um cliente_id real>'::uuid,
--            '<aluno_id desse cliente>/' || gen_random_uuid()::text || '.pdf',
--            'croqui-' || g || '.pdf',
--            100000 + g,
--            now() - (g || ' hours')::interval
--       from generate_series(1, 20) g;
--
--     analyze gps.cliente_croquis;
--
--     explain (analyze, buffers)
--     select id, cliente_id, path, nome, tamanho, apresentado_em, observacoes,
--            enviado_em, enviado_por, enviado_pela_equipe
--       from gps.cliente_croquis
--      where cliente_id = '<o mesmo cliente_id>'
--      order by enviado_em desc;
--   rollback;
--   -- esperado: Index Scan using cliente_croquis_cliente_idx,
--   --           SEM nó de Sort (o índice já é (cliente_id, enviado_em desc)),
--   --           Rows Removed by Filter = 0.
--   -- 🚩 Se aparecer `Seq Scan` + `Sort`: com 20 linhas o planner pode
--   --    escolher Seq Scan legitimamente (tabela minúscula — ver o protocolo:
--   --    em tabela pequena Seq Scan é a escolha CERTA). Para provar o índice,
--   --    repetir com `set local enable_seqscan = off;` antes do explain e
--   --    conferir que o Index Scan existe e NÃO tem Sort por cima.
--   -- a colar:
--
-- ── P2. GRANTs da tabela: authenticated = SELECT, e SÓ ──────────────────
--   select grantee, string_agg(privilege_type, ', ' order by privilege_type)
--     from information_schema.role_table_grants
--    where table_schema = 'gps' and table_name = 'cliente_croquis'
--    group by grantee order by grantee;
--   -- esperado: authenticated → SELECT (só isso). anon → nada (ausente).
--   --           postgres → tudo. É o MESMO retrato de gps.cliente_minutas.
--   -- 🔴 Esta é a prova do conserto do erro da ...259. Se aparecer
--   --    INSERT/UPDATE/DELETE para authenticated, o revoke não pegou.
--   -- a colar:
--
-- ── P3. Comparação lado a lado com a tabela-molde ───────────────────────
--   select table_name, grantee,
--          string_agg(privilege_type, ', ' order by privilege_type)
--     from information_schema.role_table_grants
--    where table_schema = 'gps'
--      and table_name in ('cliente_croquis', 'cliente_minutas')
--    group by table_name, grantee order by table_name, grantee;
--   -- esperado: as duas linhas de `authenticated` IDÊNTICAS.
--   -- a colar:
--
-- ── P4. `proacl` das 4 funções novas (não `has_function_privilege`) ─────
--   select p.proname, p.proacl::text
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps'
--      and p.proname in ('pode_ver_croqui', 'pode_anexar_croqui',
--                        'cliente_croqui_anexar', 'cliente_croqui_remover')
--    order by p.proname;
--   -- esperado (o MESMO das 6 funções de minuta, medido em 24/09/2026):
--   --   {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   -- 🔴 NENHUMA entrada pode começar com '=' — entrada com grantee VAZIO
--   --    antes do '=' é o pseudo-role PUBLIC, e toda role herda de PUBLIC
--   --    (memória de 19/08/2026). `has_function_privilege` responde "pode?",
--   --    não "por quê pode?" — por isso a prova é o proacl.
--   -- a colar:
--
-- ── P5. Nenhuma função nova ficou com PUBLIC (a varredura) ──────────────
--   select p.proname
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps'
--      and p.proname like '%croqui%'
--      and exists (select 1 from unnest(p.proacl) a where a::text like '=%');
--   -- esperado: ZERO linhas.
--   -- ⚠️ `proacl::text like '%=X/%'` daria falso positivo (casa
--   --    'postgres=X/' também) — por isso `unnest` + `like '=%'`.
--   -- a colar:
--
-- ── P6. Assinatura ÚNICA das RPCs (sem sobrecarga acidental) ────────────
--   select p.proname, pg_get_function_arguments(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps'
--      and p.proname in ('cliente_croqui_anexar', 'cliente_croqui_remover')
--    order by p.proname;
--   -- esperado: UMA linha por nome. `create or replace` com assinatura
--   --           diferente CRIA SOBRECARGA em vez de substituir — duas
--   --           funções vivas e o chamador antigo fica na velha.
--   -- a colar:
--
-- ── P7. O CHECK do diário: 38 valores e nenhum perdido ──────────────────
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'gps.aluno_eventos'::regclass and contype = 'c'
--    order by conname;
--   -- esperado: 5 CHECKs. `aluno_eventos_tipo_check` com 38 valores (os 36
--   --           vivos + cliente_croqui_anexado + cliente_croqui_removido).
--   --           Os outros 4 (ator/entidade/origem/rotulo) INALTERADOS.
--   -- a colar:
--
-- ── P8. Nenhum tipo de evento vivo ficou fora do CHECK novo ─────────────
--   select tipo, count(*) from gps.aluno_eventos
--    group by tipo order by tipo;
--   -- esperado: todo `tipo` desta lista tem de estar no CHECK do P7. Se o
--   --           `add constraint` passou, o Postgres já validou a base
--   --           inteira — esta query é a conferência humana.
--   -- a colar:
--
-- ── P9. Bucket com a configuração certa ─────────────────────────────────
--   select id, public, file_size_limit, allowed_mime_types
--     from storage.buckets where id in ('gps-croquis', 'gps-minutas');
--   -- esperado: gps-croquis → public=false, 5242880, {application/pdf}
--   --           (idêntico a gps-minutas).
--   -- a colar:
--
-- ── P10. As 3 policies do bucket, e só as 3 ─────────────────────────────
--   select policyname, cmd, qual, with_check
--     from pg_policies
--    where schemaname = 'storage' and tablename = 'objects'
--      and policyname like 'gps_croquis%'
--    order by policyname;
--   -- esperado: gps_croquis_select (SELECT), gps_croquis_insert (INSERT),
--   --           gps_croquis_delete_admin (DELETE). NENHUMA de UPDATE.
--   -- a colar:
--
-- ── P11. RLS ligada e UMA policy só na tabela ───────────────────────────
--   select relrowsecurity, relforcerowsecurity
--     from pg_class where oid = 'gps.cliente_croquis'::regclass;
--   select policyname, cmd from pg_policies
--    where schemaname = 'gps' and tablename = 'cliente_croquis';
--   -- esperado: relrowsecurity = true; UMA policy, `cliente_croquis_select`,
--   --           cmd = SELECT.
--   -- a colar:
--
-- ── P12. Contagem de etapa1_clientes antes/depois = 1710 ────────────────
--   select count(*) from gps.etapa1_clientes;
--   -- esperado: 1710 nos dois lados. Esta migração NÃO toca a ficha — a
--   --           FK `on delete cascade` aponta de croquis PARA clientes,
--   --           nunca o contrário.
--   -- a colar:
--
-- ── P13. `gps.config_definir` intacta (desvio 2: não tocamos a allowlist) ─
--   select count(*) from gps.config where chave like '%croqui%';
--   -- esperado: 0. Esta migração NÃO cria interruptor.
--   select pg_get_functiondef(p.oid) from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname = 'config_definir';
--   -- esperado: as MESMAS 15 chaves vivas de 24/09/2026, sem nenhuma nova.
--   -- a colar:

-- ---------------------------------------------------------------------------
-- RESULTADOS MEDIDOS (24/09/2026 ~14:30 UTC, tabela + CHECKs + índice + RLS +
-- revoke/grant dentro de begin … rollback no banco de produção, ANTES de
-- aplicar; funções, policies de storage e CHECK de aluno_eventos medidos na
-- aplicação real — ver bloco seguinte quando aplicada). Cobre P1, P2 e P11.
--
-- P1  20 croquis semeados para 1 cliente + 200 clientes com 1 croqui (220
--     linhas), analyze, depois:
--     explain (analyze, buffers) select … from gps.cliente_croquis
--       where cliente_id = $1 order by enviado_em desc
--     Index Scan using cliente_croquis_cliente_idx on cliente_croquis
--       (cost=0.14..7.08 rows=20 width=181) (actual time=0.006..0.011 rows=20 loops=1)
--       Index Cond: (cliente_id = '…'::uuid)   Buffers: shared hit=2
--     Planning Time: 0.172 ms   Execution Time: 0.032 ms
--     → o índice entrega o predicado E a ordem (nenhum nó Sort).
--     CHECKs: path 'x/y.pdf' → recusado · nome 'a/b.pdf' → recusado ·
--     tamanho 5242881 → recusado.
-- P2  role_table_grants de gps.cliente_croquis: authenticated=SELECT (só);
--     postgres=tudo. pg_default_acl do schema gps dá `authenticated=arwd` a
--     tabela nova — o revoke all ANTES do grant select é o que desfaz isso.
-- P11 relrowsecurity = true; 1 policy (cliente_croquis_select).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- APLICADA em 24/09/2026 ~14:45 UTC (apply_migration, sucesso). Conferido
-- no banco VIVO logo depois (P4, P6, P7, P9, P10, P11, P12, P13):
--
-- P4  proacl das 4 funções (pode_ver_croqui, pode_anexar_croqui,
--     cliente_croqui_anexar, cliente_croqui_remover):
--     {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--     — nenhuma com anon nem PUBLIC (varredura `=X/` → 0 linhas).
-- P6  1 assinatura de cliente_croqui_anexar e 1 de _remover (sem sobrecarga).
-- P7  chk_cliente_croquis_{path,nome,tamanho,observacoes} presentes com o
--     texto desta migração; aluno_eventos_tipo_check com os 2 tipos novos e a
--     âncora cliente_entrevista_sem_contato (ver bloco seguinte para a
--     contagem exata).
-- P9  storage.buckets gps-croquis: public=false · 5242880 · {application/pdf}
-- P10 storage.objects: gps_croquis_select (SELECT) · gps_croquis_insert
--     (INSERT) · gps_croquis_delete_admin (DELETE) — 3 policies, sem UPDATE.
-- P11 relrowsecurity=true; 1 policy cliente_croquis_select (SELECT).
--     role_table_grants: authenticated=SELECT (só); postgres=tudo.
-- P12 count(*) from gps.etapa1_clientes = 1710 (inalterado).
-- P13 gps.config_definir intacta (a 310 é quem a altera).
-- ---------------------------------------------------------------------------
-- P7' aluno_eventos_tipo_check no banco vivo: 38 valores (regexp_matches
--     de '<valor>'::text), com cliente_croqui_anexado, cliente_croqui_removido
--     e a âncora cliente_entrevista_sem_contato — nenhum dos 36 vivos sumiu.
