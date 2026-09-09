-- Retenção do anexo de chamado: 180 dias após o FECHAMENTO (B6).
--
-- 🔴 POR QUE NÃO É pg_cron: apagar a linha de storage.objects por SQL NÃO apaga
-- o arquivo no object store. Um job SQL reportaria sucesso e deixaria os bytes
-- lá -- o pior modo de falha possível para uma rotina de retenção (a planilha
-- diz que apagou, o arquivo continua). O expurgo REAL exige a Storage API, que
-- exige uma sessão autenticada; o GPS não usa service_role e a única sessão
-- legítima disponível é a do admin no navegador. Por isso o expurgo é um BOTÃO
-- em /admin/chamados, com contador que não some enquanto houver o que expurgar.
-- Se um dia service_role for autorizado, o job chama estas MESMAS duas funções.
--
-- A DIVISÃO DE TRABALHO (e a ordem, que importa): esta migração só LISTA e só
-- CARIMBA. Quem apaga o byte é a action `expurgarAnexo`
-- (src/app/admin/chamados/actions.ts), que faz `storage.remove([path])` PRIMEIRO
-- e só então chama `gps.chamado_anexo_marcar_expurgado`. Carimbar antes e falhar
-- o delete deixaria o arquivo vivo com a tela dizendo que sumiu.
--
-- 180 dias é decisão reversível: trocar o interval e reaplicar a função. O
-- Plantão expurga evento em 90 -- não herdado de propósito: evento de plantão é
-- telemetria, anexo de chamado é a prova de um problema que pode voltar. E o
-- prazo de REABERTURA do chamado é 7 dias (...111): cabe folgado aqui dentro,
-- então nunca se reabre uma thread com o arquivo já apagado.
--
-- ÓRFÃO: o aluno sobe o arquivo ANTES de enviar a mensagem (é o que torna a
-- abertura um INSERT atômico). Se ele desistir, o objeto fica sem linha. E
-- gps.admin_excluir_acesso apaga os chamados (migração ...114), deixando os
-- anexos órfãos também. Os dois casos caem no mesmo lugar, com motivo='orfao' e
-- corte de 24h -- o corte existe para não listar como órfão o arquivo que
-- acabou de subir e cuja mensagem ainda está sendo escrita.
--
-- 🔴 DEPENDÊNCIA DE PRIVILÉGIO: a lista de órfãos lê `storage.objects`. Conferir
-- `select has_table_privilege('postgres','storage.objects','select')` antes de
-- aplicar. Se faltar, a função levanta o erro do Postgres e a TELA MOSTRA O ERRO
-- -- de propósito: uma lista de expurgo que devolve vazio por falta de
-- privilégio é exatamente a falha silenciosa que esta feature proíbe.
--
-- O QUE ESTA MIGRAÇÃO NÃO FAZ: não apaga arquivo (não consegue), não apaga
-- linha de mensagem (o histórico da conversa FICA: a tela diz "removido por
-- retenção em dd/mm"), não agenda nada, não cria índice.
--
-- REVERSÃO: drop das 2 funções. Nada é apagado por elas sozinhas.

create or replace function gps.chamados_anexos_para_expurgo()
returns table (
  mensagem_id uuid,          -- null quando motivo='orfao'
  chamado_id  uuid,          -- null quando motivo='orfao'
  aluno_id    uuid,          -- null quando motivo='orfao'
  path        text,
  motivo      text,          -- 'retencao' | 'orfao'
  referencia  timestamptz    -- fechado_em (retencao) | created_at (orfao)
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.gp_is_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;

  return query
    select m.id, c.id, c.aluno_id, m.anexo_path, 'retencao'::text, c.fechado_em
      from gps.chamado_mensagens m
      join gps.chamados c on c.id = m.chamado_id
     where m.anexo_path is not null
       and m.anexo_expurgado_em is null
       and c.status = 'fechado'
       and c.fechado_em < now() - interval '180 days'
    union all
    select null::uuid, null::uuid, null::uuid, o.name, 'orfao'::text, o.created_at
      from storage.objects o
     where o.bucket_id = 'gps-chamados'
       and o.created_at < now() - interval '24 hours'
       and not exists (select 1 from gps.chamado_mensagens m2
                        where m2.anexo_path = o.name)
     order by 6;
end;
$$;

comment on function gps.chamados_anexos_para_expurgo() is
  'Lista o que PODE ser apagado do bucket gps-chamados: anexo de chamado fechado ha mais de 180 dias (motivo=retencao) e objeto sem mensagem correspondente com mais de 24h (motivo=orfao). So-admin, so LEITURA -- quem apaga o byte e a Storage API com a sessao do admin. Sem indice dedicado de proposito: roda sob demanda sobre tabela da ordem de centenas de linhas.';

revoke execute on function gps.chamados_anexos_para_expurgo() from public, anon;
grant  execute on function gps.chamados_anexos_para_expurgo() to authenticated;

create or replace function gps.chamado_anexo_marcar_expurgado(p_mensagem_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.gp_is_admin() then
    raise exception 'apenas administradores' using errcode = '42501';
  end if;

  -- Idempotente e restrito: só carimba mensagem que TEM anexo e que ainda não
  -- foi carimbada. `anexo_path` e `anexo_nome` FICAM -- a tela precisa dizer
  -- QUAL arquivo sumiu, senão a thread mente por omissão.
  update gps.chamado_mensagens
     set anexo_expurgado_em = now()
   where id = p_mensagem_id
     and anexo_path is not null
     and anexo_expurgado_em is null;
end;
$$;

comment on function gps.chamado_anexo_marcar_expurgado(uuid) is
  'Carimba anexo_expurgado_em DEPOIS que a action apagou o arquivo pela Storage API. So-admin, idempotente. E a UNICA escrita permitida em gps.chamado_mensagens fora de gps.chamado_gravar_mensagem, e ela nao toca texto nem autor.';

revoke execute on function gps.chamado_anexo_marcar_expurgado(uuid) from public, anon;
grant  execute on function gps.chamado_anexo_marcar_expurgado(uuid) to authenticated;
