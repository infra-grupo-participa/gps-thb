-- `plantao_calendario` passa a devolver `inscricao_encerrada`: o cut-off deixa
-- de ser invisível até o clique.
--
-- Recomendação do `fable-orchestrator`. O slot de 09/09 já passou do cut-off
-- (12:00 da véspera), mas o calendário o mostrava igual aos outros e o botão
-- "Inscrever" ficava ativo — a primeira experiência de parte dos 402 seria um
-- toast de erro. A mensagem é acionável, mas o estado devia estar na tela
-- antes do clique.
--
-- 🔑 Mesmo padrão já aplicado ao cancelamento (`pode_cancelar`): a LEITURA
-- espelha exatamente a regra da ESCRITA, calculada no mesmo lugar, para as
-- duas nunca divergirem. A expressão aqui é idêntica à de
-- `plantao_inscrever` — inclusive o fuso America/Sao_Paulo, que é o que
-- impede o prazo de mentir das 21h à meia-noite.
--
-- Diferença entre os dois campos:
--   `encerrado`           = o plantão já começou
--   `inscricao_encerrada` = ainda vai acontecer, mas as inscrições fecharam
--
-- ⚠️ `getSlotsAdmin` (src/lib/plantao-data.ts) calcula o mesmo em TypeScript,
-- porque lê a tabela direto (é admin, tem policy) em vez de passar pela RPC.
-- As duas formas foram conferidas contra os 3 slots reais e concordam — o
-- corte é 15:00 UTC, que é meio-dia em São Paulo (o Brasil não usa mais
-- horário de verão, então o offset é fixo).
--
-- Reversão: restaurar a versão da migração ...043 (sem a 9ª coluna).

drop function if exists gps.plantao_calendario(int, int, text);

create function gps.plantao_calendario(p_ano int, p_mes int, p_email text default null)
returns table (
  slot_id uuid, data date, hora_inicio time, duracao_min int,
  mentora_nome text, inscritos_qtd int, minha_inscricao boolean,
  encerrado boolean, inscricao_encerrada boolean
)
language plpgsql
security definer
set search_path to 'pg_catalog', 'extensions', 'public', 'gps'
as $function$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_aluno_id uuid;
  v_inicio timestamptz;
  v_fim timestamptz;
begin
  if v_email <> '' then
    select id into v_aluno_id from gps.plantao_alunos
     where email = v_email and ativo and not bloqueado_por_programa;
  end if;

  v_inicio := make_date(p_ano, p_mes, 1) at time zone 'America/Sao_Paulo';
  v_fim := (make_date(p_ano, p_mes, 1) + interval '1 month') at time zone 'America/Sao_Paulo';

  return query
  select sl.id, sl.data, sl.hora_inicio, sl.duracao_min, m.nome,
         coalesce(cnt.qtd, 0)::int,
         (insc.id is not null),
         (sl.inicio_em <= now()),
         -- Espelha o cut-off de plantao_inscrever, caractere a caractere.
         (now() >= ((sl.inicio_em at time zone 'America/Sao_Paulo')::date
                    - 1 + time '12:00') at time zone 'America/Sao_Paulo')
  from gps.plantao_slots sl
  join gps.plantao_mentoras m on m.id = sl.mentora_id
  left join lateral (
    select count(*) as qtd
    from gps.plantao_inscricoes i
    join gps.plantao_alunos a
      on a.id = i.aluno_plantao_id and not a.bloqueado_por_programa
    where i.slot_id = sl.id and i.cancelado_em is null
  ) cnt on true
  left join gps.plantao_inscricoes insc
    on insc.slot_id = sl.id
   and insc.aluno_plantao_id = v_aluno_id
   and insc.cancelado_em is null
  where sl.publicado
    and sl.inicio_em >= v_inicio
    and sl.inicio_em < v_fim
  order by sl.inicio_em;
end;
$function$;

revoke execute on function gps.plantao_calendario(int, int, text) from public;
grant execute on function gps.plantao_calendario(int, int, text) to anon, authenticated;

comment on function gps.plantao_calendario(int, int, text) is
  'Calendario mensal PUBLICO. p_email opcional. inscritos_qtd exclui bloqueado_por_programa. `encerrado` = ja comecou; `inscricao_encerrada` = passou do cut-off de 12:00 da vespera (espelha plantao_inscrever, mesmo fuso) — o aluno ve o estado antes de clicar.';
