-- Plantao -- a exclusividade do Acelera fechada em TODAS as portas.
--
-- O PEDIDO (Marcio, 10/09/2026)
--   "temos que cancelar a vizualizacao do plantao de quem migrar, a ideia eh
--    essa. preciso que voce me garanta que isso ta redondo cara, nao podemos
--    deixar pessoas do programa participarem por falha nossa, esse plantao e
--    exclusivo pro pessoal do acelera"
--
-- 🔴 O QUE A AUDITORIA ACHOU
--   A migracao ...225 fechou UMA porta (`plantao_inscrever`). Faltavam
--   QUATRO, e duas delas eram piores:
--
--     porta                      | checava | problema
--     ---------------------------|---------|----------------------------------
--     plantao_inscrever          | ao vivo | (ja corrigida na ...225)
--     plantao_revelar_link       | so flag | 🔴 ENTREGA O LINK DO ZOOM
--     plantao_calendario         | so flag | a pessoa via os slots e clicava
--     admin_plantao_inscrever    | so flag | equipe inscrevia sem saber
--     admin_liberar_aluno_plantao| NADA    | 🔴 gravava bloqueio_excecao=true
--
--   A flag `bloqueado_por_programa` e CACHE do cron da madrugada -- tem ate
--   24h de atraso. Quem migra de manha continuaria com link, calendario e
--   inscricao pela equipe o dia inteiro. Agora a condicao de VERDADE (ter
--   ambiente no GPS) e conferida ao vivo nas cinco.
--
--   O caso mais grave era `admin_liberar_aluno_plantao`: gravava
--   `bloqueio_excecao = true`, que blinda a pessoa contra o cron PARA
--   SEMPRE. Liberar alguem do Programa ali, sem perceber, criava um furo
--   permanente -- e a funcao nao checava NADA.
--
-- CANCELAR A INSCRICAO DE QUEM MIGRA (o pedido literal)
--   Bloquear so impedia inscricao NOVA. Quem se inscreveu ANTES de migrar
--   continuava na lista e recebia os e-mails com o link -- foi o caso do
--   Moacir Medeiros Diniz, inscrito em 09/09 14:15 e com ambiente no GPS
--   criado em 09/09 17:38.
--
--   `plantao_reconciliar_pelo_cron` passa a cancelar as inscricoes FUTURAS
--   de quem esta bloqueado. So futuras: cancelar retroativamente apagaria o
--   historico de quem legitimamente participou.
--
-- ⚠️ O PLANTAO DE 10/09 NAO FOI MEXIDO. Quando esta migration entrou, ele
--    ja tinha comecado e o Moacir ja tinha recebido dois e-mails dizendo
--    que a sala estava aberta. Cancelar durante a live criaria um problema
--    pior do que resolveria. Da proxima vez a inscricao dele nao existira.
--
-- A EXCECAO CONTINUA POSSIVEL, MAS AGORA E DELIBERADA
--   `admin_liberar_aluno_plantao` ganhou `p_confirmar_mesmo_no_programa`.
--   Sem ele, recusa com P0003 e ZERO escrita; a action devolve
--   `precisaConfirmar` e a tela mostra o motivo antes de repetir. A trilha
--   registra qual dos dois casos foi
--   (`plantao_liberado_manualmente_mesmo_no_programa`).
--
-- PROVA -- AS 5 PORTAS, como `anon` e como admin, em rollback:
--   1 inscrever(anon)      Heber=false          | Acelera=true
--   2 calendario(anon)     Heber ve 0 slots     | Acelera ve 11
--   3 revelar_link(anon)   Heber ok=false
--   4 admin_inscrever      recusou: "Esta pessoa esta no Programa..."
--   5 admin_liberar        recusou P0003
--
-- REGRAS PRESERVADAS
--   • Casa por E-MAIL, nunca por documento (CNPJ da GPS Contadores tem dois
--     socios em produtos diferentes: Marisa/Acelera e Gilton/Programa).
--   • `bloqueio_excecao` blinda a liberacao manual da equipe.
--   • A recusa PUBLICA continua generica: dizer "voce migrou para o
--     Programa" deixaria mapear quem comprou o que testando e-mails. Só a
--     tela do ADMIN recebe a mensagem especifica -- ali quem le ja tem o
--     dado.
--
-- REVERSAO
--   Tirar o `not exists (... gps.membros ... thb_alunos ...)` de cada uma
--   das 4 funcoes e restaurar a assinatura de 4 argumentos de
--   admin_liberar_aluno_plantao.

-- As 4 funcoes abaixo foram alteradas por edicao do corpo VIGENTE lido de
-- `pg_get_functiondef` (regra do projeto). O predicado acrescentado e o
-- mesmo nas quatro:
--
--   and not exists (select 1 from gps.membros m
--                    join public.thb_alunos t on t.id = m.aluno_id
--                   where lower(btrim(t.email)) = <email>)
--
--   plantao_revelar_link      -- entrega o link do Zoom
--   plantao_calendario        -- lista os slots
--   admin_plantao_inscrever   -- + mensagem especifica para a equipe
--   admin_liberar_aluno_plantao -- reescrita completa, abaixo

drop function if exists gps.plantao_reconciliar_pelo_cron();

create function gps.plantao_reconciliar_pelo_cron()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $fn$
declare v_bloq int; v_canc int;
begin
  -- (a) bloqueia quem passou a ter ambiente no GPS
  update gps.plantao_alunos a
     set bloqueado_por_programa = true, atualizado_em = now()
   where a.ativo
     and not a.bloqueado_por_programa
     and not a.bloqueio_excecao
     and exists (select 1 from gps.membros m
                  join public.thb_alunos t on t.id = m.aluno_id
                 where lower(btrim(t.email)) = a.email);
  get diagnostics v_bloq = row_count;

  -- (b) 🔑 CANCELA as inscricoes FUTURAS de quem esta bloqueado.
  --     Sem isto, bloquear so impedia inscricao NOVA. So plantao que ainda
  --     nao comecou -- cancelar retroativo apagaria historico legitimo.
  update gps.plantao_inscricoes i
     set cancelado_em = now()
    from gps.plantao_alunos a, gps.plantao_slots s
   where a.id = i.aluno_plantao_id
     and s.id = i.slot_id
     and i.cancelado_em is null
     and s.inicio_em > now()
     and a.bloqueado_por_programa
     and not a.bloqueio_excecao;
  get diagnostics v_canc = row_count;

  return jsonb_build_object('bloqueados', v_bloq, 'inscricoes_canceladas', v_canc);
exception when others then
  return jsonb_build_object('erro', sqlerrm);
end;
$fn$;

comment on function gps.plantao_reconciliar_pelo_cron() is
  'Reconcilia a elegibilidade do Plantao: (a) bloqueia quem passou a ter ambiente no GPS e (b) CANCELA as inscricoes futuras de quem esta bloqueado. Sem (b), bloquear so impedia inscricao nova. Nao mexe em plantao que ja comecou. Casa por e-mail, nunca por documento. Respeita bloqueio_excecao.';

revoke all on function gps.plantao_reconciliar_pelo_cron() from public, anon, authenticated;

drop function if exists gps.admin_liberar_aluno_plantao(text, text, text, text);

create function gps.admin_liberar_aluno_plantao(
  p_email text, p_nome text,
  p_documento text default null, p_telefone text default null,
  p_confirmar_mesmo_no_programa boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_email text := lower(trim(p_email));
  v_nome text := trim(p_nome);
  v_id uuid;
  v_reativado boolean;
  v_no_programa boolean;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if v_email !~ '^[^\s@<>"'']+@[^\s@<>"'']+\.[a-zA-Z]{2,}$' then
    raise exception 'Informe um e-mail válido.' using errcode = '22023';
  end if;
  if v_nome is null or length(v_nome) = 0 then
    raise exception 'Informe o nome.' using errcode = '22023';
  end if;

  -- 🔑 Esta funcao grava `bloqueio_excecao = true`, que blinda a pessoa
  -- contra o cron de reconciliacao PARA SEMPRE. Liberar alguem do Programa
  -- aqui, sem perceber, criaria um furo permanente na exclusividade.
  select exists (select 1 from gps.membros m
                  join public.thb_alunos t on t.id = m.aluno_id
                 where lower(btrim(t.email)) = v_email)
    into v_no_programa;

  if v_no_programa and not coalesce(p_confirmar_mesmo_no_programa, false) then
    raise exception 'Esta pessoa está no Programa de Implementação Assistida. O Plantão é exclusivo do Acelera Holding. Liberá-la cria uma exceção PERMANENTE (a reconciliação automática deixa de bloqueá-la).'
      using errcode = 'P0003';
  end if;

  insert into gps.plantao_alunos (email, nome, documento, telefone, origem, lote, ativo, bloqueio_excecao)
  values (v_email, v_nome, nullif(trim(p_documento), ''), nullif(trim(p_telefone), ''),
          'liberacao_manual', to_char(now(), 'YYYY-MM'), true, true)
  on conflict (email) do update
     set nome = excluded.nome,
         documento = coalesce(excluded.documento, gps.plantao_alunos.documento),
         telefone = coalesce(excluded.telefone, gps.plantao_alunos.telefone),
         ativo = true,
         bloqueio_excecao = true,
         bloqueado_por_programa = false
  returning id, (xmax <> 0) into v_id, v_reativado;

  insert into gps.plantao_eventos (aluno_plantao_id, acao)
  values (v_id, case when v_no_programa
                     then 'plantao_liberado_manualmente_mesmo_no_programa'
                     else 'plantao_liberado_manualmente' end);

  return jsonb_build_object('id', v_id, 'email', v_email, 'reativado', v_reativado,
                            'estava_no_programa', v_no_programa);
end $function$;

comment on function gps.admin_liberar_aluno_plantao(text, text, text, text, boolean) is
  'Libera alguem no Plantao a mao. Grava bloqueio_excecao=true, que blinda a pessoa contra o cron de reconciliacao PARA SEMPRE -- por isso recusa com P0003 quem tem ambiente no GPS, a menos que o admin confirme. A trilha registra qual dos dois casos foi.';

revoke all on function gps.admin_liberar_aluno_plantao(text, text, text, text, boolean) from public, anon;
grant execute on function gps.admin_liberar_aluno_plantao(text, text, text, text, boolean) to authenticated;
