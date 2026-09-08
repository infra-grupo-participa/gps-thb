-- Plantão de Dúvidas: elegibilidade — só participa quem é do Acelera Holding.
--
-- REGRA DE NEGÓCIO (decisão do Marcio, 08/09/2026): o Plantão pertence ao
-- **Acelera Holding**, que é produto separado do Programa de Implementação
-- Assistida (o GPS, ~R$ 15 mil). Quem migrou para o Programa não participa do
-- Plantão.
--
-- ⚠️ O CUSTO FOI APRESENTADO E ACEITO. A regra literal do Marcio distinguia
-- quem pagou o Programa COM o desconto de ~R$ 1 mil (perderia o Plantão) de
-- quem pagou cheio (manteria). Essa distinção **não foi implementada**: o dado
-- de valor pago não está em `cs.vw_gps_acessos`, e `cs.contatos_hm` (que tem
-- `valor_total`/`valor_pago`) não liga por e-mail. Diante da escolha entre
-- três opções, o Marcio decidiu: **todas as 20 pessoas que estão nas duas
-- bases perdem o Plantão**, inclusive quem pagou o Programa cheio. Se alguém
-- reclamar, a reversão é por pessoa e sem deploy (ver abaixo).
--
-- POR QUE COLUNA, e não regra escondida dentro do login:
--   - o admin consegue VER quem perdeu e por quê;
--   - reverter uma pessoa é `update ... set bloqueado_por_programa = false`,
--     sem tocar em código nem esperar deploy;
--   - a marcação fica auditável: dá para conferir a lista antes de abrir.
--
-- CASAMENTO POR E-MAIL, de propósito. Casar por CPF multiplicaria: um mesmo
-- documento pode ter 2 linhas em `public.thb_alunos` (caso Eder Fagundes, já
-- registrado no projeto). Pior, o documento pode ser CNPJ de empresa
-- compartilhado por DUAS PESSOAS DIFERENTES — conferido: Marisa Tiedt
-- (Acelera) e Gilton Silva (Programa) dividem o CNPJ da GPS Contadores, e
-- casar por documento bloquearia a Marisa, que tem direito. Por e-mail ela
-- passa, corretamente.
--
-- Reversão total: `update gps.plantao_alunos set bloqueado_por_programa = false;`
-- Reversão de uma pessoa: o mesmo update com `where email = '...'`.

alter table gps.plantao_alunos
  add column if not exists bloqueado_por_programa boolean not null default false;

comment on column gps.plantao_alunos.bloqueado_por_programa is
  'true = perdeu o plantao por estar no Programa de Implementacao (gps.membros). O plantao pertence ao Acelera Holding; quem migrou para o Programa nao participa (decisao 08/09/2026). Reversivel por pessoa: update para false devolve o acesso, sem deploy.';

update gps.plantao_alunos pa
   set bloqueado_por_programa = true
 where pa.ativo
   and exists (
     select 1
       from public.thb_alunos a
       join gps.membros m on m.aluno_id = a.id
      where lower(btrim(a.email)) = lower(btrim(pa.email))
   );

-- ── `plantao_sessao`: + `senha_provisoria`, + recusa de bloqueado ───────────
--
-- `senha_provisoria` passa a vir DAQUI (e não de um cookie-sinal): a obrigação
-- de trocar a senha padrão tem de vir do banco. Cookie extra é estado
-- duplicado, e some com mais facilidade que o de sessão em iframe no Safari —
-- a obrigação sumiria junto e o aluno seguiria com a senha padrão.
--
-- A recusa do bloqueado mora AQUI, no resolvedor de sessão, e não só no login:
-- quem já estava logado quando a regra entrou perde o acesso na próxima
-- requisição, em vez de navegar por mais 90 dias com a sessão antiga.

drop function if exists gps.plantao_sessao(text);

create function gps.plantao_sessao(p_token text)
returns table (aluno_plantao_id uuid, nome text, senha_provisoria boolean)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_hash text := encode(extensions.digest(p_token, 'sha256'), 'hex');
  v_sessao_id uuid;
  v_aluno_id uuid;
  v_nome text;
  v_provisoria boolean;
begin
  select s.id, s.aluno_plantao_id, a.nome, coalesce(ac.senha_provisoria, false)
    into v_sessao_id, v_aluno_id, v_nome, v_provisoria
  from gps.plantao_sessoes s
  join gps.plantao_alunos a on a.id = s.aluno_plantao_id
  left join gps.plantao_acessos ac on ac.aluno_plantao_id = a.id
  where s.token_hash = v_hash
    and s.expira_em > now()
    and a.ativo
    and not a.bloqueado_por_programa;

  if not found then
    return;
  end if;

  update gps.plantao_sessoes set ultimo_uso_em = now() where id = v_sessao_id;

  return query select v_aluno_id, v_nome, v_provisoria;
end;
$function$;

revoke execute on function gps.plantao_sessao(text) from public;
grant execute on function gps.plantao_sessao(text) to anon, authenticated;

comment on function gps.plantao_sessao(text) is
  'Resolve a sessao do plantao pelo token (guarda-se so o sha256). Devolve senha_provisoria para o portal obrigar a troca da senha padrao. Recusa aluno inativo e aluno bloqueado_por_programa — a trava mora aqui, entao sessao antiga tambem para de valer.';

-- Diagnóstico para o ADMIN. Sem grant para `anon` de propósito: responder
-- publicamente "este e-mail participa?" seria um enumerador perfeito de quem
-- comprou o Acelera.
create or replace function gps.plantao_pode_participar(p_email text)
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select exists (
    select 1 from gps.plantao_alunos pa
     where lower(btrim(pa.email)) = lower(btrim(p_email))
       and pa.ativo
       and not pa.bloqueado_por_programa
  );
$function$;

revoke execute on function gps.plantao_pode_participar(text) from public, anon;
grant execute on function gps.plantao_pode_participar(text) to authenticated;

comment on function gps.plantao_pode_participar(text) is
  'Diagnostico para o ADMIN: o e-mail participa do plantao? Sem grant para anon de proposito — responder isso publicamente permitiria enumerar quem comprou o Acelera.';
