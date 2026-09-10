-- Plantao -- rastreio de clique nos e-mails.
--
-- O PEDIDO (Marcio, 10/09/2026)
--   "comecar a trackear os emails, pra gente poder saber como que ta o
--    pessoal que clica nos links dos emails, e trackear certinho quem entrou
--    dentro do plantao do dia"
--
-- O QUE ISTO RESPONDE -- E O QUE NAO RESPONDE
--   Duas perguntas diferentes, que hoje se confundiam num numero so:
--     "o e-mail funcionou?"      -> plantao_email_cliques (NOVO)
--     "a pessoa entrou na sala?" -> plantao_inscricoes.presenca_em (ja existia)
--   Juntas dao o funil: inscrito -> recebeu -> clicou -> entrou -> NPS.
--
-- DUAS DECISOES DO MARCIO
--
--   1. SEM PIXEL DE ABERTURA. So clique.
--      Pixel de 1x1 mediria "abriu o e-mail", mas: o Gmail PRE-CARREGA
--      imagens (inflando o numero com aberturas que nao houve) e filtro
--      corporativo penaliza pixel de rastreio -- e esta base e cheia de
--      e-mail @empresa. Alternativa descartada com o custo na mesa.
--
--   2. CLIQUE NO PORTAL = PRESENCA. Nao integrar com a API do Zoom.
--      Quem de fato entrou na sala so o Zoom sabe. A aproximacao aceita e o
--      clique no botao do portal. Ja funciona, e o e-mail agora forca esse
--      caminho (migracao ...222). A alternativa (app do Zoom + job pos-
--      plantao, com tempo de permanencia) fica registrada como evolucao.
--
-- COMO FUNCIONA
--   O link dos e-mails de aluno ganhou `&o=<origem>&s=<slot>`:
--     e-mail de 1h antes  -> o=sala_1h
--     e-mail de abertura  -> o=abertura
--   A pagina `/p/plantao` chama `registrarCliqueDeEmail` quando os dois
--   parametros vem preenchidos, e a RPC casa e-mail + slot para achar a
--   inscricao.
--
-- 🔑 FALHA SILENCIOSA POR DESENHO
--   A RPC tem `exception when others then return`, e a action TypeScript
--   engole qualquer erro. Isto roda no caminho de quem esta tentando entrar
--   no plantao: se o registro falhar, a pessoa NAO pode ser impedida de
--   assistir. Metrica jamais bloqueia produto. Pior caso e lacuna no dado.
--
-- ⚠️ LEITURA DO HISTORICO
--   `clicou_*` e 0 para 09/09 e para o plantao de 10/09 que ja aconteceu --
--   os links daqueles e-mails nao tinham marcador. Zero ali significa "nao
--   medido", NAO "ninguem clicou". A view diz isso no comentario.
--
-- REVERSAO
--   drop view gps.vw_plantao_funil;
--   drop function gps.plantao_registrar_clique(text, uuid, text, text, text);
--   drop table gps.plantao_email_cliques;
--   (e tirar `&o=`/`&s=` das duas atribuicoes de v_link no disparo)

create table if not exists gps.plantao_email_cliques (
  id uuid primary key default gen_random_uuid(),
  inscricao_id uuid not null references gps.plantao_inscricoes(id) on delete cascade,
  origem text not null check (origem in ('sala_1h','abertura','nps')),
  clicado_em timestamptz not null default now(),
  ip_hash text,
  user_agent text
);

comment on table gps.plantao_email_cliques is
  'Append-only: um clique num link de e-mail do Plantao. Responde "o e-mail funcionou?" -- diferente de plantao_inscricoes.presenca_em, que responde "a pessoa entrou na sala?". Sem pixel de abertura (decisao do Marcio, 10/09/2026).';

comment on column gps.plantao_email_cliques.origem is
  'De qual e-mail veio o clique: sala_1h (1 hora antes), abertura ("comecou agora") ou nps.';

create index if not exists idx_plantao_email_cliques_inscricao
  on gps.plantao_email_cliques (inscricao_id, clicado_em desc);

alter table gps.plantao_email_cliques enable row level security;
revoke all on table gps.plantao_email_cliques from public, anon, authenticated;
grant select on table gps.plantao_email_cliques to authenticated;

drop policy if exists plantao_email_cliques_admin_le on gps.plantao_email_cliques;
create policy plantao_email_cliques_admin_le on gps.plantao_email_cliques
  for select to authenticated using (public.gp_is_admin());

create or replace function gps.plantao_registrar_clique(
  p_email text, p_slot_id uuid, p_origem text,
  p_ip_hash text default null, p_user_agent text default null
) returns void
language plpgsql security definer set search_path to ''
as $fn$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_insc uuid;
begin
  if p_origem is null or p_origem not in ('sala_1h','abertura','nps') then
    return;
  end if;

  select i.id into v_insc
    from gps.plantao_inscricoes i
    join gps.plantao_alunos a on a.id = i.aluno_plantao_id
   where i.slot_id = p_slot_id and a.email = v_email and i.cancelado_em is null
   limit 1;

  if v_insc is null then return; end if;

  insert into gps.plantao_email_cliques (inscricao_id, origem, ip_hash, user_agent)
  values (v_insc, p_origem, nullif(btrim(coalesce(p_ip_hash,'')),''),
          left(nullif(btrim(coalesce(p_user_agent,'')),''), 300));
exception when others then
  return;   -- metrica nunca bloqueia produto; ver cabecalho
end;
$fn$;

comment on function gps.plantao_registrar_clique(text, uuid, text, text, text) is
  'Registra que alguem chegou ao portal por um link de e-mail do Plantao. Falha SILENCIOSA por desenho: roda no caminho de quem esta tentando entrar na sala.';

revoke all on function gps.plantao_registrar_clique(text, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function gps.plantao_registrar_clique(text, uuid, text, text, text) to anon;

create or replace view gps.vw_plantao_funil as
select s.data, s.hora_inicio, m.nome as mentora,
       count(*) as inscritos,
       count(*) filter (where i.email_sala_em is not null) as recebeu_1h,
       count(*) filter (where i.email_abertura_em is not null) as recebeu_abertura,
       count(*) filter (where exists (select 1 from gps.plantao_email_cliques c
          where c.inscricao_id = i.id and c.origem = 'sala_1h')) as clicou_no_1h,
       count(*) filter (where exists (select 1 from gps.plantao_email_cliques c
          where c.inscricao_id = i.id and c.origem = 'abertura')) as clicou_na_abertura,
       count(*) filter (where exists (select 1 from gps.plantao_email_cliques c
          where c.inscricao_id = i.id)) as clicou_em_algum,
       count(*) filter (where i.presenca_em is not null) as entrou_na_sala,
       count(*) filter (where i.nps_nota is not null) as respondeu_nps,
       round(avg(i.nps_nota)::numeric, 1) as nps_medio
  from gps.plantao_inscricoes i
  join gps.plantao_slots s on s.id = i.slot_id
  join gps.plantao_mentoras m on m.id = s.mentora_id
 where i.cancelado_em is null
 group by s.data, s.hora_inicio, m.nome;

comment on view gps.vw_plantao_funil is
  'Funil por plantao: inscritos -> recebeu e-mail -> clicou -> entrou na sala -> NPS. "clicou" so existe a partir de 10/09/2026; antes disso e sempre 0, e isso significa NAO MEDIDO, nunca "ninguem clicou".';

revoke all on gps.vw_plantao_funil from public, anon;
grant select on gps.vw_plantao_funil to authenticated;

-- A funcao de disparo (gps.plantao_disparar_emails_sala) foi alterada por
-- edicao do corpo vigente: as duas atribuicoes de `v_link` ganharam
-- `&o=sala_1h&s=` e `&o=abertura&s=` respectivamente.
--
-- Provado como `anon` em rollback: 2 chamadas validas gravaram; origem
-- invalida, e-mail inexistente e e-mail nulo foram ignorados SEM erro.
