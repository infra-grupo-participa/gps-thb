-- Central de resolução — troca o titular do ambiente (B-T1, opção A).
--
-- O QUE É (e o que NÃO é)
--   Troca o PAPEL dentro do ambiente: rebaixa o titular atual para `socio` e
--   promove um sócio a `titular`. O ambiente continua sendo o `thb_alunos.id`
--   do titular ANTIGO — `gps.membros.aluno_id` não muda, e por isso clientes,
--   progresso, Diário, chamados, pasta e contrato continuam onde estão.
--   Trocar o DONO do ambiente (reescrever `aluno_id` em 10 tabelas, com o
--   Financeiro do sip não acompanhando) é migração de dados, não botão, e está
--   FORA desta rodada por decisão do orquestrador.
--
-- 🔴 CONSEQUÊNCIA QUE A TELA TEM DE ESCREVER ANTES DE CONFIRMAR
--   `gps.financeiro_pode_ler` (migração ...140) libera o Financeiro para quem
--   tem `papel = 'titular'` naquele ambiente. Depois desta troca, portanto:
--   o NOVO titular passa a ver o contrato do ambiente — que é o contrato do
--   ANTIGO — e o antigo deixa de ver. Isso é DECISÃO DO ORQUESTRADOR (09/09,
--   B-T1 opção A), tomada com a consequência na mesa e escrita na confirmação:
--   "O novo titular passa a ver o Financeiro do ambiente e o antigo deixa de
--   ver; a Etapa 01, os clientes e o Diário continuam os mesmos."
--   Esta migração NÃO altera `gps.financeiro_pode_ler` — de propósito. Se o
--   João decidir fechar o Financeiro para o titular promovido, o remédio é UMA
--   linha na guarda (exigir também
--   `coalesce(m.pessoa_aluno_id, m.aluno_id) = m.aluno_id`), e o backfill de
--   `pessoa_aluno_id` (...154) já deixou o dado pronto para isso — hoje todo
--   titular tem pessoa_aluno_id = aluno_id, então a mudança seria bit a bit
--   idêntica para os 125 ambientes atuais.
--   O retorno da função devolve `financeiro_passa_a_ver` para a UI não ter de
--   deduzir isso de novo.
--
-- A ORDEM IMPORTA
--   `membros_um_titular_por_ambiente` é índice único PARCIAL (aluno_id) where
--   papel='titular': dois titulares não cabem. Rebaixa primeiro, promove depois
--   — os dois updates na MESMA transação, então nunca existe ambiente sem
--   titular visível para ninguém. Dois admins clicando junto: o segundo bate no
--   índice (23505) ou não acha mais o alvo como sócio — nunca fica partido.
--
-- GUARDAS (todas antes de qualquer escrita)
--   1. public.gp_is_admin()                                → 42501
--   2. o membro alvo pertence a ESTE ambiente              → P0002
--   3. o alvo ainda não é o titular                        → 22023
--   4. o alvo tem login (user_id não nulo)                 → P0002
--   5. o alvo NÃO é conta de equipe (admin_alvo_e_equipe)  → 42501
--   6. o ambiente tem titular hoje                         → P0002
--   A guarda 5 é a que impede escalada: sem ela, uma conta dev/admin do grupo
--   viraria titular de um ambiente de aluno. Mesma guarda de
--   gps.admin_definir_senha_membro e gps.admin_excluir_membro.
--
-- O QUE NÃO FAZ
--   * não move dado nenhum entre ambientes;
--   * não mexe em auth.users (nem senha, nem e-mail, nem sessão);
--   * não apaga o titular antigo — ele vira sócio e mantém login, histórico,
--     senha e o próprio `pessoa_aluno_id`;
--   * não altera gps.financeiro_pode_ler (ver acima);
--   * não grava em gps.aluno_eventos: a trilha do Diário é o que o ALUNO fez no
--     produto; troca de papel é ação administrativa e mora em gps.acessos_log,
--     que a aba Diário já lê e exibe (getAcoesAdministrativasDoAluno).
--
-- REVERSÃO
--   Chamar a função de novo com o membro antigo: é simétrica. O log guarda os
--   dois e-mails. Para remover o caminho:
--     drop function if exists gps.admin_trocar_titular(uuid, uuid);

create or replace function gps.admin_trocar_titular(
  p_aluno_id uuid, p_novo_titular_membro_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  novo record; velho record;
  v_email_novo text; v_email_velho text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_aluno_id is null or p_novo_titular_membro_id is null then
    raise exception 'ambiente ou membro nao informado' using errcode = '22023';
  end if;

  -- O ambiente entra na cláusula de propósito: o id do membro sozinho
  -- permitiria promover alguém de OUTRO ambiente por engano de tela.
  select * into novo from gps.membros
   where id = p_novo_titular_membro_id and aluno_id = p_aluno_id;
  if not found then
    raise exception 'Este membro não pertence a este ambiente.' using errcode = 'P0002';
  end if;
  if novo.papel = 'titular' then
    raise exception 'Este membro já é o titular.' using errcode = '22023';
  end if;
  if novo.user_id is null then
    raise exception 'O novo titular precisa ter login. Defina o acesso dele primeiro.'
      using errcode = 'P0002';
  end if;
  if gps.admin_alvo_e_equipe(novo.user_id) then
    raise exception 'Esta conta é da equipe — não pode ser titular de um ambiente.'
      using errcode = '42501';
  end if;

  select * into velho from gps.membros
   where aluno_id = p_aluno_id and papel = 'titular';
  if not found then
    raise exception 'Este ambiente não tem titular.' using errcode = 'P0002';
  end if;

  -- Rebaixa ANTES de promover: o índice único parcial recusa dois titulares.
  update gps.membros set papel = 'socio'   where id = velho.id;
  update gps.membros set papel = 'titular' where id = novo.id;

  select u.email into v_email_novo from auth.users u where u.id = novo.user_id;
  if velho.user_id is not null then
    select u.email into v_email_velho from auth.users u where u.id = velho.user_id;
  end if;

  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('titular_trocado', p_aluno_id, novo.user_id, v_email_novo,
          format('titular: %s → %s. O novo titular passa a ver o Financeiro do ambiente; o anterior deixa de ver.',
                 coalesce(v_email_velho, '(sem login)'), coalesce(v_email_novo, '?')),
          auth.uid());

  return jsonb_build_object(
    'titular_anterior', velho.id, 'titular_atual', novo.id,
    'email_anterior', v_email_velho, 'email_atual', v_email_novo,
    -- Para a UI dizer a consequência com as mesmas palavras do banco, em vez
    -- de a copy e a regra divergirem com o tempo.
    'financeiro_passa_a_ver', true);
end $function$;

comment on function gps.admin_trocar_titular(uuid, uuid) is
  'Troca o titular do ambiente (B-T1 opcao A, decisao do orquestrador em 09/09/2026): rebaixa o titular atual para socio e promove o membro alvo, NA MESMA TRANSACAO e nessa ordem -- membros_um_titular_por_ambiente (indice unico parcial) recusa dois titulares. NAO move dado: gps.membros.aluno_id continua sendo o thb_alunos.id do titular ANTIGO, entao clientes, progresso, Diario, chamados e pasta ficam onde estao. CONSEQUENCIA que a tela precisa escrever antes de confirmar: gps.financeiro_pode_ler libera pelo papel, logo o NOVO titular passa a ver o contrato do ambiente (que e do antigo) e o antigo deixa de ver -- esta funcao NAO altera aquela guarda, de proposito. Guardas: admin, membro do ambiente, ainda nao titular, tem login, nao e conta de equipe, ambiente tem titular. Log em gps.acessos_log (titular_trocado). Simetrica: chamar de novo com o membro antigo desfaz.';

revoke execute on function gps.admin_trocar_titular(uuid, uuid) from public, anon;
grant  execute on function gps.admin_trocar_titular(uuid, uuid) to authenticated;
