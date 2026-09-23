-- A trava do cliente favorito passa a nascer sozinha QUANDO O CASO ANDA.
--
-- DECISÃO DO MARCIO (23/09/2026)
--   A confirmação manual do acompanhamento pela equipe ACABA como gatilho da
--   trava. Ela nunca aconteceu — 37 clientes escolhidos, ZERO com
--   `acompanhamento_confirmado_em` preenchido em 3 meses — e é a causa de 7
--   chamados abertos: o aluno escolhe, a equipe nunca carimba, e a trava que
--   deveria proteger o caso em andamento nunca chega. Na prática o sistema
--   tinha uma trava que só existia no papel.
--
-- A REGRA NOVA, literal
--   O aluno troca / desmarca / apaga o cliente favorito LIVREMENTE enquanto o
--   cliente estiver em `fase = 'prospeccao'` E `data_reuniao_preliminar is
--   null`. A partir do momento em que o cliente sai de prospecção OU ganha
--   data de reunião preliminar, trocar / desmarcar / apagar passa a exigir
--   chamado — mesma exceção 42501, mesma frase.
--
--   O gatilho deixa de ser um ato administrativo (alguém carimbar) e passa a
--   ser um FATO do caso (ele andou). Fato que o próprio aluno produz, sem
--   depender de ninguém, e que ele entende sem explicação: "mexi na reunião,
--   agora está valendo".
--
-- MEDIDO ANTES DE ESCREVER (Marcio, 23/09/2026, produção)
--   select count(*) filter (where acompanhado_equipe)         → 37
--   travariam pela regra nova                                 → 26
--   seguem livres                                             → 11
--   acompanhamento_confirmado_em is not null                  → 0
--
--   ZERO confirmados = NÃO HÁ DADO A MIGRAR. Nenhum aluno perde uma trava que
--   já tivesse; 26 ganham uma que não existia, e ganham porque o caso deles de
--   fato andou.
--
-- ⚠️ LER DE `old`, NUNCA DE `new` — é o ponto que quebraria a feature
--   O UPDATE que É a própria mudança de fase (prospeccao → fechamento) ou que
--   marca a data da reunião tem `new.fase <> 'prospeccao'` / `new.
--   data_reuniao_preliminar not null`. Decidir por `new` recusaria o PRÓPRIO
--   ATO DE AVANÇAR: o aluno não conseguiria mover o cliente que escolheu, que
--   é exatamente o trabalho da Etapa 01. A decisão "este caso já andou?" se lê
--   no estado ANTERIOR à escrita — e por isso o mesmo UPDATE que faz o caso
--   andar passa, e o seguinte já é o que trava.
--
--   Consequência desenhada, não acidental: mover para fechamento PASSA; e a
--   partir daí desmarcar a estrela é recusado.
--
-- O QUE **NÃO** MUDA
--   * `acompanhamento_confirmado_em` / `_por` CONTINUAM existindo, e continuam
--     sendo escrita exclusiva da equipe (bloco (a) intacto). Elas deixam de
--     ser o que LIGA a trava; seguem como registro de "a equipe assumiu".
--   * `gps.admin_confirmar_acompanhamento` / `gps.admin_liberar_acompanhamento`
--     continuam existindo, sem nenhuma alteração — são o escape da equipe.
--   * O admin continua passando por tudo (é ele quem troca a pedido do
--     chamado).
--   * Marcar o PRIMEIRO favorito continua livre: `old.acompanhado_equipe`
--     falso e nada aqui dispara. Idem para o update de `gps.onboarding_concluir`.
--   * A ficha continua toda editável — a trava é do VÍNCULO, nunca da ficha.
--   * ZERO coluna nova, ZERO índice novo, ZERO backfill, ZERO linha escrita.
--
-- ÍNDICE: nenhum criado. A trigger lê `old.fase` e `old.data_reuniao_preliminar`
--   do registro que o Postgres JÁ tem em memória na linha que está sendo
--   escrita — não há busca, não há plano de query, o custo é comparação de
--   campo. A leitura de tela que usa a mesma condição foi medida pelo Marcio:
--   `Bitmap Index Scan on etapa1_clientes_unico_equipe`, Execution Time
--   0.185 ms, buffers hit=20 — o índice parcial que já existe atende.
--
-- COMO É FEITO: `create or replace` a partir do CORPO VIGENTE da ...215, com o
--   corpo INTEIRO copiado e só a condição do return antecipado trocada.
--   `create or replace function` NÃO herda nada do corpo anterior — escrever
--   só o trecho novo apagaria as travas que já estão em produção (lição de
--   08/09/2026, "recriar função parte do corpo VIGENTE").
--
-- REVERSÃO: repor o corpo da ...215 (trocar a condição de volta para
--   `if old.acompanhamento_confirmado_em is null then`). Nenhum dado precisa
--   ser desfeito — esta migração não escreve linha nenhuma.
--   `drop trigger` NÃO é a reversão: sem a trigger some também a trava das
--   colunas de confirmação, e o aluno voltaria a poder zerá-las pelo PostgREST.

create or replace function gps.etapa1_clientes_acompanhamento_travado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Admin passa por tudo: é ele quem confirma, libera e conserta.
  -- `coalesce(..., false)`: sem sessão gp_is_admin() é NULL e `if not NULL`
  -- não dispararia — a guarda falharia ABERTO.
  if coalesce(public.gp_is_admin(), false) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- Daqui para baixo: NÃO é admin.

  -- (a) as duas colunas do vínculo são só da equipe, SEMPRE. Continua valendo
  -- exatamente como antes: elas deixaram de LIGAR a trava, não deixaram de ser
  -- escrita da equipe. Sem isto, `{acompanhamento_confirmado_em: null}` pela
  -- API mexeria num registro que não é do aluno.
  if tg_op = 'UPDATE'
     and (new.acompanhamento_confirmado_em  is distinct from old.acompanhamento_confirmado_em
       or new.acompanhamento_confirmado_por is distinct from old.acompanhamento_confirmado_por)
  then
    raise exception 'Só a equipe confirma ou libera o acompanhamento deste cliente.'
      using errcode = '42501';
  end if;

  -- ─────────────────────────────────────────────────────────────────────
  -- (b) O CASO AINDA NÃO ANDOU → tudo livre (23/09/2026).
  --
  -- Aqui ficava `if old.acompanhamento_confirmado_em is null then return`,
  -- que devolvia livre SEMPRE, porque ninguém nunca carimbou (0 em 37).
  --
  -- ⚠️ `old`, NUNCA `new`: no UPDATE que move a fase ou marca a reunião, o
  -- `new` já traz o caso "andado" e recusaria o próprio ato de avançar. O
  -- estado ANTERIOR é que responde "quando esta escrita começou, o caso já
  -- tinha andado?".
  -- ─────────────────────────────────────────────────────────────────────
  if old.fase = 'prospeccao' and old.data_reuniao_preliminar is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- ─────────────────────────────────────────────────────────────────────
  -- Daqui para baixo: o caso JÁ ANDOU (saiu de prospecção ou tem reunião
  -- marcada). As três travas da ...215/...203, agora sob a condição nova.
  -- ─────────────────────────────────────────────────────────────────────

  -- Apagar o cliente que está com a estrela é trocar de cliente por outro
  -- caminho — a frase é a mesma de propósito: para o aluno é UM problema só.
  if tg_op = 'DELETE' and old.acompanhado_equipe then
    raise exception 'Para trocar o cliente que a equipe acompanha, abra um chamado no Suporte.'
      using errcode = '42501';
  end if;

  -- Desmarcar a estrela. É por aqui que passa toda troca, porque o índice
  -- único parcial `etapa1_clientes_unico_equipe` obriga a desmarcar o atual
  -- antes de marcar outro.
  if tg_op = 'UPDATE' and old.acompanhado_equipe and not new.acompanhado_equipe then
    raise exception 'Para trocar o cliente que a equipe acompanha, abra um chamado no Suporte.'
      using errcode = '42501';
  end if;

  -- A fase não volta para Prospecção: voltar seria destravar a própria trava
  -- (o caso "desandaria" no papel e o aluno passaria a poder trocar). Vale
  -- para o cliente que andou, com ou sem estrela.
  if tg_op = 'UPDATE'
     and new.fase = 'prospeccao' and old.fase is distinct from 'prospeccao'
  then
    raise exception 'A equipe está acompanhando este cliente — a fase não pode voltar para Prospecção.'
      using errcode = '42501';
  end if;

  -- Apagar um cliente que andou mas NÃO está com a estrela continua livre: a
  -- trava é do vínculo, e ele não tem vínculo nenhum. (Antes, a camada ...203
  -- recusava esse DELETE quando havia confirmação — condição que nunca
  -- ocorreu em produção, 0 confirmados, e que passaria a valer para 26
  -- clientes que só andaram de fase. Excluir cliente sem estrela nunca foi o
  -- que este pedido quis travar.)
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

comment on function gps.etapa1_clientes_acompanhamento_travado() is
  'BEFORE UPDATE OR DELETE em gps.etapa1_clientes. Recusa com 42501, para quem NAO e admin: (a) qualquer escrita em acompanhamento_confirmado_em/_por, SEMPRE; e, QUANDO O CASO JA ANDOU -- old.fase <> prospeccao OU old.data_reuniao_preliminar preenchida (decisao do Marcio, 23/09/2026) --, (b) DESMARCAR a estrela, (c) APAGAR o cliente que esta com a estrela e (d) voltar a fase para prospeccao. Enquanto o cliente esta em prospeccao SEM data de reuniao, o aluno troca/desmarca/apaga a vontade. ⚠️ A decisao le de OLD, nunca de NEW: o UPDATE que move a fase ou marca a reuniao e justamente o ato de avancar e TEM de passar -- com NEW o aluno nao conseguiria mover o proprio cliente. acompanhamento_confirmado_em NAO liga mais a trava (eram 0 confirmados em 37 escolhidos, em 3 meses, e 7 chamados): continua existindo como registro da equipe e como escrita exclusiva dela, via admin_confirmar_acompanhamento/admin_liberar_acompanhamento, que nao mudaram. MARCAR o primeiro favorito continua livre (inclusive o update de gps.onboarding_concluir). Toda a ficha continua livre -- a trava e do VINCULO, nao da ficha. Guarda com coalesce(gp_is_admin(), false): sem sessao a funcao devolve NULL e a trava falharia ABERTO (licao de gps.etapa_liberada_para, 09/09/2026). As frases estao em FRASES_DO_BANCO (src/lib/erros.ts).';

-- A trigger não muda (BEFORE UPDATE OR DELETE, for each row): o `create or
-- replace` acima já trocou o corpo. Recriada aqui só para a migração ser
-- idempotente por si mesma.
drop trigger if exists trg_etapa1_clientes_acompanhamento_travado on gps.etapa1_clientes;
create trigger trg_etapa1_clientes_acompanhamento_travado
  before update or delete on gps.etapa1_clientes
  for each row execute function gps.etapa1_clientes_acompanhamento_travado();

-- ─────────────────────────────────────────────────────────────────────────
-- Dois comentários que PASSARAM A MENTIR — corrigidos aqui, sem tocar no corpo
-- das funções (nenhum `create or replace` abaixo).
-- ─────────────────────────────────────────────────────────────────────────

comment on column gps.etapa1_clientes.acompanhamento_confirmado_em is
  'Registro de que a EQUIPE assumiu formalmente este cliente. ⚠️ DESDE 23/09/2026 NAO E MAIS O QUE LIGA A TRAVA do favorito: a trava nasce sozinha quando o caso anda (fase <> prospeccao OU data_reuniao_preliminar preenchida) -- trigger trg_etapa1_clientes_acompanhamento_travado. Motivo: em 3 meses foram 37 clientes escolhidos e ZERO confirmados, e a confirmacao manual que nunca acontecia gerou 7 chamados. A coluna segue sendo escrita EXCLUSIVA da equipe (a trigger recusa qualquer escrita do aluno, sempre) e segue servindo de registro/escape: so gps.admin_confirmar_acompanhamento e gps.admin_liberar_acompanhamento escrevem aqui.';

comment on function gps.admin_confirmar_acompanhamento(uuid, text) is
  'A EQUIPE registra que assumiu o acompanhamento do cliente favoritado: carimba acompanhamento_confirmado_em/_por. ⚠️ DESDE 23/09/2026 confirmar NAO E MAIS O QUE TRAVA a estrela -- a trava passou a nascer quando o caso anda (fase <> prospeccao OU reuniao preliminar marcada). Confirmar continua valendo como REGISTRO formal do acompanhamento e como trilha (evento favorito_confirmado_pela_equipe, log favorito_confirmado). Exige que o cliente JA seja o favorito. Motivo obrigatorio (3..300). gp_is_admin() ou 42501.';

comment on function gps.admin_liberar_acompanhamento(uuid, text) is
  'Encerra o acompanhamento formal da equipe: zera acompanhamento_confirmado_em/_por. NAO desmarca a estrela. ⚠️ DESDE 23/09/2026 liberar NAO destrava nada para o aluno: a trava da estrela nao depende mais desta coluna, e sim de o caso ter andado (fase <> prospeccao OU data_reuniao_preliminar preenchida). Quem troca a estrela de um caso que ja andou e a EQUIPE, em Modo Assistencia (o admin nao e barrado pela trigger), a pedido de um chamado. Motivo obrigatorio (3..300), log favorito_liberado e evento favorito_liberado_pela_equipe. gp_is_admin() ou 42501.';
