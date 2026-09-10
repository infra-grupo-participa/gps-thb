-- A escolha do cliente acompanhado é UMA. Trocar é assunto da equipe.
--
-- POR QUÊ
--   Pedido do João (10/09/2026): "quando ele selecionar um cliente para
--   acompanhar, uma vez selecionado é esse que a equipe acompanha; se quiser
--   mudar tem que abrir um chamado; a equipe pode alterar."
--
--   A ...203 já tinha travado a estrela, mas SÓ depois de a equipe carimbar
--   `acompanhamento_confirmado_em`. Na prática isso deixava a janela inteira
--   entre "o aluno escolheu" e "alguém da equipe entrou na ficha e confirmou"
--   com a estrela solta — que é justamente o período em que a equipe está
--   estudando o caso e montando a reunião. Trocar de cliente aí é trocar o
--   caso debaixo de quem já começou a trabalhar nele, sem ninguém saber.
--
--   Agora a regra é a do João, literal: a PRIMEIRA escolha é livre (é a
--   escolha dele, e ninguém aparece com o direito já gasto); a partir dela, o
--   aluno não desmarca e não apaga o cliente marcado. Ele pede pelo Suporte, e
--   a equipe (admin) libera ou troca — o admin passa por tudo desde a ...203.
--
--   `acompanhamento_confirmado_em` CONTINUA significando o que significava: "a
--   equipe confirmou que está acompanhando". As travas dela também continuam,
--   agora como a camada de dentro (fase não volta para prospeccao, ficha
--   confirmada não some).
--
-- COMO É FEITO: `create or replace` a partir do CORPO VIGENTE da ...203, com o
--   corpo inteiro copiado e as duas regras novas inseridas ANTES do
--   `return` antecipado de quem não tem confirmação. `create or replace
--   function` NÃO herda nada do corpo anterior: escrever só o trecho novo
--   apagaria as 4 recusas que já estão em produção (lição de 08/09/2026,
--   "recriar função parte do corpo VIGENTE").
--
--   ⚠️ Uma recusa da ...203 SAI porque virou INALCANÇÁVEL, não porque deixou de
--   valer: "A equipe está acompanhando este cliente — só a equipe pode trocar o
--   cliente acompanhado." só disparava para não-admin com
--   `acompanhamento_confirmado_em` preenchido desmarcando a estrela, e agora a
--   regra nova pega esse mesmo caso ANTES, com uma frase que diz o que fazer
--   ("abra um chamado no Suporte"). Deixar código morto dentro de uma trigger
--   de segurança é pior do que tirá-lo: a próxima pessoa a ler não sabe qual
--   dos dois caminhos está vivo. A frase continua em `FRASES_DO_BANCO`
--   (src/lib/erros.ts) enquanto esta migração puder ser revertida.
--
-- O QUE ISSO **NÃO** FAZ
--   * NÃO impede marcar o primeiro favorito. `old.acompanhado_equipe` falso →
--     nada dispara. Idem para o `update` de `gps.onboarding_concluir()`, que
--     marca a estrela num cliente recém-criado.
--   * NÃO trava a FICHA: nome, telefone, registro de contato, DISC, problemas,
--     honorários, grau de relação, contrato anexado (...214) — tudo continua
--     livre no cliente acompanhado. A trava é do VÍNCULO.
--   * NÃO trava o admin, em nada.
--   * ZERO backfill, zero coluna nova, zero índice, zero linha escrita. As 25
--     estrelas de hoje continuam onde estão — e a partir de agora só a equipe
--     as move.
--   * NÃO cria a fila de chamado nem manda e-mail: o caminho "abra um chamado"
--     já existe em `/chamados` e a frase aponta para ele.
--   * NÃO mexe em `gps.admin_confirmar_acompanhamento` /
--     `gps.admin_liberar_acompanhamento` (...203) nem nas colunas de confirmação.
--
-- ⚠️ EFEITO IMEDIATO NO PRODUTO (o frontend precisa saber, está no relatório):
--   `definirClienteEquipe` (src/app/clientes/actions.ts) desmarca TODOS antes
--   de marcar um. Com um favorito já existente, esse primeiro `update` bate
--   nesta trava e a ação inteira falha com a frase — que é o comportamento
--   PEDIDO. A UI não pode oferecer a estrela nos outros cards nem o "desmarcar"
--   no card marcado: botão que sempre falha é pior do que botão ausente.
--
-- REVERSÃO: repor o corpo da ...203 (as 4 recusas, sem as 2 regras novas).
--   Nenhum dado precisa ser desfeito — esta migração não escreve linha.
--   drop trigger/function NÃO é a reversão: sem a trigger, some também a trava
--   das colunas de confirmação (...203) e o aluno voltaria a poder zerar
--   `acompanhamento_confirmado_em` pelo PostgREST.

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

  -- (a) as duas colunas do vínculo são só da equipe, SEMPRE — inclusive
  -- quando ainda não há confirmação. Sem isto, `{acompanhamento_confirmado_em:
  -- null}` pela API derrubaria a própria trava.
  if tg_op = 'UPDATE'
     and (new.acompanhamento_confirmado_em  is distinct from old.acompanhamento_confirmado_em
       or new.acompanhamento_confirmado_por is distinct from old.acompanhamento_confirmado_por)
  then
    raise exception 'Só a equipe confirma ou libera o acompanhamento deste cliente.'
      using errcode = '42501';
  end if;

  -- ─────────────────────────────────────────────────────────────────────
  -- (b) ...215 — A ESCOLHA É UMA SÓ, e independe de confirmação.
  --
  -- Marcar o primeiro favorito continua livre (`old.acompanhado_equipe` é
  -- falso e nada aqui dispara). O que não é livre é DESMARCAR o que já está
  -- marcado — e é por aí que passa toda troca, porque o índice único parcial
  -- `etapa1_clientes_unico_equipe` obriga a desmarcar o atual antes de marcar
  -- outro. Apagar a linha marcada é a mesma troca por outro caminho.
  --
  -- A frase é a mesma nos dois casos de propósito: para o aluno é UM problema
  -- só ("quero trocar de cliente") e a saída é uma só.
  -- ─────────────────────────────────────────────────────────────────────
  if tg_op = 'DELETE' and old.acompanhado_equipe then
    raise exception 'Para trocar o cliente que a equipe acompanha, abra um chamado no Suporte.'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and old.acompanhado_equipe and not new.acompanhado_equipe then
    raise exception 'Para trocar o cliente que a equipe acompanha, abra um chamado no Suporte.'
      using errcode = '42501';
  end if;

  -- Sem confirmação da equipe, o resto continua como sempre foi.
  if old.acompanhamento_confirmado_em is null then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  -- (c) cliente CONFIRMADO pela equipe — a camada de dentro, da ...203.
  -- O DELETE aqui é o do cliente confirmado que NÃO está mais com a estrela
  -- (só o admin consegue produzir esse estado, desmarcando sem liberar): a
  -- confirmação sozinha já basta para a linha não poder sumir.
  if tg_op = 'DELETE' then
    raise exception 'A equipe está acompanhando este cliente — ele não pode ser excluído.'
      using errcode = '42501';
  end if;

  if new.fase = 'prospeccao' and old.fase is distinct from 'prospeccao' then
    raise exception 'A equipe está acompanhando este cliente — a fase não pode voltar para Prospecção.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function gps.etapa1_clientes_acompanhamento_travado() is
  'BEFORE UPDATE OR DELETE em gps.etapa1_clientes. Recusa com 42501, para quem NAO e admin: (a) qualquer escrita em acompanhamento_confirmado_em/_por, sempre; (b) ...215: DESMARCAR a estrela ou APAGAR o cliente que esta com a estrela, INDEPENDENTE de confirmacao -- a primeira escolha e do aluno, a troca e da equipe ("abra um chamado no Suporte"); e, quando o cliente esta CONFIRMADO pela equipe, (c) apagar a linha e (d) voltar a fase para prospeccao. MARCAR o primeiro favorito continua livre (inclusive o update de gps.onboarding_concluir). Todo o resto da ficha continua livre -- a trava e do VINCULO, nao da ficha; o contrato anexado (...214) tambem passa. Guarda com coalesce(gp_is_admin(), false): sem sessao a funcao devolve NULL e a trava falharia ABERTO (licao de gps.etapa_liberada_para, 09/09/2026). As frases estao em FRASES_DO_BANCO (src/lib/erros.ts); sem elas o aluno leria uma frase generica de 42501. ⚠️ definirClienteEquipe (src/app/clientes/actions.ts) desmarca todos antes de marcar: com favorito existente, a chamada do ALUNO agora falha com a frase -- e a UI nao pode oferecer o botao.';

-- A trigger não muda (BEFORE UPDATE OR DELETE, for each row): o `create or
-- replace` acima já trocou o corpo. Recriada aqui só para a migração ser
-- idempotente por si mesma se um dia a ...203 for revertida por engano.
drop trigger if exists trg_etapa1_clientes_acompanhamento_travado on gps.etapa1_clientes;
create trigger trg_etapa1_clientes_acompanhamento_travado
  before update or delete on gps.etapa1_clientes
  for each row execute function gps.etapa1_clientes_acompanhamento_travado();

-- ─────────────────────────────────────────────────────────────────────────
-- Um comentário que PASSOU A MENTIR — corrigido aqui, sem tocar no corpo
-- ─────────────────────────────────────────────────────────────────────────
--
-- `gps.admin_liberar_acompanhamento` (...203) dizia "Devolve ao ALUNO o
-- direito de trocar o cliente acompanhado". Depois desta migração isso é
-- FALSO: a trava de desmarcar a estrela não depende mais da confirmação, então
-- liberar solta só a camada de dentro (fase pode voltar a prospeccao, a ficha
-- pode ser excluída SE a estrela sair antes) — e quem tira a estrela é a
-- equipe, em Modo Assistência, ou o aluno depois de um chamado.
-- A FUNÇÃO NÃO MUDA (nenhum `create or replace`): só o comentário, que é o que
-- a próxima pessoa lê antes de mexer.
comment on function gps.admin_liberar_acompanhamento(uuid, text) is
  'Encerra o acompanhamento formal da equipe: zera acompanhamento_confirmado_em/_por. NAO desmarca a estrela -- desmarcar travaria os passos 4-8 da Etapa 01 de quem nao pediu nada. ⚠️ Desde a ...215 liberar NAO devolve ao aluno o direito de TROCAR o cliente acompanhado: desmarcar a estrela passou a ser recusado independentemente de confirmacao (pedido do Joao, 10/09/2026 -- "se quiser mudar tem que abrir um chamado"). Quem troca a estrela e a EQUIPE, em Modo Assistencia (o admin nao e barrado pela trigger). O que liberar solta e a camada de dentro: a fase volta a poder ir para prospeccao e a ficha volta a poder ser excluida depois que a estrela sair. Motivo obrigatorio (3..300), log favorito_liberado e evento favorito_liberado_pela_equipe. gp_is_admin() ou 42501.';
