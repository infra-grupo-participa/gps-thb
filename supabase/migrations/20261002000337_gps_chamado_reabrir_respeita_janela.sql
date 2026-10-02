-- ═══════════════════════════════════════════════════════════════════════════
-- Chamados: reabrir (transição) respeita a janela de 30 min do aviso à equipe
-- Card ClickUp 86akryph9 — achado BAIXO do pentest (02/10/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ── O BURACO ──────────────────────────────────────────────────────────────
-- Na …335, quando o parceiro escreve num chamado `respondido`/`fechado`
-- (transição de status), `v_avisar_equipe := true` SEMPRE. O parceiro pode
-- chamar `gps.chamado_fechar` (…111: admin OU dono do ambiente) e, em seguida,
-- `gps.chamado_responder`: fechar -> reabrir -> fechar -> reabrir… cada volta
-- é uma transição e manda 1 e-mail à equipe. Teto prático = o de 20 mensagens
-- por chamado (~19 e-mails por chamado). Sem ganho ao atacante além de ruído,
-- mas é e-mail real (Resend, 10 req/s) e a equipe é quem paga a atenção.
--
-- ── A REGRA NOVA (decisão do arquiteto, 02/10) ────────────────────────────
-- Transição de status do parceiro avisa a equipe se:
--   (a) o último aviso à equipe — `coalesce(ultimo_aviso_equipe_em, criado_em)`
--       — foi há 30 min ou mais (a MESMA janela do chamado já aberto), OU
--   (b) a EQUIPE JÁ RESPONDEU depois desse último aviso (existe mensagem
--       `autor_papel = 'equipe'` com `criado_em` > último aviso): é o parceiro
--       respondendo à equipe, e a equipe precisa saber, mesmo dentro da janela.
-- Só (b) é exceção à janela. Quem reabre sozinho (sem a equipe ter respondido
-- desde o último aviso) fica preso aos 30 min. A comparação do (b) é
-- ESTRITA (`>`): depois de avisar, `ultimo_aviso_equipe_em` passa a ser maior
-- ou igual à resposta da equipe, então a mesma resposta não "arma" o aviso
-- duas vezes.
-- Mudar SÓ isto: o ramo "chamado já aberto" (config + janela de 30 min), a
-- contagem `mensagens_novas`, o carimbo `ultimo_aviso_equipe_em`, o ramo da
-- equipe e todas as guardas têm o mesmo efeito da …335 (o `coalesce` do último aviso virou a variável `v_ultimo_aviso`).
--
-- ── ASSINATURA ────────────────────────────────────────────────────────────
-- Idêntica à da …335: (uuid, text, text, text, text, integer) e retorno
-- `table(status_novo text, avisar text, avisar_equipe boolean,
-- mensagens_novas integer)`. Por isso `create or replace` serve (não há 42P13,
-- não há drop, não nasce sobrecarga). `create or replace` preserva o ACL; o
-- `revoke`/`grant` abaixo está repetido de propósito (idempotente) para a
-- migration afirmar o estado final sozinha.
--
-- ⚠️ Antes de aplicar, conferir que a função VIVA ainda é a da …335 (corpo
-- vigente do banco manda, não o arquivo):
--   select md5(pg_get_functiondef('gps.chamado_responder(uuid,text,text,text,text,integer)'::regprocedure));
-- e ler o corpo. Se divergir da …335, PARAR.
--
-- ── REVERSÃO ──────────────────────────────────────────────────────────────
-- Recriar o corpo da …335 (seção 3 do arquivo
-- 20261002000335_gps_chamado_aviso_e_clientes_lote.sql) com `create or replace`
-- (mesma assinatura e retorno — não precisa de drop). Sem mudança de schema,
-- sem coluna nova, sem dado migrado: reverter é só trocar o corpo.
--
-- ── ÍNDICE ────────────────────────────────────────────────────────────────
-- Nenhum novo. O `exists` novo lê a thread de UM chamado
-- (`chamado_id = $1 and autor_papel = 'equipe' and criado_em > $2`), teto de 20
-- linhas, mesma leitura que a …335 já faz com `max(criado_em)` em
-- `idx_chamado_mensagens_thread`. Plano a colar: ver o `explain (analyze)` no
-- bloco de provas (é um SELECT; não executa escrita).
-- ═══════════════════════════════════════════════════════════════════════════

begin;

set local lock_timeout = '3s';
set local statement_timeout = '20s';

create or replace function gps.chamado_responder(
  p_chamado_id uuid,
  p_texto text,
  p_anexo_path text default null,
  p_anexo_nome text default null,
  p_anexo_mime text default null,
  p_anexo_tamanho integer default null
)
returns table(status_novo text, avisar text, avisar_equipe boolean, mensagens_novas integer)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_chamado       gps.chamados%rowtype;
  v_papel         text;
  v_status_ant    text;
  v_novo          text;
  v_avisar        text;
  v_avisar_equipe boolean := false;
  v_novas         integer := 0;
  v_desde         timestamptz;
  v_ultimo_aviso  timestamptz;
begin
  select * into v_chamado from gps.chamados c where c.id = p_chamado_id for update;
  if v_chamado.id is null then
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if public.gp_is_admin() then
    v_papel := 'equipe';
  elsif gps.aluno_atual() = v_chamado.aluno_id then
    v_papel := 'aluno';
  else
    raise exception 'sem permissao' using errcode = '42501';
  end if;
  if v_papel = 'aluno' then
    if not gps.chamados_abertos() then
      raise exception 'o suporte por chamado esta temporariamente fechado' using errcode = '42501';
    end if;
    if v_chamado.status = 'fechado' then
      if v_chamado.fechado_em is null or v_chamado.fechado_em <= now() - interval '7 days' then
        raise exception 'este chamado foi fechado ha mais de 7 dias; abra um novo chamado'
          using errcode = '42501';
      end if;
    end if;
  end if;
  v_status_ant := v_chamado.status;
  perform gps.chamado_gravar_mensagem(
    p_chamado_id, v_papel, p_texto,
    p_anexo_path, p_anexo_nome, p_anexo_mime, p_anexo_tamanho);
  v_novo := case when v_papel = 'aluno' then 'aberto' else 'respondido' end;

  if v_papel = 'aluno' then
    -- Último aviso à equipe (nulo = a abertura, que já avisou via chamado_abrir).
    v_ultimo_aviso := coalesce(v_chamado.ultimo_aviso_equipe_em, v_chamado.criado_em);

    if v_status_ant <> 'aberto' then
      -- (…337) Transição (reabertura): respeita a MESMA janela de 30 min do
      -- chamado aberto, para fechar+reabrir em loop não virar 1 e-mail por
      -- volta. Exceção: se a equipe respondeu DEPOIS do último aviso, o parceiro
      -- está respondendo à equipe — avisa sempre. A mensagem que acabou de ser
      -- gravada é do aluno, então não entra neste `exists`.
      v_avisar_equipe :=
        v_ultimo_aviso <= now() - interval '30 minutes'
        or exists (
          select 1
            from gps.chamado_mensagens m
           where m.chamado_id = p_chamado_id
             and m.autor_papel = 'equipe'
             and m.criado_em > v_ultimo_aviso);
    elsif coalesce(
            (select c.valor from gps.config c where c.chave = 'chamados_aviso_por_mensagem'),
            'true') <> 'false' then
      -- (…335) Chamado já aberto: aviso agrupado, 1 por chamado a cada 30 min.
      v_avisar_equipe :=
        v_ultimo_aviso <= now() - interval '30 minutes';
    end if;

    if v_avisar_equipe then
      -- Quantas mensagens do parceiro a equipe ainda não "viu": desde o último
      -- aviso OU a última resposta da equipe, o que for mais recente. Inclui a
      -- desta chamada. Lê só a thread (≤ 20 linhas, idx_chamado_mensagens_thread).
      v_desde := greatest(
        v_ultimo_aviso,
        (select max(m.criado_em) from gps.chamado_mensagens m
          where m.chamado_id = p_chamado_id and m.autor_papel = 'equipe'));
      select count(*)::int into v_novas
        from gps.chamado_mensagens m
       where m.chamado_id = p_chamado_id
         and m.autor_papel = 'aluno'
         and m.criado_em > v_desde;
      v_novas := greatest(v_novas, 1);

      update gps.chamados c
         set ultimo_aviso_equipe_em = now()
       where c.id = p_chamado_id;

      v_avisar := nullif(btrim(coalesce(
        (select c.valor from gps.config c where c.chave = 'chamados_email_equipe'), '')), '');
    end if;
  -- (…319, 28/09) Equipe: avisa SEMPRE o parceiro, não só na transição.
  elsif v_papel = 'equipe' then
    v_avisar := coalesce(
      (select u.email from auth.users u where u.id = v_chamado.aberto_por),
      (select a.email from public.thb_alunos a where a.id = v_chamado.aluno_id));
  end if;

  return query select v_novo, v_avisar, v_avisar_equipe, v_novas;
end;
$function$;

comment on function gps.chamado_responder(uuid, text, text, text, text, integer) is
  'Responde na thread. Papel DERIVADO no servidor (gp_is_admin -> equipe; membro do ambiente -> aluno; ninguem mais -> 42501): o cliente nunca informa quem e. O aluno so responde com o interruptor aberto e, se o chamado estiver fechado, dentro de 7 dias (responder REABRE). Aviso a EQUIPE (avisar_equipe=true; avisar = chamados_email_equipe, pode vir nulo e a action cai no fallback): (1) transicao de status (reabertura) e chamado ja aberto seguem a MESMA janela -- so avisa se o ultimo aviso (coalesce(ultimo_aviso_equipe_em, criado_em)) foi ha 30 min ou mais (…337; antes avisava sempre na transicao e fechar+reabrir em loop mandava 1 e-mail por volta); (2) excecao so da transicao: se a equipe respondeu DEPOIS do ultimo aviso, avisa sempre; (3) chamado ja aberto ainda depende de config.chamados_aviso_por_mensagem <> false (…335). mensagens_novas = quantas do parceiro desde o ultimo aviso/resposta da equipe. Aviso ao PARCEIRO (avisar = e-mail dele) a CADA resposta da equipe (…319).';

revoke all     on function gps.chamado_responder(uuid, text, text, text, text, integer) from public, anon;
grant  execute on function gps.chamado_responder(uuid, text, text, text, text, integer) to authenticated, service_role;

commit;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVAS A RODAR DEPOIS DE APLICAR (nada disto foi rodado: o executor não tem
-- acesso ao banco). Rodar INTEIRO, como `postgres`, numa única sessão/transação.
-- Termina em ROLLBACK: nenhum chamado, mensagem nem carimbo fica.
--
-- Por que há "backdate": dentro de UMA transação `now()` é constante, então a
-- janela de 30 min não passa sozinha. As datas são movidas como `postgres`
-- (entre `reset role` e `set local role authenticated`), nunca como parceiro.
-- Pré-requisito: o ambiente do parceiro escolhido tem < 5 chamados não
-- fechados e `gps.chamados_abertos()` é true (senão a abertura recusa 42501).
-- Se algum UPDATE de backdate for barrado por trigger append-only, PARAR e
-- avisar (a prova não vale sem ele).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- begin;
--
-- -- 0) Fixtures (como postgres): 1 titular com login e 1 admin ativo.
-- select set_config('prova.aluno_user',
--          (select m.user_id::text from gps.membros m
--            where m.papel = 'titular' and m.user_id is not null
--              and (select count(*) from gps.chamados c
--                    where c.aluno_id = m.aluno_id and c.status <> 'fechado') = 0
--            order by m.criado_em limit 1), true) as aluno_user,
--        set_config('prova.admin_user',
--          (select p.id::text from public.perfis p
--            where p.ativo and p.cargo in ('dev','admin') limit 1), true) as admin_user;
--
-- -- 1) Parceiro abre o chamado.
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--          json_build_object('sub', current_setting('prova.aluno_user'),
--                            'role', 'authenticated')::text, true);
-- select set_config('prova.chamado', c.chamado_id::text, true)
--   from gps.chamado_abrir('PROVA …337 (apagar: rollback)', 'texto de abertura') c;
--
-- -- 2) Envelhece a abertura (como postgres): último aviso = criado_em = há 2 h.
-- reset role;
-- update gps.chamados
--    set criado_em = now() - interval '2 hours'
--  where id = current_setting('prova.chamado')::uuid;
--
-- -- ═════ PROVA (a): fechar + reabrir 2× em < 30 min  =>  1 aviso só ═════
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--          json_build_object('sub', current_setting('prova.aluno_user'),
--                            'role', 'authenticated')::text, true);
--
-- select gps.chamado_fechar(current_setting('prova.chamado')::uuid);
-- -- 1ª reabertura: último aviso há 2 h  => ESPERADO avisar_equipe = TRUE, mensagens_novas = 1
-- select * from gps.chamado_responder(current_setting('prova.chamado')::uuid, 'reabre 1');
--
-- select gps.chamado_fechar(current_setting('prova.chamado')::uuid);
-- -- 2ª reabertura: aviso acabou de sair (< 30 min), equipe não respondeu
-- --   => ESPERADO avisar_equipe = FALSE, avisar = NULL, status_novo = 'aberto'
-- select * from gps.chamado_responder(current_setting('prova.chamado')::uuid, 'reabre 2');
--
-- select gps.chamado_fechar(current_setting('prova.chamado')::uuid);
-- -- 3ª reabertura: idem => ESPERADO avisar_equipe = FALSE
-- select * from gps.chamado_responder(current_setting('prova.chamado')::uuid, 'reabre 3');
--
-- -- Estado: 1 carimbo só, e as mensagens foram gravadas mesmo sem aviso (4 do aluno).
-- reset role;
-- select c.status, c.ultimo_aviso_equipe_em is not null as carimbou,
--        (select count(*) from gps.chamado_mensagens m
--          where m.chamado_id = c.id and m.autor_papel = 'aluno') as msgs_aluno   -- ESPERADO: aberto | true | 4
--   from gps.chamados c where c.id = current_setting('prova.chamado')::uuid;
--
-- -- ═════ PROVA (b): equipe responde, parceiro reabre  =>  avisa ═════
-- -- Aviso do parceiro "há 10 min" (ainda DENTRO da janela de 30), para a regra
-- -- de tempo sozinha dizer NÃO; só a exceção da resposta da equipe pode dizer SIM.
-- update gps.chamados
--    set ultimo_aviso_equipe_em = now() - interval '10 minutes'
--  where id = current_setting('prova.chamado')::uuid;
--
-- -- Equipe responde (admin). ESPERADO: status_novo = 'respondido', avisar = e-mail do parceiro.
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--          json_build_object('sub', current_setting('prova.admin_user'),
--                            'role', 'authenticated')::text, true);
-- select * from gps.chamado_responder(current_setting('prova.chamado')::uuid, 'resposta da equipe');
--
-- -- Parceiro responde ao chamado `respondido` (transição), dentro da janela:
-- --   ESPERADO avisar_equipe = TRUE (a equipe respondeu depois do último aviso)
-- set local role authenticated;
-- select set_config('request.jwt.claims',
--          json_build_object('sub', current_setting('prova.aluno_user'),
--                            'role', 'authenticated')::text, true);
-- select * from gps.chamado_responder(current_setting('prova.chamado')::uuid, 'parceiro responde a equipe');
--
-- -- Controle: sem nova resposta da equipe, fechar+reabrir de novo NÃO avisa
-- -- (o carimbo novo >= resposta da equipe; comparação estrita) => ESPERADO FALSE
-- select gps.chamado_fechar(current_setting('prova.chamado')::uuid);
-- select * from gps.chamado_responder(current_setting('prova.chamado')::uuid, 'reabre sem equipe');
--
-- -- ═════ PLANO do `exists` novo (SELECT puro: não executa escrita) ═════
-- reset role;
-- explain (analyze, buffers)
-- select exists (
--   select 1 from gps.chamado_mensagens m
--    where m.chamado_id = current_setting('prova.chamado')::uuid
--      and m.autor_papel = 'equipe'
--      and m.criado_em > now() - interval '1 hour');
--
-- -- ═════ ACL e sobrecarga (esperado: sem anon, sem "=X/", 1 só função) ═════
-- select p.proacl, p.prosecdef, p.proconfig
--   from pg_proc p
--  where p.oid = 'gps.chamado_responder(uuid,text,text,text,text,integer)'::regprocedure;
--   -- ESPERADO: proacl com authenticated e service_role (e postgres), sem anon, sem "=X/…";
--   --           prosecdef = t; proconfig = {search_path=""}
-- select has_function_privilege('anon',
--          'gps.chamado_responder(uuid,text,text,text,text,integer)', 'execute');   -- ESPERADO f
-- select count(*) from pg_proc
--  where pronamespace = 'gps'::regnamespace and proname = 'chamado_responder';       -- ESPERADO 1
--
-- rollback;
