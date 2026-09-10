-- Plantao -- o prazo de inscricao volta, com data de virada.
--
-- HISTORICO (importa, porque esta regra ja foi e voltou)
--   A migracao ...040 trouxe o cut-off de 12:00 da vespera, do calendario
--   oficial do Acelera. A ...046 o REMOVEU em 08/09/2026, por decisao do
--   Marcio: o plantao da Isabela era no dia seguinte e o prazo ja tinha
--   vencido -- ninguem conseguia agendar. Na ocasiao a alternativa de abrir
--   excecao so para aquele plantao foi recusada explicitamente.
--
-- A DECISAO DE 10/09/2026
--   O Marcio pediu o cut-off de volta e, em seguida, flexibilizou: "vamos
--   flexionar dessa semana para o pessoal poder se inscrever ate 1h antes,
--   mas na semana que vem isso precisa mudar".
--
--   Ou seja, nao e uma regra ligada/desligada -- e uma regra com DATA DE
--   INICIO. Por isso a virada mora em `gps.config`, e nao no corpo da
--   funcao: adiar ou antecipar vira um update, sem deploy e sem migration.
--
--     ate 13/09/2026  -> inscricao ate 1h antes do inicio
--     de 14/09 em diante -> 12:00 do dia ANTERIOR (regra oficial)
--
--   O corte cai limpo: os plantoes desta semana sao 10/09 e 11/09, e o
--   proximo e 15/09 (terca). Nao ha plantao no fim de semana, entao a
--   fronteira nao e ambigua.
--
-- ONDE A REGRA VIVE
--   `gps.plantao_prazo_inscricao(slot)` e o UNICO lugar que decide o prazo.
--   As duas pontas a consultam:
--     - `plantao_inscrever`  -> recusa a inscricao fora do prazo
--     - `plantao_calendario` -> devolve `inscricao_encerrada` para a tela
--   Manter duas regras divergentes e o padrao que ja falhou 4x neste modulo
--   (registrado na propria ...046).
--
-- EFEITO IMEDIATO no dado de 10/09/2026, 09:5x
--   10/09 10:00 (25 inscritos) -> FECHADO (o prazo de 1h antes venceu 09:00)
--   11/09 10:00 (1 inscrito)   -> fecha 11/09 09:00
--   15/09 14:00 em diante      -> fecha 12:00 da vespera
--
--   ⚠️ Fecha apenas inscricao NOVA. Quem ja esta inscrito continua entrando
--   normalmente -- as 25 pessoas de hoje receberam e-mail as 09:00 dizendo
--   que a sala abre as 10:00, e isso tem de continuar valendo.
--
-- A TELA
--   `inscricao-painel.tsx` ja tinha o ramo `inscricaoEncerrada` pronto, com
--   um comentario prevendo o retorno do prazo ("muda so a expressao no
--   banco -- esta tela nao precisa ser tocada"). Ele estava certo: so o
--   aviso em texto foi acrescentado.
--
-- REVERSAO
--   update gps.config set valor = '2099-01-01'
--    where chave = 'plantao_cutoff_vespera_desde';   -- adia indefinidamente
--   (ou remover as duas chamadas de gps.plantao_prazo_inscricao)

insert into gps.config (chave, valor)
values ('plantao_cutoff_vespera_desde', '2026-09-14')
on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();

create or replace function gps.plantao_prazo_inscricao(p_slot_id uuid)
returns timestamptz
language sql
stable
security definer
set search_path to ''
as $fn$
  select case
    when s.data >= coalesce(
           (select c.valor from gps.config c
             where c.chave = 'plantao_cutoff_vespera_desde')::date,
           date '2026-09-14')
    then ((s.data - 1) + time '12:00') at time zone 'America/Sao_Paulo'
    else s.inicio_em - interval '1 hour'
  end
  from gps.plantao_slots s
 where s.id = p_slot_id;
$fn$;

revoke all on function gps.plantao_prazo_inscricao(uuid) from public, anon, authenticated;

comment on function gps.plantao_prazo_inscricao(uuid) is
  'Instante em que a inscricao naquele slot se encerra. Antes da data em gps.config.plantao_cutoff_vespera_desde: 1h antes do inicio. A partir dela: 12:00 do dia anterior (calendario oficial do Acelera). Peca interna -- chamada por plantao_inscrever e plantao_calendario, que precisam concordar.';

-- As duas funcoes abaixo foram alteradas por edicao do corpo VIGENTE lido de
-- `pg_get_functiondef` (regra do projeto). O que muda em cada uma:
--
--   plantao_inscrever  -- ganhou, depois da trava de "ja comecou":
--     if now() > gps.plantao_prazo_inscricao(p_slot_id) then
--       return query select false,
--         'As inscricoes para este plantao ja se encerraram. Escolha outra data.'
--       ...
--
--   plantao_calendario -- a coluna `inscricao_encerrada` passou de
--     (sl.inicio_em <= now())
--   para
--     (sl.inicio_em <= now() or now() > gps.plantao_prazo_inscricao(sl.id))
--
-- Provado como `anon` em rollback: plantao de hoje recusado com a frase do
-- prazo; plantao de 15/09 aceito.
