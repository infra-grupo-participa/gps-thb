-- Ficha do cliente ganha os 4 campos de PESSOA JURÍDICA (24/09/2026).
--
-- POR QUÊ
--   Reforma da ficha do cliente (plano do arquiteto, 24/09/2026). O cliente
--   do parceiro pode ser PJ, e hoje a ficha só tem nome e telefone — a razão
--   social, o CNPJ, o ramo de atividade e o regime tributário viviam em
--   caderno, planilha ou no `registro_contato` (texto livre). Quatro colunas
--   na PRÓPRIA ficha, não tabela nova: é 1-para-1 com o cliente (um cliente
--   tem UMA razão social), não há histórico de versões nem N linhas por
--   cliente — o argumento que criou `gps.cliente_minutas` (…259) não se
--   aplica aqui, e o molde certo é o de `contrato_url`/`grau_relacao`:
--   coluna nullable na ficha.
--
-- TODAS AS 4 SÃO NULLABLE, SEM DEFAULT, SEM BACKFILL
--   As 1.710 linhas existentes ficam com NULL = "não informado". Não existe
--   valor plausível para inventar: `razao_social` de um cliente PF não é
--   o `nome` (seria mentira gravada), e um `regime_tributario` default
--   afirmaria um fato tributário que ninguém apurou. NULL é a única resposta
--   honesta, e `not null` com default quebraria o cadastro de PF.
--   👉 Isto também é o que torna a migração barata: `add column` nullable
--   sem default NÃO reescreve a tabela no Postgres ≥ 11 — é troca de
--   catálogo, e o `ACCESS EXCLUSIVE` dura milissegundos.
--
-- SEM ÍNDICE — E ISSO É DECISÃO, NÃO ESQUECIMENTO
--   Nenhuma tela filtra, ordena ou agrupa por estas 4 colunas. O acesso à
--   ficha é por PK (`getClienteById` → `where id = $1`) e a lista do aluno é
--   por `aluno_id` (`etapa1_clientes_aluno_idx`, já existe). Índice em
--   coluna que nenhum WHERE toca é custo de escrita puro: cada INSERT/UPDATE
--   da ficha pagaria a manutenção de 4 B-trees para zero leitura. Se um dia
--   nascer uma busca por CNPJ, o índice entra COM o `explain analyze` da
--   query real — não especulativamente agora.
--   ⚠️ E não há UNIQUE em `cnpj` de propósito: dois parceiros DIFERENTES
--   podem ter o mesmo CNPJ na carteira (é o cliente deles, não é conta do
--   sistema), e até o mesmo parceiro pode ter duas fichas do mesmo CNPJ em
--   momentos diferentes. UNIQUE global recusaria cadastro legítimo.
--
-- CNPJ: SÓ 14 DÍGITOS, SEM DÍGITO VERIFICADOR — DECISÃO DO MARCIO
--   O CHECK é `~ '^[0-9]{14}$'`: guarda só a FORMA. A máscara
--   (00.000.000/0000-00) é da TELA (`mascaraCpfCnpj`, src/lib/masks.ts); o
--   banco guarda dígito puro, como todo campo de documento deste produto —
--   armazenar com máscara faria a mesma empresa ter duas representações.
--   🔴 A validação de DÍGITO VERIFICADOR fica FORA (decisão do Marcio,
--   24/09/2026), embora `cnpjValido` já exista em `src/lib/masks.ts`: a
--   ficha é cadastro de PROSPECT, e recusar um CNPJ digitado com um dígito
--   trocado impediria o parceiro de salvar o resto da ficha por causa de um
--   campo acessório. Se um dia virar exigência, o lugar é a validação da
--   Server Action (mensagem em português) e/ou uma função `IMMUTABLE`
--   chamada pelo CHECK — nunca uma subquery aqui (`0A000`: este banco não
--   aceita subquery em CHECK).
--
-- REGIME TRIBUTÁRIO: CHECK COM 3 VALORES, NÃO ENUM
--   `simples` | `presumido` | `real`. CHECK e não `create type ... as enum`
--   pelo mesmo motivo de `fase`/`grau_relacao`/`aluno_eventos.tipo` neste
--   banco: acrescentar valor a um ENUM é DDL que não volta atrás (não existe
--   `drop value`), enquanto reescrever um CHECK é uma linha reversível. O
--   rótulo de tela vive em `REGIMES_TRIBUTARIOS` (`src/lib/types.ts`), nunca
--   no banco.
--
-- TAMANHOS
--   `razao_social` 1..200 — o mesmo teto de `nome` (a action já recusa >200).
--   `ramo_atividade` 1..120 — texto curto de classificação, não descrição.
--   Os dois CHECKs aceitam NULL e recusam string VAZIA: campo esvaziado na
--   tela TEM de virar `null`, nunca `''` (a Server Action normaliza; o CHECK
--   é quem garante). `''` gravado seria "informado em branco", um terceiro
--   estado que nenhuma tela sabe mostrar.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ
--   Não toca RLS, policy, GRANT nem trigger de `gps.etapa1_clientes` — as 4
--   colunas entram no MESMO regime de escrita das demais colunas de
--   formulário (PostgREST, dono do ambiente, `PatchCliente`). Não são
--   `contrato_*` (aquelas têm trigger própria porque prometem que um arquivo
--   existe); estas são texto que o parceiro digita, como `registro_contato`.
--   Não cria tabela, não cria função, não cria bucket, não mexe no catálogo
--   de `gps.aluno_eventos.tipo` (editar a ficha não gera evento novo — o
--   diário já não registra edição de campo de texto da ficha).
--
-- REVERSÃO (uma linha, sem restore):
--   alter table gps.etapa1_clientes
--     drop column razao_social,
--     drop column cnpj,
--     drop column ramo_atividade,
--     drop column regime_tributario;
--   (os 4 CHECKs caem junto com as colunas — não precisam de drop próprio)

-- ═════════════════════════════════════════════════════════════════════════
-- 1. As 4 colunas — nullable, sem default
-- ═════════════════════════════════════════════════════════════════════════

alter table gps.etapa1_clientes
  add column if not exists razao_social      text,
  add column if not exists cnpj              text,
  add column if not exists ramo_atividade    text,
  add column if not exists regime_tributario text;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. Os 4 CHECKs — um por coluna, NUNCA um CHECK composto
-- ═════════════════════════════════════════════════════════════════════════
--
-- Um CHECK por coluna, e não um só com os 4 predicados: `traduzirErroBanco`
-- (`src/lib/erros.ts`) casa a frase pelo TEXTO do erro, e um CHECK composto
-- devolveria sempre o mesmo nome de constraint — o parceiro veria "CNPJ
-- inválido" ao errar o ramo de atividade. Mesmo argumento escrito na …273
-- (tamanho separado da forma).
--
-- Os 4 aceitam NULL explicitamente: `add constraint` em tabela com 1.710
-- linhas VALIDA as linhas existentes, e sem o `is null` a migração falharia
-- em cima de toda a base.

alter table gps.etapa1_clientes
  add constraint chk_etapa1_clientes_razao_social
  check (razao_social is null or char_length(razao_social) between 1 and 200);

alter table gps.etapa1_clientes
  add constraint chk_etapa1_clientes_cnpj
  check (cnpj is null or cnpj ~ '^[0-9]{14}$');

alter table gps.etapa1_clientes
  add constraint chk_etapa1_clientes_ramo_atividade
  check (ramo_atividade is null or char_length(ramo_atividade) between 1 and 120);

alter table gps.etapa1_clientes
  add constraint chk_etapa1_clientes_regime_tributario
  check (regime_tributario is null or regime_tributario in ('simples', 'presumido', 'real'));

-- ═════════════════════════════════════════════════════════════════════════
-- 3. Comentários — a documentação que sobrevive ao arquivo
-- ═════════════════════════════════════════════════════════════════════════

comment on column gps.etapa1_clientes.razao_social is
  'Razao social do cliente quando ele e PESSOA JURIDICA. NULL = nao informado (a maioria das 1710 fichas de 24/09/2026). NAO e o `nome` -- `nome` e como o parceiro chama o cliente (pode ser o nome do socio); este e o nome registrado na Receita. 1..200 caracteres, string vazia RECUSADA pelo CHECK (campo esvaziado na tela vira null na Server Action).';

comment on column gps.etapa1_clientes.cnpj is
  'CNPJ do cliente PJ, SO DIGITOS (14), sem pontuacao -- a mascara 00.000.000/0000-00 e da TELA (mascaraCpfCnpj, src/lib/masks.ts). O CHECK guarda a FORMA (^[0-9]{14}$), NAO o digito verificador: decisao do Marcio em 24/09/2026 -- ficha de prospect nao pode travar por um digito trocado. SEM UNIQUE: dois parceiros podem ter o mesmo CNPJ na carteira. NULL = nao informado.';

comment on column gps.etapa1_clientes.ramo_atividade is
  'Ramo de atividade do cliente (texto livre curto, 1..120). Classificacao de conversa, NAO CNAE -- nao ha catalogo fechado nem validacao contra tabela nenhuma. NULL = nao informado.';

comment on column gps.etapa1_clientes.regime_tributario is
  'Regime tributario do cliente PJ: simples | presumido | real (CHECK, catalogo fechado). CHECK e nao ENUM de proposito -- acrescentar valor a um ENUM nao tem volta, reescrever um CHECK e uma linha. Os rotulos de tela vivem em REGIMES_TRIBUTARIOS (src/lib/types.ts), nunca no banco. NULL = nao informado.';

-- ═════════════════════════════════════════════════════════════════════════
-- 4. ROTEIRO DE PROVA — a colar depois de aplicar (Marcio roda)
-- ═════════════════════════════════════════════════════════════════════════
--
-- ⚠️ NENHUM plano abaixo foi executado por quem escreveu esta migração: o
-- executor NÃO tem acesso ao banco. Os blocos `-- a colar:` ficam VAZIOS até
-- a medição real — não preencher com plano plausível.
--
-- ⚠️ `explain analyze` em UPDATE/DELETE EXECUTA o comando (memória de
-- 15/09/2026, SIC-HF). As provas 3 e 4 abaixo escrevem: rodar DENTRO de
-- `begin; ... rollback;` numa STRING ÚNICA (o MCP do Supabase é AUTOCOMMIT;
-- `begin` e `rollback` em chamadas separadas NÃO protegem).
--
-- ── P1. Contagem antes/depois: tem de dar 1710 nos dois lados ───────────
--   select count(*) from gps.etapa1_clientes;
--   -- esperado: 1710  (add column nullable não cria nem apaga linha)
--   -- a colar:
--
-- ── P2. O caminho quente da ficha continua Index Scan por PK ────────────
--   explain (analyze, buffers)
--   select id, aluno_id, nome, telefone, razao_social, cnpj, ramo_atividade,
--          regime_tributario
--     from gps.etapa1_clientes
--    where id = '<um id real de gps.etapa1_clientes>';
--   -- esperado: Index Scan using etapa1_clientes_pkey, 1 linha,
--   --           Rows Removed by Filter = 0.
--   -- 🔑 é a query de getClienteById com as 4 colunas novas: prova que
--   --    acrescentar coluna não mudou o plano de acesso da ficha.
--   -- a colar:
--
-- ── P3. A lista do aluno NÃO regride (é o caminho de 1.710 linhas) ──────
--   explain (analyze, buffers)
--   select id, aluno_id, nome, telefone, fase
--     from gps.etapa1_clientes
--    where aluno_id = '<um aluno_id real com muitos clientes>'
--    order by ordem, criado_em;
--   -- esperado: Index Scan / Bitmap Index Scan em etapa1_clientes_aluno_idx.
--   -- 🔑 a lista NÃO lê as 4 colunas novas (COLUNAS_CLIENTE_LISTA, fatia 2):
--   --    este plano é a linha de base para provar isso.
--   -- a colar:
--
-- ── P4. Os 4 CHECKs recusam o que têm de recusar (EM ROLLBACK) ──────────
--   begin;
--     -- cada um destes 5 tem de levantar 23514:
--     update gps.etapa1_clientes set cnpj = '12.345.678/0001-90' where id = '<id>';
--     update gps.etapa1_clientes set cnpj = '1234567890123'      where id = '<id>';
--     update gps.etapa1_clientes set razao_social = ''           where id = '<id>';
--     update gps.etapa1_clientes set ramo_atividade = ''         where id = '<id>';
--     update gps.etapa1_clientes set regime_tributario = 'mei'   where id = '<id>';
--     -- e este tem de PASSAR:
--     update gps.etapa1_clientes
--        set razao_social = 'ACME Servicos Ltda', cnpj = '12345678000190',
--            ramo_atividade = 'Comercio varejista', regime_tributario = 'simples'
--      where id = '<id>';
--   rollback;
--   -- a colar:
--
-- ── P5. Definição VIVA dos 4 CHECKs (a verdade é o banco, não este arquivo)
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conrelid = 'gps.etapa1_clientes'::regclass
--      and conname in ('chk_etapa1_clientes_razao_social',
--                      'chk_etapa1_clientes_cnpj',
--                      'chk_etapa1_clientes_ramo_atividade',
--                      'chk_etapa1_clientes_regime_tributario')
--    order by conname;
--   -- a colar:
--
-- ── P6. Nenhum índice novo nasceu (a decisão "sem índice" é auditável) ──
--   select indexname, indexdef from pg_indexes
--    where schemaname = 'gps' and tablename = 'etapa1_clientes'
--    order by indexname;
--   -- esperado: a MESMA lista de antes desta migração (nenhum índice com
--   --           razao_social/cnpj/ramo_atividade/regime_tributario).
--   -- a colar:
--
-- ── P7. GRANT não mudou (add column não concede nada, mas se prova) ─────
--   select grantee, string_agg(privilege_type, ', ' order by privilege_type)
--     from information_schema.role_table_grants
--    where table_schema = 'gps' and table_name = 'etapa1_clientes'
--    group by grantee order by grantee;
--   -- esperado: o MESMO de antes (authenticated com DELETE/INSERT/SELECT/
--   --           UPDATE — é a tabela de escrita direta do aluno, sob RLS).
--   -- a colar:

-- ---------------------------------------------------------------------------
-- RESULTADOS MEDIDOS (24/09/2026 ~14:30 UTC, migração inteira dentro de
-- begin … rollback no banco de produção, ANTES de aplicar). Cobrem P1, P2,
-- P4, P6 e P7 do roteiro acima; P3 (lista por aluno_id) não muda porque a
-- lista usa COLUNAS_CLIENTE_LISTA, sem as 4 colunas; P5 é o texto dos CHECKs
-- desta própria migração.
--
-- P1  count(*) from gps.etapa1_clientes ................ 1710 (antes = depois)
-- P2  explain (analyze, buffers) da ficha por PK, com as 4 colunas novas:
--     Index Scan using etapa1_clientes_pkey on etapa1_clientes
--       (cost=0.28..2.50 rows=1 width=193) (actual time=0.027..0.028 rows=1 loops=1)
--       Index Cond: (id = '…'::uuid)   Buffers: shared hit=3
--     Planning Time: 0.189 ms   Execution Time: 0.042 ms
-- P4  CHECKs (em do-block, exception when check_violation):
--     cnpj '123' → recusado · cnpj com máscara → recusado · razao_social '' →
--     recusado · regime 'lucro' → recusado · ramo 121 chars → recusado ·
--     linha válida (cnpj 14 dígitos, razão, presumido, ramo) → gravou.
-- P6  pg_indexes de etapa1_clientes ................ 3 (pkey, aluno_idx,
--     unico_equipe) — nenhum índice novo.
-- P7  role_table_grants de etapa1_clientes inalterado:
--     authenticated=INSERT,DELETE,UPDATE,SELECT · disparos_app=SELECT ·
--     service_role/postgres=tudo (a RLS é quem governa, como antes).
-- ---------------------------------------------------------------------------
