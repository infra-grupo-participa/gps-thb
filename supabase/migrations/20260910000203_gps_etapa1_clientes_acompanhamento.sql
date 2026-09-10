-- Mega feature — a equipe CONFIRMA que está acompanhando um cliente, e a
-- partir daí o aluno não troca mais a estrela.
--
-- Pedido literal do João: "O cliente favoritado não pode ser alterado sem o
-- consentimento da equipe. A equipe ao marcar que ele está acompanhando, o
-- aluno não pode alterar mais."
--
-- POR QUE DUAS COLUNAS E NÃO UMA TRAVA A MAIS
--   `acompanhado_equipe` (boolean) guarda HOJE dois conceitos ao mesmo tempo:
--     1. "foi este que EU escolhi para a equipe acompanhar" — escolha do
--        aluno, reversível, destrava os passos 4–8 da Etapa 01;
--     2. "a equipe ACEITOU e está acompanhando" — que não existe em lugar
--        nenhum.
--   O pedido é o (2). Isto não é uma trava a mais; é o segundo conceito
--   ganhando nome próprio. `acompanhamento_confirmado_em is null` = o aluno é
--   dono da estrela (comportamento de hoje); preenchido = a equipe está
--   acompanhando.
--
-- BACKFILL: ZERO. Os 25 favoritos de hoje nascem NÃO confirmados — ninguém
--   perde um direito no dia 1, sem aviso. A equipe confirma um a um, na ficha
--   do cliente, com motivo obrigatório.
--
-- A TRAVA É DO BANCO, NÃO DA TELA
--   Server Action é endpoint HTTP e `authenticated` tem `update`/`delete` em
--   gps.etapa1_clientes (a RLS deixa o dono do ambiente escrever). Uma trava
--   só na UI seria promessa. Trigger BEFORE UPDATE OR DELETE, no molde do
--   `trg_etapa1_clientes_status_congelado` (...062), levantando 42501 com
--   frase NOSSA (as 4 frases estão em FRASES_DO_BANCO, src/lib/erros.ts).
--
--   ⚠️ `not coalesce(public.gp_is_admin(), false)`: `gp_is_admin()` devolve
--   NULL sem sessão, e `if not NULL` não dispara — a guarda falharia ABERTO.
--   É literalmente o furo que `gps.etapa_liberada_para` teve em 09/09.
--
--   ⚠️ A trava cobre TAMBÉM a escrita nas duas colunas novas. Sem isso, o
--   aluno chamaria o PostgREST com `{acompanhamento_confirmado_em: null}` e a
--   trava sumiria sozinha — a proibição vale mesmo quando ainda não há
--   confirmação (ninguém "se confirma" para a equipe).
--
--   O QUE CONTINUA LIVRE com o favorito confirmado: telefone, registro de
--   contato, perda pela inércia, DISC, honorários, problemas, nome, grau de
--   relação, ordem — a ficha inteira. A trava é do VÍNCULO (a estrela, a
--   exclusão da linha e a volta para `prospeccao`), não da ficha.
--
-- CONVIVÊNCIA COM AS OUTRAS 3 TRIGGERS (medido, M4 da Onda 0):
--   trg_aluno_eventos_etapa1_clientes    AFTER  insert/update/delete (captura)
--   trg_etapa1_clientes_status_congelado BEFORE update OF status
--   trg_etapa1_clientes_touch            BEFORE update
--   A nova é BEFORE update or delete e se chama
--   `trg_etapa1_clientes_acompanhamento_travado` — em BEFORE, o Postgres
--   dispara por ordem alfabética de nome, então ela roda ANTES das outras
--   duas. Nenhuma delas escreve nas colunas que a outra vigia, e nenhuma
--   cancela linha (todas devolvem NEW/OLD ou levantam). A de captura é AFTER e
--   não vê nada disto.
--
--   🔑 A captura NÃO grava evento por causa destas colunas (ela só olha
--   acompanhado_equipe, status, mensagem_padrao, estudo_caso, ligacao,
--   aderiu_reuniao e data_reuniao_preliminar). Por isso as RPCs abaixo gravam
--   o próprio evento — sem risco de duplicar.
--
-- REVERSÃO (nesta ordem):
--   drop trigger trg_etapa1_clientes_acompanhamento_travado on gps.etapa1_clientes;
--   drop function gps.etapa1_clientes_acompanhamento_travado();
--   drop function gps.admin_confirmar_acompanhamento(uuid, text);
--   drop function gps.admin_liberar_acompanhamento(uuid, text);
--   alter table gps.etapa1_clientes
--     drop column acompanhamento_confirmado_em,
--     drop column acompanhamento_confirmado_por;
--   -- Soltar a trava SEM perder o registro: basta dropar a trigger. As
--   -- colunas continuam contando quem confirmou e quando.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Colunas
-- ─────────────────────────────────────────────────────────────────────────

alter table gps.etapa1_clientes
  add column if not exists acompanhamento_confirmado_em  timestamptz;

-- `on delete set null`, NÃO `restrict`: gps.admin_excluir_acesso apaga linha
-- de auth.users, e com restrict excluir o acesso de quem confirmou passaria a
-- falhar com 23503 — travando o caminho oficial de destravar gente por causa
-- de um rastro. Quem confirmou é informação útil, não pode virar catraca.
alter table gps.etapa1_clientes
  add column if not exists acompanhamento_confirmado_por uuid
    references auth.users(id) on delete set null;

comment on column gps.etapa1_clientes.acompanhamento_confirmado_em is
  'NULL = o ALUNO e dono da estrela (comportamento de sempre; os 25 favoritos de 10/09/2026 nascem assim, backfill zero). PREENCHIDO = a EQUIPE confirmou que esta acompanhando este cliente: o aluno nao troca a estrela, nao apaga o cliente e nao volta a fase para prospeccao (trigger trg_etapa1_clientes_acompanhamento_travado, 42501). O resto da ficha continua livre. So gps.admin_confirmar_acompanhamento/gps.admin_liberar_acompanhamento escrevem aqui.';
comment on column gps.etapa1_clientes.acompanhamento_confirmado_por is
  'auth.users de quem confirmou. `on delete set null` de proposito: gps.admin_excluir_acesso apaga linha de auth.users e um restrict aqui travaria esse caminho.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. A trava
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.etapa1_clientes_acompanhamento_travado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Admin passa por tudo: é ele quem confirma, libera e conserta.
  -- `coalesce(..., false)`: sem sessão gp_is_admin() é NULL e `if not NULL`
  -- não dispararia — a guarda falharia ABERTO.
  if coalesce(public.gp_is_admin(), false) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Daqui para baixo: NÃO é admin.

  -- (a) as duas colunas do vínculo são só da equipe, SEMPRE — inclusive
  -- quando ainda não há confirmação. Sem isto, `{acompanhamento_confirmado_em:
  -- null}` pela API derrubaria a própria trava.
  if tg_op = 'UPDATE'
     and (new.acompanhamento_confirmado_em  is distinct from old.acompanhamento_confirmado_em
       or new.acompanhamento_confirmado_por is distinct from old.acompanhamento_confirmado_por)
  then
    raise exception 'Só a equipe confirma ou libera o acompanhamento deste cliente.'
      using errcode = '42501';
  end if;

  -- Sem confirmação, nada muda: o aluno segue dono da estrela.
  if old.acompanhamento_confirmado_em is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- (b) cliente CONFIRMADO pela equipe.
  if tg_op = 'DELETE' then
    raise exception 'A equipe está acompanhando este cliente — ele não pode ser excluído.'
      using errcode = '42501';
  end if;

  if old.acompanhado_equipe and not new.acompanhado_equipe then
    raise exception 'A equipe está acompanhando este cliente — só a equipe pode trocar o cliente acompanhado.'
      using errcode = '42501';
  end if;

  if new.fase = 'prospeccao' and old.fase is distinct from 'prospeccao' then
    raise exception 'A equipe está acompanhando este cliente — a fase não pode voltar para Prospecção.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function gps.etapa1_clientes_acompanhamento_travado() is
  'BEFORE UPDATE OR DELETE em gps.etapa1_clientes. Recusa com 42501, para quem NAO e admin: (a) qualquer escrita em acompanhamento_confirmado_em/_por, sempre; e, quando o cliente esta CONFIRMADO pela equipe, (b) desmarcar a estrela, (c) apagar a linha e (d) voltar a fase para prospeccao. Todo o resto da ficha continua livre -- a trava e do VINCULO, nao da ficha. Guarda com coalesce(gp_is_admin(), false): sem sessao a funcao devolve NULL e a trava falharia ABERTO (licao de gps.etapa_liberada_para, 09/09/2026). As 4 frases estao em FRASES_DO_BANCO (src/lib/erros.ts); sem elas o aluno leria uma frase generica de 42501.';

drop trigger if exists trg_etapa1_clientes_acompanhamento_travado on gps.etapa1_clientes;
create trigger trg_etapa1_clientes_acompanhamento_travado
  before update or delete on gps.etapa1_clientes
  for each row execute function gps.etapa1_clientes_acompanhamento_travado();

-- ─────────────────────────────────────────────────────────────────────────
-- 3. gps.admin_confirmar_acompanhamento
-- ─────────────────────────────────────────────────────────────────────────
--
-- CASA DE ORIGEM: a ficha do cliente no Modo Assistência — é onde o admin já
-- está olhando o cliente. A Central mostra a linha de diagnóstico com LINK
-- para a ficha; a regra da Central é "nenhuma segunda porta para escrita que
-- já existe".
--
-- EXIGE QUE O CLIENTE JÁ SEJA O FAVORITO. Confirmar acompanhamento de um
-- cliente que não é a estrela criaria um terceiro estado ("a equipe acompanha
-- um, o aluno escolheu outro") que nenhuma tela sabe mostrar. O admin pode
-- marcar a estrela antes (ele não é barrado pela trava) e então confirmar.

create or replace function gps.admin_confirmar_acompanhamento(
  p_cliente_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_c record; v_motivo text;
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_cliente_id is null then
    raise exception 'cliente nao informado' using errcode = '22023';
  end if;
  v_motivo := btrim(coalesce(p_motivo, ''));
  if length(v_motivo) < 3 then
    raise exception 'Escreva o motivo — a trilha deste aluno vai registrar.'
      using errcode = '22023';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
  end if;

  select c.id, c.aluno_id, c.nome, c.acompanhado_equipe, c.acompanhamento_confirmado_em
    into v_c
    from gps.etapa1_clientes c
   where c.id = p_cliente_id;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if not v_c.acompanhado_equipe then
    raise exception 'Este cliente não é o cliente acompanhado deste aluno. Marque a estrela antes de confirmar.'
      using errcode = '22023';
  end if;
  if v_c.acompanhamento_confirmado_em is not null then
    raise exception 'A equipe já está acompanhando este cliente.' using errcode = '22023';
  end if;

  update gps.etapa1_clientes
     set acompanhamento_confirmado_em  = now(),
         acompanhamento_confirmado_por = auth.uid()
   where id = p_cliente_id;

  -- Log de ação administrativa. `detalhe` leva o motivo (texto da EQUIPE) e
  -- NUNCA o nome do cliente do aluno, que é dado de terceiro.
  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('favorito_confirmado', v_c.aluno_id,
          format('cliente %s confirmado como acompanhado pela equipe. Motivo: %s',
                 p_cliente_id, v_motivo),
          auth.uid());

  -- Evento na trilha do aluno. `ator = 'equipe'` explícito: a trigger de
  -- captura resolve o ator por gp_is_admin() e chegaria ao mesmo valor, mas
  -- ela não olha estas colunas — este insert é o único.
  -- `left(..., 300)`: o CHECK de `rotulo` é 1..300 e `nome` é `text` sem limite.
  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_c.aluno_id, now(), 'favorito_confirmado_pela_equipe', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('motivo', v_motivo), 'equipe', auth.uid(), 'app');

  return jsonb_build_object('cliente_id', p_cliente_id, 'aluno_id', v_c.aluno_id,
                            'confirmado', true);
end $function$;

comment on function gps.admin_confirmar_acompanhamento(uuid, text) is
  'A EQUIPE assume o acompanhamento do cliente favoritado: carimba acompanhamento_confirmado_em/_por e, com isso, o aluno deixa de poder trocar a estrela, apagar o cliente e voltar a fase para prospeccao (trigger trg_etapa1_clientes_acompanhamento_travado). Exige que o cliente JA seja o favorito -- confirmar um que nao e a estrela criaria um terceiro estado que nenhuma tela sabe mostrar. Motivo obrigatorio (3..300), que vai para gps.acessos_log (favorito_confirmado) e para o evento favorito_confirmado_pela_equipe na trilha. gp_is_admin() ou 42501.';

revoke execute on function gps.admin_confirmar_acompanhamento(uuid, text) from public, anon;
grant  execute on function gps.admin_confirmar_acompanhamento(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. gps.admin_liberar_acompanhamento — o caminho de volta
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.admin_liberar_acompanhamento(
  p_cliente_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_c record; v_motivo text;
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_cliente_id is null then
    raise exception 'cliente nao informado' using errcode = '22023';
  end if;
  v_motivo := btrim(coalesce(p_motivo, ''));
  if length(v_motivo) < 3 then
    raise exception 'Escreva o motivo — a trilha deste aluno vai registrar.'
      using errcode = '22023';
  end if;
  if length(v_motivo) > 300 then
    raise exception 'O motivo passa de 300 caracteres.' using errcode = '22023';
  end if;

  select c.id, c.aluno_id, c.nome, c.acompanhamento_confirmado_em
    into v_c
    from gps.etapa1_clientes c
   where c.id = p_cliente_id;
  if not found then
    raise exception 'Cliente não encontrado.' using errcode = 'P0002';
  end if;
  if v_c.acompanhamento_confirmado_em is null then
    raise exception 'A equipe não está acompanhando este cliente.' using errcode = '22023';
  end if;

  -- Solta a trava e NÃO mexe na estrela: liberar é devolver a escolha ao
  -- aluno, não desfazer a escolha dele. Desmarcar aqui travaria os passos
  -- 4–8 da Etapa 01 de quem não pediu nada.
  update gps.etapa1_clientes
     set acompanhamento_confirmado_em  = null,
         acompanhamento_confirmado_por = null
   where id = p_cliente_id;

  insert into gps.acessos_log (acao, aluno_id, detalhe, feito_por)
  values ('favorito_liberado', v_c.aluno_id,
          format('cliente %s liberado: o aluno volta a poder trocar o cliente acompanhado. Motivo: %s',
                 p_cliente_id, v_motivo),
          auth.uid());

  insert into gps.aluno_eventos
    (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values
    (v_c.aluno_id, now(), 'favorito_liberado_pela_equipe', 'cliente', p_cliente_id,
     left(coalesce(nullif(btrim(v_c.nome), ''), 'Cliente sem nome'), 300),
     jsonb_build_object('motivo', v_motivo), 'equipe', auth.uid(), 'app');

  return jsonb_build_object('cliente_id', p_cliente_id, 'aluno_id', v_c.aluno_id,
                            'confirmado', false);
end $function$;

comment on function gps.admin_liberar_acompanhamento(uuid, text) is
  'Devolve ao ALUNO o direito de trocar o cliente acompanhado: zera acompanhamento_confirmado_em/_por. NAO desmarca a estrela -- liberar e devolver a escolha, nao desfaze-la (desmarcar travaria os passos 4-8 da Etapa 01 de quem nao pediu nada). Motivo obrigatorio (3..300), log favorito_liberado e evento favorito_liberado_pela_equipe. gp_is_admin() ou 42501.';

revoke execute on function gps.admin_liberar_acompanhamento(uuid, text) from public, anon;
grant  execute on function gps.admin_liberar_acompanhamento(uuid, text) to authenticated;
