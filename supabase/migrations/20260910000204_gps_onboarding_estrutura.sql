-- Mega feature — o questionário inicial: `gps.pessoa_atual()`,
-- `gps.onboarding_respostas` e `gps.onboarding_anexos`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- O ONBOARDING É DA PESSOA, NÃO DO AMBIENTE
-- ═══════════════════════════════════════════════════════════════════════════
--   `gps.aluno_atual()` devolve o AMBIENTE (do titular). Cliente, progresso,
--   pasta e chamado são do ambiente — titular e sócio dividem. Mas o
--   onboarding é uma CONVERSA COM UMA PESSOA: "de onde virá o SEU cliente 1".
--   São 13 sócios em 13 ambientes; com a chave no ambiente, o sócio nunca
--   seria perguntado e nunca veria o tour — que é a metade mais importante da
--   feature ("apresentação do sistema").
--
--   Chave = `pessoa_aluno_id` (public.thb_alunos.id), a mesma identidade que a
--   Central estabeleceu em `gps.membros.pessoa_aluno_id` (migrações ...154 e
--   ...160). MEDIDO na Onda 0 (gate M1): o índice único parcial
--   `membros_pessoa_uk` EXISTE, então uma pessoa não aparece em dois
--   ambientes — e a PK aqui é sólida. M6: 0 membros sem pessoa.
--   Ela sobrevive a `admin_mover_membro` e a remover/recriar o membro;
--   `gps.membros.id` não sobreviveria.
--
--   ⚠️ Consequência que a TELA precisa dizer: o onboarding é por pessoa, mas o
--   efeito colateral (o cliente 1) é do AMBIENTE. Se o sócio responder "já
--   tenho esse cliente" num ambiente que já tem favorito, o cliente é criado
--   SEM favoritar (§B.1) — senão o segundo a responder derrubaria o favorito
--   do primeiro em silêncio, e o índice único parcial
--   `etapa1_clientes_unico_equipe` transformaria isso em erro de banco no meio
--   do onboarding.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- DESVIO DECLARADO em relação ao rascunho §B.2 da concepção
-- ═══════════════════════════════════════════════════════════════════════════
--   O rascunho do arquiteto não tem onde guardar o NOME/TELEFONE/GRAU do
--   cliente 1 entre o passo 3 e a conclusão — e o onboarding é RETOMÁVEL
--   ("fechou no 3, volta no 3"). Sem persistir, fechar o navegador no passo 4
--   apagaria o que a pessoa digitou no 3, e `gps.onboarding_concluir()` (que
--   não recebe parâmetros, por contrato) não teria com que criar o cliente.
--   → Entram 3 colunas: `cliente_nome`, `cliente_telefone`,
--     `cliente_grau_relacao`. São RESPOSTA da pessoa, não estado vivo: o
--     estado vivo nasce em gps.etapa1_clientes na conclusão.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- GRANTS: leitura direta sim, ESCRITA direta não (desvio declarado, com razão)
-- ═══════════════════════════════════════════════════════════════════════════
--   As policies de insert/update do DONO existem e estão escritas abaixo, mas
--   `authenticated` recebe só `select`. Motivo, medido contra o pedido do João:
--   a regra "execução em andamento ⇒ honorários E contrato anexado, sem isso
--   ele não pode avançar" é a peça que ele chamou de FUNDAMENTAL, e ela vive
--   dentro de `gps.onboarding_concluir()`. Com `insert` direto em
--   `gps.onboarding_anexos`, qualquer aluno forjaria uma linha de
--   'contrato_honorarios' pelo PostgREST e passaria pelo gate sem anexar nada:
--   a obrigação viraria decoração. É o mesmo raciocínio de `gps.chamados`
--   (migração ...110): `grant select` e nada mais; toda escrita por RPC.
--   Ligar a escrita direta de `onboarding_respostas` é UM `grant`; a de
--   `onboarding_anexos` NUNCA deve ser ligada.
--
-- O QUE NÃO FAZ
--   * não cria o bucket (é a ...205) nem as RPCs (é a ...206);
--   * não escreve nenhuma linha: depois de aplicar, as duas tabelas têm 0
--     linhas e isso é o resultado correto;
--   * não toca gps.membros, gps.etapa1_clientes nem gps.aluno_atual().
--
-- REVERSÃO (nesta ordem):
--   drop table gps.onboarding_anexos;
--   drop table gps.onboarding_respostas;
--   drop function gps.pessoa_atual();

-- ─────────────────────────────────────────────────────────────────────────
-- 1. gps.pessoa_atual() — a irmã de gps.aluno_atual()
-- ─────────────────────────────────────────────────────────────────────────
--
-- SECURITY INVOKER de propósito: a policy `membros_self_select` já deixa a
-- pessoa ler a PRÓPRIA linha de gps.membros, e um DEFINER teria de
-- reimplementar a mesma regra (segundo lugar para esquecer de manter). Mesma
-- decisão de `gps.pode_ver_chamado` e `gps.etapa_liberada_para`.
--
-- FALHA FECHADO por construção: sem sessão, `auth.uid()` é NULL, nenhuma linha
-- casa e a função devolve NULL. Toda policy que a usa compara com `=`, e
-- `x = NULL` é NULL — que NÃO é `true`, logo nega. É o cuidado que
-- `coalesce(..., false)` presta às guardas booleanas, aqui obtido pelo tipo.
--
-- 🔑 CRÉDITO DE OTIMIZAÇÃO: `getContextoSessao` (src/lib/auth.ts) fazia um
-- `ilike` em `public.thb_alunos.email` em TODA requisição de sócio só para
-- descobrir quem ele é. `pessoa_aluno_id` existe desde a ...154 e vem na MESMA
-- linha de gps.membros que a sessão já lê — uma consulta a menos por
-- requisição de sócio, e sem casar pessoa por e-mail (que multiplica).

create or replace function gps.pessoa_atual()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select m.pessoa_aluno_id
    from gps.membros m
   where m.user_id = auth.uid()
     and m.pessoa_aluno_id is not null
   order by (m.papel = 'titular') desc, m.criado_em asc
   limit 1;
$$;

comment on function gps.pessoa_atual() is
  'Quem a PESSOA logada e em public.thb_alunos (gps.membros.pessoa_aluno_id). Irma de gps.aluno_atual(), que devolve o AMBIENTE: para o titular os dois coincidem, para o socio nao. NULL quando nao ha sessao, quando o usuario nao e membro ou quando o membro ainda nao tem pessoa vinculada (a Central resolve com admin_vincular_pessoa_membro) -- e NULL nega em toda policy, porque `x = NULL` nao e true. SECURITY INVOKER: a policy membros_self_select ja e a fonte de verdade.';

revoke execute on function gps.pessoa_atual() from public, anon;
grant  execute on function gps.pessoa_atual() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. gps.onboarding_respostas — uma linha por pessoa, retomável, versionada
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists gps.onboarding_respostas (
  pessoa_aluno_id    uuid primary key references public.thb_alunos(id) on delete cascade,

  -- O ambiente onde a pessoa estava ao responder. Denormalizado de propósito:
  -- é por ele que o cliente 1 é criado e é por ele que o admin acha a resposta
  -- na Central. Se a pessoa for movida de ambiente depois, a resposta continua
  -- contando a verdade de quando foi dada — histórico não se reescreve.
  ambiente_aluno_id  uuid not null references public.thb_alunos(id),

  -- VERSÃO DO QUESTIONÁRIO. 1 = o texto que o João escreveu em 10/09/2026.
  -- Mudar pergunta depois NÃO reabre o pop-up de quem já respondeu; a versão
  -- existe para a equipe saber a QUE pergunta a resposta responde.
  versao             smallint not null default 1 check (versao between 1 and 99),

  -- Retomada: o passo em que a pessoa parou (0..9). Só AVANÇA ou mantém.
  passo_atual        smallint not null default 0 check (passo_atual between 0 and 9),

  iniciado_em        timestamptz not null default now(),
  concluido_em       timestamptz,                    -- null = em andamento

  -- ── RESPOSTAS TIPADAS (CHECK fechado — é o que o dashboard agrega) ──
  origem_cliente1    text check (origem_cliente1 in ('captacao','ja_tenho')),
  fase_cliente1      text check (fase_cliente1 in (
                        'viabilidade_feita',    -- "Sessão de viabilidade já realizada e Croqui estrutural a apresentar"
                        'croqui_apresentado',   -- "Croqui Estrutural já apresentado e aguardando a execução"
                        'execucao_andamento')), -- "Execução em andamento"
  valor_honorarios   numeric(12,2) check (valor_honorarios is null or valor_honorarios >= 0),

  -- ── IDENTIFICAÇÃO DO CLIENTE 1 (desvio declarado no cabeçalho) ──
  cliente_nome         text check (cliente_nome is null or char_length(btrim(cliente_nome)) between 1 and 200),
  cliente_telefone     text check (cliente_telefone is null or char_length(btrim(cliente_telefone)) between 8 and 40),
  cliente_grau_relacao text check (cliente_grau_relacao is null or cliente_grau_relacao in
                          ('parente','amigo','conhecido','indicacao','cliente_atual','lead')),

  -- O cliente que ESTA resposta criou. `on delete set null`: o aluno pode
  -- apagar o cliente depois, e a resposta continua sendo história verdadeira.
  cliente_id         uuid references gps.etapa1_clientes(id) on delete set null,

  -- ── TEXTO LIVRE (as duas perguntas abertas do João) ──
  descricao_caso     text check (descricao_caso is null or char_length(descricao_caso) between 1 and 4000),
  ajuda_pronta       text check (ajuda_pronta   is null or char_length(ajuda_pronta)   between 1 and 4000),

  atualizado_em      timestamptz not null default now(),

  -- Coerência mínima, SEM catraca (lição B9-b, 09/09): a fase só existe quando
  -- a origem é 'ja_tenho'. NÃO amarra honorários à fase — voltar atrás não
  -- pode exigir apagar dado que a pessoa já deu.
  constraint onboarding_fase_so_com_cliente
    check (fase_cliente1 is null or origem_cliente1 = 'ja_tenho')
);

comment on table gps.onboarding_respostas is
  'Questionario inicial do Programa (10/09/2026), UMA linha por PESSOA (pessoa_aluno_id = public.thb_alunos.id, a identidade de gps.membros.pessoa_aluno_id). Retomavel: passo_atual guarda onde a pessoa parou e so avanca. concluido_em NULL = em andamento. E RETRATO DO DIA 0, nao estado vivo: o estado vivo do cliente 1 e a linha de gps.etapa1_clientes que cliente_id aponta. Escrita SO por RPC (gps.onboarding_salvar_passo/onboarding_concluir, migracao ...206) -- authenticated tem apenas select, ver o cabecalho da migracao.';
comment on column gps.onboarding_respostas.ambiente_aluno_id is
  'AMBIENTE em que a pessoa estava ao responder. Denormalizado: e por ele que o cliente 1 nasce e e por ele que a Central acha a resposta. Nao se atualiza quando a pessoa muda de ambiente -- historico nao se reescreve.';
comment on column gps.onboarding_respostas.fase_cliente1 is
  'As TRES respostas literais do Joao, preservadas com a granularidade original. NAO existe 4a fase de cliente (decisao C-1): as tres mapeiam para fechamento/fechamento/contratado em gps.etapa1_clientes, e a distincao que se perderia fica guardada AQUI.';
comment on column gps.onboarding_respostas.cliente_nome is
  'Nome do cliente 1 informado no passo 3. Fica aqui ate a conclusao criar a linha de gps.etapa1_clientes -- sem isso, fechar o navegador entre o passo 3 e o 9 apagaria o que a pessoa digitou (o onboarding e retomavel por contrato). Depois da conclusao e historico: quem manda e a ficha do cliente.';
comment on column gps.onboarding_respostas.descricao_caso is
  'Texto livre do ALUNO sobre o caso dele -- pode conter dado de TERCEIRO (o cliente). Visivel para o proprio aluno e para o admin. NUNCA vai para o Slack, para e-mail nem para retorno agregado (dashboard).';

create index if not exists onboarding_respostas_ambiente_idx
  on gps.onboarding_respostas (ambiente_aluno_id);
comment on index gps.onboarding_respostas_ambiente_idx is
  'Serve gps.admin_onboarding_do_aluno(uuid) e a coluna onboarding_status de gps.admin_painel_alunos: as duas partem do AMBIENTE. Sem ele, com a base crescendo, cada abertura da Central varreria a tabela inteira.';

drop trigger if exists trg_onboarding_respostas_touch on gps.onboarding_respostas;
create trigger trg_onboarding_respostas_touch
  before update on gps.onboarding_respostas
  for each row execute function gps.touch_atualizado_em();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. gps.onboarding_anexos — N por pessoa, com o contrato à parte
-- ─────────────────────────────────────────────────────────────────────────

create table if not exists gps.onboarding_anexos (
  id              uuid primary key default gen_random_uuid(),
  pessoa_aluno_id uuid not null
                    references gps.onboarding_respostas(pessoa_aluno_id) on delete cascade,

  -- 'contrato_honorarios' é ÚNICO por pessoa (índice parcial abaixo) e é o que
  -- a regra de obrigatoriedade cobra. 'documento' é a lista aberta do passo 7.
  tipo            text not null check (tipo in ('contrato_honorarios','documento')),

  -- Formato exato <uuid-do-ambiente>/<uuid>.<ext>. Sem o CHECK, `../` e nome
  -- arbitrário chegariam até a policy de storage.objects — o prefixo do
  -- caminho É a credencial de leitura do arquivo.
  path            text not null check (path ~
                    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|pdf)$'),

  -- Nome ORIGINAL, só para exibir e para o `download=` da URL assinada. É
  -- texto vindo do usuário: proibido conter / ou \.
  nome            text not null check (char_length(nome) between 1 and 120 and nome !~ '[/\\]'),
  mime            text not null check (mime in ('image/png','image/jpeg','image/webp','application/pdf')),
  tamanho         integer not null check (tamanho between 1 and 5242880),
  criado_em       timestamptz not null default now()
);

comment on table gps.onboarding_anexos is
  'Anexos do questionario inicial. tipo=contrato_honorarios e a PROVA que destrava "execucao em andamento" (unico por pessoa; enviar outro SUBSTITUI, via RPC). tipo=documento e a lista aberta do passo 7 (teto de 5, imposto na RPC). ⚠️ NAO e o fichario de documentos do cliente, removido em 07/2026: contrato, RG e matricula continuam so no Drive. O contrato aqui e documento de TERCEIRO (o cliente do aluno) -- nao vai por e-mail, nao vai para o Slack, nao entra em retorno agregado, e todo link sai com `download=`, nunca inline.';
comment on column gps.onboarding_anexos.path is
  'Caminho no bucket gps-onboarding, no formato <ambiente_aluno_id>/<uuid>.<ext>. O PREFIXO e o que as policies de storage.objects usam para decidir quem le; por isso o CHECK exige o formato exato. Que o prefixo seja MESMO o ambiente da pessoa e conferido na RPC, que a constraint nao tem como saber.';

create unique index if not exists onboarding_contrato_unico
  on gps.onboarding_anexos (pessoa_aluno_id) where tipo = 'contrato_honorarios';
comment on index gps.onboarding_contrato_unico is
  'UM contrato de honorarios por pessoa. PARCIAL: os anexos tipo=documento nao disputam. E o que torna a substituicao do contrato uma operacao explicita (a RPC apaga a linha anterior antes de inserir) em vez de acumular versoes sem ninguem saber qual vale.';

create index if not exists onboarding_anexos_pessoa_idx
  on gps.onboarding_anexos (pessoa_aluno_id, criado_em);
comment on index gps.onboarding_anexos_pessoa_idx is
  'Serve a listagem de gps.onboarding_meu()/admin_onboarding_do_aluno e a contagem do teto de 5 documentos.';

-- ─────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────

alter table gps.onboarding_respostas enable row level security;
alter table gps.onboarding_anexos    enable row level security;

drop policy if exists gps_onboarding_respostas_admin_all   on gps.onboarding_respostas;
drop policy if exists gps_onboarding_respostas_dono_select on gps.onboarding_respostas;
drop policy if exists gps_onboarding_respostas_dono_insert on gps.onboarding_respostas;
drop policy if exists gps_onboarding_respostas_dono_update on gps.onboarding_respostas;

create policy gps_onboarding_respostas_admin_all on gps.onboarding_respostas
  for all to authenticated
  using (public.gp_is_admin()) with check (public.gp_is_admin());

-- 🔴 `pessoa_aluno_id = gps.pessoa_atual()`, NUNCA `ambiente_aluno_id =
-- gps.aluno_atual()`: a resposta é da PESSOA. O sócio do mesmo ambiente NÃO lê
-- a resposta do titular (e vice-versa) — `descricao_caso` e `ajuda_pronta` são
-- texto livre que pode conter dado de terceiro.
create policy gps_onboarding_respostas_dono_select on gps.onboarding_respostas
  for select to authenticated
  using (pessoa_aluno_id = gps.pessoa_atual());

-- As duas policies abaixo existem, mas hoje não têm GRANT correspondente (ver
-- cabeçalho): ligar a escrita direta é uma linha de `grant`, e o custo dela
-- está escrito. Sem policy, ligar o grant abriria escrita para QUALQUER linha.
create policy gps_onboarding_respostas_dono_insert on gps.onboarding_respostas
  for insert to authenticated
  with check (pessoa_aluno_id = gps.pessoa_atual());

create policy gps_onboarding_respostas_dono_update on gps.onboarding_respostas
  for update to authenticated
  using (pessoa_aluno_id = gps.pessoa_atual())
  with check (pessoa_aluno_id = gps.pessoa_atual());

-- NENHUMA policy de delete, para ninguém: resposta é histórico. Nem o admin
-- apaga pela API (a exclusão do ambiente inteiro leva junto pelo cascade da FK
-- de public.thb_alunos).

drop policy if exists gps_onboarding_anexos_admin_all   on gps.onboarding_anexos;
drop policy if exists gps_onboarding_anexos_dono_select on gps.onboarding_anexos;

create policy gps_onboarding_anexos_admin_all on gps.onboarding_anexos
  for all to authenticated
  using (public.gp_is_admin()) with check (public.gp_is_admin());

create policy gps_onboarding_anexos_dono_select on gps.onboarding_anexos
  for select to authenticated
  using (pessoa_aluno_id = gps.pessoa_atual());

-- 🔴 NENHUMA policy de insert/update para o aluno, NUNCA: uma linha forjada de
-- tipo='contrato_honorarios' passaria pelo gate de obrigatoriedade de
-- gps.onboarding_concluir() sem que nenhum arquivo existisse. A RPC
-- gps.onboarding_registrar_anexo (...206) confere o objeto em
-- storage.objects.metadata antes de gravar — é ela a fonte de verdade.

-- ─────────────────────────────────────────────────────────────────────────
-- 5. Grants
-- ─────────────────────────────────────────────────────────────────────────
-- 🔴 `revoke all` ANTES do grant, e não só `grant select`: o schema gps tem
-- ALTER DEFAULT PRIVILEGES que concede insert/update/DELETE a `authenticated`
-- em TABELA NOVA (conferido no banco em 08/09, ver migração ...070/...110).
-- Sem o revoke, as duas tabelas nasceriam com um caminho de escrita que
-- ninguém escreveu.

revoke all on gps.onboarding_respostas from public, anon;
revoke all on gps.onboarding_anexos    from public, anon;
revoke all on gps.onboarding_respostas from authenticated;
revoke all on gps.onboarding_anexos    from authenticated;
grant select on gps.onboarding_respostas to authenticated;
grant select on gps.onboarding_anexos    to authenticated;
-- ZERO grant para anon, em qualquer verbo.
