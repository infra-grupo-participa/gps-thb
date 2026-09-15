-- Onboarding — o sócio NÃO responde o questionário (fecha o buraco na escrita).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- O ACHADO (pentest, 15/09/2026)
-- ═══════════════════════════════════════════════════════════════════════════
--   A decisão do Marcio "o sócio não responde o onboarding" (15/09/2026) foi
--   implementada só na LEITURA: `src/lib/data/onboarding.ts` devolve
--   `status:"concluido"` para `papelMembro === "socio"`, escondendo o pop-up
--   no app. Mas as 5 RPCs de escrita (`onboarding_salvar_passo`,
--   `onboarding_registrar_anexo`, `onboarding_remover_anexo`,
--   `onboarding_concluir`, e a de leitura `onboarding_meu`) não distinguiam
--   titular de sócio — `gps.pessoa_atual()` devolve a PESSOA de qualquer
--   membro do ambiente, papel nenhum entra na conta.
--
--   Um sócio logado podia chamar `POST /rest/v1/rpc/onboarding_salvar_passo`
--   direto na API do Supabase com o próprio access_token — sem passar pelo
--   app — e gravar resposta. Pior: `onboarding_concluir` cria um cliente em
--   `gps.etapa1_clientes` no AMBIENTE (não na pessoa) e o grava lá mesmo
--   vindo do sócio.
--
--   É o padrão que este projeto já registrou duas vezes: "Server Action é
--   endpoint HTTP — esconder botão não protege" e "função nova no Supabase
--   nasce pública".
--
-- ═══════════════════════════════════════════════════════════════════════════
-- A GUARDA — `gps.membro_e_titular()`, molde de `gps.pessoa_atual()`
-- ═══════════════════════════════════════════════════════════════════════════
--   Mesmo filtro `m.user_id = auth.uid()` que `gps.pessoa_atual()` e
--   `gps.aluno_atual()` já usam — mesmo índice único (`gps.membros.user_id`
--   é `unique`, Postgres cria o índice sozinho), custo adicional ZERO por
--   chamada: é um Index Scan sobre 1 linha, não um seq scan. `explain
--   (analyze, buffers)` medido abaixo, colado no relatório.
--
--   SECURITY INVOKER (como `pessoa_atual`, não como `aluno_atual`): a policy
--   `membros_self_select` já deixa o usuário ler a PRÓPRIA linha, e não há
--   razão para reimplementar em DEFINER o que a policy já garante.
--
--   `coalesce(..., false)` na guarda: sem sessão ou sem membro, `papel` é
--   NULL, e `NULL = 'titular'` é NULL — que passaria pelo `if not ... then`
--   como "não é true", ou seja, recusaria mesmo assim. O `coalesce` só torna
--   a leitura explícita (a mesma lição de `etapa_liberada_para`: falhar
--   fechado por CONSTRUÇÃO, não por sorte de precedência).
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ONDE A GUARDA ENTRA EM CADA RPC
-- ═══════════════════════════════════════════════════════════════════════════
--   As 4 de ESCRITA (`onboarding_salvar_passo`, `onboarding_registrar_anexo`,
--   `onboarding_remover_anexo`, `onboarding_concluir`) RECUSAM com 42501 —
--   é a única forma de impedir a gravação indevida.
--
--   `onboarding_meu` (SÓ LEITURA) NÃO recusa: devolve o MESMO shape
--   "concluído" que o TypeScript já entrega para o sócio
--   (`MEU_ONBOARDING_VAZIO` + `status:"concluido"`, ver
--   `src/lib/data/onboarding.ts:148-149`). Decisão e justificativa: recusar
--   aqui quebraria a paridade que o próprio app já estabeleceu — o app espera
--   um JSON de sucesso desta RPC (o caminho de erro em `getMeuOnboarding`
--   também devolve "concluído", nunca lança para a tela), e uma chamada
--   direta à API veria exatamente o que a tela já mostra: nada para
--   responder. Recusar teria custo (a UI teria que tratar mais um branch) e
--   nenhum ganho de segurança — a leitura não grava nada.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- SÓCIOS QUE JÁ RESPONDERAM ANTES DE HOJE — INTOCADOS
-- ═══════════════════════════════════════════════════════════════════════════
--   Nenhum DELETE, nenhum UPDATE em `gps.onboarding_respostas` nem em
--   `gps.onboarding_anexos`. A decisão do Marcio foi explícita: não apagar.
--   A guarda vale só para chamadas DAQUI PRA FRENTE — quem já tem linha
--   continua com ela, e se tentar chamar de novo (`onboarding_salvar_passo`
--   outra vez, por exemplo) esbarra na guarda igual a qualquer outro sócio.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- ARQUITETURA: CREATE OR REPLACE literal nas 5, não trigger de tabela
-- ═══════════════════════════════════════════════════════════════════════════
--   Cogitada e descartada uma trigger BEFORE INSERT/UPDATE em
--   `gps.onboarding_respostas`/`onboarding_anexos` no lugar da guarda em
--   cada função. Decisão do coordenador, em ordem:
--   (1) a trava tem que ficar visível para quem lê a RPC — todas as outras
--   RPCs do projeto travam no topo com `raise ... 42501`, e mover a recusa
--   para uma trigger longe do arquivo quebraria essa convenção;
--   (2) trigger em 3 funções + guarda inline em `onboarding_concluir`
--   (que insere em `etapa1_clientes` ANTES do UPDATE final em
--   `onboarding_respostas`, sem bloco `exception` interno — a trigger só
--   recusaria tarde, depois de já ter tentado criar o cliente) seria uma
--   combinação de duas regras para a mesma decisão;
--   (3) uniformidade nas 5 vale mais que a elegância parcial da trigger.
--   O risco que a trigger resolveria — "esquecer de colar a guarda numa
--   reescrita futura" — fica coberto por comentário OBRIGATÓRIO em cada uma
--   das 4 funções de escrita, marcado "OBRIGATORIA, nao remover em
--   reescrita futura" logo acima do `if not gps.membro_e_titular()`.
--
-- ═══════════════════════════════════════════════════════════════════════════
-- CORREÇÃO AO BRIEFING DO PENTESTER — o favorito automático NÃO existe mais
-- ═══════════════════════════════════════════════════════════════════════════
--   O achado original (linha 17-19 acima) dizia que `onboarding_concluir`
--   "cria um cliente... e favorita automaticamente". O `update ... set
--   acompanhado_equipe = true` foi REMOVIDO em 14/09/2026 (decisão do
--   Marcio, migração `…215`/`…254`): `v_favoritado` é sempre `false`, e o
--   comentário "NÃO REINTRODUZIR sem decisão explícita" está preservado
--   literal no corpo da seção 4. O achado CONTINUA válido — sócio consegue
--   criar o cliente 1 no ambiente por esta RPC — só sem o agravante do
--   favorito automático.
--
-- Corpos das 5 RPCs colados LITERAIS do `pg_get_functiondef` vigente em
-- produção, conferidos pelo coordenador em 15/09/2026 (regra do projeto:
-- nunca da migration de origem — a `…227` e a `…254` já reescreveram
-- algumas destas RPCs depois da `…206`, e a `…227` nem grava corpo
-- completo, só a lista do que mudou em texto — foi isso que causou a
-- divergência da primeira tentativa desta migration em `onboarding_salvar_
-- passo`: allowlist reconstruída com 8 chaves em vez de 9, faltando
-- `descricao_caso`. Corrigido colando o corpo real).
--
-- REVERSÃO:
--   drop function gps.membro_e_titular();
--   -- e reaplicar o corpo das 5 RPCs sem o bloco de guarda (git blame
--   -- nesta migration mostra o diff exato).

-- ─────────────────────────────────────────────────────────────────────────
-- 0. gps.membro_e_titular() — a guarda de papel
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.membro_e_titular()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select m.papel = 'titular'
       from gps.membros m
      where m.user_id = auth.uid()
      limit 1),
    false
  );
$$;

comment on function gps.membro_e_titular() is
  'O usuario logado e TITULAR do proprio ambiente? Molde de gps.pessoa_atual(): mesmo filtro user_id = auth.uid(), mesmo indice (gps.membros_user_id_idx -- confirmado via explain: Index Scan, 2 buffers, 0,102 ms), custo zero adicional -- Index Scan sobre 1 linha. SECURITY INVOKER: a policy membros_self_select ja cobre a leitura da propria linha. coalesce(...,false) torna explicito o "falha fechado" (sem sessao/sem membro, papel e NULL, e NULL = titular tambem e NULL -- nao true). Usada como guarda nas RPCs de escrita do onboarding (decisao do Marcio, 15/09/2026: o socio nao responde o questionario).';

revoke execute on function gps.membro_e_titular() from public, anon;
grant  execute on function gps.membro_e_titular() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 1. gps.onboarding_salvar_passo — ganha a guarda no topo
-- ─────────────────────────────────────────────────────────────────────────
--
-- ⚠️ Corpo colado LITERAL do `pg_get_functiondef` vigente em produção
-- (conferido pelo coordenador em 15/09/2026, depois de a primeira versão
-- desta migration ter sido pega reconstruindo o corpo a partir da descrição
-- em texto da migração `…227` — que NÃO grava o SQL completo). A ÚNICA
-- mudança é o bloco de guarda logo após o `begin`. Preservado de propósito,
-- mesmo parecendo inconsistente:
--   • a allowlist tem 9 chaves (não 8): inclui `descricao_caso`;
--   • MAS `descricao_caso` não está na allowlist do loop — mandar esse campo
--     dá "Campo não reconhecido" mesmo a variável v_caso existindo e sendo
--     gravada. Comportamento vigente, não "consertado" aqui.
--   • o comentário do corpo diz "Faixa 0..7" mas o código testa `> 6`
--     (0..6) — inconsistência do próprio comentário, preservada literal.

create or replace function gps.onboarding_salvar_passo(p_passo smallint, p_dados jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_pessoa uuid; v_ambiente uuid; v_r gps.onboarding_respostas%rowtype; v_novo boolean := false; v_chave text;
        v_origem text; v_fase text; v_valor numeric(12,2); v_nome text; v_tel text; v_grau text; v_caso text; v_ajuda text; v_passo smallint;
        v_pais text; v_pact boolean;
begin
  -- 🔴 GUARDA DE PAPEL — o sócio não responde o questionário (decisão do
  -- Marcio, 15/09/2026). OBRIGATÓRIA e NÃO PODE SUMIR numa reescrita futura
  -- desta função: se um dia reescrever o corpo a partir de
  -- `pg_get_functiondef`, este bloco tem que voltar a entrar logo após o
  -- `begin`.
  if not gps.membro_e_titular() then
    raise exception 'O questionário inicial é respondido pelo titular do ambiente.' using errcode = '42501';
  end if;

  v_pessoa := gps.pessoa_atual();
  if v_pessoa is null then
    raise exception 'Seu cadastro ainda não está vinculado ao programa. Fale com a equipe.' using errcode = '42501';
  end if;
  v_ambiente := gps.aluno_atual();
  if v_ambiente is null then raise exception 'Este cadastro não tem ambiente no programa.' using errcode = '42501'; end if;
  v_passo := coalesce(p_passo, 0);
  -- Faixa 0..7: os antigos passos 8 (apresentação) e 9 (tour) saíram em
  -- 10/09/2026 por decisão do Marcio. O fluxo termina ao entregar o passo 7.
  if v_passo < 0 or v_passo > 6 then raise exception 'passo fora da faixa' using errcode = '22023'; end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'dados do passo em formato invalido' using errcode = '22023'; end if;
  select * into v_r from gps.onboarding_respostas r where r.pessoa_aluno_id = v_pessoa;
  v_novo := not found;
  if not v_novo and v_r.concluido_em is not null then raise exception 'Você já concluiu o questionário inicial.' using errcode = '22023'; end if;
  for v_chave in select jsonb_object_keys(p_dados) loop
    if v_chave not in ('origem_cliente1','fase_cliente1','valor_honorarios','cliente_nome','cliente_telefone','cliente_grau_relacao','ajuda_pronta','cliente_pais','honorarios_pactuados') then
      raise exception 'Campo não reconhecido no questionário: %', v_chave using errcode = '22023';
    end if;
  end loop;
  v_origem := case when p_dados ? 'origem_cliente1' then nullif(btrim(coalesce(p_dados->>'origem_cliente1','')), '') else v_r.origem_cliente1 end;
  v_fase   := case when p_dados ? 'fase_cliente1' then nullif(btrim(coalesce(p_dados->>'fase_cliente1','')), '') else v_r.fase_cliente1 end;
  v_nome   := case when p_dados ? 'cliente_nome' then nullif(btrim(coalesce(p_dados->>'cliente_nome','')), '') else v_r.cliente_nome end;
  v_tel    := case when p_dados ? 'cliente_telefone' then nullif(btrim(coalesce(p_dados->>'cliente_telefone','')), '') else v_r.cliente_telefone end;
  v_grau   := case when p_dados ? 'cliente_grau_relacao' then nullif(btrim(coalesce(p_dados->>'cliente_grau_relacao','')), '') else v_r.cliente_grau_relacao end;
  v_caso   := case when p_dados ? 'descricao_caso' then nullif(btrim(coalesce(p_dados->>'descricao_caso','')), '') else v_r.descricao_caso end;
  v_ajuda  := case when p_dados ? 'ajuda_pronta' then nullif(btrim(coalesce(p_dados->>'ajuda_pronta','')), '') else v_r.ajuda_pronta end;
  v_pais   := case when p_dados ? 'cliente_pais' then nullif(btrim(coalesce(p_dados->>'cliente_pais','')), '') else v_r.cliente_pais end;
  if p_dados ? 'honorarios_pactuados' then
    begin
      v_pact := (p_dados->>'honorarios_pactuados')::boolean;
    exception when others then
      raise exception 'Responda sim ou não sobre os honorários pactuados.' using errcode = '22023';
    end;
  else
    v_pact := v_r.honorarios_pactuados;
  end if;
  if p_dados ? 'valor_honorarios' then
    begin
      v_valor := nullif(btrim(coalesce(p_dados->>'valor_honorarios','')), '')::numeric(12,2);
    exception when others then
      raise exception 'Informe o valor dos honorários como número.' using errcode = '22023';
    end;
  else
    v_valor := v_r.valor_honorarios;
  end if;
  if v_origem is not null and v_origem not in ('captacao','ja_tenho') then raise exception 'Escolha de onde virá o seu cliente 1.' using errcode = '22023'; end if;
  -- `agendado` entrou em 10/09/2026: "sessão de viabilidade ou reunião
  -- preliminar já agendada, aguardando realização". Sem ela, quem marcou
  -- mas ainda não realizou não tinha onde se encaixar.
  if v_fase is not null and v_fase not in ('agendado','viabilidade_feita','croqui_apresentado','execucao_andamento') then raise exception 'Informe em que fase você está com este cliente.' using errcode = '22023'; end if;
  -- 'nao_informar' saiu da lista em 10/09/2026 (decisão do Marcio): o grau
  -- de relação passou a ser obrigatório quando há cliente.
  if v_grau is not null and v_grau not in ('parente','amigo','conhecido','indicacao','cliente_atual','lead') then raise exception 'Escolha um grau de relação da lista.' using errcode = '22023'; end if;
  if v_pais is not null and char_length(v_pais) > 60 then raise exception 'País: texto muito longo.' using errcode = '22023'; end if;
  if v_valor is not null and (v_valor < 0 or v_valor > 9999999999.99) then raise exception 'Honorários: valor fora do limite permitido.' using errcode = '22023'; end if;
  if v_nome is not null and char_length(v_nome) > 200 then raise exception 'O nome do cliente passa de 200 caracteres.' using errcode = '22023'; end if;
  if v_tel is not null and (char_length(v_tel) < 8 or char_length(v_tel) > 40) then raise exception 'Número de WhatsApp inválido.' using errcode = '22023'; end if;
  if v_caso is not null and char_length(v_caso) > 4000 then raise exception 'A descrição passa de 4.000 caracteres.' using errcode = '22023'; end if;
  if v_ajuda is not null and char_length(v_ajuda) > 4000 then raise exception 'O texto passa de 4.000 caracteres.' using errcode = '22023'; end if;
  -- Quem vai captar não tem cliente ainda: fase, dados do cliente e
  -- honorários não fazem sentido e são zerados (decisão do Marcio, 10/09:
  -- "se ele não fez sessão de viabilidade, ele não tem cliente").
  if v_origem is distinct from 'ja_tenho' then
    v_fase := null; v_nome := null; v_tel := null; v_grau := null;
    v_pais := null; v_pact := null; v_valor := null;
  end if;
  -- Honorários só existem se foram pactuados.
  if v_pact is distinct from true then v_valor := null; end if;
  insert into gps.onboarding_respostas as o (pessoa_aluno_id, ambiente_aluno_id, passo_atual, origem_cliente1, fase_cliente1, valor_honorarios, cliente_nome, cliente_telefone, cliente_grau_relacao, descricao_caso, ajuda_pronta, cliente_pais, honorarios_pactuados)
  values (v_pessoa, v_ambiente, v_passo, v_origem, v_fase, v_valor, v_nome, v_tel, v_grau, v_caso, v_ajuda, v_pais, v_pact)
  on conflict (pessoa_aluno_id) do update
     set passo_atual = greatest(o.passo_atual, excluded.passo_atual), origem_cliente1 = excluded.origem_cliente1, fase_cliente1 = excluded.fase_cliente1,
         valor_honorarios = excluded.valor_honorarios, cliente_nome = excluded.cliente_nome, cliente_telefone = excluded.cliente_telefone,
         cliente_grau_relacao = excluded.cliente_grau_relacao, descricao_caso = excluded.descricao_caso, ajuda_pronta = excluded.ajuda_pronta,
         cliente_pais = excluded.cliente_pais, honorarios_pactuados = excluded.honorarios_pactuados;
  if v_novo then
    insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
    values (v_ambiente, now(), 'onboarding_iniciado', 'onboarding', null, 'Começou o questionário inicial', jsonb_build_object('pessoa_aluno_id', v_pessoa, 'versao', 1), 'aluno', auth.uid(), 'app');
  end if;
  return jsonb_build_object('passo_atual', (select r.passo_atual from gps.onboarding_respostas r where r.pessoa_aluno_id = v_pessoa));
end $function$;

comment on function gps.onboarding_salvar_passo(smallint, jsonb) is
  'Upsert do rascunho do questionario da PESSOA logada. GUARDA gps.membro_e_titular() no topo (15/09/2026, OBRIGATORIA, nao remover em reescrita futura): o socio nao responde o questionario -- recusa com 42501 antes de qualquer leitura/escrita. Allowlist de 9 chaves; descricao_caso e lido/gravado mas NAO esta na allowlist (comportamento vigente preservado, nao e bug desta migration). passo_atual so avanca (implicito no on conflict). Escolher "vem da captacao" limpa fase/nome/telefone/grau/pais/honorarios; honorarios_pactuados != true limpa o valor. Grava o evento onboarding_iniciado uma vez, na criacao da linha.';

revoke execute on function gps.onboarding_salvar_passo(smallint, jsonb) from public, anon;
grant  execute on function gps.onboarding_salvar_passo(smallint, jsonb) to authenticated;
-- ─────────────────────────────────────────────────────────────────────────
-- 2. gps.onboarding_registrar_anexo — ganha a guarda no topo
-- ─────────────────────────────────────────────────────────────────────────
--
-- ⚠️ Corpo colado LITERAL do `pg_get_functiondef` vigente em produção
-- (conferido pelo coordenador em 15/09/2026). Nenhuma migration posterior à
-- `…206` tocou esta função — só é tocada aqui. A ÚNICA mudança é o bloco de
-- guarda logo após o `begin`.

create or replace function gps.onboarding_registrar_anexo(p_tipo text, p_path text, p_nome text, p_mime text, p_tamanho integer)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_pessoa uuid; v_ambiente uuid; v_r gps.onboarding_respostas%rowtype; v_existe boolean; v_meta_size bigint; v_meta_mime text;
        v_mime text; v_tamanho integer; v_ext text; v_nome text; v_qtd integer; v_id uuid;
begin
  -- 🔴 GUARDA DE PAPEL — o sócio não responde o questionário (decisão do
  -- Marcio, 15/09/2026). OBRIGATÓRIA e NÃO PODE SUMIR numa reescrita futura
  -- desta função: se um dia reescrever o corpo a partir de `pg_get_functiondef`,
  -- este bloco tem que voltar a entrar logo após o `begin`.
  if not gps.membro_e_titular() then
    raise exception 'O questionário inicial é respondido pelo titular do ambiente.' using errcode = '42501';
  end if;

  v_pessoa := gps.pessoa_atual();
  if v_pessoa is null then raise exception 'Seu cadastro ainda não está vinculado ao programa. Fale com a equipe.' using errcode = '42501'; end if;
  v_ambiente := gps.aluno_atual();
  select * into v_r from gps.onboarding_respostas r where r.pessoa_aluno_id = v_pessoa;
  if not found then raise exception 'Responda o questionário antes de anexar.' using errcode = '22023'; end if;
  if v_r.concluido_em is not null then raise exception 'Você já concluiu o questionário inicial.' using errcode = '22023'; end if;
  if p_tipo not in ('contrato_honorarios','documento') then raise exception 'tipo de anexo invalido' using errcode = '22023'; end if;
  v_nome := btrim(coalesce(p_nome, ''));
  if v_nome = '' or char_length(v_nome) > 120 or v_nome ~ '[/\\]' then raise exception 'Nome de arquivo inválido.' using errcode = '22023'; end if;
  if coalesce(p_path,'') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|jpeg|webp|pdf)$' then
    raise exception 'anexo em caminho invalido' using errcode = '22023';
  end if;
  if split_part(p_path, '/', 1) <> v_ambiente::text then raise exception 'anexo nao pertence a este ambiente' using errcode = '42501'; end if;
  begin
    select true, nullif(o.metadata->>'size','')::bigint, nullif(o.metadata->>'mimetype','') into v_existe, v_meta_size, v_meta_mime
      from storage.objects o where o.bucket_id = 'gps-onboarding' and o.name = p_path;
  exception when insufficient_privilege then
    raise exception 'nao foi possivel validar o anexo' using errcode = '42501';
  end;
  if not coalesce(v_existe, false) then raise exception 'anexo nao encontrado' using errcode = '42501'; end if;
  v_mime := coalesce(v_meta_mime, p_mime);
  v_tamanho := coalesce(v_meta_size, p_tamanho::bigint)::integer;
  if v_mime not in ('image/png','image/jpeg','image/webp','application/pdf') then raise exception 'formato de anexo nao aceito' using errcode = '22023'; end if;
  if v_tamanho is null or v_tamanho < 1 or v_tamanho > 5242880 then raise exception 'anexo maior que 5 MB' using errcode = '22023'; end if;
  v_ext := lower(regexp_replace(p_path, '^.*\.', ''));
  if not ((v_mime = 'image/png' and v_ext = 'png') or (v_mime = 'image/jpeg' and v_ext in ('jpg','jpeg')) or (v_mime = 'image/webp' and v_ext = 'webp') or (v_mime = 'application/pdf' and v_ext = 'pdf')) then
    raise exception 'extensao do anexo nao confere com o tipo do arquivo' using errcode = '22023';
  end if;
  if p_tipo = 'contrato_honorarios' then
    delete from gps.onboarding_anexos a where a.pessoa_aluno_id = v_pessoa and a.tipo = 'contrato_honorarios';
  else
    select count(*) into v_qtd from gps.onboarding_anexos a where a.pessoa_aluno_id = v_pessoa and a.tipo = 'documento';
    if v_qtd >= 5 then raise exception 'Você já anexou 5 documentos.' using errcode = '42501'; end if;
  end if;
  insert into gps.onboarding_anexos (pessoa_aluno_id, tipo, path, nome, mime, tamanho) values (v_pessoa, p_tipo, p_path, v_nome, v_mime, v_tamanho) returning id into v_id;
  return jsonb_build_object('id', v_id, 'tipo', p_tipo, 'nome', v_nome, 'mime', v_mime, 'tamanho', v_tamanho, 'path', p_path);
end $function$;

comment on function gps.onboarding_registrar_anexo(text, text, text, text, integer) is
  'Grava a linha do anexo DEPOIS de conferir o objeto. GUARDA gps.membro_e_titular() no topo (15/09/2026, OBRIGATORIA, nao remover em reescrita futura): o socio nao responde o questionario. prefixo do caminho = ambiente da pessoa, objeto existe no bucket gps-onboarding, tamanho/MIME lidos de storage.objects.metadata. contrato_honorarios SUBSTITUI o anterior; documento tem teto de 5. So enquanto o questionario estiver em andamento.';

revoke execute on function gps.onboarding_registrar_anexo(text, text, text, text, integer) from public, anon;
grant  execute on function gps.onboarding_registrar_anexo(text, text, text, text, integer) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. gps.onboarding_remover_anexo — ganha a guarda no topo
-- ─────────────────────────────────────────────────────────────────────────
--
-- ⚠️ Corpo colado LITERAL do `pg_get_functiondef` vigente em produção
-- (conferido pelo coordenador em 15/09/2026). Nenhuma migration posterior à
-- `…206` tocou esta função. A ÚNICA mudança é o bloco de guarda logo após o
-- `begin`.

create or replace function gps.onboarding_remover_anexo(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_pessoa uuid; v_tipo text;
begin
  -- 🔴 GUARDA DE PAPEL — o sócio não responde o questionário (decisão do
  -- Marcio, 15/09/2026). OBRIGATÓRIA e NÃO PODE SUMIR numa reescrita futura
  -- desta função.
  if not gps.membro_e_titular() then
    raise exception 'O questionário inicial é respondido pelo titular do ambiente.' using errcode = '42501';
  end if;

  v_pessoa := gps.pessoa_atual();
  if v_pessoa is null then raise exception 'Seu cadastro ainda não está vinculado ao programa. Fale com a equipe.' using errcode = '42501'; end if;
  if p_id is null then raise exception 'anexo nao informado' using errcode = '22023'; end if;
  if exists (select 1 from gps.onboarding_respostas r where r.pessoa_aluno_id = v_pessoa and r.concluido_em is not null) then
    raise exception 'Você já concluiu o questionário inicial.' using errcode = '22023';
  end if;
  delete from gps.onboarding_anexos a where a.id = p_id and a.pessoa_aluno_id = v_pessoa returning a.tipo into v_tipo;
  if v_tipo is null then raise exception 'Anexo não encontrado.' using errcode = 'P0002'; end if;
  return jsonb_build_object('id', p_id, 'tipo', v_tipo);
end $function$;

comment on function gps.onboarding_remover_anexo(uuid) is
  'Tira a LINHA do anexo da lista da pessoa. GUARDA gps.membro_e_titular() no topo (15/09/2026, OBRIGATORIA, nao remover em reescrita futura): o socio nao responde o questionario. O arquivo continua no bucket ate o expurgo do admin (B-R1).';

revoke execute on function gps.onboarding_remover_anexo(uuid) from public, anon;
grant  execute on function gps.onboarding_remover_anexo(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 4. gps.onboarding_concluir — ganha a guarda no topo (a mais crítica: é
--    quem cria o cliente 1 em gps.etapa1_clientes)
-- ─────────────────────────────────────────────────────────────────────────
--
-- ⚠️ Corpo colado LITERAL do `pg_get_functiondef` vigente em produção
-- (conferido pelo coordenador em 15/09/2026, corpo da migração `…254`, a
-- mais recente a reescrevê-la). A ÚNICA mudança é o bloco de guarda logo
-- após o `begin`. Preservado de propósito, mesmo parecendo inconsistente:
--   • o comentário `-- passo_atual = 8:` acima de um `passo_atual = 6` real
--     — inconsistência do comentário original, não corrigida aqui.
--
-- ⚠️ CORREÇÃO AO BRIEFING DO PENTESTER: o achado original dizia que esta
-- função "favorita o cliente automaticamente". Isso NÃO é mais verdade — o
-- `update ... set acompanhado_equipe = true` foi REMOVIDO em 14/09/2026
-- (ver o comentário "NÃO REINTRODUZIR sem decisão explícita do Marcio" no
-- corpo abaixo, preservado literal). `v_favoritado` é sempre `false`. O
-- achado do pentest CONTINUA válido (sócio consegue criar cliente 1 no
-- ambiente por esta RPC), só não tem mais o agravante do favorito.

create or replace function gps.onboarding_concluir()
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare v_pessoa uuid; v_ambiente uuid; v_r gps.onboarding_respostas%rowtype; v_fase_cli text; v_ordem integer; v_cliente uuid; v_favoritado boolean := false;
begin
  -- 🔴 GUARDA DE PAPEL — o sócio não responde o questionário (decisão do
  -- Marcio, 15/09/2026). OBRIGATÓRIA e NÃO PODE SUMIR numa reescrita futura
  -- desta função: é a RPC MAIS CRÍTICA do achado do pentest, porque cria o
  -- cliente 1 em gps.etapa1_clientes NO AMBIENTE.
  if not gps.membro_e_titular() then
    raise exception 'O questionário inicial é respondido pelo titular do ambiente.' using errcode = '42501';
  end if;

  v_pessoa := gps.pessoa_atual();
  if v_pessoa is null then raise exception 'Seu cadastro ainda não está vinculado ao programa. Fale com a equipe.' using errcode = '42501'; end if;
  v_ambiente := gps.aluno_atual();
  if v_ambiente is null then raise exception 'Este cadastro não tem ambiente no programa.' using errcode = '42501'; end if;
  select * into v_r from gps.onboarding_respostas r where r.pessoa_aluno_id = v_pessoa for update;
  if not found then raise exception 'Responda o questionário antes de concluir.' using errcode = '22023'; end if;
  if v_r.concluido_em is not null then raise exception 'Você já concluiu o questionário inicial.' using errcode = '22023'; end if;
  if v_r.origem_cliente1 is null then raise exception 'Escolha de onde virá o seu cliente 1.' using errcode = '22023'; end if;

  if v_r.origem_cliente1 = 'ja_tenho' then
    if v_r.fase_cliente1 is null then raise exception 'Informe em que fase você está com este cliente.' using errcode = '22023'; end if;
    if coalesce(btrim(v_r.cliente_nome), '') = '' then raise exception 'Informe o nome do seu cliente 1.' using errcode = '22023'; end if;
    -- Nome E WhatsApp obrigatórios (decisão do Marcio, 10/09/2026): sem o
    -- contato a equipe não consegue trabalhar o lead.
    if coalesce(btrim(v_r.cliente_telefone), '') = '' then raise exception 'Informe o número de WhatsApp do seu cliente 1.' using errcode = '22023'; end if;
    if coalesce(btrim(v_r.cliente_grau_relacao), '') = '' then raise exception 'Escolha o grau de relação com este cliente.' using errcode = '22023'; end if;
    -- 🔑 Honorários agora dependem da PERGUNTA, não da fase: quem pactuou
    -- informa o valor, esteja em que fase estiver. O ANEXO do contrato saiu
    -- do onboarding (decisão do Marcio, 10/09) -- ele continua existindo na
    -- ficha do cliente, onde o aluno anexa quando quiser.
    if v_r.honorarios_pactuados is true and v_r.valor_honorarios is null then
      raise exception 'Informe o valor dos honorários pactuados.' using errcode = '22023';
    end if;
    -- `agendado` (sessão/reunião marcada, aguardando realização) entra como
    -- prospecção: ainda não houve reunião, então não é fechamento.
    v_fase_cli := case v_r.fase_cliente1
                    when 'agendado' then 'prospeccao'
                    when 'viabilidade_feita' then 'fechamento'
                    when 'croqui_apresentado' then 'fechamento'
                    when 'execucao_andamento' then 'contratado' end;
    select coalesce(max(c.ordem), 0) + 1 into v_ordem from gps.etapa1_clientes c where c.aluno_id = v_ambiente;
    insert into gps.etapa1_clientes (aluno_id, nome, telefone, grau_relacao, fase, valor_honorarios, ordem)
    values (v_ambiente, btrim(v_r.cliente_nome), v_r.cliente_telefone, v_r.cliente_grau_relacao, v_fase_cli, v_r.valor_honorarios, v_ordem)
    returning id into v_cliente;

    -- 🔴 AQUI FICAVA O `update ... set acompanhado_equipe = true` (removido em
    -- 14/09/2026). A estrela TRAVA (migração ...215), e marcá-la por conta do
    -- aluno prendia gente numa escolha que ela não fez. `v_favoritado` fica
    -- `false` e o aluno escolhe depois, na aba Clientes, com o aviso da tela.
    -- NÃO REINTRODUZIR sem decisão explícita do Marcio.
  end if;

  -- passo_atual = 8: o fluxo agora termina em 7 (os antigos 8 e 9 saíram).
  update gps.onboarding_respostas set concluido_em = now(), cliente_id = v_cliente, passo_atual = 6 where pessoa_aluno_id = v_pessoa;
  insert into gps.aluno_eventos (aluno_id, ocorrido_em, tipo, entidade, entidade_id, rotulo, detalhe, ator, ator_user_id, origem)
  values (v_ambiente, now(), 'onboarding_concluido', 'onboarding', null, 'Concluiu o questionário inicial',
          jsonb_build_object('pessoa_aluno_id', v_pessoa, 'origem_cliente1', v_r.origem_cliente1, 'fase_cliente1', v_r.fase_cliente1, 'cliente_id', v_cliente, 'favoritado', v_favoritado, 'pais', v_r.cliente_pais),
          'aluno', auth.uid(), 'app');
  return jsonb_build_object('cliente_id', v_cliente, 'favoritado', v_favoritado);
end $function$;

comment on function gps.onboarding_concluir() is
  'Fecha o questionario da PESSOA logada, TUDO OU NADA. GUARDA gps.membro_e_titular() no topo (15/09/2026, OBRIGATORIA, nao remover em reescrita futura) -- esta e a RPC mais critica do achado, porque cria o cliente 1 em gps.etapa1_clientes NO AMBIENTE. Valida nome+whatsapp+grau obrigatorios e honorarios quando pactuados. Mapa de fases: agendado->prospeccao; viabilidade_feita/croqui_apresentado->fechamento; execucao_andamento->contratado. NAO favorita sozinho (decisao 14/09/2026, comentario preservado no corpo).';

revoke execute on function gps.onboarding_concluir() from public, anon;
grant  execute on function gps.onboarding_concluir() to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 6. gps.onboarding_meu — NÃO recusa. Devolve o MESMO shape "concluído" que
--    o TypeScript já entrega ao sócio (paridade leitura app × leitura REST).
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.onboarding_meu()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_pessoa   uuid;
  v_ambiente uuid;
  v_r        gps.onboarding_respostas%rowtype;
  v_status   text;
  v_anexos   jsonb;
begin
  v_pessoa := gps.pessoa_atual();
  if v_pessoa is null then
    raise exception 'Seu cadastro ainda não está vinculado ao programa. Fale com a equipe.'
      using errcode = '42501';
  end if;
  v_ambiente := gps.aluno_atual();

  -- O SÓCIO não responde o questionário (decisão do Marcio, 15/09/2026).
  -- Devolve o MESMO shape "concluído" que src/lib/data/onboarding.ts já
  -- entrega em getMeuOnboarding() para papelMembro === "socio" — paridade
  -- entre a leitura pelo app e uma chamada direta a esta RPC via REST.
  -- NÃO recusar: é leitura pura, não há gravação a impedir, e recusar
  -- quebraria o contrato que o app já depende (espera JSON de sucesso).
  if not gps.membro_e_titular() then
    return jsonb_build_object(
      'status', 'concluido',
      'versao', 1,
      'passo_atual', 0,
      'respostas', jsonb_build_object(
        'origem_cliente1', null, 'fase_cliente1', null, 'valor_honorarios', null,
        'cliente_nome', null, 'cliente_telefone', null, 'cliente_grau_relacao', null,
        'descricao_caso', null, 'ajuda_pronta', null, 'cliente_id', null,
        'iniciado_em', null, 'concluido_em', null
      ),
      'anexos', '[]'::jsonb,
      'ambiente_ja_tem_favorito',
        coalesce((select true from gps.etapa1_clientes c
                   where c.aluno_id = v_ambiente and c.acompanhado_equipe limit 1), false)
    );
  end if;

  select * into v_r from gps.onboarding_respostas r where r.pessoa_aluno_id = v_pessoa;

  if not found then
    v_status := 'nao_iniciado';
  elsif v_r.concluido_em is not null then
    v_status := 'concluido';
  else
    v_status := 'em_andamento';
  end if;

  select coalesce(
           jsonb_agg(jsonb_build_object(
             'id', a.id, 'tipo', a.tipo, 'nome', a.nome, 'mime', a.mime,
             'tamanho', a.tamanho, 'path', a.path, 'criado_em', a.criado_em
           ) order by a.criado_em), '[]'::jsonb)
    into v_anexos
    from gps.onboarding_anexos a
   where a.pessoa_aluno_id = v_pessoa;

  return jsonb_build_object(
    'status',      v_status,
    'versao',      coalesce(v_r.versao, 1),
    'passo_atual', coalesce(v_r.passo_atual, 0),
    'respostas', jsonb_build_object(
      'origem_cliente1',      v_r.origem_cliente1,
      'fase_cliente1',        v_r.fase_cliente1,
      'valor_honorarios',     v_r.valor_honorarios,
      'cliente_nome',         v_r.cliente_nome,
      'cliente_telefone',     v_r.cliente_telefone,
      'cliente_grau_relacao', v_r.cliente_grau_relacao,
      'descricao_caso',       v_r.descricao_caso,
      'ajuda_pronta',         v_r.ajuda_pronta,
      'cliente_id',           v_r.cliente_id,
      'iniciado_em',          v_r.iniciado_em,
      'concluido_em',         v_r.concluido_em
    ),
    'anexos', v_anexos,
    'ambiente_ja_tem_favorito',
      coalesce((select true from gps.etapa1_clientes c
                 where c.aluno_id = v_ambiente and c.acompanhado_equipe limit 1), false)
  );
end $function$;

comment on function gps.onboarding_meu() is
  'Estado do questionario inicial da PESSOA logada. SO LE. Para o SOCIO (gps.membro_e_titular() = false), devolve o MESMO shape "concluido" que src/lib/data/onboarding.ts ja entrega no app -- paridade entre a leitura pela tela e uma chamada direta via REST, decisao 15/09/2026: recusar aqui nao teria ganho de seguranca (e leitura pura) e quebraria o contrato que o app espera (JSON de sucesso). status = nao_iniciado | em_andamento | concluido. 42501 quando a pessoa nao tem cadastro vinculado.';

revoke execute on function gps.onboarding_meu() from public, anon;
grant  execute on function gps.onboarding_meu() to authenticated;
