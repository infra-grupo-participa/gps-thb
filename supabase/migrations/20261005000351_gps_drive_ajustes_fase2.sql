-- ═══════════════════════════════════════════════════════════════════════════
-- 351 — Google Drive, Fase 2: 2 BAIXOs do kirad sobre a 349/350
-- ═══════════════════════════════════════════════════════════════════════════
-- Corpos recriados a partir da 349/350 do repo (= aplicado em 05/10/2026),
-- com trava de md5 contra o vivo.
-- 1. gps.drive_atividade_aplicar: item cujo pai é pasta do MESMO lote ainda
--    não processada espera a próxima passada SEMPRE (antes: só quando o pai
--    não resolvia). Cenário: pasta F sai da árvore, X é criado em F, F muda
--    de novo, X vem antes de F → X era gravado com nome sob o cliente.
--    E todo item que fica removido perde o nome (nome = null): não sobra nome
--    de arquivo pessoal de quem saiu da árvore. drive_arquivos.nome aceita
--    null só quando removido. Descendente restaurado junto com a pasta volta
--    com '(nome indisponível)' até o próximo evento dele.
-- 2. gps.drive_ambiente_arquivar: arquivar e revogação em DOIS blocos
--    begin/exception — a falha de um não impede o outro.
--
-- DOWN (comentado): recriar as duas funções com os corpos da 349 (seção 6.2)
--   e da 350 (seção 3); os nomes apagados não voltam (dado de quem saiu).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '2s';
set local statement_timeout = '20s';

-- 0) Trava: corpos VIVOS = os da 349/350 do repo (com e sem linhas '--').
do $$
declare
  v_apl text;
  v_amb text;
begin
  select md5(p.prosrc) into v_apl from pg_proc p
   where p.oid = 'gps.drive_atividade_aplicar(jsonb, text, text, text)'::regprocedure;
  select md5(p.prosrc) into v_amb from pg_proc p
   where p.oid = 'gps.drive_ambiente_arquivar()'::regprocedure;
  if v_apl is null or v_apl not in ('b5fd0d9cc74b70db56740322ce1892cb', '5fb04dbf2392979c820598bfb84c864b') then
    raise exception 'drive_atividade_aplicar viva diverge da 349 (md5 %) -- migracao abortada', v_apl;
  end if;
  if v_amb is null or v_amb not in ('0f502f950df173c752bf8350118740df', 'ce73b59ff765d5a560b1942ac173ad80') then
    raise exception 'drive_ambiente_arquivar viva diverge da 350 (md5 %) -- migracao abortada', v_amb;
  end if;
end $$;

-- 1) drive_arquivos.nome: null só em removido
alter table gps.drive_arquivos alter column nome drop not null;
alter table gps.drive_arquivos drop constraint drive_arquivos_nome_check;
update gps.drive_arquivos set nome = null where removido and nome is not null;
alter table gps.drive_arquivos
  add constraint drive_arquivos_nome_check
    check (nome is null or (char_length(nome) between 1 and 200 and nome !~ '[[:cntrl:]]')),
  add constraint drive_arquivos_nome_removido
    check (removido or nome is not null);

-- 2) aplicar
create or replace function gps.drive_atividade_aplicar(
  p_itens      jsonb,
  p_token_lido text,
  p_token_novo text,
  p_erro       text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_atual     text;
  v_pend      jsonb;
  v_prox      jsonb;
  v_pastas    text[];
  v_feitos    text[]  := '{}';
  v_it        jsonb;
  v_passada   int     := 0;
  v_forcar    boolean := false;
  v_progresso boolean;
  v_file      text;
  v_pai       text;
  v_rem       boolean;
  v_pasta     boolean;
  v_nome      text;
  v_mime      text;
  v_mod       timestamptz;
  v_por       text;
  v_cli       uuid;
  v_alu       uuid;
  v_sub       text;
  v_chave     text;
  v_existia   boolean;
  v_old       record;
  v_grav      int := 0;
  v_remov     int := 0;
  v_desc      int := 0;
  v_erro      text;
begin
  if not gps.drive_atividade_ativo() then
    raise exception 'A leitura de atividade do Drive está desligada.' using errcode = 'P0001';
  end if;

  if p_erro is not null then
    v_erro := nullif(left(btrim(regexp_replace(p_erro, '[[:cntrl:]]', ' ', 'g')), 300), '');
    update gps.drive_cursor c
       set ultimo_erro = coalesce(v_erro, 'erro sem detalhe'), rodando_desde = null, atualizado_em = now()
     where c.id;
    return jsonb_build_object('erro_gravado', true);
  end if;

  if p_token_novo is null or char_length(p_token_novo) > 500 or p_token_novo !~ '^[!-~]+$' then
    raise exception 'token novo invalido' using errcode = '22023';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then
    raise exception 'itens invalidos' using errcode = '22023';
  end if;
  if jsonb_array_length(p_itens) > 1000 then
    raise exception 'itens demais (max 1000)' using errcode = '22023';
  end if;

  -- Trava otimista: só avança do token que a execução leu.
  select c.page_token into v_atual from gps.drive_cursor c where c.id for update;
  if not found then
    raise exception 'cursor ausente' using errcode = 'P0002';
  end if;
  if v_atual is distinct from p_token_lido then
    raise exception 'O cursor do Drive mudou (outra execução avançou).' using errcode = 'P0001';
  end if;

  -- Pastas (não removidas) presentes no lote: filho que vem antes do pai
  -- espera a próxima passada.
  select coalesce(array_agg(e->>'file_id'), '{}') into v_pastas
    from jsonb_array_elements(p_itens) e
   where jsonb_typeof(e) = 'object'
     and (e->'eh_pasta' = 'true'::jsonb or e->>'mime' = 'application/vnd.google-apps.folder')
     and e->'removed' is distinct from 'true'::jsonb
     and e->'trashed' is distinct from 'true'::jsonb;

  v_pend := p_itens;
  loop
    v_passada   := v_passada + 1;
    v_prox      := '[]'::jsonb;
    v_progresso := false;

    for v_it in select e from jsonb_array_elements(v_pend) e loop
      if jsonb_typeof(v_it) <> 'object' then
        v_desc := v_desc + 1; continue;
      end if;
      v_file := v_it->>'file_id';
      if v_file is null or v_file !~ '^[A-Za-z0-9_-]{10,200}$' then
        v_desc := v_desc + 1; continue;
      end if;
      -- Pasta do sistema (raiz/subpasta do cliente, pastas do parceiro): não é arquivo.
      if exists (select 1 from gps.drive_pastas p where p.file_id = v_file) then
        v_feitos := v_feitos || v_file;
        v_progresso := true;
        v_desc := v_desc + 1; continue;
      end if;

      v_rem := v_it->'removed' = 'true'::jsonb or v_it->'trashed' = 'true'::jsonb;
      v_rem := coalesce(v_rem, false);
      v_pai := v_it->>'parent_id';
      if v_pai is not null and v_pai !~ '^[A-Za-z0-9_-]{10,200}$' then
        v_pai := null;
      end if;

      v_cli := null; v_alu := null; v_sub := null; v_chave := null;
      -- (…351, kirad) Pai que é pasta DESTE lote e ainda não foi processado:
      -- espera, mesmo que o pai resolva pelo estado antigo. Senão o arquivo
      -- criado numa pasta que sai da árvore no mesmo lote seria gravado com
      -- nome sob o cliente antes de a pasta sair.
      if not v_rem and v_pai is not null and not v_forcar
         and v_pai = any (v_pastas) and not (v_pai = any (v_feitos)) then
        v_prox := v_prox || jsonb_build_array(v_it);
        continue;
      end if;
      if not v_rem and v_pai is not null then
        select p.cliente_id, p.aluno_id,
               case when p.papel = 'raiz_cliente' then 'raiz' else left(p.sub_chave, 2) end,
               case when p.papel = 'raiz_cliente' then null else p.sub_chave end
          into v_cli, v_alu, v_sub, v_chave
          from gps.drive_pastas p
         where p.file_id = v_pai
           and p.cliente_id is not null
           and p.aluno_id is not null
           and (p.papel = 'raiz_cliente' or (p.papel = 'sub_cliente' and p.sub_chave is not null));
        if v_cli is null then
          select a.cliente_id, a.aluno_id, a.subpasta, a.sub_chave
            into v_cli, v_alu, v_sub, v_chave
            from gps.drive_arquivos a
           where a.file_id = v_pai and a.file_id <> v_file
             and a.eh_pasta and not a.removido;
        end if;
      end if;
      v_feitos := v_feitos || v_file;
      v_progresso := true;

      select a.cliente_id, a.subpasta, a.sub_chave, a.removido, a.removido_em, a.eh_pasta
        into v_old
        from gps.drive_arquivos a
       where a.file_id = v_file
       for update;
      v_existia := found;

      -- Removido, lixeira ou fora da árvore conhecida.
      if v_rem or v_cli is null then
        if v_existia and not v_old.removido then
          update gps.drive_arquivos
             set removido = true, removido_em = now(), visto_em = now(), nome = null
           where file_id = v_file;
          if v_old.eh_pasta then
            with recursive d(file_id) as (
              select a.file_id from gps.drive_arquivos a where a.pasta_file_id = v_file
              union
              select a.file_id from gps.drive_arquivos a join d on a.pasta_file_id = d.file_id
            )
            update gps.drive_arquivos a
               set removido = true, removido_em = now(), visto_em = now(), nome = null
              from d
             where a.file_id = d.file_id and not a.removido;
          end if;
          v_remov := v_remov + 1;
          v_progresso := true;
        else
          v_desc := v_desc + 1;
        end if;
        continue;
      end if;

      v_pasta := coalesce(v_it->'eh_pasta' = 'true'::jsonb, false)
                 or coalesce(v_it->>'mime' = 'application/vnd.google-apps.folder', false);
      v_nome  := left(btrim(regexp_replace(coalesce(v_it->>'nome', ''), '[[:cntrl:]]', ' ', 'g')), 200);
      if v_nome = '' then
        v_nome := 'Sem nome';
      end if;
      v_mime  := nullif(left(btrim(regexp_replace(coalesce(v_it->>'mime', ''), '[[:cntrl:]]', '', 'g')), 200), '');
      v_por   := nullif(left(btrim(regexp_replace(coalesce(v_it->>'modificado_por_nome', ''), '[[:cntrl:]]', ' ', 'g')), 120), '');
      if v_por ~ '@' then
        v_por := null;
      end if;
      v_mod := case
                 when v_it->>'modificado_em' ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$'
                 then (v_it->>'modificado_em')::timestamptz
                 else now()
               end;

      insert into gps.drive_arquivos
        (file_id, cliente_id, aluno_id, pasta_file_id, subpasta, sub_chave, nome, mime,
         eh_pasta, modificado_em, modificado_por_nome, removido, removido_em, visto_em)
      values
        (v_file, v_cli, v_alu, v_pai, v_sub, v_chave, v_nome, v_mime,
         v_pasta, v_mod, v_por, false, null, now())
      on conflict (file_id) do update
         set cliente_id = excluded.cliente_id, aluno_id = excluded.aluno_id,
             pasta_file_id = excluded.pasta_file_id, subpasta = excluded.subpasta,
             sub_chave = excluded.sub_chave, nome = excluded.nome, mime = excluded.mime,
             eh_pasta = excluded.eh_pasta, modificado_em = excluded.modificado_em,
             modificado_por_nome = excluded.modificado_por_nome,
             removido = false, removido_em = null, visto_em = now();
      v_grav := v_grav + 1;
      v_progresso := true;

      -- Pasta que mudou de lugar ou voltou da lixeira: a subárvore acompanha.
      -- Restaurada: volta só o que caiu junto com ela (mesmo removido_em).
      if v_pasta and v_existia
         and ((v_old.cliente_id, v_old.subpasta, v_old.sub_chave) is distinct from (v_cli, v_sub, v_chave)
              or v_old.removido) then
        with recursive d(file_id) as (
          select a.file_id from gps.drive_arquivos a where a.pasta_file_id = v_file
          union
          select a.file_id from gps.drive_arquivos a join d on a.pasta_file_id = d.file_id
        )
        update gps.drive_arquivos a
           set cliente_id = v_cli, aluno_id = v_alu, subpasta = v_sub, sub_chave = v_chave,
               removido = false, removido_em = null, visto_em = now(),
               -- o nome foi apagado ao remover; volta com o próximo evento do arquivo
               nome = coalesce(a.nome, '(nome indisponível)')
          from d
         where a.file_id = d.file_id
           and (not a.removido or (v_old.removido and a.removido_em = v_old.removido_em));
      end if;
    end loop;

    exit when jsonb_array_length(v_prox) = 0;
    -- Sem progresso (pai nunca resolve) ou profundidade absurda: a próxima
    -- passada trata o que sobrou como fora da árvore.
    if not v_progresso or v_passada >= 20 then
      v_forcar := true;
    end if;
    v_pend := v_prox;
  end loop;

  update gps.drive_cursor c
     set page_token = p_token_novo, rodando_desde = null, ultimo_erro = null, atualizado_em = now()
   where c.id;

  return jsonb_build_object('gravados', v_grav, 'removidos', v_remov,
                            'descartados', v_desc, 'passadas', v_passada);
end;
$function$;

revoke all     on function gps.drive_atividade_aplicar(jsonb, text, text, text) from public, anon, authenticated;
grant  execute on function gps.drive_atividade_aplicar(jsonb, text, text, text) to service_role;

-- 3) gatilho do ambiente
create or replace function gps.drive_ambiente_arquivar()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_raiz text;
  v_n    int;
begin
  begin
    select p.file_id into v_raiz
      from gps.drive_pastas p
     where p.aluno_id = old.aluno_id and p.papel = 'raiz_parceiro';

    update gps.drive_pastas p
       set arquivada_em = coalesce(p.arquivada_em, now()),
           nome = case p.papel
                    when 'raiz_parceiro' then '(parceiro excluído)'
                    when 'raiz_cliente'  then '(cliente excluído)'
                    else p.nome
                  end
     where p.aluno_id = old.aluno_id;

    if v_raiz is not null then
      -- A pasta do parceiro leva as dos clientes junto: as tarefas de cliente
      -- desta transação (criado_em = now() = início da transação) somem; as
      -- pendentes antigas do mesmo ambiente ficam como 'feito' com aviso.
      delete from gps.drive_tarefas t
       where t.tipo = 'arquivar' and t.estado = 'pendente'
         and t.origem_aluno_id = old.aluno_id
         and t.criado_em = now();
      update gps.drive_tarefas t
         set estado = 'feito', aviso = 'coberto_pelo_parceiro', concluido_em = now()
       where t.tipo = 'arquivar' and t.estado = 'pendente'
         and t.origem_aluno_id = old.aluno_id;

      insert into gps.drive_tarefas (tipo, aluno_id, file_id, origem_aluno_id)
      values ('arquivar', null, v_raiz, old.aluno_id)
      on conflict (file_id) where tipo = 'arquivar' and estado in ('pendente', 'rodando') do nothing;
    end if;
  exception when others then
    raise warning 'drive: arquivamento do ambiente nao enfileirado (%): %', sqlstate, sqlerrm;
  end;

  -- (…351, kirad) Bloco próprio: falha no arquivar não impede a revogação,
  -- e vice-versa. Reusa a marcação da 347: permissão viva que o sistema deu
  -- neste ambiente (o gatilho de gps.membros já marca a do titular).
  begin
    update gps.drive_permissoes p
       set revogar_desde = now(), revogar_motivo = 'membro_removido',
           tentativas = 0, erro_detalhe = null
     where p.aluno_id = old.aluno_id
       and p.revogado_em is null
       and p.revogar_desde is null;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      perform gps.drive_revogar_enfileirar();
    end if;
  exception when others then
    raise warning 'drive: revogacao do ambiente nao marcada (%): %', sqlstate, sqlerrm;
  end;

  return old;
end;
$function$;

revoke all on function gps.drive_ambiente_arquivar() from public, anon, authenticated, service_role;

commit;
