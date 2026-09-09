-- Central de resolução — move UM SÓCIO para outro ambiente.
--
-- POR QUE É SÓ UM UPDATE
--   `gps.membros.user_id` é UNIQUE (retrato do schema): uma pessoa está em no
--   máximo UM ambiente. Não existe caminho de "estar nos dois", então mover é
--   trocar `aluno_id` — não há criar-lá-e-apagar-cá, nem janela em que a pessoa
--   fique fora do programa.
--
-- 🔴 O QUE A TELA PRECISA DIZER: MOVER A PESSOA NÃO MOVE O QUE ELA FEZ.
--   Cliente, progresso, nota, evento e chamado são do AMBIENTE (`aluno_id`),
--   não da pessoa. O que o sócio registrou continua no ambiente de origem. Isso
--   é o modelo (o programa acompanha um ambiente, não um indivíduo), não um
--   efeito colateral a consertar depois.
--
-- POR QUE NÃO MOVE TITULAR
--   Sem titular, `gps.admin_adicionar_socio` recusa novos sócios (migração
--   ...118) e `gps.financeiro_pode_ler` deixa o contrato do ambiente sem
--   ninguém que possa ler. Titular sai por "Trocar titular" (...155) e só
--   depois, já como sócio, por aqui.
--
-- GUARDAS (todas antes da escrita)
--   1. public.gp_is_admin()                                   → 42501
--   2. o membro existe                                        → P0002
--   3. o membro NÃO é titular                                 → 42501
--   4. destino ≠ origem                                       → 22023
--   5. o ambiente de DESTINO tem titular                      → P0002
--   6. o login já participa do destino (membros_aluno_user_uk)→ 23505
--   7. destino já tem um membro sem login, e este também não tem
--      (membros_um_orfao_por_ambiente)                        → 23505
--   As guardas 6 e 7 existem para o admin ler a frase certa em vez do 23505
--   cru de um índice cujo nome não diz nada a quem está resolvendo.
--
-- O QUE NÃO FAZ
--   * não move nenhuma linha de dado entre ambientes;
--   * não mexe em auth.users nem em papel;
--   * não altera `pessoa_aluno_id` — a PESSOA é a mesma, só o ambiente mudou;
--   * não cria ambiente: o destino precisa existir com titular.
--
-- REVERSÃO
--   Chamar de novo com o ambiente de origem — o log guarda os dois lados.
--     drop function if exists gps.admin_mover_membro(uuid, uuid);

create or replace function gps.admin_mover_membro(
  p_membro_id uuid, p_novo_aluno_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare m record; v_email text;
begin
  if not public.gp_is_admin() then
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;
  if p_membro_id is null or p_novo_aluno_id is null then
    raise exception 'membro ou ambiente de destino nao informado' using errcode = '22023';
  end if;

  select * into m from gps.membros where id = p_membro_id;
  if not found then
    raise exception 'Membro não encontrado.' using errcode = 'P0002';
  end if;
  if m.papel = 'titular' then
    raise exception 'O titular não pode ser movido — o ambiente é dele. Troque o titular primeiro.'
      using errcode = '42501';
  end if;
  if m.aluno_id = p_novo_aluno_id then
    raise exception 'Este membro já está neste ambiente.' using errcode = '22023';
  end if;
  if not exists (select 1 from gps.membros t
                  where t.aluno_id = p_novo_aluno_id and t.papel = 'titular') then
    raise exception 'O ambiente de destino não tem titular.' using errcode = 'P0002';
  end if;
  if m.user_id is not null
     and exists (select 1 from gps.membros x
                  where x.aluno_id = p_novo_aluno_id and x.user_id = m.user_id) then
    raise exception 'Este login já participa do ambiente de destino.' using errcode = '23505';
  end if;
  if m.user_id is null
     and exists (select 1 from gps.membros x
                  where x.aluno_id = p_novo_aluno_id and x.user_id is null) then
    raise exception 'O ambiente de destino já tem um membro sem login.' using errcode = '23505';
  end if;

  update gps.membros set aluno_id = p_novo_aluno_id where id = p_membro_id;

  if m.user_id is not null then
    select u.email into v_email from auth.users u where u.id = m.user_id;
  end if;

  -- DUAS linhas de log, uma em cada ambiente: `gps.acessos_log` é lido por
  -- aluno_id (idx_acessos_log_aluno, e a aba Diário filtra por ambiente). Uma
  -- linha só sumiria de uma das duas telas — quem auditar a origem precisa ver
  -- a saída, e quem auditar o destino precisa ver a entrada.
  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('membro_movido', m.aluno_id, m.user_id, v_email,
          format('sócio SAIU deste ambiente para %s. O que ele registrou fica aqui (cliente, progresso, nota e chamado são do ambiente).',
                 p_novo_aluno_id::text),
          auth.uid()),
         ('membro_movido', p_novo_aluno_id, m.user_id, v_email,
          format('sócio ENTROU vindo de %s. O histórico dele continua no ambiente anterior.',
                 m.aluno_id::text),
          auth.uid());

  return jsonb_build_object('membro_id', m.id, 'de', m.aluno_id,
                            'para', p_novo_aluno_id, 'email', v_email);
end $function$;

comment on function gps.admin_mover_membro(uuid, uuid) is
  'Move UM SOCIO de um ambiente para outro (update de gps.membros.aluno_id -- user_id e UNIQUE, entao a pessoa esta em no maximo um ambiente e nao existe estado intermediario). NAO MOVE DADO: cliente, progresso, nota, evento e chamado sao do AMBIENTE, e continuam no de origem -- a tela precisa dizer isso. Recusa mover titular (sem titular o ambiente fica sem quem le o Financeiro e sem quem recebe socio novo), destino sem titular, destino igual a origem, e os dois choques de indice unico (mesmo login no destino; dois membros sem login no mesmo ambiente) com frase legivel em vez do 23505 cru. Grava DUAS linhas em gps.acessos_log, uma em cada ambiente, porque o log e lido por aluno_id.';

revoke execute on function gps.admin_mover_membro(uuid, uuid) from public, anon;
grant  execute on function gps.admin_mover_membro(uuid, uuid) to authenticated;
