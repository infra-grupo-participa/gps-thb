-- Plantão — liberação manual de aluno pelo painel (09/09/2026).
--
-- POR QUE EXISTE
--   `gps.plantao_alunos` é um CSV CONGELADO: 421 linhas com origem='acelera_csv',
--   lote='2026-08', carregadas em 01/09. NADA atualiza essa lista — o job
--   noturno (`gps.plantao_reconciliar_elegibilidade`) só REMOVE gente (quem
--   migrou para o Programa de Implementação); nunca ADICIONA quem comprou o
--   Acelera depois da carga. Resultado: todo comprador novo fica de fora até
--   alguém recarregar o CSV à mão. Caso real medido em 09/09: Bianca Estacio
--   de Almeida Estácio Barrinuevo (compradora desde 17/08) foi recusada na
--   inscrição; o Marcio liberou por SQL direto, com
--   origem='liberacao_manual' e bloqueio_excecao=true. Há 49 compradores
--   criados depois da carga.
--
-- O QUE FAZ
--   gps.admin_liberar_aluno_plantao(p_email, p_nome, p_documento, p_telefone):
--   insere ou REATIVA a pessoa em gps.plantao_alunos pelo e-mail, com
--   origem='liberacao_manual' e bloqueio_excecao=true (para o job noturno de
--   reconciliação NUNCA rebloquear quem entrou por aqui, mesmo que a pessoa
--   também apareça em gps.membros por outro motivo). Idempotente:
--   `on conflict (email) do update` — chamar duas vezes para o mesmo e-mail
--   reativa (ativo=true) e atualiza nome/documento/telefone se novos vierem
--   preenchidos, nunca duplica.
--
-- GUARDAS (antes de qualquer escrita)
--   1. public.gp_is_admin()                            → 42501
--   2. e-mail com cara de e-mail (mesma regra do emailValido do TS,
--      replicada aqui porque é o banco quem grava — não dá para confiar só
--      no client)                                       → 22023
--   3. nome não vazio                                   → 22023
--
-- O QUE NÃO FAZ
--   * NÃO cria login nem toca `auth.users` — o Plantão não tem identidade
--     própria desde 08/09/2026, é rota pública por e-mail;
--   * NÃO reativa `bloqueado_por_programa`: se a pessoa estiver bloqueada por
--     já estar no Programa de Implementação, a liberação manual não muda
--     isso — são eixos independentes (Acelera × Programa). O admin que
--     precisar desbloquear os dois usa também a ação de elegibilidade
--     existente;
--   * NÃO apaga nem desativa ninguém (essa é `revogarAcessoPlantao`, já
--     existente em `alunos-actions.ts`).
--
-- LOG
--   `gps.plantao_eventos` (acao='plantao_liberado_manualmente'), não
--   `gps.acessos_log`: `acessos_log.aluno_id` é o `aluno_id` de
--   `public.thb_alunos`, e uma pessoa liberada aqui pode nem ter cadastro lá
--   (o Plantão é do Acelera, produto sem overlap garantido com a base do
--   Programa). `plantao_eventos` já é a trilha de auditoria deste módulo e
--   tem `aluno_plantao_id` como identidade nativa.
--
-- REVERSÃO
--   drop function if exists gps.admin_liberar_aluno_plantao(text, text, text, text);
--   (e remover a action liberarAlunoPlantao de src/app/admin/plantao/alunos-actions.ts)

create or replace function gps.admin_liberar_aluno_plantao(
  p_email text,
  p_nome text,
  p_documento text default null,
  p_telefone text default null
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

  insert into gps.plantao_alunos (email, nome, documento, telefone, origem, lote, ativo, bloqueio_excecao)
  values (v_email, v_nome, nullif(trim(p_documento), ''), nullif(trim(p_telefone), ''),
          'liberacao_manual', to_char(now(), 'YYYY-MM'), true, true)
  on conflict (email) do update
     set nome = excluded.nome,
         documento = coalesce(excluded.documento, gps.plantao_alunos.documento),
         telefone = coalesce(excluded.telefone, gps.plantao_alunos.telefone),
         ativo = true,
         bloqueio_excecao = true
  returning id, (xmax <> 0) into v_id, v_reativado;

  insert into gps.plantao_eventos (aluno_plantao_id, acao)
  values (v_id, 'plantao_liberado_manualmente');

  return jsonb_build_object('id', v_id, 'email', v_email, 'reativado', v_reativado);
end $function$;

comment on function gps.admin_liberar_aluno_plantao(text, text, text, text) is
  'Adiciona ou reativa uma pessoa em gps.plantao_alunos pelo e-mail -- remedio para o CSV congelado (o job noturno so remove, nunca adiciona quem comprou o Acelera depois da carga de 01/09). Idempotente via on conflict(email). Sempre grava origem=liberacao_manual e bloqueio_excecao=true, para o job de reconciliacao nunca rebloquear. NAO mexe em bloqueado_por_programa nem em auth.users. Log em gps.plantao_eventos (acao=plantao_liberado_manualmente), nao em gps.acessos_log, porque a pessoa pode nao ter thb_alunos.';

-- ACL: `revoke` antes do `grant`, sempre.
revoke execute on function gps.admin_liberar_aluno_plantao(text, text, text, text) from public, anon;
grant  execute on function gps.admin_liberar_aluno_plantao(text, text, text, text) to authenticated;
