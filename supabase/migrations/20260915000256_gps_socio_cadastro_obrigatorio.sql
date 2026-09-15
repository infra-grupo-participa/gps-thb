-- Onboarding obrigatório do sócio convidado (feature "Equipe", 15/09/2026).
--
-- O QUE MUDA
--   O sócio que aceita o convite (`gps.socio_convite_aceitar`, …244) entra
--   hoje sem NENHUM dado pessoal. Esta migração cria a RPC que grava os 11
--   campos obrigatórios (nome, CPF/CNPJ, e-mail, telefone, CEP, cidade,
--   estado, bairro, país, logradouro, número) e um interruptor que decide se
--   a tela bloqueia o uso até o formulário ser preenchido. O e-mail é o
--   único dos 11 que NÃO é parâmetro: vem de `auth.users.email` lido no
--   servidor por `auth.uid()`, o mesmo raciocínio de `gps.trocar_meu_nome`
--   (…228) — nunca se confia em e-mail vindo do cliente.
--
-- MEDIÇÕES DE PRODUÇÃO QUE ESTA MIGRAÇÃO ASSUME (rodadas antes de escrever)
--   • gps.membros hoje: titular 142 (0 sem pessoa) · sócio 11 com pessoa ·
--     sócio 2 SEM pessoa (carlosabcunha@gmail.com e isaazevedot@outlook.com,
--     este último ambiente de teste do Marcio).
--   • public.thb_alunos JÁ TEM `pais text default 'Brasil'` — não criada
--     aqui, só usada.
--   • `estado` é `character(2)` e a base inteira já usa SIGLA (SP, MG, RJ…).
--   • Nenhuma pessoa é membro de 2+ ambientes hoje (0 linhas) — o caso do
--     CPF-de-outro-membro é possível, mas ainda não ocorreu na base real.
--   • carlosabcunha@gmail.com JÁ TEM linha em thb_alunos (casa por e-mail),
--     com `pessoa_aluno_id` do membro dele NULL — o caminho "reusa linha
--     existente" será exercitado no primeiro uso real da feature.
--
-- POR QUE REUSAR gps.aluno_por_documento PARA NORMALIZAR (E NÃO REESCREVER)
--   A normalização (`lpad(regexp_replace(doc,'\D','','g'),14,'0')`) é a MESMA
--   que o gatilho de vínculo automático usa para casar login por CPF/CNPJ —
--   reescrevê-la aqui seria uma segunda fonte da mesma regra, e as duas
--   divergindo um dia é o tipo de bug que só aparece em produção. A RPC desta
--   migração chama `gps.aluno_por_documento(p_documento)` (SECURITY INVOKER,
--   já com `execute` para `authenticated`) para achar a linha livre.
--
-- POR QUE `thb_alunos` E NÃO TABELA NOVA
--   `thb_alunos` é compartilhada com o sip e é onde o resto do sistema já lê
--   nome/documento/endereço de cada pessoa (Central, Financeiro, e-mails).
--   Criar uma tabela de cadastro paralela duplicaria a fonte de verdade da
--   pessoa. A escrita é só por RPC SECURITY DEFINER porque a policy de
--   escrita de `thb_alunos` exige `gp_pode_editar('centro_controle')`, que o
--   sócio não tem — nem deveria: o resto da tabela (dado financeiro, turma,
--   fonte) continua fora do alcance dele.
--
-- 🔴 CASO ESPECIAL: CPF JÁ É pessoa_aluno_id DE OUTRO MEMBRO
--   `membros_pessoa_uk` (…160) é um índice ÚNICO PARCIAL em
--   `gps.membros(pessoa_aluno_id) where pessoa_aluno_id is not null`. Se o
--   CPF digitado já identifica outra pessoa do programa, esta RPC grava os
--   dados em `thb_alunos` normalmente (a pessoa existe e o cadastro dela
--   pode estar incompleto) mas NÃO tenta apontar `gps.membros.pessoa_aluno_id`
--   para ela — evita a corrida em vez de confiar só no `exception when
--   unique_violation` (mesmo raciocínio da …244 na linha 547-556: "se a
--   pessoa já é de outro membro, fica NULL"). A recusa apontada pelo cliente
--   entra como REDE (`exception when unique_violation`), não como caminho
--   principal — e a frase devolvida NUNCA cita nome nem ambiente de terceiro.
--   `pessoa_aluno_id` NULL não bloqueia a entrada: o sócio segue usando o
--   sistema, e a Central de resolução (`gps.admin_vincular_pessoa_membro`)
--   resolve o vínculo quando a equipe decidir qual das duas pessoas é a real.
--
-- INTERRUPTOR: `gps.config.socio_cadastro_obrigatorio`, nasce 'false'
--   `gps.config` só tem policy de admin (`gps_config_admin`) — sem uma RPC
--   de leitura o sócio lê 0 linhas e cairia no fallback para sempre (mesmo
--   achado que gerou `gps.convite_socio_ativo`, …245). Molde EXATO daquela
--   função: `security definer`, `set search_path to ''`, `stable`,
--   `coalesce(…, false)` — falha fechado, chave ausente nunca bloqueia
--   ninguém.
--
-- REVERSÃO
--   update gps.config set valor = 'false' where chave = 'socio_cadastro_obrigatorio';
--   -- (o interruptor nasce 'false' — não precisa reverter nada para desligar)
--   -- Para desfazer por completo:
--   --   drop function gps.socio_cadastro_gravar(text,text,text,text,text,text,text,text,text,text);
--   --   drop function gps.socio_cadastro_obrigatorio();
--   --   delete from gps.config where chave = 'socio_cadastro_obrigatorio';
--   --   -- o CHECK de acessos_log.acao NÃO se reverte sozinho: recriar sem o
--   --   -- valor 'socio_cadastro_preenchido' exigiria 0 linhas com essa ação.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. gps.config.socio_cadastro_obrigatorio — nasce 'false'
-- ═══════════════════════════════════════════════════════════════════════════

insert into gps.config (chave, valor)
values ('socio_cadastro_obrigatorio', 'false')
on conflict (chave) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. gps.socio_cadastro_obrigatorio() — o sócio lê o interruptor
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Molde EXATO de gps.convite_socio_ativo() (…245): mesma razão de existir
-- (gps.config só tem policy de admin), mesma falha fechada.

create or replace function gps.socio_cadastro_obrigatorio()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (select valor = 'true' from gps.config where chave = 'socio_cadastro_obrigatorio'),
    false
  );
$function$;

revoke execute on function gps.socio_cadastro_obrigatorio() from public, anon;
grant  execute on function gps.socio_cadastro_obrigatorio() to authenticated;

comment on function gps.socio_cadastro_obrigatorio() is
  'Interruptor do cadastro obrigatorio do socio convidado, legivel por qualquer usuario autenticado. gps.config so tem policy de admin -- expor a linha inteira vazaria resend_api_key/email_from. Molde de gps.convite_socio_ativo() (...245). Falha fechado: chave ausente devolve false.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. CHECK de gps.acessos_log.acao — soma 'socio_cadastro_preenchido'
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Acha o CHECK pelo CONTEÚDO ('acessos_criados_em_lote', valor mais recente
-- que a ...200 acrescentou e que a ...244 confirmou continuar vigente),
-- NUNCA pelo nome. Mesma técnica das ...092/...150/...200/...244. O
-- `insert` em acessos_log é o ÚLTIMO passo da RPC do bloco 4 — sem este
-- CHECK aceitando o valor novo, a transação inteira reverteria DEPOIS de já
-- ter gravado o cadastro (o mesmo modo de falha que deixou
-- admin_adotar_login_existente quebrada por 15 dias).

do $$
declare v_nome text;
begin
  select con.conname
    into v_nome
    from pg_constraint con
    join pg_class     c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'gps'
     and c.relname = 'acessos_log'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) like '%acessos_criados_em_lote%';

  if v_nome is null then
    raise exception
      'CHECK de gps.acessos_log.acao nao encontrado (procurado pelo CONTEUDO acessos_criados_em_lote) -- migracao abortada para nao deixar gps.socio_cadastro_gravar gravando uma acao que a constraint rejeita. Leia o CHECK vigente no banco (select pg_get_constraintdef(oid) from pg_constraint where conname=...) antes de reescrever esta lista: migracoes posteriores a ...244 podem ja ter acrescentado valores novos.';
  end if;

  execute format('alter table gps.acessos_log drop constraint %I', v_nome);
end;
$$;

-- Lista COMPLETA vigente em 15/09/2026, LIDA DO BANCO (22 valores) + o 1
-- novo desta migração = 23. Conferida com:
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid='gps.acessos_log'::regclass and contype='c';
-- 5 do baseline + 7 da Central ...150 + 3 da mega feature ...200 + 3 da
-- feature Equipe ...244 + 4 posteriores (chamados, troca de e-mail, export).
alter table gps.acessos_log
  add constraint acessos_log_acao_check check (acao = any (array[
    'senha_definida',
    'acesso_excluido',
    'socio_adicionado',
    'membro_excluido',
    'ambiente_ambiguo',
    -- ── Central de resolução (09/09/2026, migrações ...152 a ...157) ──
    'etapa_liberacao_alterada',
    'progresso_reaberto',
    'membro_pessoa_vinculada',
    'titular_trocado',
    'membro_movido',
    'financeiro_vinculado',
    'financeiro_desvinculado',
    -- ── Mega feature: onboarding e trava do favorito (10/09/2026) ──
    'favorito_confirmado',
    'favorito_liberado',
    'acessos_criados_em_lote',
    -- ── Equipe: autosserviço de convite de sócio (11/09/2026) ──
    'socio_convidado',
    'socio_convite_aceito',
    'socio_convite_revogado',
    -- ── Chamados, troca de e-mail e export (migrações posteriores à ...244) ──
    -- 🔴 CONFERIDOS NO BANCO EM 15/09/2026 antes de reescrever esta lista.
    -- Estes 4 NÃO estavam na ...244 e nenhum tem linha gravada ainda, logo a
    -- migração aplicaria LIMPA sem eles e só quebraria depois, na primeira
    -- exportação de clientes ou aprovação de chamado. É o mesmo modo de falha
    -- que deixou admin_adotar_login_existente quebrada por 15 dias.
    'chamado_solicitacao_aprovada',
    'chamado_solicitacao_declinada',
    'email_login_alterado',
    'clientes_exportados',
    -- ── Onboarding obrigatório do sócio convidado (15/09/2026) ──
    'socio_cadastro_preenchido'    -- gps.socio_cadastro_gravar
  ]));

comment on constraint acessos_log_acao_check on gps.acessos_log is
  'Catalogo fechado das acoes administrativas auditadas. Espelha ROTULO_ACAO_ADMIN em src/components/admin/diario-labels.ts. 5 do baseline; 7 da Central (...150); 3 da mega feature (...200); 3 da feature Equipe (...244); 4 posteriores (chamados, email_login_alterado, clientes_exportados); 1 do onboarding obrigatorio do socio (...256): socio_cadastro_preenchido. Ao acrescentar valor, LEIA O CHECK VIGENTE NO BANCO antes -- reescrever a lista de memoria apaga valores em silencio.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 3b. gps.cpf_valido — dígito verificador
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Espelha `cpfValido` de src/lib/masks.ts:39. Existe porque a validação do
-- cliente não é fronteira: Server Action é endpoint HTTP, e `char_length=11`
-- sozinho aceita '11111111111' (medido — criou pessoa em produção durante a
-- prova desta migração). `immutable` para poder ser usada em CHECK no futuro.

create or replace function gps.cpf_valido(p_doc text)
returns boolean
language plpgsql
immutable
set search_path to ''
as $function$
declare
  d text := regexp_replace(coalesce(p_doc, ''), '\D', '', 'g');
  soma int; resto int; i int;
begin
  if char_length(d) <> 11 then return false; end if;
  -- repetidos ('00000000000' … '99999999999') passam na conta mas não existem
  if d ~ '^(.)\1{10}$' then return false; end if;

  soma := 0;
  for i in 1..9 loop
    soma := soma + substring(d, i, 1)::int * (11 - i);
  end loop;
  resto := (soma * 10) % 11;
  if resto = 10 then resto := 0; end if;
  if resto <> substring(d, 10, 1)::int then return false; end if;

  soma := 0;
  for i in 1..10 loop
    soma := soma + substring(d, i, 1)::int * (12 - i);
  end loop;
  resto := (soma * 10) % 11;
  if resto = 10 then resto := 0; end if;
  if resto <> substring(d, 11, 1)::int then return false; end if;

  return true;
end;
$function$;

comment on function gps.cpf_valido(text) is
  'Digito verificador de CPF. Espelha cpfValido de src/lib/masks.ts:39. Criada em 15/09/2026 depois de a prova da ...256 mostrar que validar so o tamanho aceitava 11111111111.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. gps.socio_cadastro_gravar — o sócio preenche o próprio cadastro
-- ═══════════════════════════════════════════════════════════════════════════
--
-- 10 parâmetros. E-mail NÃO entra: vem de auth.users.email, lido no
-- servidor. Sequência: identidade → papel/estado do membro → validação dos
-- campos → normalização do documento → busca/update/insert em thb_alunos →
-- vínculo em gps.membros (com rede contra a corrida) → log (último passo).

create or replace function gps.socio_cadastro_gravar(
  p_nome        text,
  p_documento   text,
  p_telefone    text,
  p_cep         text,
  p_cidade      text,
  p_estado      text,
  p_bairro      text,
  p_logradouro  text,
  p_numero      text,
  p_pais        text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user         uuid := auth.uid();
  v_membro       gps.membros%rowtype;
  v_email        text;
  v_nome         text := btrim(coalesce(p_nome, ''));
  v_documento    text := regexp_replace(coalesce(p_documento, ''), '\D', '', 'g');
  v_doc_norm     text;
  v_telefone     text := btrim(coalesce(p_telefone, ''));
  v_telefone_164 text;
  v_cep          text := regexp_replace(coalesce(p_cep, ''), '\D', '', 'g');
  v_cidade       text := btrim(coalesce(p_cidade, ''));
  v_estado       text := upper(btrim(coalesce(p_estado, '')));
  v_bairro       text := btrim(coalesce(p_bairro, ''));
  v_logradouro   text := btrim(coalesce(p_logradouro, ''));
  v_numero       text := btrim(coalesce(p_numero, ''));
  v_pais         text := btrim(coalesce(p_pais, ''));
  v_aluno_id     uuid;
  v_cpf_de_outro boolean := false;
begin
  -- 1) Identidade. Nunca um user_id vindo do cliente.
  if v_user is null then
    raise exception 'Faça login para preencher o seu cadastro.' using errcode = '42501';
  end if;

  -- 2) Resolve o membro por user_id. Só sócio, e só quem ainda não tem
  -- cadastro vinculado (impede reenvio depois de já ter uma pessoa —
  -- reabrir isso é vínculo, tarefa da Central, não deste formulário).
  select * into v_membro from gps.membros where user_id = v_user;
  if not found then
    raise exception 'Não encontramos o seu vínculo com o programa.' using errcode = 'P0002';
  end if;
  if v_membro.papel <> 'socio' then
    raise exception 'Este cadastro é só para o sócio convidado.' using errcode = '42501';
  end if;
  if v_membro.pessoa_aluno_id is not null then
    raise exception 'Este cadastro já foi preenchido.' using errcode = '22023';
  end if;

  -- 3) E-mail vem do SERVIDOR — qualquer e-mail no payload é ignorado.
  select lower(trim(u.email)) into v_email
    from auth.users u where u.id = v_user and u.deleted_at is null;
  if v_email is null or v_email = '' then
    raise exception 'Não encontramos o e-mail do seu login.' using errcode = 'P0002';
  end if;

  -- 4) Validação dos 11 campos (10 parâmetros + e-mail do servidor).
  if char_length(v_nome) < 2 then
    raise exception 'Escreva o nome completo.' using errcode = '22023';
  end if;
  if char_length(v_nome) > 120 then
    raise exception 'O nome passa de 120 caracteres.' using errcode = '22023';
  end if;
  if v_nome ~ '[\r\n]' then
    raise exception 'O nome não pode ter quebra de linha.' using errcode = '22023';
  end if;

  if v_documento = '' then
    raise exception 'Informe o CPF.' using errcode = '22023';
  end if;
  if char_length(v_documento) <> 11 then
    raise exception 'CPF inválido.' using errcode = '22023';
  end if;
  -- 🔴 Dígito verificador, não só o tamanho. Medido em 15/09/2026: a versão
  -- que checava só `char_length = 11` ACEITOU '111.111.111-11' e criou a
  -- pessoa. Um CPF inválido em thb_alunos gruda o sócio numa identidade que
  -- não existe, e é justamente a coluna pela qual o gatilho de vínculo casa
  -- login (`lpad(dígitos,14,'0')`) — o estrago não fica nesta tela.
  -- O frontend já barra com `documentoValido` (src/lib/masks.ts:72), mas
  -- Server Action é endpoint HTTP: a fronteira real é aqui.
  if not gps.cpf_valido(v_documento) then
    raise exception 'CPF inválido.' using errcode = '22023';
  end if;

  v_telefone_164 := case
    when char_length(regexp_replace(v_telefone, '\D', '', 'g')) in (10, 11)
      then '+55' || regexp_replace(v_telefone, '\D', '', 'g')
    else null
  end;
  if v_telefone_164 is null then
    raise exception 'Telefone inválido.' using errcode = '22023';
  end if;

  if v_cep = '' or char_length(v_cep) <> 8 then
    raise exception 'CEP inválido.' using errcode = '22023';
  end if;
  if v_cidade = '' or char_length(v_cidade) > 120 then
    raise exception 'Informe a cidade.' using errcode = '22023';
  end if;
  if v_estado !~ '^[A-Z]{2}$' then
    raise exception 'Escolha o estado na lista.' using errcode = '22023';
  end if;
  if v_bairro = '' or char_length(v_bairro) > 120 then
    raise exception 'Informe o bairro.' using errcode = '22023';
  end if;
  if v_logradouro = '' or char_length(v_logradouro) > 200 then
    raise exception 'Informe o endereço.' using errcode = '22023';
  end if;
  if v_numero = '' or char_length(v_numero) > 20 then
    raise exception 'Informe o número.' using errcode = '22023';
  end if;
  if v_pais = '' or char_length(v_pais) > 60 then
    raise exception 'Informe o país.' using errcode = '22023';
  end if;

  -- 5) Normaliza o documento com a MESMA regra do gatilho de vínculo e de
  -- gps.aluno_por_documento (...131): lpad(dígitos, 14, '0').
  v_doc_norm := lpad(v_documento, 14, '0');

  -- 6) Busca por documento reusando gps.aluno_por_documento (mesma
  -- normalização do gatilho de vínculo). Ela é SECURITY INVOKER, mas como
  -- esta função já é DEFINER (roda como o dono), a RLS de thb_alunos não
  -- entra no caminho — a guarda de identidade dos passos 1-2 já resolveu
  -- quem pode chegar até aqui.
  select a.id into v_aluno_id
    from gps.aluno_por_documento(v_documento) a
   limit 1;

  -- 🔴 A CHECAGEM DE DONO VEM ANTES DA ESCRITA (achado ALTO do pentest,
  -- 15/09/2026). Se o CPF digitado já é a pessoa de OUTRO membro, esta RPC
  -- NÃO pode tocar a linha: `thb_alunos` é compartilhada com o sip, e o
  -- update sobrescreveria nome, telefone e endereço de um terceiro real.
  -- Bastava o sócio digitar o CPF de um colega — ou do próprio titular que
  -- o convidou — para corromper o cadastro dessa pessoa nos dois sistemas.
  -- A versão anterior checava o dono só no passo 7, DEPOIS do update: isso
  -- impedia o vínculo, mas a escrita indevida já tinha acontecido e não era
  -- revertida. A trilha registrava o evento sem impedir nada — detecção
  -- tardia, não prevenção.
  if v_aluno_id is not null and exists (
    select 1 from gps.membros
     where pessoa_aluno_id = v_aluno_id and user_id is distinct from v_user
  ) then
    v_cpf_de_outro := true;
    v_aluno_id := null;          -- nada será escrito nem vinculado
  end if;

  if v_cpf_de_outro then
    -- Sai sem gravar. A pessoa entra no sistema (pessoa_aluno_id fica nulo)
    -- e a Central resolve o vínculo depois, decidindo qual pessoa é a real.
    insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
    values ('socio_cadastro_preenchido', v_membro.aluno_id, v_user, v_email,
            'sócio informou CPF que já pertence a outra pessoa do programa; nada foi gravado',
            v_user);
    return jsonb_build_object('ok', false, 'cpf_de_outro_membro', true);
  end if;

  if v_aluno_id is not null then
    update public.thb_alunos set
      nome                = v_nome,
      email               = coalesce(nullif(email, ''), v_email),
      telefone            = v_telefone,
      telefone_e164       = v_telefone_164,
      cep                 = v_cep,
      cidade              = v_cidade,
      estado              = v_estado,
      bairro              = v_bairro,
      endereco_logradouro = v_logradouro,
      endereco_numero     = v_numero,
      pais                = v_pais,
      -- 🔴 NÃO gravar `atualizado_por` aqui: a FK fk_thb_alunos_atualizado_por
      -- aponta para public.perfis (a EQUIPE interna), e o sócio nunca tem
      -- linha lá — medido em 15/09/2026: 0 dos 2 sócios sem pessoa estão em
      -- perfis. Gravar o user_id do sócio fazia a RPC estourar 23503 em 100%
      -- das chamadas, no primeiro uso real. A autoria da mudança fica na
      -- trilha de gps.acessos_log (feito_por = o próprio sócio), que é o
      -- lugar certo dela.
      atualizado_por_em   = now()
     where id = v_aluno_id;
  else
    insert into public.thb_alunos (
      nome, email, documento, tipo_documento,
      telefone, telefone_e164,
      cep, cidade, estado, bairro,
      endereco_logradouro, endereco_numero, pais,
      fonte, atualizado_por_em
    ) values (
      v_nome, v_email, v_documento, 'CPF',
      v_telefone, v_telefone_164,
      v_cep, v_cidade, v_estado, v_bairro,
      v_logradouro, v_numero, v_pais,
      -- `atualizado_por` omitido pela mesma razão do update acima (FK para
      -- public.perfis, que só tem a equipe interna).
      'gps_socio_onboarding', now()
    )
    returning id into v_aluno_id;
  end if;

  -- 7) Vínculo em gps.membros. O caso "CPF de outro membro" já saiu da
  -- função lá em cima, sem escrever nada — aqui só resta a REDE contra a
  -- corrida: outra transação pode ter vinculado esta mesma pessoa entre a
  -- checagem e este update. `membros_pessoa_uk` (…160) é quem garante.
  begin
    update gps.membros set pessoa_aluno_id = v_aluno_id where user_id = v_user;
  exception when unique_violation then
    -- Perdeu a corrida: a pessoa virou de outro membro no meio do caminho.
    -- Os dados já foram gravados em thb_alunos, mas aquela linha não tinha
    -- dono no momento da checagem — não é sobrescrita de terceiro.
    v_cpf_de_outro := true;
  end;

  -- 8) Trilha — último passo (mesma ordem de todas as RPCs deste padrão: se
  -- o CHECK do bloco 3 não aceitasse o valor novo, é aqui que reverteria a
  -- transação inteira). `detalhe` é `text` (não jsonb) — molde de `format()`
  -- das RPCs da Central (...152 a ...157).
  insert into gps.acessos_log (acao, aluno_id, user_id_alvo, email_alvo, detalhe, feito_por)
  values ('socio_cadastro_preenchido', v_membro.aluno_id, v_user, v_email,
          format('sócio preencheu o cadastro (documento %s)%s',
                 left(v_doc_norm, 3) || '.***.***-**',
                 case when v_cpf_de_outro
                      then ' — CPF já é de outra pessoa do programa; vínculo NÃO criado'
                      else '' end),
          v_user);

  return jsonb_build_object(
    'ok', true,
    'cpf_de_outro_membro', v_cpf_de_outro
  );
end;
$function$;

comment on function gps.socio_cadastro_gravar(text,text,text,text,text,text,text,text,text,text) is
  'O socio convidado preenche o proprio cadastro (11 campos; email vem de auth.users, nao do parametro). Grava/atualiza public.thb_alunos e liga gps.membros.pessoa_aluno_id -- exceto quando o CPF ja e pessoa de OUTRO membro, caso em que os dados sao gravados mas o vinculo fica NULL (a Central resolve depois) e o retorno sinaliza cpf_de_outro_membro sem revelar nome nem ambiente de terceiro. Guarda: so socio, so quem ainda nao tem pessoa_aluno_id. Molde de identidade: gps.trocar_meu_nome (...228). Normalizacao de documento: gps.aluno_por_documento (...131).';

revoke all on function gps.socio_cadastro_gravar(text,text,text,text,text,text,text,text,text,text) from public, anon;
grant execute on function gps.socio_cadastro_gravar(text,text,text,text,text,text,text,text,text,text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Conferência de grants (rodar depois de aplicar; deve bater 1 linha cada)
-- ═══════════════════════════════════════════════════════════════════════════
--
--   select p.proname,
--          has_function_privilege('anon',          p.oid, 'execute') as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
--          has_function_privilege('public',        p.oid, 'execute') as public
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'gps' and p.proname like 'socio_cadastro%'
--    order by p.proname;
--   -- ESPERADO:
--   --   socio_cadastro_gravar       anon=f authenticated=t public=f
--   --   socio_cadastro_obrigatorio  anon=f authenticated=t public=f

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Nenhuma tabela nova → nenhuma policy nova.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PROVA EM ROLLBACK (rodar como `postgres`, DEPOIS de aplicar, dentro de um
-- `do $$ ... $$` terminado em `raise exception` para nada sobreviver).
-- `set local role authenticated` + JWT real onde há guarda de auth.uid() —
-- como `postgres` não passa pelas guardas de identidade, prova só como
-- superusuário não vale para os casos A a E.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- do $$
-- declare
--   v_ambiente_a uuid; v_titular_a uuid; v_socio_a uuid; v_user_a uuid;
--   v_ambiente_b uuid; v_titular_b uuid;
--   v_email_a text := 'prova.socio.cadastro.A@exemplo.invalid';
--   v_doc_a   text := '52998224725'; -- CPF válido de exemplo (RF)
--   v_ret_a jsonb; v_ret_b jsonb; v_ret_c jsonb;
--   v_erro_d text; v_erro_e text; v_erro_f text;
-- begin
--   -- setup: titular A com sócio SEM pessoa (caso A), titular B (para a
--   -- prova D: titular tentando chamar a RPC de sócio).
--   ... (monta ambiente_a/titular_a/socio_a via insert em thb_alunos +
--        auth.users + gps.membros, no molde da prova da ...244) ...
--
--   -- A) sócio sem pessoa grava e ganha pessoa_aluno_id
--   perform set_config('request.jwt.claims',
--     json_build_object('sub', v_user_a, 'role','authenticated')::text, true);
--   set local role authenticated;
--   select gps.socio_cadastro_gravar(
--     'Sócio de Prova', v_doc_a, '51993662779', '90000000', 'Porto Alegre',
--     'RS', 'Centro', 'Rua de Prova', '100', 'Brasil'
--   ) into v_ret_a;
--   reset role;
--   -- esperado: v_ret_a->>'ok' = 'true', v_ret_a->>'cpf_de_outro_membro' = 'false',
--   -- e select pessoa_aluno_id from gps.membros where user_id = v_user_a
--   -- deixa de ser NULL.
--
--   -- B) CPF já em thb_alunos (linha livre) → REUSA, não duplica
--   --    (repetir com um CPF que já tem linha em thb_alunos sem dono e
--   --    conferir que o count(*) de thb_alunos por esse documento continua 1)
--
--   -- C) CPF já é pessoa de OUTRO membro → grava dados, pessoa_aluno_id
--   --    fica NULL, frase não vaza terceiro
--   --    (chamar com o documento de v_socio_a a partir de um SEGUNDO user;
--   --     esperado: ok=true, cpf_de_outro_membro=true, e o segundo membro
--   --     continua com pessoa_aluno_id NULL)
--
--   -- D) titular chamando → 42501
--   begin
--     perform set_config('request.jwt.claims',
--       json_build_object('sub', v_titular_a, 'role','authenticated')::text, true);
--     set local role authenticated;
--     perform gps.socio_cadastro_gravar('X', v_doc_a, '51993662779', '90000000',
--       'Porto Alegre', 'RS', 'Centro', 'Rua', '1', 'Brasil');
--     reset role;
--   exception when others then
--     reset role;
--     v_erro_d := sqlerrm;
--   end;
--   -- esperado: v_erro_d = 'Este cadastro é só para o sócio convidado.'
--
--   -- E) e-mail forjado no payload é ignorado — a RPC não tem parâmetro de
--   --    e-mail, então não há como forjar (a prova é estrutural: conferir
--   --    a assinatura da função com \df gps.socio_cadastro_gravar e ver que
--   --    são 10 parâmetros).
--
--   -- F) anon chamando a RPC → negado
--   begin
--     set local role anon;
--     perform gps.socio_cadastro_gravar('X', v_doc_a, '51993662779', '90000000',
--       'Porto Alegre', 'RS', 'Centro', 'Rua', '1', 'Brasil');
--     reset role;
--   exception when others then
--     reset role;
--     v_erro_f := sqlerrm;
--   end;
--   -- esperado: v_erro_f = 'permission denied for function socio_cadastro_gravar'
--
--   raise exception E'PROVA ...256 (abortando para nada sobreviver)\nA: %\nD: %\nF: %',
--     v_ret_a, v_erro_d, v_erro_f;
-- end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. PROVAS RODADAS EM 15/09/2026 (produção, mbvybujpkwuorhtdzcde)
-- ═══════════════════════════════════════════════════════════════════════════
--
-- EXPLAIN (ANALYZE, BUFFERS) da busca por documento em thb_alunos:
--
--   Seq Scan on thb_alunos  (cost=0.00..693.45 rows=9 width=16)
--                           (actual time=0.116..2.171 rows=1 loops=1)
--     Filter: (lpad(regexp_replace(COALESCE(documento,''),'\D','','g'),14,'0')
--              = '00015400154832')
--     Rows Removed by Filter: 1857
--     Buffers: shared hit=661
--   Planning Time: 1.246 ms
--   Execution Time: 2.230 ms
--
--   VEREDITO: Seq Scan, 2,2 ms em 1.858 linhas. REPORTADO, NÃO CORRIGIDO.
--   Não se cria índice aqui: (a) a busca roda UMA VEZ por sócio, e o teto
--   estrutural é 1 sócio por ambiente (~142 hoje); (b) thb_alunos já tem 18
--   índices e este projeto já mediu índice deixando query MAIS LENTA
--   (etapa1_clientes(fase): Seq Scan 0,686 ms × Index Scan 0,809 ms);
--   (c) um índice funcional em lpad(regexp_replace(...)) só serviria a esta
--   chamada e pesaria em todo insert/update da tabela, que é compartilhada
--   com o sip.
--
-- PROVA FUNCIONAL (em transação revertida, exceto onde indicado):
--   B) CPF já em thb_alunos (Carlos, caso real) → delta de linhas = 0,
--      reusou a linha existente, pessoa_aluno_id vinculado. OK
--   E) e-mail forjado no payload → ignorado; gravou o de auth.users. OK
--   D) titular chamando → [42501] 'Este cadastro é só para o sócio convidado.' OK
--   A2) reenvio com pessoa já vinculada → [22023] 'Este cadastro já foi preenchido.' OK
--   V2) CPF com 10 dígitos → [22023] 'CPF inválido.' OK
--   V3) CPF '111.111.111-11' → *** ACEITOU E CRIOU PESSOA *** ← DEFEITO
--       Corrigido nesta migração pelo bloco 3b (gps.cpf_valido).
--       Revalidado: 9/9 casos, incluindo os 2 CPFs reais da base.
--
-- DEFEITOS ENCONTRADOS E CORRIGIDOS DURANTE A PROVA:
--   1. CHECK de acessos_log reescrito com 19 valores enquanto o banco tinha
--      22 — apagaria em silêncio chamado_solicitacao_aprovada/declinada,
--      email_login_alterado e clientes_exportados. Nenhuma tinha linha
--      gravada, então a migração aplicaria LIMPA e só quebraria na primeira
--      exportação de clientes. Corrigido: lista lida do banco.
--   2. `atualizado_por = v_user` violava fk_thb_alunos_atualizado_por (aponta
--      para public.perfis, só a equipe interna; 0 dos 2 sócios estão lá).
--      Estourava 23503 em 100% das chamadas. Corrigido: coluna não é mais
--      escrita; a autoria fica em gps.acessos_log.
--   3. CPF sem dígito verificador (acima).
