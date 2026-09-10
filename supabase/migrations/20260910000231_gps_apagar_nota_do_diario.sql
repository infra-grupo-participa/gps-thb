-- Apagar nota do Diário — a única exceção ao append-only, e ela é nominal.
--
-- Pedido do Marcio (10/09/2026): "tem que ser possível apagar a nota, somente
-- marcio@advmais.com, elaine@advmais.com e isabela@advmais.com podem apagar a
-- nota do histórico do aluno".
--
-- 🔴 POR QUE ISTO É UMA EXCEÇÃO, E NÃO UMA FEATURE COMUM
--   `gps.aluno_notas` nasceu APPEND-ONLY (migração 20260908000001): só
--   `resolvido_em`/`resolvido_por` são editáveis, e não existe policy de
--   delete. A razão era LGPD — o texto livre pode conter dado pessoal de
--   TERCEIRO (cliente do aluno, situação familiar, valor de patrimônio).
--
--   O mesmo motivo que fez a tabela ser append-only é o que agora exige o
--   delete: quando alguém pede para apagar dado pessoal de terceiro, deixar
--   a linha no banco marcada como "apagada" NÃO cumpre o pedido. Por isso é
--   DELETE de verdade, não soft-delete.
--
-- 🔑 A LISTA VIVE EM `gps.config`, NÃO NO CORPO DA FUNÇÃO
--   `notas_podem_apagar` = os três e-mails. Trocar quem apaga vira um update,
--   sem deploy e sem migration.
--
--   FALHA FECHADA: lista vazia (ou chave ausente) = NINGUÉM apaga. Se a
--   configuração sumir, a função para de apagar em vez de liberar para todo
--   admin — o inverso seria um interruptor de segurança que abre quando
--   quebra.
--
-- 🔑 A NOTA SOME; O FATO DE TER SUMIDO, NÃO
--   Cada delete grava `nota_apagada` em `gps.aluno_eventos`: quem apagou,
--   quando, de qual aluno e quando a nota tinha sido criada. Sem isso,
--   apagar seria invisível — e o Diário é justamente a memória da equipe
--   sobre o aluno.
--
-- ⚠️ O CHECK DO CATÁLOGO precisou de duas linhas novas (`nota_apagada` no
--    tipo, `nota` na entidade). Sem elas a função falharia com 23514 na
--    PRIMEIRA chamada — pego pela prova em rollback, não pelo build. É a
--    segunda vez hoje que um CHECK de catálogo me pega; a lição está no
--    cabeçalho da migração ...227.
--
-- PROVA (rollback, JWT real):
--   admin FORA da lista  -> recusou 42501
--   marcio@advmais.com   -> nota apagada, 1 evento `nota_apagada` gravado
--
-- REVERSÃO
--   drop function gps.admin_apagar_nota(uuid);
--   delete from gps.config where chave = 'notas_podem_apagar';
--   (o CHECK pode ficar — aceitar um tipo a mais não quebra nada)

insert into gps.config (chave, valor)
values ('notas_podem_apagar',
        'marcio@advmais.com,elaine@advmais.com,isabela@advmais.com')
on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();

alter table gps.aluno_eventos drop constraint if exists aluno_eventos_tipo_check;
alter table gps.aluno_eventos add constraint aluno_eventos_tipo_check
  check (tipo = any (array[
    'cliente_cadastrado','cliente_favoritado','cliente_desfavoritado',
    'cliente_status_mudou','cliente_fase_mudou','cliente_mensagem_padrao',
    'cliente_estudo_caso','cliente_ligacao','cliente_aderiu_reuniao',
    'cliente_reuniao_agendada','cliente_excluido','cliente_honorarios_definidos',
    'tarefa_concluida','tarefa_reaberta','conta_criada','email_confirmado',
    'primeiro_acesso','entrou_no_programa','etapa_liberada_pela_equipe',
    'etapa_travada_pela_equipe','onboarding_iniciado','onboarding_concluido',
    'favorito_confirmado_pela_equipe','favorito_liberado_pela_equipe',
    'cliente_contrato_anexado','cliente_contrato_removido',
    'nota_apagada']));

alter table gps.aluno_eventos drop constraint if exists aluno_eventos_entidade_check;
alter table gps.aluno_eventos add constraint aluno_eventos_entidade_check
  check (entidade = any (array['cliente','tarefa','conta','etapa','onboarding','nota']));

create or replace function gps.admin_apagar_nota(p_nota_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
declare
  v_email text;
  v_lista text;
  v_nota gps.aluno_notas%rowtype;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  select lower(btrim(u.email)) into v_email from auth.users u where u.id = auth.uid();
  select lower(btrim(c.valor)) into v_lista from gps.config c
   where c.chave = 'notas_podem_apagar';

  -- Falha FECHADA: sem lista, ninguém apaga.
  if coalesce(v_email, '') = ''
     or coalesce(v_lista, '') = ''
     or not (v_email = any (string_to_array(v_lista, ','))) then
    raise exception 'Só Marcio, Elaine e Isabela podem apagar notas do diário.'
      using errcode = '42501';
  end if;

  select * into v_nota from gps.aluno_notas n where n.id = p_nota_id;
  if not found then
    raise exception 'Nota não encontrada.' using errcode = 'P0002';
  end if;

  delete from gps.aluno_notas where id = p_nota_id;

  insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id,
                                 rotulo, detalhe, ator, ator_user_id, origem)
  values (v_nota.aluno_id, now(), 'nota_apagada', 'nota', p_nota_id,
          'Apagou uma nota do diário',
          jsonb_build_object('por', v_email, 'criada_em', v_nota.criado_em),
          'equipe', auth.uid(), 'app');

  return jsonb_build_object('ok', true, 'aluno_id', v_nota.aluno_id);
end;
$fn$;

comment on function gps.admin_apagar_nota(uuid) is
  'Apaga uma nota do Diario. UNICA excecao ao append-only de gps.aluno_notas. So os e-mails em gps.config.notas_podem_apagar (falha fechada: lista vazia = ninguem apaga). O evento nota_apagada registra quem e quando -- a nota some, o fato de ter sumido nao.';

revoke all on function gps.admin_apagar_nota(uuid) from public, anon;
grant execute on function gps.admin_apagar_nota(uuid) to authenticated;
