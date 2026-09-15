-- Minutas da ficha do cliente — histórico de versões, só PDF.
--
-- POR QUE UMA TABELA NOVA, E NÃO 5 COLUNAS COMO O CONTRATO
--   Decisão do Marcio (15/09/2026): a minuta é anexada na ficha do CLIENTE
--   (Etapa 05, não a tarefa), em **várias versões**, com **histórico visível
--   e data** — cada envio é uma versão nova, as anteriores FICAM. O contrato
--   (...214) é tudo-ou-nada, 1 anexo por cliente, substitui ao reenviar: esse
--   molde serve para UM anexo, não para N com histórico. `gps.cliente_minutas`
--   é uma tabela própria, FK para `gps.etapa1_clientes(id)`, sem CHECK de
--   "tudo ou nada" na ficha (a ficha não ganha coluna nenhuma).
--
-- FORMATO: só `application/pdf`. Instrução do Marcio: "ele exporta o Word em
--   PDF antes de anexar" — .docx NÃO é liberado. Diferença deliberada do
--   molde do chamado/onboarding/contrato (4 MIMEs): aqui é 1 só, e o CHECK e
--   a allowlist do bucket refletem isso.
--
-- A "INSTRUÇÃO EM VERMELHO" NÃO É VALIDADA PELO SISTEMA
--   O texto pedido pelo Marcio ("deixe em vermelho o que foi alterado da
--   minuta original, e inclua as notas sobre a minuta") é ORIENTAÇÃO NA TELA
--   ao parceiro — não um contrato de dados. O sistema não abre o PDF, não
--   compara páginas, não valida cor nenhuma. `notas` é campo de texto livre
--   (opcional) para quem envia registrar o que quiser sobre a versão; a
--   instrução em si é copy do frontend, não linha de banco.
--
-- BUCKET NOVO `gps-minutas`, e NÃO o `gps-onboarding`
--   Medido em 15/09/2026: `gps-onboarding` é privado, 5 MB, MIME
--   png/jpeg/webp/pdf — mas a guarda de escrita (`gps.pode_anexar_onboarding`)
--   exige prefixo = ambiente E, historicamente, tinha a condição "questionário
--   em andamento" (removida na ...214 porque o contrato é da Etapa 05, muito
--   depois do questionário). A minuta tem a MESMA característica de tempo
--   (Etapa 05) mas quer uma allowlist MAIS ESTREITA: só PDF, nunca imagem —
--   é defesa que `gps-onboarding` não pode ter, porque ele PRECISA aceitar
--   imagem para o questionário e para documentos anexos. Reaproveitar o
--   bucket faria toda leitura de "isto é PDF" depender de o CHAMADOR ter
--   filtrado certo, em vez do BUCKET recusar sozinho um .png que alguém tente
--   subir como minuta. Bucket novo é uma camada de defesa a mais, não
--   duplicação de política — as policies SÃO cópias adaptadas de propósito
--   (mesmo argumento da ...205/...206), porque cada bucket tem sua própria
--   allowlist e não dá para compartilhar `storage.objects` entre bucket_id
--   diferentes numa policy só sem enfraquecer as duas.
--
--   ⚠️ NÃO usar `gps-documentos`: medido em 15/09/2026 — órfão, sem
--   `file_size_limit`, sem `allowed_mime_types`, carrega histórico do
--   fichário removido em 07/2026 (M8 confirmou que segue órfão; não tocar).
--
-- TRÊS CAMADAS, NA ORDEM EM QUE PEGAM (molde de ...205/...206/...214):
--   1) o BUCKET recusa por tamanho (5 MB) e por MIME (só application/pdf);
--   2) as POLICIES de `storage.objects` recusam por CAMINHO (regex do
--      caminho E o prefixo tem de ser o ambiente de quem chama) — SEM
--      policy de UPDATE (ninguém sobrescreve; `upsert:true` no mesmo
--      caminho falha) e DELETE só para admin (é o expurgo, B-R1, que ainda
--      não tem botão — só a policy que o botão vai precisar quando vier);
--   3) a RPC `gps.cliente_minuta_anexar` confere que o objeto EXISTE e lê
--      MIME e TAMANHO REAIS de `storage.objects.metadata`, nunca o que o
--      navegador declarou, e casa a extensão com o MIME.
--
-- QUEM ANEXA: dono do ambiente (aluno titular ou sócio) OU admin — o MESMO
--   critério de `gps.cliente_definir_contrato` (...214). A task não restringe
--   a um só lado como o chamado/onboarding restringem ao aluno: minuta é
--   revisão jurídica entre a equipe e o cliente, e tanto o parceiro quanto a
--   equipe (modo assistência) podem ser quem sobe a versão mais recente.
--
-- SEM CATRACA DE FASE OU DE FAVORITO: minuta é FICHA, não VÍNCULO — a trava
--   do favorito (...203/...215) não bloqueia aqui, mesma lógica do contrato.
--
-- LEITURA: admin ou membro do AMBIENTE do cliente (titular e sócio) — regra
--   idêntica à leitura do contrato/onboarding. Nunca `anon`.
--
-- ÍNDICE: a listagem por cliente usa `cliente_minutas_cliente_idx
--   (cliente_id, enviado_em desc)`. `gps.etapa1_clientes` tem 1.339 linhas e
--   já tem `etapa1_clientes_aluno_idx` — este é um índice NOVO numa tabela
--   NOVA (zero linhas hoje), então não há "antes/depois" para medir contra
--   dado existente; o `explain analyze` no rollback (bloco de prova, ver o
--   relato do backend) mostra o plano com a tabela vazia e prova que o
--   predicado (`cliente_id =`) é exatamente o que a query de listagem usa —
--   não é índice especulativo sobre coluna que a tela não filtra.
--
-- O QUE NÃO FAZ: não mexe em `gps.etapa1_clientes` (nenhuma coluna nova),
--   não mexe no contrato (...214), não toca `gps-onboarding` nem
--   `gps-documentos`, não concede nada a `anon`, não expurga nada por cron
--   (mesma decisão da retenção do chamado e do onboarding — expurgo é
--   clique do admin, B-R1 espelhado aqui).
--
-- REVERSÃO (nesta ordem):
--   drop policy gps_minutas_select/_insert/_delete_admin on storage.objects;
--   drop function gps.pode_ver_minuta(text);
--   drop function gps.pode_anexar_minuta(text);
--   drop function gps.cliente_minuta_anexar(uuid, text, text, integer, text);
--   drop function gps.cliente_minuta_remover(uuid);
--   drop table gps.cliente_minutas;
--   -- o bucket gps-minutas FICA (storage.protect_delete bloqueia DELETE
--   -- direto); sem policy nenhuma ele fica inacessível, que é seguro.
--   -- o CHECK de gps.aluno_eventos.tipo não tem reversão limpa sem apagar
--   -- linhas de trilha — ver o bloco 7 abaixo antes de reverter.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. Bucket `gps-minutas`
-- ═════════════════════════════════════════════════════════════════════════

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gps-minutas', 'gps-minutas', false, 5242880, array['application/pdf'])
on conflict (id) do update
   set public             = false,
       file_size_limit    = 5242880,
       allowed_mime_types = array['application/pdf'];

-- ═════════════════════════════════════════════════════════════════════════
-- 2. A tabela — N versões por cliente, sem UPDATE de conteúdo
-- ═════════════════════════════════════════════════════════════════════════
--
-- Sem coluna "versão" numérica: a ORDEM é `enviado_em`, e o número de exibição
-- ("Versão 3 de 3") é derivado na leitura (`row_number() over (partition by
-- cliente_id order by enviado_em)`) — gravar um contador seria mais um lugar
-- para uma corrida (duas conclusões simultâneas) inflar ou colidir.

create table if not exists gps.cliente_minutas (
  id                   uuid primary key default gen_random_uuid(),
  cliente_id           uuid not null references gps.etapa1_clientes(id) on delete cascade,
  path                 text not null,
  nome                 text not null,
  tamanho              integer not null,
  notas                text,
  enviado_em           timestamptz not null default now(),
  enviado_por          uuid references auth.users(id) on delete set null,
  enviado_pela_equipe  boolean not null default false
);

comment on table gps.cliente_minutas is
  'Historico de VERSOES da minuta (PDF) de um cliente da Etapa 01. Cada linha e um envio -- nao ha UPDATE de conteudo, so INSERT (versao nova) e DELETE (gps.cliente_minuta_remover, tira a linha; o byte fica no bucket ate o expurgo do admin). Escrita SO por gps.cliente_minuta_anexar/_remover -- authenticated tem select mas o insert/delete direto pelo PostgREST fica de fora do GRANT (bloco 7).';
comment on column gps.cliente_minutas.path is
  'Caminho no bucket gps-minutas, formato <ambiente_aluno_id>/<uuid>.pdf. O PREFIXO e a credencial de leitura (policies gps_minutas_*).';
comment on column gps.cliente_minutas.nome is
  'Nome ORIGINAL do arquivo, so para exibir e para o `download=` da URL assinada. 1..120, sem / nem \.';
comment on column gps.cliente_minutas.tamanho is
  'Tamanho REAL em bytes (1..5 MB), lido de storage.objects.metadata pela RPC -- nunca o que o navegador declarou.';
comment on column gps.cliente_minutas.notas is
  'Texto livre de quem enviou sobre ESTA versao (ex.: o que mudou). NAO validado nem comparado pelo sistema -- a instrucao de deixar em vermelho o que mudou e orientacao da TELA ao parceiro, nao regra de banco. Ate 2000 caracteres (CHECK).';
comment on column gps.cliente_minutas.enviado_pela_equipe is
  'true quando quem chamou gps.cliente_minuta_anexar era admin (modo assistencia). O historico mostra quem enviou cada versao -- aluno ou equipe.';

alter table gps.cliente_minutas
  add constraint chk_cliente_minutas_path
  check (path ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$');

alter table gps.cliente_minutas
  add constraint chk_cliente_minutas_nome
  check (char_length(nome) between 1 and 120 and nome !~ '[/\\]');

alter table gps.cliente_minutas
  add constraint chk_cliente_minutas_tamanho
  check (tamanho between 1 and 5242880);

alter table gps.cliente_minutas
  add constraint chk_cliente_minutas_notas
  check (notas is null or char_length(notas) <= 2000);

-- Único índice desta migração: EXATAMENTE o predicado da listagem por
-- cliente (`where cliente_id = $1 order by enviado_em desc`). Tabela nasce
-- vazia — ver o `explain analyze` no relato do backend.
create index if not exists cliente_minutas_cliente_idx
  on gps.cliente_minutas (cliente_id, enviado_em desc);

alter table gps.cliente_minutas enable row level security;

-- RLS: leitura para admin ou para quem é dono do AMBIENTE do cliente
-- (titular ou sócio, via `gps.aluno_atual()` contra `etapa1_clientes.aluno_id`
-- — mesma regra de leitura da ficha inteira). Sem policy de INSERT/UPDATE/
-- DELETE: authenticated só lê; toda escrita é pela RPC (SECURITY DEFINER),
-- que valida o objeto no bucket antes de gravar.
create policy cliente_minutas_select on gps.cliente_minutas
  for select to authenticated
  using (
    public.gp_is_admin()
    or exists (
      select 1 from gps.etapa1_clientes c
       where c.id = cliente_minutas.cliente_id
         and c.aluno_id = gps.aluno_atual()
    )
  );

revoke all on gps.cliente_minutas from public, anon;
grant select on gps.cliente_minutas to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Guardas de storage.objects — pode_ver_minuta / pode_anexar_minuta
-- ═════════════════════════════════════════════════════════════════════════
--
-- Molde de gps.pode_ver_anexo_onboarding/pode_anexar_onboarding (...205),
-- adaptado ao bucket gps-minutas (só PDF, sem a extensão variável) e à regra
-- de quem anexa (dono do ambiente OU admin — diferente do onboarding, que é
-- só o aluno). AS DUAS FALHAM FECHADO: nome de objeto é entrada de usuário.

create or replace function gps.pode_ver_minuta(p_name text)
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

comment on function gps.pode_ver_minuta(text) is
  'Quem le um anexo do bucket gps-minutas: admin ou membro do AMBIENTE cujo aluno_id e o PREFIXO do caminho (titular e socio). SECURITY INVOKER -- gps.aluno_atual() e gp_is_admin() ja resolvem pela sessao. Falha FECHADO. Toda URL assinada sai com download=, nunca inline.';

create or replace function gps.pode_anexar_minuta(p_name text)
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

  -- Dono do ambiente (titular ou sócio) OU admin -- mesma regra de
  -- gps.cliente_definir_contrato. Diferente do onboarding (só o aluno):
  -- minuta é revisão jurídica, a equipe também pode subir a versão.
  return coalesce(public.gp_is_admin(), false)
      or gps.aluno_atual() = split_part(p_name, '/', 1)::uuid;
exception when others then
  return false;
end;
$$;

comment on function gps.pode_anexar_minuta(text) is
  'Quem ESCREVE no bucket gps-minutas: dono do ambiente (titular ou socio, via gps.aluno_atual()) OU admin. Formato exato <ambiente_aluno_id>/<uuid>.pdf. Falha FECHADO. Diferente de gps.pode_anexar_onboarding (so aluno): minuta e revisao juridica entre equipe e cliente, entao a equipe tambem pode subir uma versao.';

revoke execute on function gps.pode_ver_minuta(text)   from public, anon;
revoke execute on function gps.pode_anexar_minuta(text) from public, anon;
grant  execute on function gps.pode_ver_minuta(text)   to authenticated;
grant  execute on function gps.pode_anexar_minuta(text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 4. Policies em storage.objects — as três, e só estas
-- ═════════════════════════════════════════════════════════════════════════
--
-- SEM policy de UPDATE (ninguém sobrescreve; `upsert:true` no mesmo caminho
-- tem de falhar -- cada versão nasce com um `randomUUID()` novo). DELETE só
-- para admin: é a policy que o expurgo (B-R1, ainda sem botão) vai precisar
-- quando vier -- o mesmo padrão do chamado e do onboarding.

drop policy if exists gps_minutas_select       on storage.objects;
drop policy if exists gps_minutas_insert       on storage.objects;
drop policy if exists gps_minutas_delete_admin on storage.objects;

create policy gps_minutas_select on storage.objects
  for select to authenticated
  using (bucket_id = 'gps-minutas' and gps.pode_ver_minuta(name));

create policy gps_minutas_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'gps-minutas' and gps.pode_anexar_minuta(name));

create policy gps_minutas_delete_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'gps-minutas' and coalesce(public.gp_is_admin(), false));

-- ═════════════════════════════════════════════════════════════════════════
-- 5. gps.cliente_minuta_anexar — grava a versão DEPOIS de conferir o objeto
-- ═════════════════════════════════════════════════════════════════════════
--
-- Molde literal de gps.cliente_definir_contrato (...214): o que o objeto
-- REALMENTE é (storage.objects.metadata) vence o que o cliente declarou.
-- Diferença: aqui é INSERT (versão nova), não UPDATE (substitui).

create or replace function gps.cliente_minuta_anexar(
  p_cliente_id uuid,
  p_path       text,
  p_nome       text,
  p_tamanho    integer,
  p_notas      text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_c         record;
  v_admin     boolean := coalesce(public.gp_is_admin(), false);
  v_ambiente  uuid    := gps.aluno_atual();
  v_existe    boolean;
  v_meta_size bigint;
  v_meta_mime text;
  v_tamanho   integer;
  v_nome      text;
  v_notas     text;
  v_id        uuid;
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

  v_notas := nullif(btrim(coalesce(p_notas, '')), '');
  if v_notas is not null and char_length(v_notas) > 2000 then
    raise exception 'Notas da minuta muito longas.' using errcode = '22023';
  end if;

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
     where o.bucket_id = 'gps-minutas'
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

  -- Extensão já é garantida pelo CHECK do path (só aceita .pdf); não há
  -- variação de extensão×MIME como no contrato/chamado (4 tipos possíveis).

  insert into gps.cliente_minutas
    (cliente_id, path, nome, tamanho, notas, enviado_por, enviado_pela_equipe)
  values
    (p_cliente_id, p_path, v_nome, v_tamanho, v_notas, auth.uid(), v_admin)
  returning id into v_id;

  -- Evento na trilha. `rotulo` é o nome do CLIENTE (padrão da trigger de
  -- captura, ...092); `detalhe` NÃO leva o nome do arquivo nem as notas
  -- (podem conter texto sensível sobre o cliente do aluno).
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_c.aluno_id, now(), 'cliente_minuta_anexada', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('minuta_id', v_id, 'tamanho', v_tamanho),
     case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');

  return jsonb_build_object('id', v_id, 'cliente_id', p_cliente_id, 'path', p_path,
                            'nome', v_nome, 'tamanho', v_tamanho);
end $function$;

comment on function gps.cliente_minuta_anexar(uuid, text, text, integer, text) is
  'Grava uma NOVA VERSAO de minuta na ficha do cliente DEPOIS de conferir o objeto: prefixo do caminho = aluno_id do AMBIENTE DO CLIENTE, objeto existe no bucket gps-minutas, e tamanho/MIME lidos de storage.objects.metadata (o que o cliente declara e fallback, nunca a fonte). Autorizacao: dono do ambiente (gps.aluno_atual()) OU admin. NAO substitui -- cada chamada INSERE uma linha nova (historico); para tirar uma versao existe gps.cliente_minuta_remover. Grava o evento cliente_minuta_anexada. A trava do favorito (...203/...215) NAO bloqueia aqui: minuta e FICHA, nao VINCULO.';

revoke execute on function gps.cliente_minuta_anexar(uuid, text, text, integer, text) from public, anon;
grant  execute on function gps.cliente_minuta_anexar(uuid, text, text, integer, text) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 6. gps.cliente_minuta_remover — tira UMA versão da lista
-- ═════════════════════════════════════════════════════════════════════════
--
-- DELETE físico da LINHA (mesmo padrão de gps.onboarding_remover_anexo,
-- ...206): o BYTE fica no bucket até o expurgo do admin. Não é soft-delete:
-- soft-delete exigiria a UI filtrar `removido_em is null` em toda leitura, e
-- o histórico de versões já é a garantia de rastreabilidade que a task pede
-- -- remover uma versão errada (ex.: PDF corrompido) não precisa deixar
-- marca visível, só sumir da lista.

create or replace function gps.cliente_minuta_remover(p_minuta_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_m        record;
  v_admin    boolean := coalesce(public.gp_is_admin(), false);
  v_ambiente uuid    := gps.aluno_atual();
begin
  if p_minuta_id is null then
    raise exception 'minuta nao informada' using errcode = '22023';
  end if;

  select mi.id, mi.cliente_id, mi.tamanho, c.aluno_id, c.nome as cliente_nome
    into v_m
    from gps.cliente_minutas mi
    join gps.etapa1_clientes c on c.id = mi.cliente_id
   where mi.id = p_minuta_id;
  if not found then
    raise exception 'Minuta não encontrada.' using errcode = 'P0002';
  end if;

  if not v_admin and (v_ambiente is null or v_ambiente <> v_m.aluno_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  delete from gps.cliente_minutas where id = p_minuta_id;

  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_m.aluno_id, now(), 'cliente_minuta_removida', 'cliente', v_m.cliente_id,
     left(coalesce(nullif(btrim(v_m.cliente_nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('minuta_id', p_minuta_id, 'tamanho', v_m.tamanho),
     case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');

  return jsonb_build_object('cliente_id', v_m.cliente_id, 'removido', true);
end $function$;

comment on function gps.cliente_minuta_remover(uuid) is
  'Tira uma VERSAO da lista de minutas do cliente (DELETE fisico da linha). O ARQUIVO continua no bucket gps-minutas ate o expurgo do admin (B-R1): a policy de delete de storage.objects e so de admin, o GPS nao usa service_role, e apagar a linha de storage.objects por SQL NAO apaga o byte. Autorizacao: dono do ambiente OU admin -- mesma regra de gps.cliente_minuta_anexar. A trava do favorito NAO bloqueia aqui.';

revoke execute on function gps.cliente_minuta_remover(uuid) from public, anon;
grant  execute on function gps.cliente_minuta_remover(uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 7. Catálogo do Diário — 2 tipos novos, POR CONTEÚDO
-- ═════════════════════════════════════════════════════════════════════════
--
-- Mesma técnica das ...092/...151/...201/...214/...231: acha o CHECK pelo
-- CONTEÚDO de um valor recente conhecido, nunca pelo nome da constraint.
--
-- 🔴 A ÂNCORA É 'nota_apagada', NÃO 'cliente_contrato_removido'
--   A ...214 (10/09, manhã) NÃO foi a última a reescrever este CHECK: a
--   ...231 (10/09, mesmo dia, mais tarde) acrescentou 'nota_apagada' e
--   também mudou aluno_eventos_entidade_check (que esta migração NÃO toca).
--   Buscar por 'cliente_contrato_removido' teria casado do mesmo jeito (o
--   valor está nas duas listas), mas copiar a lista da ...214 de memória
--   teria APAGADO 'nota_apagada' em silêncio — exatamente o modo de falha
--   que o catálogo já causou duas vezes neste projeto (ver o cabeçalho da
--   ...231). Conferido em 15/09/2026: nenhuma migração entre a ...231 e esta
--   toca aluno_eventos_tipo_check (`grep -rl aluno_eventos_tipo_check
--   supabase/migrations/`), então a lista abaixo é a ...231 completa + 2.

do $$
declare v_nome text;
begin
  select con.conname into v_nome
    from pg_constraint con
    join pg_class     c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'gps' and c.relname = 'aluno_eventos' and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%nota_apagada%';

  if v_nome is null then
    raise exception
      'CHECK de gps.aluno_eventos.tipo nao encontrado (procurado pelo conteudo nota_apagada, da migracao ...231) -- migracao abortada. Leia o CHECK vigente no banco (select pg_get_constraintdef(oid) from pg_constraint where conrelid=''gps.aluno_eventos''::regclass and contype=''c'') antes de reescrever esta lista.';
  end if;

  execute format('alter table gps.aluno_eventos drop constraint %I', v_nome);
end;
$$;

-- Lista COMPLETA: os 27 tipos vigentes na ...231 (24 da ...201 + 2 da ...214
-- + 1 da própria ...231), na mesma ordem, + os 2 novos no fim.
alter table gps.aluno_eventos
  add constraint aluno_eventos_tipo_check check (tipo in (
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
    -- ── Minutas da ficha do cliente (15/09/2026, migração ...259) ──
    'cliente_minuta_anexada',
    'cliente_minuta_removida'
  ));

comment on constraint aluno_eventos_tipo_check on gps.aluno_eventos is
  'Catalogo fechado de tipos de evento do diario. Espelha TIPOS_EVENTO em src/lib/types.ts. 27 valores vigentes na ...231 (24 da ...201 + cliente_contrato_anexado/_removido da ...214 + nota_apagada da ...231) + 2 desta migracao: cliente_minuta_anexada/cliente_minuta_removida, gravados so por gps.cliente_minuta_anexar/_remover. NAO confundir com cliente_contrato_anexado (o anexo tudo-ou-nada, ...214): minuta e N versoes com historico. Ao acrescentar valor, LEIA O CHECK VIGENTE NO BANCO antes -- reescrever a lista de memoria apaga valores em silencio.';
