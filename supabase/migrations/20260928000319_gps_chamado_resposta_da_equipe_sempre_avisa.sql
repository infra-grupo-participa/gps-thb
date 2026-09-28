-- ═══════════════════════════════════════════════════════════════════════
-- Chamados: TODA resposta da equipe avisa o parceiro por e-mail (28/09/2026)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Caso real (Ricardo Buss, chamado "Preciso de ajuda para precificar a
-- Holding no Croqui Estrutural"): em 21/09 a equipe escreveu às 09:30
-- "estou reforçando com o setor responsável" — o status foi para
-- `respondido` e o e-mail saiu. A RESPOSTA DE VERDADE veio às 16:10 do mesmo
-- dia e NÃO gerou e-mail, porque o aviso só saía na TRANSIÇÃO de status.
-- Ele só viu em 25/09: "nem tinha visto que responderam. Achei que vinha
-- aviso no email".
--
-- Padrão que produz o buraco: "aguarde, vou verificar" seguido da resposta.
-- É exatamente a resposta que importa que ficava muda.
--
-- Medido (28/09, 18 dias de chamados): 34 mensagens da equipe, 4 delas
-- seguidas de outra da equipe (3 chamados) — é o que passa a gerar e-mail.
-- ~4 e-mails a mais em 18 dias. Quem escreve é a equipe, não um formulário
-- público: não há vetor de rajada. Resend (10 req/s) fora de questão.
--
-- O lado do ALUNO NÃO muda: a equipe continua sendo avisada só na transição
-- (a fila de `/admin/chamados` já mostra o chamado aberto; é ali que a equipe
-- trabalha, e o aluno pode mandar 5 mensagens seguidas).
--
-- Corpo recriado a partir do VIGENTE (`pg_get_functiondef`, 28/09), não de
-- arquivo antigo — só o ramo `equipe` do `v_avisar` mudou. Mesma assinatura
-- → `create or replace` mantém o ACL (conferido: postgres, authenticated,
-- service_role; sem anon).
--
-- Reverter: trocar `elsif v_papel = 'equipe' then` por
-- `elsif v_papel = 'equipe' and v_status_ant <> 'respondido' then`.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function gps.chamado_responder(
  p_chamado_id uuid,
  p_texto text,
  p_anexo_path text default null,
  p_anexo_nome text default null,
  p_anexo_mime text default null,
  p_anexo_tamanho integer default null
)
returns table(status_novo text, avisar text)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_chamado    gps.chamados%rowtype;
  v_papel      text;
  v_status_ant text;
  v_novo       text;
  v_avisar     text;
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
  if v_papel = 'aluno' and v_status_ant <> 'aberto' then
    v_avisar := nullif(btrim(coalesce(
      (select c.valor from gps.config c where c.chave = 'chamados_email_equipe'), '')), '');
  -- (…319, 28/09) Equipe: avisa SEMPRE, não só na transição — a resposta
  -- que vem depois de um "aguarde" era a que ficava sem e-mail.
  elsif v_papel = 'equipe' then
    v_avisar := coalesce(
      (select u.email from auth.users u where u.id = v_chamado.aberto_por),
      (select a.email from public.thb_alunos a where a.id = v_chamado.aluno_id));
  else
    v_avisar := null;
  end if;
  return query select v_novo, v_avisar;
end;
$function$;

revoke execute on function gps.chamado_responder(uuid, text, text, text, text, integer) from public, anon;
grant  execute on function gps.chamado_responder(uuid, text, text, text, text, integer) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- PROVAS (aplicada em produção 28/09/2026 — dentro de `do $$ … raise $$`,
-- que desfaz tudo; o e-mail só sai pela action do Next, nenhuma trigger de
-- `chamados`/`chamado_mensagens` nem `chamado_gravar_mensagem` usa pg_net)
-- ═══════════════════════════════════════════════════════════════════════
-- JWT de admin real, no chamado do caso (status 'aberto', 10 mensagens):
--   1ª resposta da equipe → status=respondido, avisar preenchido ✔ (já era)
--   2ª resposta seguida   → status=respondido, avisar preenchido ✔ (ANTES: null)
-- JWT do parceiro dono, chamado já 'aberto' → status=aberto, avisar null ✔
--   (lado do aluno inalterado: a equipe só é avisada na transição)
-- Sobra depois das provas: 0 mensagens 'PROVA 319%' ✔
-- proacl: {postgres, authenticated, service_role} — sem anon/PUBLIC ✔
-- Sobrecargas: 1 ✔
-- Custo: nenhuma consulta nova — o mesmo `coalesce` de 2 lookups por PK que
-- já rodava na transição passa a rodar em toda resposta da equipe (34 em 18
-- dias). Sem explain: não há plano novo, é o mesmo acesso por PK.
