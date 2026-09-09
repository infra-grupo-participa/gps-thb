-- CD9 — gps.config absorve a chave de gps.plantao_config (rodada final de 09/09/2026).
--
-- POR QUE EXISTE
--   Duas tabelas chave/valor, mesmo padrão, mesmas policies, mesma trigger:
--   gps.plantao_config (migração ...070, uma chave) e gps.config (migração
--   ...110, genérica). A própria ...110:185 registrou em texto que
--   "plantao_config FICA como está — migrar as chaves depois, em tarefa
--   própria". É esta a tarefa. Depois dela, gps.config é a ÚNICA tabela de
--   configuração do GPS e a próxima chave não cria a terceira.
--
-- O QUE FAZ
--   1) Copia o valor VIGENTE de gps.plantao_config(chave='inscricao_aberta')
--      para gps.config como 'plantao_inscricao_aberta'. Copia — não escreve
--      'true' de cabeça: se a equipe tiver o Plantão PAUSADO hoje, a migração
--      não pode reabrir as inscrições no meio do dia. `on conflict do nothing`
--      pelo mesmo motivo (reaplicar não sobrescreve uma pausa posterior).
--      Se a linha de origem não existir, NADA é inserido — e a função cai nos
--      degraus seguintes exatamente como cai hoje.
--   2) `create or replace` de gps.plantao_escrita_liberada() acrescentando
--      gps.config como PRIMEIRO degrau, antes dos que já existiam.
--
-- ⚠️ CHECK diferente entre as duas tabelas — o valor migrado passa nos dois,
--    mas quem for acrescentar chave precisa saber:
--      plantao_config.valor → length between 1 and 200 (vazio PROIBIDO);
--      config.valor         → length <= 2000 e sem CR/LF (vazio PERMITIDO,
--                             é o estado inicial de chamados_email_equipe).
--    'true'/'false' cabe nos dois. O CR/LF do config existe porque a tabela
--    guarda endereço que vira cabeçalho de e-mail na Resend.
--
-- ── ORDEM DOS DEGRAUS (deliberada, herdada da ...070) ────────────────────
--   gps.config → gps.plantao_config → setting app.plantao_inscricao_aberta
--   → default 'true' (ABERTO).
--   * gps.config primeiro: é onde a tela de /admin/plantao passa a gravar.
--   * gps.plantao_config no meio: COMPATIBILIDADE. Enquanto o deploy do Next
--     não subir, a tela antiga continua gravando lá e continua funcionando —
--     migração de banco e deploy de app não são atômicos. Com as duas linhas
--     preenchidas, gps.config vence; é o mesmo raciocínio de "a tela é a
--     autoridade do dia a dia" da ...070.
--   * o setting continua sendo a emergência sem deploy.
--   * AUSENTE NOS QUATRO = ABERTO. O default tem de ser funcionar: o produto
--     não pode morrer no dia em que alguém apagar uma linha de config.
--   Nenhum degrau devolve NULL para fora: o coalesce termina em literal, e
--   `<> 'false'` sobre um literal não nulo é sempre booleano. A função não
--   tem caminho de erro nem de null — logo não existe janela em que ela
--   "falhe fechado" e derrube inscrição, cancelamento, presença e NPS.
--
-- ── O QUE ESTA MIGRAÇÃO NÃO FAZ ──────────────────────────────────────────
--   * NÃO dropa gps.plantao_config. Mesma regra das órfãs da ...117: remove-se
--     o caminho de código, não o histórico — e aqui a tabela ainda é o degrau
--     de compatibilidade do deploy. Dropar é passo separado, em migração
--     própria, depois de UMA SEMANA com o app novo em produção
--     (o app novo lê e grava só gps.config; ver src/lib/plantao-data.ts e
--     src/app/admin/plantao/actions.ts).
--   * NÃO mexe nos GRANTs de gps.plantao_escrita_liberada(). `create or
--     replace` preserva a ACL existente, e a existente (`execute to public`,
--     default do Postgres, conferido em 09/09) é intencional: as RPCs
--     públicas do Plantão sem login chamam esta função e o /p/plantao é
--     anônimo por decisão de produto (...043). Revogar aqui fecharia o
--     Plantão público — é outra decisão, não um detalhe de arrumação.
--   * NÃO mexe nas policies/grants de nenhuma das duas tabelas: `anon`
--     continua sem grant nas duas, e a leitura pública continua acontecendo
--     DENTRO da função SECURITY DEFINER.
--   * NÃO apaga a linha de gps.plantao_config: apagá-la mudaria o
--     comportamento do app ANTIGO (que ainda pode estar de pé) de "pausado"
--     para "aberto" sem ninguém pedir.
--
-- ── REVERSÃO (literal, nesta ordem) ──────────────────────────────────────
--   1) create or replace function gps.plantao_escrita_liberada()
--        returns boolean language sql stable security definer
--        set search_path to '' as $$
--          select coalesce(
--            (select c.valor from gps.plantao_config c where c.chave = 'inscricao_aberta'),
--            current_setting('app.plantao_inscricao_aberta', true),
--            'true') <> 'false';
--        $$;
--      (é o corpo VIGENTE da ...070, colado textual);
--   2) delete from gps.config where chave = 'plantao_inscricao_aberta';
--   3) reverter src/lib/plantao-data.ts e src/app/admin/plantao/actions.ts
--      para ler/gravar gps.plantao_config(chave='inscricao_aberta').
--   ⚠️ Se o passo 3 não for junto, o app grava numa tabela que a função não
--      lê mais — a tela mostraria "pausado" com as escritas abertas. Reverter
--      banco sem reverter app é o erro a evitar aqui.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. A chave muda de casa (o VALOR vem da origem, não de um literal)
-- ─────────────────────────────────────────────────────────────────────────

insert into gps.config (chave, valor)
select 'plantao_inscricao_aberta', c.valor
  from gps.plantao_config c
 where c.chave = 'inscricao_aberta'
on conflict (chave) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. plantao_escrita_liberada() — gps.config primeiro, plantao_config como
--    degrau de compatibilidade, setting como emergência, default ABERTO
-- ─────────────────────────────────────────────────────────────────────────

create or replace function gps.plantao_escrita_liberada()
returns boolean
language sql
stable
security definer
set search_path to ''
as $function$
  select coalesce(
    (select c.valor from gps.config c where c.chave = 'plantao_inscricao_aberta'),
    (select c.valor from gps.plantao_config c where c.chave = 'inscricao_aberta'),
    current_setting('app.plantao_inscricao_aberta', true),
    'true') <> 'false';
$function$;

comment on function gps.plantao_escrita_liberada() is
  'Interruptor de TODAS as escritas publicas do plantao: inscrever, cancelar, revelar_link (grava presenca) e registrar_nps. Leitura (calendario, minha_inscricao) continua liberada de proposito. Fonte primaria desde a migracao ...130: gps.config(chave=''plantao_inscricao_aberta''), editavel pela equipe em /admin/plantao sem deploy. Segundo degrau: gps.plantao_config(chave=''inscricao_aberta''), COMPATIBILIDADE com o app anterior ao deploy da migracao ...130 -- sai numa migracao futura, depois de uma semana. Terceiro: o setting app.plantao_inscricao_aberta (alter role authenticator set ...), emergencia sem deploy. Ausente nos tres = ABERTO: o default tem de ser funcionar. Nao devolve null em nenhum caminho -- o coalesce termina em literal.';

comment on table gps.plantao_config is
  'APOSENTADA desde 09/09/2026 (migracao ...130): a chave inscricao_aberta virou gps.config(chave=''plantao_inscricao_aberta''), que e a unica tabela de configuracao do GPS. Esta tabela FICA como segundo degrau de gps.plantao_escrita_liberada() enquanto o deploy do Next nao estabiliza -- migracao de banco e deploy de app nao sao atomicos. DROPAR EM MIGRACAO FUTURA, depois de uma semana com o app novo em producao. Nao escrever mais nada aqui: o app grava em gps.config.';
