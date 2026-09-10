-- O contrato do cliente vira ANEXO, não link.
--
-- POR QUÊ
--   Pedido do João (10/09/2026): "ele tem que anexar o contrato, PDF, PNG, o
--   que for". Hoje a ficha do cliente só tem `contrato_url` — um link colável
--   do Drive, criado na migração ...090 e com **0 linhas preenchidas** em
--   10/09/2026 (medição da Onda 0). Link colável não é prova: quem cola
--   escolhe o que está do outro lado, o portal não vê o arquivo, e a regra que
--   o João chamou de fundamental ("sem o contrato assinado ele não avança")
--   não tem como ser conferida por ninguém — nem pelo banco, nem pela equipe.
--
--   O molde é o que já existe e já foi auditado duas vezes: o anexo do chamado
--   (...112) e o anexo do questionário inicial (...204/...205/...206). Mesmo
--   formato de caminho, mesmos 4 MIMEs, mesmos 5 MB, mesma conferência do
--   objeto REAL em `storage.objects.metadata` dentro da RPC.
--
-- BUCKET: `gps-onboarding` REAPROVEITADO, e não um bucket novo
--   O bucket nasceu na ...205 privado, com teto de 5 MB, allowlist de 4 MIMEs
--   e policies por PREFIXO = `ambiente_aluno_id` (`gps.aluno_atual()`). O
--   contrato do cliente tem exatamente as mesmas regras de quem lê (o admin e
--   os membros do ambiente), de quem escreve (só o aluno) e de retenção
--   (expurgo por clique do admin, B-R1). Criar `gps-clientes` seria um quarto
--   bucket com as MESMAS policies, e cada cópia é um lugar a mais para a
--   allowlist divergir no dia em que alguém mexer numa só.
--
--   👉 O SIGNIFICADO DO BUCKET MUDA AQUI: `gps-onboarding` passa a ser
--      "ANEXOS DO AMBIENTE" — questionário inicial **e** contratos de clientes
--      daquele ambiente. O nome fica (renomear bucket é mover objeto, e o
--      caminho é a credencial de leitura); o significado está escrito nos
--      comentários das duas funções-guarda, que são o que alguém lê antes de
--      mexer. `storage.buckets` é tabela de LINHA, não tem `comment on` — por
--      isso a documentação do bucket vive nas funções e neste cabeçalho.
--
-- O AJUSTE EM `gps.pode_anexar_onboarding`
--   A guarda da ...205 exigia, além do formato e do prefixo, que a pessoa
--   tivesse um questionário EM ANDAMENTO. Isso era certo quando o bucket era
--   só do questionário; agora bloquearia o upload do contrato de um cliente
--   cadastrado meses depois — o aluno concluiu o questionário no dia 1 e a
--   partir daí não conseguiria anexar mais nada. A condição SAI.
--   ⚠️ A obrigatoriedade do onboarding NÃO se perde: ela nunca esteve aqui.
--   Ela vive em `gps.onboarding_concluir()` (...206), que recusa concluir sem
--   `valor_honorarios` e sem a linha de anexo `contrato_honorarios`.
--
-- A ESCRITA É SÓ PELA RPC — E O BANCO GARANTE
--   `gps.etapa1_clientes` é escrita direta do aluno pelo PostgREST (a RLS
--   deixa o dono do ambiente atualizar a própria linha). Sem trava, uma
--   chamada forjada gravaria `contrato_path` apontando para um caminho que
--   nunca recebeu byte nenhum (contrato fantasma: a equipe veria "contrato
--   anexado" e o gate do João viraria enfeite) ou para o PREFIXO DE OUTRO
--   AMBIENTE (e aí é o ADMIN, ao clicar em baixar, quem assina a URL do
--   contrato de um terceiro). Por isso a trigger
--   `trg_etapa1_clientes_contrato_travado`: as 5 colunas só mudam por dentro
--   de função SECURITY DEFINER (dono `postgres`) ou por mão de admin.
--
-- `contrato_url` FICA — não dropar
--   0 linhas preenchidas, nenhum custo, e é o caminho de volta: enquanto a
--   coluna existir, reverter esta migração é dropar 5 colunas e nada mais.
--   Passa a ser LEGADO (comentário atualizado abaixo): a ficha continua
--   aceitando o link do Drive de quem já organiza a pasta assim.
--
-- O QUE NÃO FAZ
--   * ZERO backfill: as 879 linhas nascem com as 5 colunas nulas, e isso é o
--     resultado CERTO — `contrato_url` tem 0 linhas, não há de onde copiar.
--     ("Campo novo nasce vazio": nenhum KPI desta rodada conta contrato.)
--   * não dropa `contrato_url`, não mexe em `valor_honorarios`, `fase` nem
--     `status` (congelado desde a ...060);
--   * não cria bucket, não apaga byte nenhum, não concede nada a `anon`;
--   * não toca as policies de `storage.objects` (as 3 da ...205 continuam
--     valendo, agora cobrindo os dois usos do bucket);
--   * não muda a trava do favorito (isso é a ...215) — contrato é FICHA, não
--     vínculo: cliente acompanhado pela equipe continua podendo receber e
--     perder contrato.
--
-- REVERSÃO (nesta ordem):
--   drop trigger trg_etapa1_clientes_contrato_travado on gps.etapa1_clientes;
--   drop function gps.etapa1_clientes_contrato_travado();
--   drop function gps.cliente_remover_contrato(uuid);
--   drop function gps.cliente_definir_contrato(uuid, text, text, text, integer);
--   alter table gps.etapa1_clientes
--     drop constraint if exists chk_etapa1_clientes_contrato_anexo_completo,
--     drop column contrato_path, drop column contrato_nome,
--     drop column contrato_mime, drop column contrato_tamanho,
--     drop column contrato_anexado_em;
--   -- repor o corpo da ...206 de gps.onboarding_concluir() (sem a cópia) e o
--   -- corpo da ...205 de gps.pode_anexar_onboarding(text);
--   -- repor o CHECK de gps.aluno_eventos.tipo com os 24 valores da ...201.
--   -- ⚠️ Antes de repor o CHECK: delete das linhas de tipo
--   --    cliente_contrato_anexado/_removido — e apagar trilha para satisfazer
--   --    reversão é destruir histórico. O caminho RECOMENDADO é deixar os dois
--   --    valores permitidos.

-- ═════════════════════════════════════════════════════════════════════════
-- 1. As 5 colunas do anexo na ficha do cliente
-- ═════════════════════════════════════════════════════════════════════════
--
-- Os CHECKs são os MESMOS de `gps.onboarding_anexos` (...204), byte a byte: o
-- arquivo é o mesmo arquivo, no mesmo bucket, com as mesmas regras. Divergir
-- aqui criaria um caminho por onde entra no cliente o que não entra no
-- questionário.

alter table gps.etapa1_clientes
  add column if not exists contrato_path text;
alter table gps.etapa1_clientes
  add column if not exists contrato_nome text;
alter table gps.etapa1_clientes
  add column if not exists contrato_mime text;
alter table gps.etapa1_clientes
  add column if not exists contrato_tamanho integer;
alter table gps.etapa1_clientes
  add column if not exists contrato_anexado_em timestamptz;

-- `drop ... if exists` + `add`: idempotente e legível. As 879 linhas atuais
-- têm as 5 colunas nulas, então a validação do CHECK passa na primeira
-- aplicação sem varredura problemática (tabela pequena).
alter table gps.etapa1_clientes
  drop constraint if exists chk_etapa1_clientes_contrato_path;
alter table gps.etapa1_clientes
  add  constraint chk_etapa1_clientes_contrato_path
  check (contrato_path is null or contrato_path ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|pdf)$');

alter table gps.etapa1_clientes
  drop constraint if exists chk_etapa1_clientes_contrato_nome;
alter table gps.etapa1_clientes
  add  constraint chk_etapa1_clientes_contrato_nome
  check (contrato_nome is null
         or (char_length(contrato_nome) between 1 and 120 and contrato_nome !~ '[/\\]'));

alter table gps.etapa1_clientes
  drop constraint if exists chk_etapa1_clientes_contrato_mime;
alter table gps.etapa1_clientes
  add  constraint chk_etapa1_clientes_contrato_mime
  check (contrato_mime is null
         or contrato_mime in ('image/png','image/jpeg','image/webp','application/pdf'));

alter table gps.etapa1_clientes
  drop constraint if exists chk_etapa1_clientes_contrato_tamanho;
alter table gps.etapa1_clientes
  add  constraint chk_etapa1_clientes_contrato_tamanho
  check (contrato_tamanho is null or contrato_tamanho between 1 and 5242880);

-- TUDO OU NADA. Sem esta constraint existiria a linha com `contrato_path`
-- preenchido e `contrato_nome` nulo — e a tela mostraria um botão "baixar"
-- que assina uma URL com `download=` vazio. Meia-ficha é pior do que ficha
-- nenhuma: parece que tem contrato.
alter table gps.etapa1_clientes
  drop constraint if exists chk_etapa1_clientes_contrato_anexo_completo;
alter table gps.etapa1_clientes
  add  constraint chk_etapa1_clientes_contrato_anexo_completo
  check (
    (contrato_path is null and contrato_nome is null and contrato_mime is null
     and contrato_tamanho is null and contrato_anexado_em is null)
    or
    (contrato_path is not null and contrato_nome is not null and contrato_mime is not null
     and contrato_tamanho is not null and contrato_anexado_em is not null)
  );

comment on column gps.etapa1_clientes.contrato_path is
  'Caminho do contrato ASSINADO no bucket gps-onboarding, no formato <ambiente_aluno_id>/<uuid>.<ext>. O PREFIXO e a credencial de leitura (policies gps_onboarding_anexo_*), por isso o CHECK exige o formato exato e a RPC confere que o prefixo e MESMO o aluno_id do ambiente do cliente. Escrita SO por gps.cliente_definir_contrato/gps.cliente_remover_contrato -- a trigger trg_etapa1_clientes_contrato_travado recusa (42501) escrita direta pelo PostgREST.';
comment on column gps.etapa1_clientes.contrato_nome is
  'Nome ORIGINAL do arquivo, so para exibir e para o `download=` da URL assinada. Texto vindo do usuario: 1..120 e proibido conter / ou \.';
comment on column gps.etapa1_clientes.contrato_mime is
  'MIME REAL lido de storage.objects.metadata pela RPC -- nunca o que o navegador declarou. Um dos 4 da allowlist do bucket.';
comment on column gps.etapa1_clientes.contrato_tamanho is
  'Tamanho REAL em bytes lido de storage.objects.metadata (1..5242880).';
comment on column gps.etapa1_clientes.contrato_anexado_em is
  'Quando o arquivo foi vinculado a esta ficha. NULL junto com as outras 4 (CHECK chk_etapa1_clientes_contrato_anexo_completo: tudo ou nada).';

comment on column gps.etapa1_clientes.contrato_url is
  'LEGADO (migracao ...090, 0 linhas preenchidas em 10/09/2026). Link https do contrato no Drive. Desde a ...214 o contrato de verdade e ANEXO (contrato_path e as outras 4 colunas): arquivo no bucket gps-onboarding, conferido em storage.objects.metadata. A coluna FICA porque nao custa nada, porque quem organiza a pasta no Drive continua podendo colar o link, e porque e o caminho de volta desta migracao. NAO e auditada em gps.aluno_eventos (decisao da ...092: link muda por manutencao de pasta).';

-- ═════════════════════════════════════════════════════════════════════════
-- 2. A trava — as 5 colunas não se escrevem pelo PostgREST
-- ═════════════════════════════════════════════════════════════════════════
--
-- Mesma lição da ...203: Server Action é endpoint HTTP e a allowlist do
-- `PatchCliente` (src/app/clientes/actions.ts) some na compilação. A trava é
-- do BANCO.
--
-- QUEM PASSA:
--   * `current_user = 'postgres'` → estamos DENTRO de uma função SECURITY
--     DEFINER nossa (dono postgres: gps.cliente_definir_contrato,
--     gps.cliente_remover_contrato, gps.onboarding_concluir) ou numa sessão de
--     manutenção/migração. É o único jeito de a RPC do ALUNO gravar: para ele
--     `gp_is_admin()` é false.
--   * admin, direto — é quem conserta ficha errada e apaga prova indevida.
-- QUEM NÃO PASSA: o aluno pelo PostgREST, com 42501 e frase nossa.
--
-- INSERT também é vigiado: `criarCliente` insere só `aluno_id`/`ordem`, mas
-- uma chamada forjada insere a linha JÁ com `contrato_path` — e aí a trava do
-- UPDATE não veria nada.

create or replace function gps.etapa1_clientes_contrato_travado()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare v_mudou boolean;
begin
  if tg_op = 'INSERT' then
    v_mudou := new.contrato_path       is not null
            or new.contrato_nome       is not null
            or new.contrato_mime       is not null
            or new.contrato_tamanho    is not null
            or new.contrato_anexado_em is not null;
  else
    v_mudou := new.contrato_path       is distinct from old.contrato_path
            or new.contrato_nome       is distinct from old.contrato_nome
            or new.contrato_mime       is distinct from old.contrato_mime
            or new.contrato_tamanho    is distinct from old.contrato_tamanho
            or new.contrato_anexado_em is distinct from old.contrato_anexado_em;
  end if;

  if not v_mudou then
    return new;                      -- o resto da ficha continua livre
  end if;

  -- `coalesce(..., false)`: gp_is_admin() devolve NULL sem sessão e
  -- `if not NULL` não dispara — a guarda falharia ABERTO (o furo de
  -- gps.etapa_liberada_para, 09/09/2026).
  --
  -- Só admin ou o DONO das funções SECURITY DEFINER (postgres: dentro de
  -- gps.cliente_definir_contrato/_remover_contrato/onboarding_concluir o
  -- current_user vira postgres). ⚠️ NÃO usar `current_user <> session_user`:
  -- no Supabase a sessão é `authenticator` e o PostgREST faz `set role
  -- authenticated`, então os dois SEMPRE diferem e a trava ficaria aberta.
  if coalesce(public.gp_is_admin(), false) or current_user = 'postgres' then
    return new;
  end if;

  raise exception 'O contrato do cliente é anexado pelo próprio portal — este campo não pode ser escrito direto.'
    using errcode = '42501';
end;
$function$;

comment on function gps.etapa1_clientes_contrato_travado() is
  'BEFORE INSERT OR UPDATE em gps.etapa1_clientes. As 5 colunas do contrato anexado (contrato_path/_nome/_mime/_tamanho/_anexado_em) so mudam por dentro de funcao SECURITY DEFINER nossa (current_user = postgres, o dono: gps.cliente_definir_contrato, gps.cliente_remover_contrato, gps.onboarding_concluir), por sessao de manutencao (postgres) ou por mao de admin. NAO se usa current_user <> session_user: no Supabase a sessao e authenticator e o PostgREST faz set role, entao os dois sempre diferem. Sem isto, o aluno gravaria pelo PostgREST um contrato FANTASMA (caminho que nunca recebeu byte) ou um caminho do prefixo de OUTRO ambiente -- e seria o admin, ao clicar em baixar, quem assinaria a URL do contrato de um terceiro. Todo o resto da ficha continua livre.';

drop trigger if exists trg_etapa1_clientes_contrato_travado on gps.etapa1_clientes;
create trigger trg_etapa1_clientes_contrato_travado
  before insert or update on gps.etapa1_clientes
  for each row execute function gps.etapa1_clientes_contrato_travado();

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Os 2 tipos novos no catálogo do Diário — POR CONTEÚDO, não pelo nome
-- ═════════════════════════════════════════════════════════════════════════
--
-- Mesma técnica das ...092/...151/...201: o CHECK nasceu inline no `create
-- table` da ...001 e já foi recriado três vezes. `drop constraint if exists
-- <nome>` com o nome errado vira NO-OP silencioso e o insert do evento morre
-- DEPOIS, lá na RPC, com 23514 — "o botão não faz nada".
--
-- 🔴 DESVIO DECLARADO em relação ao contrato do orquestrador: entram DOIS
--    tipos, não um. `cliente_contrato_removido` existe porque o contrato é a
--    PROVA que sustenta o sinal "apto ao saldo do programa" — tirar a prova
--    sem deixar rastro é o único caminho pelo qual esse sinal apaga sozinho e
--    ninguém sabe quem apagou. Custo: uma linha no CHECK, uma em
--    TIPOS_EVENTO, uma em ROTULO_TIPO_EVENTO e uma em ROTULO_MACRO_POR_TIPO.

do $$
declare v_nome text;
begin
  select con.conname into v_nome
    from pg_constraint con
    join pg_class     c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'gps' and c.relname = 'aluno_eventos' and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%favorito_liberado_pela_equipe%';

  if v_nome is null then
    raise exception
      'CHECK de gps.aluno_eventos.tipo nao encontrado (procurado pelo conteudo favorito_liberado_pela_equipe) -- a ...201 foi aplicada? migracao abortada';
  end if;

  execute format('alter table gps.aluno_eventos drop constraint %I', v_nome);
end;
$$;

-- Lista COMPLETA: os 24 tipos da ...201, na mesma ordem, + os 2 novos no fim.
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
    -- ── Contrato do cliente como ANEXO (10/09/2026, migração ...214) ──
    'cliente_contrato_anexado',
    'cliente_contrato_removido'
  ));

comment on constraint aluno_eventos_tipo_check on gps.aluno_eventos is
  'Catalogo fechado de tipos de evento do diario. Espelha TIPOS_EVENTO em src/lib/types.ts -- acrescentar tipo aqui SEM acrescentar la deixa o rotulo da trilha sem traducao (e ROTULO_MACRO_POR_TIPO em src/lib/log-agregacao.ts e Partial: esquecer la nao quebra o build, so mostra o codigo cru). cliente_status_mudou fica permitido para as linhas HISTORICAS. Os 4 da ...201: onboarding_iniciado/onboarding_concluido (gps.onboarding_salvar_passo/_concluir) e favorito_confirmado/liberado_pela_equipe (gps.admin_confirmar/liberar_acompanhamento). Os 2 da ...214: cliente_contrato_anexado/cliente_contrato_removido, gravados so por gps.cliente_definir_contrato/gps.cliente_remover_contrato -- o contrato ANEXADO e a prova que sustenta o sinal "apto ao saldo", e tirar a prova sem rastro seria o unico jeito de esse sinal apagar sozinho. NAO confundir com cliente_honorarios_definidos (o VALOR) nem com contrato_url (link do Drive, legado, nao auditado).';

-- ═════════════════════════════════════════════════════════════════════════
-- 4. gps.pode_anexar_onboarding — o bucket passa a ser do AMBIENTE
-- ═════════════════════════════════════════════════════════════════════════
--
-- Corpo VIGENTE da ...205 MENOS a condição "questionário em andamento". Ver o
-- cabeçalho: com ela, quem já concluiu o questionário (que é o estado normal
-- depois do dia 1) não conseguiria anexar o contrato de nenhum cliente.
--
-- O QUE CONTINUA: formato exato do caminho e prefixo = ambiente do próprio
-- aluno. O admin continua NÃO anexando (mesma decisão do chamado, B5-c): ele
-- responde com texto e link, e tem o Drive. Reverter é `or
-- public.gp_is_admin()` aqui, e nada mais.

create or replace function gps.pode_anexar_onboarding(p_name text)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
begin
  if coalesce(p_name, '') !~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|pdf)$'
  then
    return false;
  end if;

  return gps.aluno_atual() = split_part(p_name, '/', 1)::uuid;
exception when others then
  return false;                          -- qualquer imprevisto NEGA
end;
$$;

comment on function gps.pode_anexar_onboarding(text) is
  'Quem ESCREVE no bucket gps-onboarding: so o aluno do ambiente que e PREFIXO do caminho, e so no formato exato <ambiente_aluno_id>/<uuid>.<ext> (sem isso `../` e nome arbitrario chegariam ate aqui). Admin NAO anexa (mesma regra do chamado, B5-c). Falha FECHADO. ⚠️ Desde a ...214 o bucket e "ANEXOS DO AMBIENTE" -- questionario inicial E contratos de clientes -- e por isso a condicao "questionario em andamento" da ...205 SAIU: ela bloquearia o contrato de um cliente cadastrado depois do dia 1. A obrigatoriedade do questionario nunca esteve aqui: ela vive em gps.onboarding_concluir(), que recusa concluir sem valor_honorarios e sem o anexo contrato_honorarios.';

comment on function gps.pode_ver_anexo_onboarding(text) is
  'Quem le um anexo do bucket gps-onboarding: admin ou membro do AMBIENTE cujo aluno_id e o PREFIXO do caminho (titular e socio, portanto). Vale para os DOIS usos do bucket desde a ...214: anexo do questionario inicial e contrato de cliente da ficha. SECURITY INVOKER -- gps.aluno_atual() e gp_is_admin() ja resolvem pela sessao. Falha FECHADO: nome de objeto e entrada de usuario. Toda URL assinada sai com `download=`, nunca inline.';

-- ═════════════════════════════════════════════════════════════════════════
-- 5. gps.cliente_definir_contrato
-- ═════════════════════════════════════════════════════════════════════════
--
-- Molde literal de `gps.onboarding_registrar_anexo` (...206): o que o objeto
-- REALMENTE é (storage.objects.metadata) vence o que o cliente declarou.
--
-- 🔴 DEPENDÊNCIA DE PRIVILÉGIO: a conferência lê `storage.objects`. O dono da
-- função (postgres) tem esse privilégio hoje. Se um dia não tiver, o
-- `exception when insufficient_privilege` RECUSA o anexo em vez de gravá-lo
-- sem conferir.
--
-- QUEM PODE: o dono do ambiente do cliente (`c.aluno_id = gps.aluno_atual()`,
-- titular ou sócio) OU o admin. O parâmetro NÃO é credencial: o ambiente sai
-- da linha do cliente, e a comparação é com a sessão.
--
-- A TRAVA DO FAVORITO NÃO BLOQUEIA AQUI (...203/...215): contrato é FICHA, não
-- VÍNCULO. Cliente que a equipe acompanha continua podendo receber contrato —
-- aliás é justamente dele que a equipe mais quer a prova.
--
-- SUBSTITUIÇÃO: anexar de novo troca as 5 colunas. ⚠️ O BYTE ANTIGO FICA no
-- bucket até o expurgo do admin (B-R1) — SQL não apaga arquivo no object
-- store, e fingir que apaga é pior do que não apagar. A tela diz isso.

create or replace function gps.cliente_definir_contrato(
  p_cliente_id uuid,
  p_path       text,
  p_nome       text,
  p_mime       text,
  p_tamanho    integer
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
  v_mime      text;
  v_tamanho   integer;
  v_ext       text;
  v_nome      text;
  v_tinha     boolean;
begin
  if p_cliente_id is null then
    raise exception 'cliente nao informado' using errcode = '22023';
  end if;

  select c.id, c.aluno_id, c.nome, c.contrato_path
    into v_c
    from gps.etapa1_clientes c
   where c.id = p_cliente_id;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  -- AUTORIZAÇÃO: dono do ambiente OU admin. Nada vindo do cliente escolhe de
  -- quem é a ficha — `v_ambiente` sai do JWT, dentro do banco.
  if not v_admin and (v_ambiente is null or v_ambiente <> v_c.aluno_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  v_nome := btrim(coalesce(p_nome, ''));
  if v_nome = '' or char_length(v_nome) > 120 or v_nome ~ '[/\\]' then
    raise exception 'Nome de arquivo inválido.' using errcode = '22023';
  end if;

  -- (1) POSSE: o prefixo tem de ser o AMBIENTE DESTE CLIENTE — não o de quem
  -- chama. Para o aluno é o mesmo valor; para o ADMIN, é o que impede vincular
  -- na ficha de um aluno um arquivo que vive no prefixo de outro.
  if coalesce(p_path,'') !~
     '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|pdf)$'
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
     where o.bucket_id = 'gps-onboarding'
       and o.name = p_path;
  exception when insufficient_privilege then
    raise exception 'nao foi possivel validar o anexo' using errcode = '42501';
  end;

  if not coalesce(v_existe, false) then
    raise exception 'anexo nao encontrado' using errcode = '42501';
  end if;

  v_mime    := coalesce(v_meta_mime, p_mime);
  v_tamanho := coalesce(v_meta_size, p_tamanho::bigint)::integer;

  if v_mime not in ('image/png','image/jpeg','image/webp','application/pdf') then
    raise exception 'formato de anexo nao aceito' using errcode = '22023';
  end if;
  if v_tamanho is null or v_tamanho < 1 or v_tamanho > 5242880 then
    raise exception 'anexo maior que 5 MB' using errcode = '22023';
  end if;

  -- (4) extensão x MIME: `contrato.pdf` servido como PNG e vice-versa.
  v_ext := lower(regexp_replace(p_path, '^.*\.', ''));
  if not (
       (v_mime = 'image/png'       and v_ext = 'png')
    or (v_mime = 'image/jpeg'      and v_ext in ('jpg','jpeg'))
    or (v_mime = 'image/webp'      and v_ext = 'webp')
    or (v_mime = 'application/pdf' and v_ext = 'pdf')
  ) then
    raise exception 'extensao do anexo nao confere com o tipo do arquivo' using errcode = '22023';
  end if;

  v_tinha := v_c.contrato_path is not null;

  update gps.etapa1_clientes
     set contrato_path       = p_path,
         contrato_nome       = v_nome,
         contrato_mime       = v_mime,
         contrato_tamanho    = v_tamanho,
         contrato_anexado_em = now()
   where id = p_cliente_id;

  -- Evento na trilha. `rotulo` é o nome do CLIENTE (o mesmo padrão da trigger
  -- de captura, ...092) e o `detalhe` NÃO leva o nome do arquivo: nome de
  -- arquivo de contrato costuma trazer o nome civil de terceiros, e a trilha é
  -- lida pela equipe inteira.
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_c.aluno_id, now(), 'cliente_contrato_anexado', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('mime', v_mime, 'tamanho', v_tamanho, 'substituiu', v_tinha),
     case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');

  return jsonb_build_object('cliente_id', p_cliente_id, 'path', p_path,
                            'nome', v_nome, 'mime', v_mime, 'tamanho', v_tamanho,
                            'substituiu', v_tinha);
end $function$;

comment on function gps.cliente_definir_contrato(uuid, text, text, text, integer) is
  'Vincula o contrato ASSINADO a ficha do cliente DEPOIS de conferir o objeto: prefixo do caminho = aluno_id do AMBIENTE DO CLIENTE (nao o de quem chama -- e o que impede o admin vincular arquivo de outro ambiente), objeto existe no bucket gps-onboarding, e tamanho/MIME lidos de storage.objects.metadata (o que o cliente declara e fallback, nunca a fonte) casando com a extensao. Autorizacao: dono do ambiente (gps.aluno_atual()) OU admin. Grava as 5 colunas de uma vez (CHECK tudo-ou-nada) e o evento cliente_contrato_anexado. Anexar de novo SUBSTITUI; o BYTE antigo fica no bucket ate o expurgo do admin -- SQL nao apaga arquivo no object store. A trava do favorito (...203/...215) NAO bloqueia aqui: contrato e FICHA, nao VINCULO.';

revoke execute on function gps.cliente_definir_contrato(uuid, text, text, text, integer) from public, anon;
grant  execute on function gps.cliente_definir_contrato(uuid, text, text, text, integer) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 6. gps.cliente_remover_contrato
-- ═════════════════════════════════════════════════════════════════════════

create or replace function gps.cliente_remover_contrato(p_cliente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_c     record;
  v_admin boolean := coalesce(public.gp_is_admin(), false);
  v_ambiente uuid := gps.aluno_atual();
begin
  if p_cliente_id is null then
    raise exception 'cliente nao informado' using errcode = '22023';
  end if;

  select c.id, c.aluno_id, c.nome, c.contrato_path, c.contrato_mime, c.contrato_tamanho
    into v_c
    from gps.etapa1_clientes c
   where c.id = p_cliente_id;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;

  if not v_admin and (v_ambiente is null or v_ambiente <> v_c.aluno_id) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if v_c.contrato_path is null then
    raise exception 'Este cliente não tem contrato anexado.' using errcode = '22023';
  end if;

  update gps.etapa1_clientes
     set contrato_path       = null,
         contrato_nome       = null,
         contrato_mime       = null,
         contrato_tamanho    = null,
         contrato_anexado_em = null
   where id = p_cliente_id;

  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_c.aluno_id, now(), 'cliente_contrato_removido', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('mime', v_c.contrato_mime, 'tamanho', v_c.contrato_tamanho),
     case when v_admin then 'equipe' else 'aluno' end, auth.uid(), 'app');

  return jsonb_build_object('cliente_id', p_cliente_id, 'removido', true);
end $function$;

comment on function gps.cliente_remover_contrato(uuid) is
  'Tira o contrato da FICHA do cliente (limpa as 5 colunas) e grava cliente_contrato_removido na trilha. Autorizacao: dono do ambiente OU admin -- a mesma de gps.cliente_definir_contrato. O ARQUIVO continua no bucket ate o expurgo do admin (B-R1): a policy de delete de storage.objects e so de admin, o GPS nao usa service_role, e apagar a linha de storage.objects por SQL NAO apaga o byte. A tela precisa dizer isso -- fingir que o arquivo sumiu seria mentira. A trava do favorito NAO bloqueia aqui: contrato e ficha, nao vinculo.';

revoke execute on function gps.cliente_remover_contrato(uuid) from public, anon;
grant  execute on function gps.cliente_remover_contrato(uuid) to authenticated;

-- ═════════════════════════════════════════════════════════════════════════
-- 7. gps.onboarding_concluir — o cliente 1 já nasce com o contrato
-- ═════════════════════════════════════════════════════════════════════════
--
-- ⚠️ CORPO VIGENTE DA ...206, copiado inteiro, com UMA adição: as 5 colunas do
-- contrato no INSERT do cliente 1. `create or replace function` NÃO herda o
-- corpo anterior — escrever só o trecho novo apagaria o gate do João, a
-- criação do cliente, a favoritação com tratamento de corrida e o evento
-- `onboarding_concluido`. (Lição de 08/09/2026: "recriar função parte do corpo
-- VIGENTE".)
--
-- POR QUE COPIAR E NÃO REFERENCIAR: o anexo do questionário é da PESSOA
-- (`gps.onboarding_anexos.pessoa_aluno_id`) e a ficha é do CLIENTE. O arquivo
-- é o MESMO byte, no MESMO bucket, com o MESMO caminho — copiar aqui é copiar
-- 4 campos de texto, não duplicar arquivo. E é o que faz o cliente 1 do aluno
-- que respondeu "execução em andamento" já nascer com a prova na ficha, sem
-- pedir que ele suba o mesmo PDF duas vezes.
--
-- A assinatura NÃO muda (sem parâmetros), então nada de `drop function`.

create or replace function gps.onboarding_concluir()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_pessoa     uuid;
  v_ambiente   uuid;
  v_r          gps.onboarding_respostas%rowtype;
  v_fase_cli   text;
  v_ordem      integer;
  v_cliente    uuid;
  v_favoritado boolean := false;
  v_cpath      text;
  v_cnome      text;
  v_cmime      text;
  v_ctam       integer;
begin
  v_pessoa := gps.pessoa_atual();
  if v_pessoa is null then
    raise exception 'Seu cadastro ainda não está vinculado ao programa. Fale com a equipe.'
      using errcode = '42501';
  end if;
  v_ambiente := gps.aluno_atual();
  if v_ambiente is null then
    raise exception 'Este cadastro não tem ambiente no programa.' using errcode = '42501';
  end if;

  -- `for update`: duas conclusões simultâneas da MESMA pessoa (duplo clique,
  -- duas abas) serializam aqui em vez de criarem dois clientes.
  select * into v_r from gps.onboarding_respostas r
   where r.pessoa_aluno_id = v_pessoa for update;
  if not found then
    raise exception 'Responda o questionário antes de concluir.' using errcode = '22023';
  end if;
  if v_r.concluido_em is not null then
    raise exception 'Você já concluiu o questionário inicial.' using errcode = '22023';
  end if;
  if v_r.origem_cliente1 is null then
    raise exception 'Escolha de onde virá o seu cliente 1.' using errcode = '22023';
  end if;

  if v_r.origem_cliente1 = 'ja_tenho' then
    if v_r.fase_cliente1 is null then
      raise exception 'Informe em que fase você está com este cliente.' using errcode = '22023';
    end if;
    if coalesce(btrim(v_r.cliente_nome), '') = '' then
      raise exception 'Informe o nome do seu cliente 1.' using errcode = '22023';
    end if;

    -- 🔴 O GATE do João: "Execução em andamento (Obrigatório ele informar o
    -- valor do contrato dos honorários e anexar o contrato de honorários
    -- assinado, sem isso ele não pode avançar)".
    if v_r.fase_cliente1 = 'execucao_andamento' then
      if v_r.valor_honorarios is null then
        raise exception 'Informe o valor dos honorários pactuados para seguir.'
          using errcode = '22023';
      end if;
      if not exists (select 1 from gps.onboarding_anexos a
                      where a.pessoa_aluno_id = v_pessoa
                        and a.tipo = 'contrato_honorarios') then
        raise exception 'Anexe o contrato de honorários assinado para seguir.'
          using errcode = '22023';
      end if;
    end if;

    -- Mapa resposta → fase do cliente (C-1: NENHUMA fase nova). O mesmo mapa
    -- vive em FASES_CLIENTE1_UI (src/lib/etapa1.ts) — dois lugares, um por
    -- camada, e os dois dizem o mesmo.
    v_fase_cli := case v_r.fase_cliente1
                    when 'viabilidade_feita'   then 'fechamento'
                    when 'croqui_apresentado'  then 'fechamento'
                    when 'execucao_andamento'  then 'contratado'
                  end;

    select coalesce(max(c.ordem), 0) + 1 into v_ordem
      from gps.etapa1_clientes c where c.aluno_id = v_ambiente;

    -- ...214: o contrato do questionário VIRA o contrato da ficha do cliente 1.
    -- Mesmo bucket, mesmo caminho, mesmo byte — o que se copia são 4 campos de
    -- texto. `contrato_anexado_em` = now() e não o `criado_em` do anexo: o que
    -- a coluna conta é quando o arquivo passou a valer PARA ESTA FICHA.
    -- Existe no máximo uma linha `contrato_honorarios` por pessoa (índice
    -- único parcial `onboarding_contrato_unico`, ...204).
    select a.path, a.nome, a.mime, a.tamanho
      into v_cpath, v_cnome, v_cmime, v_ctam
      from gps.onboarding_anexos a
     where a.pessoa_aluno_id = v_pessoa
       and a.tipo = 'contrato_honorarios';

    insert into gps.etapa1_clientes
      (aluno_id, nome, telefone, grau_relacao, fase, valor_honorarios, ordem,
       contrato_path, contrato_nome, contrato_mime, contrato_tamanho, contrato_anexado_em)
    values
      (v_ambiente, btrim(v_r.cliente_nome), v_r.cliente_telefone,
       v_r.cliente_grau_relacao, v_fase_cli, v_r.valor_honorarios, v_ordem,
       v_cpath, v_cnome, v_cmime, v_ctam,
       case when v_cpath is null then null else now() end)
    returning id into v_cliente;
    -- ↑ a trigger de captura grava `cliente_cadastrado` sozinha. O INSERT passa
    -- pela trava da ...214 porque estamos em SECURITY DEFINER (postgres).

    -- FAVORITA se e somente se o ambiente ainda não tem favorito (§B.1): o
    -- segundo sócio a responder NÃO derruba a estrela do primeiro.
    -- Por UPDATE, e não no INSERT acima, de propósito: é o ramo de UPDATE da
    -- trigger de captura que grava `cliente_favoritado` — favoritar no INSERT
    -- deixaria a trilha sem essa linha.
    -- ⚠️ Este UPDATE marca a estrela num cliente que acabou de nascer sem ela:
    -- a trava da ...215 recusa DESMARCAR, nunca marcar. Passa.
    if not exists (select 1 from gps.etapa1_clientes c
                    where c.aluno_id = v_ambiente and c.acompanhado_equipe) then
      begin
        update gps.etapa1_clientes set acompanhado_equipe = true where id = v_cliente;
        v_favoritado := true;
      exception when unique_violation then
        -- CORRIDA: outra conclusão do mesmo ambiente favoritou entre o `not
        -- exists` e o `update`. O índice único parcial
        -- `etapa1_clientes_unico_equipe` é a garantia. Aqui a resposta certa
        -- NÃO é abortar (o cliente é bom e já existe): é seguir sem a estrela,
        -- que é exatamente a regra do parágrafo acima. O bloco é uma
        -- subtransação: só o `update` volta.
        v_favoritado := false;
      end;
    end if;
  end if;

  update gps.onboarding_respostas
     set concluido_em = now(),
         cliente_id   = v_cliente,
         passo_atual  = 9
   where pessoa_aluno_id = v_pessoa;

  -- O ÚNICO evento que esta função grava. `cliente_cadastrado` e
  -- `cliente_favoritado` já vieram da trigger de captura.
  -- ⚠️ A cópia do contrato NÃO grava `cliente_contrato_anexado`: o arquivo já
  -- foi conferido em `gps.onboarding_registrar_anexo` e a trilha já tem o
  -- `onboarding_concluido` com `cliente_id` — duas linhas para o mesmo ato
  -- contariam a mesma coisa duas vezes.
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_ambiente, now(), 'onboarding_concluido', 'onboarding', null,
     'Concluiu o questionário inicial',
     jsonb_build_object('pessoa_aluno_id', v_pessoa,
                        'origem_cliente1', v_r.origem_cliente1,
                        'fase_cliente1',   v_r.fase_cliente1,
                        'cliente_id',      v_cliente,
                        'favoritado',      v_favoritado,
                        'contrato_copiado', v_cpath is not null),
     'aluno', auth.uid(), 'app');

  return jsonb_build_object('cliente_id', v_cliente, 'favoritado', v_favoritado,
                            'contrato_copiado', v_cpath is not null);
end $function$;

comment on function gps.onboarding_concluir() is
  'Fecha o questionario da PESSOA logada, TUDO OU NADA. Valida a obrigatoriedade que o Joao chamou de fundamental (execucao em andamento => valor_honorarios E anexo contrato_honorarios) -- o banco e a garantia, a UI e conveniencia. Quando a origem e ja_tenho, cria o cliente 1 em gps.etapa1_clientes com nome/telefone/grau_relacao/fase (mapa de C-1: viabilidade_feita e croqui_apresentado -> fechamento; execucao_andamento -> contratado)/valor_honorarios/ordem=max+1, COPIA o contrato do questionario para as 5 colunas de contrato da ficha (...214: mesmo bucket, mesmo caminho -- o cliente ja nasce com a prova) e FAVORITA so se o ambiente ainda nao tiver favorito. Nao duplica evento: cliente_cadastrado e cliente_favoritado vem da trigger de captura (...008), e a copia do contrato nao grava cliente_contrato_anexado (o arquivo ja foi conferido no questionario). NAO cobra nada, nao manda e-mail e nao muda situacao financeira -- o "apto ao saldo" e derivado e e sinal para a equipe.';

revoke execute on function gps.onboarding_concluir() from public, anon;
grant  execute on function gps.onboarding_concluir() to authenticated;
