-- Plantão — `plantao_revelar_link` ganha rate limit e recusa genérica.
--
-- 🔴 Achado do `security-pentester` sobre a migration `…171`, 09/09/2026.
--
-- Das TRÊS RPCs da rota pública `/p/plantao`, esta era a única sem nenhum
-- atrito:
--
--     plantao_inscrever(p_email, p_nome, p_slot_id, p_ip_hash)  ← 10/15min
--     plantao_cancelar (p_email, p_inscricao_id, p_ip_hash)     ← ip auditado
--     plantao_revelar_link(p_email, p_inscricao_id)             ← NADA
--
-- E é justamente a mais sensível: entrega o link do Zoom **e grava presença
-- em nome de alguém**. A rota não tem login — a identidade é o e-mail na
-- query string —, então qualquer pessoa que conheça um e-mail de comprador e
-- um `inscricao_id` podia repetir a chamada sem limite.
--
-- A `…171` não criou o furo, mas **triplicou a janela** em que ele vale: de
-- ~60 min (a sala fechava no início) para até 180 (1h antes + 120 de sessão).
-- Alargar a janela sem dar a esta RPC a mesma proteção das outras duas seria
-- fechar a porta da frente e alargar a janela dos fundos.
--
-- Duas mudanças:
--
-- 1. **Rate limit de 10 tentativas por IP em 15 minutos**, no MESMO molde de
--    `plantao_inscrever` — contando `plantao_presenca` +
--    `plantao_presenca_tentativa` em `gps.plantao_eventos`. A tentativa
--    fracassada passa a ser registrada (antes falhava em silêncio, sem
--    deixar rastro nem custo para quem tentava).
--
--    ⚠️ IP ausente cai no balde comum `'sem-ip'`, igual a `inscrever` — é
--    proposital: sem isso, bastaria omitir o cabeçalho para escapar do teto.
--
-- 2. **Recusa genérica** para identidade inválida. As mensagens distinguiam
--    "Inscrição não encontrada" de "já encerrado", o que permitia a um
--    terceiro descobrir, por tentativa e erro, se aquela inscrição existe e
--    em que fase da janela está. As recusas por JANELA continuam
--    específicas — nessa altura o dono já foi confirmado, e a própria tela
--    mostra a contagem regressiva, então não há nada a vazar.
--
-- ⚠️ A assinatura muda (3º parâmetro), então a versão de 2 argumentos é
-- DROPADA no fim. Sem isso ficariam duas sobrecargas — e a antiga, **sem
-- rate limit, continuaria chamável por `anon`**, que é exatamente o buraco
-- que esta migration fecha. (Sobrecarga ambígua já quebrou em runtime nos
-- sistemas do grupo; a regra do projeto é manter uma só.)

begin;

create or replace function gps.plantao_revelar_link(
  p_email text, p_inscricao_id uuid, p_ip_hash text default null)
returns table(ok boolean, motivo text, zoom_url text)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_ip    text := coalesce(nullif(btrim(coalesce(p_ip_hash, '')), ''), 'sem-ip');
  v_aluno_id uuid;
  v_dono uuid;
  v_slot gps.plantao_slots%rowtype;
  v_fim  timestamptz;
  v_tentativas int;
  -- Mensagem UNICA para todas as recusas de identidade: distinguir
  -- "nao encontrada" de "ja encerrado" deixava um terceiro com e-mail alheio
  -- descobrir, por tentativa e erro, se aquela inscricao existe e em que
  -- fase da janela esta. Achado do security-pentester, 09/09/2026.
  v_generico text := 'Não foi possível abrir a sala agora. Se o plantão está no horário, fale com a monitoria.';
begin
  if not gps.plantao_escrita_liberada() then
    return query select false, 'Operação temporariamente indisponível.'::text, null::text;
    return;
  end if;

  -- 🔑 Rate limit por IP, no mesmo molde de `plantao_inscrever` (10/15min).
  -- Esta RPC era a UNICA das tres da rota publica sem nenhum atrito: entrega
  -- o link do Zoom E grava presenca, e a janela passou de ~60 min para
  -- ate 180 (1h antes + a duracao da sessao), ampliando a superficie.
  select count(*) into v_tentativas
  from gps.plantao_eventos e
  where e.ip_hash = v_ip
    and e.acao in ('plantao_presenca', 'plantao_presenca_tentativa')
    and e.criado_em > now() - interval '15 minutes';

  if v_tentativas >= 10 then
    return query select false, 'Muitas tentativas. Aguarde alguns minutos.'::text, null::text;
    return;
  end if;

  select id into v_aluno_id from gps.plantao_alunos
   where email = v_email and ativo and not bloqueado_por_programa;
  if v_aluno_id is null then
    insert into gps.plantao_eventos (acao, ip_hash)
      values ('plantao_presenca_tentativa', v_ip);
    return query select false, v_generico, null::text;
    return;
  end if;

  select i.aluno_plantao_id into v_dono
  from gps.plantao_inscricoes i
  where i.id = p_inscricao_id and i.cancelado_em is null;

  select sl.* into v_slot
  from gps.plantao_inscricoes i
  join gps.plantao_slots sl on sl.id = i.slot_id
  where i.id = p_inscricao_id and i.cancelado_em is null;

  if v_dono is null or v_dono <> v_aluno_id then
    insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash)
      values (v_aluno_id, 'plantao_presenca_tentativa', v_ip);
    return query select false, v_generico, null::text;
    return;
  end if;

  -- A sala abre 1h ANTES e fica aberta ATE O FIM da sessao (decisao do
  -- Marcio, 09/09/2026). O fim vem de `duracao_min` do proprio slot.
  v_fim := v_slot.inicio_em + make_interval(mins => coalesce(v_slot.duracao_min, 120));

  -- Recusa por JANELA pode ser especifica: o dono ja foi confirmado acima,
  -- e a propria tela mostra a contagem regressiva. Nao vaza nada novo.
  if now() < v_slot.inicio_em - interval '60 minutes' then
    return query select false, 'A sala abre 1 hora antes do início.'::text, null::text;
    return;
  end if;

  if now() >= v_fim then
    return query select false, 'Este plantão já foi encerrado.'::text, null::text;
    return;
  end if;

  if v_slot.zoom_url is null or btrim(v_slot.zoom_url) = '' then
    return query select false, 'O link deste plantão ainda não foi cadastrado.'::text, null::text;
    return;
  end if;

  -- Idempotente: so grava presenca_em se ainda nao tiver.
  update gps.plantao_inscricoes
  set presenca_em = now()
  where id = p_inscricao_id and presenca_em is null;

  insert into gps.plantao_eventos (aluno_plantao_id, acao, ip_hash, slot_id)
    values (v_aluno_id, 'plantao_presenca', v_ip, v_slot.id);

  return query select true, null::text, v_slot.zoom_url;
end;
$function$;

comment on function gps.plantao_revelar_link(text, uuid, text) is
  'Revela o link do Zoom e grava presenca. Janela: [inicio-1h, inicio+duracao_min). Rate limit 10/15min por ip_hash.';

-- A versão de 2 argumentos sai: se ficasse, a chamada sem `p_ip_hash`
-- continuaria resolvendo para a função SEM rate limit, ainda com execute
-- para `anon` — o furo que esta migration fecha.
drop function if exists gps.plantao_revelar_link(text, uuid);

grant execute on function gps.plantao_revelar_link(text, uuid, text) to anon, authenticated;

commit;
