-- ============================================================
-- 338 — Cadastro do sócio: só NOME e CPF obrigatórios; opcional em branco não apaga
-- ============================================================
-- Onda 3 da megafeature do Digisac (C40–C45, "não consigo acessar sem
-- preencher novamente"). 3ª rodada, depois de dois vereditos do pentest:
--   · SAIU a ligação /cadastro → convite (metadata forjável no signup).
--   · SAIU o lembrete de convite (sem massa; reanimava convite expirado).
--   · SAIU o pré-preenchimento e o "CPF vazio usa o do cadastro": o titular
--     recebe o token do convite em claro e pode aceitar ele mesmo, então
--     convite aceito NÃO prova posse do e-mail. O CPF é SEMPRE digitado.
--
-- O QUE FICA — remendo ancorado em gps.socio_cadastro_gravar (…256):
--   · obrigatórios: NOME e CPF (a recusa 'Informe o CPF.' do corpo vivo fica
--     intacta);
--   · 🔴 DONO DO CADASTRO (4º veredito do pentest): CPF que casa com linha
--     EXISTENTE de thb_alunos só grava/liga se lower(btrim(email)) da linha
--     = e-mail do login. Senão: a mesma saída de cpf_de_outro_membro (nada
--     escrito, pessoa_aluno_id nulo, a Central resolve). Fecha a leitura de
--     dado de terceiro E a sobrescrita do nome que vinha da …256;
--   · telefone/CEP/UF só têm o formato conferido quando preenchidos;
--     cidade/bairro/endereço/número/país só o tamanho;
--   · campo opcional em branco MANTÉM o valor que a linha de thb_alunos já
--     tem (o update do corpo vivo reescreve tudo — sem isto, apagaria). Só
--     alcança a linha do próprio e-mail ou a criada na hora (insert).
-- ⚠️ v_email do corpo vivo já é lower(trim(auth.users.email)) (passo 3 da …256).
--
-- Remendo ANCORADO sobre pg_get_functiondef (regra da …234: nunca recopiar
-- corpo antigo). Âncora que não casar exatamente 1 vez ABORTA tudo.
-- Marcador '-- 338 opcionais' → pula se já aplicado.
--
-- ── PRÉ-CHECAGEM (rodar ANTES; PARAR se divergir) ──────────────────────────
-- P1. socio_cadastro_gravar vivo = …256:245-500 (o repo não tem outra versão):
--   select pg_get_functiondef('gps.socio_cadastro_gravar(text,text,text,text,text,text,text,text,text,text)'::regprocedure);
--   PARAR se divergir de supabase/migrations/20260915000256_gps_socio_cadastro_obrigatorio.sql
--   (além de espaço/CRLF).
-- P2. Colunas que o insert do cadastro pode deixar vazias:
--   select column_name, is_nullable from information_schema.columns
--    where table_schema='public' and table_name='thb_alunos'
--      and column_name in ('telefone','telefone_e164','cep','cidade','estado',
--                          'bairro','endereco_logradouro','endereco_numero','pais');
--   PARAR se telefone_e164 for NOT NULL (as outras recebem '' e passam).
--
-- ── REVERSÃO ───────────────────────────────────────────────────────────────
--   reaplicar o corpo lido em P1 (os remendos levam '-- 338').
-- ============================================================

begin;

set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $chk$
begin
  if to_regprocedure('gps.socio_cadastro_gravar(text,text,text,text,text,text,text,text,text,text)') is null then
    raise exception '338: gps.socio_cadastro_gravar ausente -- ABORTADA';
  end if;
end
$chk$;

-- ═══════════════════════════════════════════════════════════════════════════
-- A1. Remendo ancorado em gps.socio_cadastro_gravar
-- ═══════════════════════════════════════════════════════════════════════════
do $mig$
declare
  v_src  text;
  v_n    int;
  v_de   text[] := array[
    -- 1..8 opcionais: só valida formato quando a pessoa preencheu
    $q$if v_telefone_164 is null then$q$,
    $q$if v_cep = '' or char_length(v_cep) <> 8 then$q$,
    $q$if v_cidade = '' or char_length(v_cidade) > 120 then$q$,
    $q$if v_estado !~ '^[A-Z]{2}$' then$q$,
    $q$if v_bairro = '' or char_length(v_bairro) > 120 then$q$,
    $q$if v_logradouro = '' or char_length(v_logradouro) > 200 then$q$,
    $q$if v_numero = '' or char_length(v_numero) > 20 then$q$,
    $q$if v_pais = '' or char_length(v_pais) > 60 then$q$,
    -- 9 em branco = mantém o que a linha já tem (o update reescreve tudo)
    $q$update public.thb_alunos set$q$,
    -- 10 dono do cadastro: CPF de linha existente com OUTRO e-mail não grava
    --    nem liga (cai na saída de cpf_de_outro_membro logo abaixo)
    $q$if v_cpf_de_outro then$q$];
  v_para text[] := array[
    $q$if v_telefone_164 is null and v_telefone <> '' then  /* 338 opcionais */$q$,
    $q$if v_cep <> '' and char_length(v_cep) <> 8 then$q$,
    $q$if char_length(v_cidade) > 120 then$q$,
    $q$if v_estado <> '' and v_estado !~ '^[A-Z]{2}$' then$q$,
    $q$if char_length(v_bairro) > 120 then$q$,
    $q$if char_length(v_logradouro) > 200 then$q$,
    $q$if char_length(v_numero) > 20 then$q$,
    $q$if char_length(v_pais) > 60 then$q$,
    $q$-- 338 opcionais: campo em branco mantém o valor que o cadastro já tem
    select coalesce(nullif(v_telefone, ''), a.telefone),
           coalesce(v_telefone_164, a.telefone_e164),
           coalesce(nullif(v_cep, ''), a.cep),
           coalesce(nullif(v_cidade, ''), a.cidade),
           coalesce(nullif(v_estado, ''), btrim(a.estado)),
           coalesce(nullif(v_bairro, ''), a.bairro),
           coalesce(nullif(v_logradouro, ''), a.endereco_logradouro),
           coalesce(nullif(v_numero, ''), a.endereco_numero),
           coalesce(nullif(v_pais, ''), a.pais)
      into v_telefone, v_telefone_164, v_cep, v_cidade, v_estado,
           v_bairro, v_logradouro, v_numero, v_pais
      from public.thb_alunos a
     where a.id = v_aluno_id;
    update public.thb_alunos set$q$,
    $q$-- 338 dono do cadastro: o CPF digitado achou uma linha que já existe
  -- (base do sip). Só é DELA quem tem o mesmo e-mail do login; senão gravar
  -- sobrescreveria um terceiro e ligar pessoa_aluno_id daria ao sócio a
  -- leitura do telefone/endereço/financeiro dele. E-mail vazio na linha
  -- também não prova nada: recusa igual. A Central resolve o vínculo.
  if v_aluno_id is not null and not v_cpf_de_outro
     and not coalesce((select lower(btrim(coalesce(a.email, ''))) = v_email
                         from public.thb_alunos a where a.id = v_aluno_id), false) then
    v_cpf_de_outro := true;
    v_aluno_id := null;          -- nada será escrito nem vinculado
  end if;

  if v_cpf_de_outro then$q$];
begin
  v_src := pg_get_functiondef('gps.socio_cadastro_gravar(text,text,text,text,text,text,text,text,text,text)'::regprocedure);
  if position('-- 338 opcionais' in v_src) > 0 then
    raise notice '338 A1 ja aplicado -- pulado';
    return;
  end if;
  for i in 1 .. array_length(v_de, 1) loop
    v_n := (length(v_src) - length(replace(v_src, v_de[i], ''))) / length(v_de[i]);
    if v_n <> 1 then
      raise exception '338 A1: ancora % casou % vezes (esperado 1) -- ABORTADA', i, v_n;
    end if;
  end loop;
  for i in 1 .. array_length(v_de, 1) loop
    v_src := replace(v_src, v_de[i], v_para[i]);
  end loop;
  execute v_src;
end
$mig$;

comment on function gps.socio_cadastro_gravar(text,text,text,text,text,text,text,text,text,text) is
  'O socio convidado preenche o proprio cadastro. Desde a 338: obrigatorios so NOME e CPF (sempre digitado); CPF de linha EXISTENTE de thb_alunos so grava/liga se o e-mail da linha = e-mail do login, senao sai como cpf_de_outro_membro sem escrever nada; telefone/CEP/UF so validam formato quando preenchidos; opcional em branco MANTEM o valor da linha (nunca apaga). Resto igual a ...256.';

commit;

-- ═══ MEDIDO em produção, 02/10/2026 (migration aplicada DENTRO de begin … rollback) ═══
-- O ensaio pegou um bug real: o marcador da âncora 1 era `-- 338 opcionais` na MESMA
-- linha do `raise … end if;` e o comentário engolia o resto (42601). Virou `/* … */`.
-- R1 CPF vazio → 22023 "Informe o CPF." · R2 só nome+CPF da própria linha → ok, pessoa
-- ligada, 9 opcionais intactos · R3 telefone ruim → 22023 · R4 anon → 42501 ·
-- R5 CPF de linha de OUTRO e-mail → {ok:false, cpf_de_outro_membro:true}, linha do
-- terceiro idêntica (to_jsonb antes = depois).
-- explain (analyze, buffers) select gps.socio_cadastro_gravar('Explain 338', <CPF livre>, '', …):
--   Result (ramo insert, como sócio de prova) · Execution Time: 9.430 ms
--   (aluno_por_documento usa o índice de documento; 1 chamada por sócio, uma vez na vida)
