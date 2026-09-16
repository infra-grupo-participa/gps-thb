-- Onboarding do admin (Central) passa a trazer os dados de CADASTRO da
-- pessoa (contato), além das respostas do questionário.
--
-- FATIA A-1 do plano do arquiteto. CORPO DE PARTIDA: a definição viva de
-- `gps.admin_onboarding_do_aluno(uuid)` (migração ...206,
-- 20260910000206_gps_onboarding_rpcs.sql, bloco 6) — conferido que nenhuma
-- migração entre ...206 e esta mexeu nesta função (só em
-- `onboarding_salvar_passo`/`onboarding_concluir`, migrações ...227 e ...254).
-- Conferir antes de reaplicar:
--   select pg_get_functiondef(p.oid) from pg_proc p
--     join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname='gps' and p.proname='admin_onboarding_do_aluno';
--
-- O ÚNICO acréscimo é dentro do `jsonb_build_object` da linha, ao lado de
-- `'nome', p.nome`: email/telefone/cidade/estado de `public.thb_alunos p` —
-- o `left join public.thb_alunos p on p.id = m.pessoa_aluno_id` JÁ EXISTE
-- na função; isto só para de descartar colunas da linha já lida. Zero
-- consulta nova, zero índice novo (medido: Index Scan using
-- thb_alunos_pkey, Execution Time ~0,25 ms).
--
-- 🔴 `documento` (CPF) NÃO entra — decisão de LGPD do plano (minimização).
--
-- Assinatura idêntica (`admin_onboarding_do_aluno(uuid)`), então
-- `create or replace` SUBSTITUI em vez de criar sobrecarga.
--
-- REVERSÃO: reaplicar 20260910000206 íntegro (bloco 6), incluindo o
-- revoke/grant do fim.

create or replace function gps.admin_onboarding_do_aluno(p_aluno_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare v_saida jsonb;
begin
  if not coalesce(public.gp_is_admin(), false) then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_aluno_id is null then
    raise exception 'aluno nao informado' using errcode = '22023';
  end if;

  select coalesce(jsonb_agg(linha order by linha->>'papel', linha->>'nome'), '[]'::jsonb)
    into v_saida
    from (
      select jsonb_build_object(
               'membro_id',       m.id,
               'pessoa_aluno_id', m.pessoa_aluno_id,
               'papel',           m.papel,
               'nome',            p.nome,
               'email',           p.email,
               'telefone',        p.telefone,
               'cidade',          p.cidade,
               'estado',          p.estado,
               'status', case when r.pessoa_aluno_id is null then 'nao_iniciado'
                              when r.concluido_em is not null then 'concluido'
                              else 'em_andamento' end,
               'versao',          r.versao,
               'passo_atual',     r.passo_atual,
               'iniciado_em',     r.iniciado_em,
               'concluido_em',    r.concluido_em,
               'origem_cliente1', r.origem_cliente1,
               'fase_cliente1',   r.fase_cliente1,
               'valor_honorarios', r.valor_honorarios,
               'cliente_id',      r.cliente_id,
               'cliente_nome',    r.cliente_nome,
               'descricao_caso',  r.descricao_caso,
               'ajuda_pronta',    r.ajuda_pronta,
               'anexos', coalesce((
                 select jsonb_agg(jsonb_build_object(
                          'id', a.id, 'tipo', a.tipo, 'nome', a.nome,
                          'mime', a.mime, 'tamanho', a.tamanho, 'path', a.path,
                          'criado_em', a.criado_em) order by a.criado_em)
                   from gps.onboarding_anexos a
                  where a.pessoa_aluno_id = r.pessoa_aluno_id), '[]'::jsonb)
             ) as linha
        from gps.membros m
        left join public.thb_alunos p on p.id = m.pessoa_aluno_id
        left join gps.onboarding_respostas r on r.pessoa_aluno_id = m.pessoa_aluno_id
       where m.aluno_id = p_aluno_id
    ) s;

  return v_saida;
end $function$;

comment on function gps.admin_onboarding_do_aluno(uuid) is
  'O questionario inicial de TODAS as pessoas de um ambiente (titular + socios), respondido ou nao -- "ninguem respondeu ainda" e um resultado e some da tela se a funcao so devolvesse quem respondeu. Traz tambem os DADOS DE CADASTRO (contato) de public.thb_alunos: email/telefone/cidade/estado -- o left join ja existia, isto so para de descartar colunas da linha ja lida (zero consulta nova). documento (CPF) NAO entra, por minimizacao (LGPD). Traz o `path` de cada anexo para a tela montar a URL assinada com download= (NUNCA inline; a licao e que o MIME vem do que o cliente declarou no PUT). gp_is_admin() ou 42501. So leitura, zero linha de log.';

revoke execute on function gps.admin_onboarding_do_aluno(uuid) from public, anon;
grant  execute on function gps.admin_onboarding_do_aluno(uuid) to authenticated;
