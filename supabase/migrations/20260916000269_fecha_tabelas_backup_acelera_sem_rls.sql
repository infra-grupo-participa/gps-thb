-- 🔴 VAZAMENTO ATIVO DE DADO PESSOAL — fechado em 16/09/2026.
--
-- ⚠️ ESTA MIGRAÇÃO MEXE EM `public`, NÃO EM `gps`.
--    As tabelas são sobra da migração do Acelera (28/08/2026) e não pertencem
--    ao GPS — mas vivem no MESMO banco, e o achado saiu de uma varredura de
--    segurança feita a partir daqui. Fica versionada neste repo porque é
--    daqui que ela foi aplicada; se o `sistema-grupo-participa` quiser
--    assumir, é só mover o arquivo.
--
-- O PROBLEMA, medido com a chave `anon` pública (a mesma que vai no
-- JavaScript de qualquer página), SEM login:
--
--   public.acelera_backup_28082026  → 299 linhas (Content-Range: 0-298/299)
--     colunas: legado_documento (CPF), nome_comprador, email_comprador,
--              telefone_comprador, responsavel_nome
--   public.acelera_movidos_28082026 → 1.286 linhas (0-1285/1286)
--     coluna: email
--   public._tmp_acelera_compradores → 0 linhas (vazia, mas aberta igual)
--
-- Total: 1.585 linhas com dado pessoal de compradores acessíveis a qualquer
-- um que tivesse a chave pública. Ficaram assim por 19 dias.
--
-- 🔑 A CLASSE DO PROBLEMA, para não repetir: migração deixa sobra, e sobra em
--    `public` nasce SEM RLS. Os próprios nomes denunciavam (`_backup_DDMMAAAA`,
--    `_tmp_`). Ninguém volta para limpar, e ninguém revisa uma tabela que
--    "não é do sistema".
--
-- CONFERIDO ANTES DE APLICAR (nada depende delas):
--   - nenhum arquivo do repo do GPS as menciona (grep em src/ e supabase/)
--   - nenhuma função no banco as cita (pg_proc.prosrc)
--   - nenhuma view as cita (pg_views.definition)
--   - nenhuma FK aponta para elas (pg_constraint contype='f')
--
-- CONFERIDO DEPOIS: as três devolvem `[]` para a chave anon; os dados seguem
-- íntegros para service_role/postgres (299 / 1.286 / 0 preservados).
--
-- RLS ligada SEM policy = ninguém lê pela API e o backup continua existindo.
-- É o passo reversível. Apagar de vez é decisão do Marcio, separada.
--
-- REVERSÃO: alter table public.<tabela> disable row level security;

alter table public.acelera_backup_28082026  enable row level security;
alter table public.acelera_movidos_28082026 enable row level security;
alter table public._tmp_acelera_compradores enable row level security;

comment on table public.acelera_backup_28082026 is
  'BACKUP da migracao do Acelera (28/08/2026). RLS ligada SEM policy em 16/09/2026: estava aberta a anon com 299 linhas de CPF/nome/email/telefone. Nao e lida por nenhum sistema (conferido em pg_proc, pg_views e FKs). Candidata a DROP quando o Marcio confirmar que o backup nao serve mais.';

comment on table public.acelera_movidos_28082026 is
  'BACKUP da migracao do Acelera (28/08/2026). RLS ligada SEM policy em 16/09/2026: estava aberta a anon com 1.286 linhas contendo email. Nao e lida por nenhum sistema. Candidata a DROP.';

comment on table public._tmp_acelera_compradores is
  'Tabela TEMPORARIA da migracao do Acelera (28/08/2026), VAZIA. RLS ligada em 16/09/2026 pelo mesmo motivo das irmas. Candidata a DROP imediato -- nao tem dado nenhum.';
