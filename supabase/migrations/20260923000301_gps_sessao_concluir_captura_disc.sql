-- ═══════════════════════════════════════════════════════════════════════════
-- A Entrevista Prévia passa a CAPTURAR o perfil DISC na conclusão.
--
-- APLICADA EM PRODUÇÃO em 22/09/2026 (`gps_sessao_concluir_captura_disc`).
--
-- Decisão do Marcio ao perguntar se a lógica do DISC estava redonda. Não
-- estava: `sessao_concluir` não tocava em `perfil_disc`, então a doutora
-- conversava com o cliente, concluía, e o DISC continuava vazio -- alguém
-- tinha de lembrar de preencher na ficha, por fora. A regra dele era
-- *"a Entrevista Prévia gera o perfil DISC"*, e isso nunca virou código.
--
-- 🔑 A doutora acabou de conversar com o cliente: é o instante em que ela
-- sabe a resposta. Pedir na ficha, depois, é pedir que ela lembre.
--
-- ── MEDIDO ANTES DE DECIDIR ────────────────────────────────────────────────
--   35 clientes favoritados · 7 com a letra do DISC · 28 SEM · 0 com DISC rico
-- Por isso a Reunião Preliminar AVISA em vez de bloquear (o bloqueio fecharia
-- a etapa para 28 parceiros, com a tela carregando vazia e sem erro).
--
-- ── O QUE MUDA ─────────────────────────────────────────────────────────────
-- `sessao_concluir` ganha 4 parâmetros OPCIONAIS de DISC. Quando vêm, grava
-- em `gps.etapa1_clientes` do cliente DAQUELA sessão.
--
-- 🔴 A assinatura de 2 argumentos foi DROPADA antes de criar a de 6.
-- Assinatura diferente cria SOBRECARGA, não substitui -- e a action antiga
-- continuaria chamando a de 2, deixando a captura contornável pelo PostgREST.
-- (Mesma armadilha que a …273 documentou em `cliente_minuta_anexar`.)
--
-- 🔴 NUNCA APAGA: `coalesce(novo, antigo)` em cada campo. Concluir sem
-- informar DISC preserva o que estava lá. Apagar por omissão é perda
-- silenciosa -- e aqui o texto é de OUTRA pessoa (o parceiro ou a colega).
--
-- 🔴 O DISC é do CLIENTE, não da sessão: grava em `etapa1_clientes` (atributo
-- estável da pessoa), o que mantém coerente a leitura AO VIVO do briefing.
--
-- ── MEDIDO DEPOIS DE APLICAR (JWT de admin real, em rollback) ───────────────
--   concluir SEM disc          -> letra preservada (S), anotação preservada
--   concluir COM disc          -> grava (D + texto), disc_gravado = true
--   letra inválida 'X'         -> "O perfil DISC precisa ser D, I, S ou C."
--   informar SÓ a letra        -> troca I->C e as 3 anotações SOBREVIVEM
--   assinaturas de sessao_concluir: 1 (a de 2 args não voltou)
--   anon: sem execute · authenticated: com execute (guarda interna decide)
--
-- Sem `explain analyze`: um UPDATE por chave primária em `etapa1_clientes`,
-- disparado por clique de conclusão (unidades por semana). Nenhum índice novo.
--
-- REVERSÃO: `drop function gps.sessao_concluir(uuid,text,text,text,text,text)`
-- e recriar a de 2 argumentos (o corpo está no histórico desta função).
-- Nenhum dado se perde: as colunas de DISC são as mesmas da ficha do cliente.
-- ═══════════════════════════════════════════════════════════════════════════

-- ⚠️ Antes de reaplicar por `db push`, confira a função VIVA
-- (`pg_get_functiondef('gps.sessao_concluir')`): ela pode ter correções
-- posteriores a este arquivo.

drop function if exists gps.sessao_concluir(uuid, text);

create or replace function gps.sessao_concluir(
  p_agendamento_id uuid,
  p_resumo text default null,
  p_perfil_disc text default null,
  p_disc_consciencia text default null,
  p_disc_gatilhos text default null,
  p_disc_relacionamento text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_admin  boolean := coalesce(public.gp_is_admin(), false);
  v_a      record;
  v_resumo text;
  v_quem   text;
  v_letra  text;
  v_cons   text;
  v_gat    text;
  v_rel    text;
  v_disc_gravado boolean := false;
begin
  if p_agendamento_id is null then
    raise exception 'sessao nao informada' using errcode = '22023';
  end if;

  select a.id, a.aluno_id, a.responsavel_id, a.cliente_id, a.tipo_id,
         a.estado, a.inicio_em, a.fim_em, a.resumo
    into v_a from gps.sessao_agendamentos a
   where a.id = p_agendamento_id for update;

  if v_a.id is null then
    raise exception 'Sessão não encontrada.' using errcode = 'P0002';
  end if;

  if coalesce(v_admin, false) then
    v_quem := 'admin';
  elsif coalesce(v_a.responsavel_id = auth.uid(), false) then
    v_quem := 'responsavel';
  else
    raise exception 'Sem permissão.' using errcode = '42501';
  end if;

  if v_a.estado <> 'agendado' then
    raise exception 'Esta sessão não está marcada — não há o que concluir.'
      using errcode = '22023';
  end if;

  if v_a.inicio_em > now() then
    raise exception 'Esta sessão ainda não começou. A conclusão só pode ser registrada depois do horário.'
      using errcode = '22023';
  end if;

  v_resumo := nullif(btrim(coalesce(p_resumo, '')), '');

  if v_resumo is not null then
    if char_length(v_resumo) < 10 then
      raise exception 'O resumo precisa de ao menos 10 caracteres. Se preferir escrever depois, conclua sem resumo e registre em seguida.'
        using errcode = '22023';
    end if;
    if char_length(v_resumo) > 4000 then
      raise exception 'O resumo passa de 4000 caracteres.' using errcode = '22023';
    end if;
  end if;

  v_letra := nullif(btrim(upper(coalesce(p_perfil_disc, ''))), '');
  v_cons  := nullif(btrim(coalesce(p_disc_consciencia, '')), '');
  v_gat   := nullif(btrim(coalesce(p_disc_gatilhos, '')), '');
  v_rel   := nullif(btrim(coalesce(p_disc_relacionamento, '')), '');

  -- Catálogo fechado, medido em produção: D 66 · I 39 · S 15 · C 7.
  if v_letra is not null and v_letra not in ('D', 'I', 'S', 'C') then
    raise exception 'O perfil DISC precisa ser D, I, S ou C.' using errcode = '22023';
  end if;

  -- Os CHECKs da tabela exigem 3..2000. Conferir aqui devolve a frase certa.
  if v_cons is not null and char_length(v_cons) < 3 then
    raise exception 'A anotação de consciência precisa de ao menos 3 caracteres.' using errcode = '22023';
  end if;
  if v_gat is not null and char_length(v_gat) < 3 then
    raise exception 'A anotação de gatilhos emocionais precisa de ao menos 3 caracteres.' using errcode = '22023';
  end if;
  if v_rel is not null and char_length(v_rel) < 3 then
    raise exception 'A anotação de relacionamento precisa de ao menos 3 caracteres.' using errcode = '22023';
  end if;

  if (v_letra is not null or v_cons is not null or v_gat is not null or v_rel is not null)
     and v_a.cliente_id is not null then
    -- 🔴 `coalesce(novo, antigo)`: campo em branco PRESERVA o que existe.
    update gps.etapa1_clientes c
       set perfil_disc         = coalesce(v_letra, c.perfil_disc),
           disc_consciencia    = coalesce(v_cons,  c.disc_consciencia),
           disc_gatilhos       = coalesce(v_gat,   c.disc_gatilhos),
           disc_relacionamento = coalesce(v_rel,   c.disc_relacionamento),
           disc_atualizado_em  = now(),
           disc_atualizado_por = auth.uid()
     where c.id = v_a.cliente_id;
    v_disc_gravado := true;
  end if;

  update gps.sessao_agendamentos
     set estado     = 'realizado',
         resumo     = v_resumo,
         resumo_em  = case when v_resumo is null then null else now() end,
         resumo_por = case when v_resumo is null then null else auth.uid() end
   where id = p_agendamento_id;

  insert into gps.sessao_eventos (agendamento_id, acao, ator_id, detalhe)
  values (p_agendamento_id, 'sessao_realizada', auth.uid(),
          jsonb_build_object('por', v_quem, 'de', 'agendado', 'para', 'realizado',
            'com_resumo', (v_resumo is not null),
            'resumo_caracteres', coalesce(char_length(v_resumo), 0),
            -- 🔴 Registra QUE o DISC mudou, nunca o CONTEÚDO: os 3 campos
            -- ricos são texto livre sobre um TERCEIRO (o cliente do parceiro).
            'disc_gravado', v_disc_gravado,
            'inicio_em', v_a.inicio_em));

  return jsonb_build_object('agendamento_id', p_agendamento_id, 'estado', 'realizado',
    'por', v_quem, 'com_resumo', (v_resumo is not null),
    'resumo_caracteres', coalesce(char_length(v_resumo), 0),
    'disc_gravado', v_disc_gravado);
end;
$function$;

revoke all on function gps.sessao_concluir(uuid, text, text, text, text, text) from public, anon;
grant execute on function gps.sessao_concluir(uuid, text, text, text, text, text) to authenticated;
