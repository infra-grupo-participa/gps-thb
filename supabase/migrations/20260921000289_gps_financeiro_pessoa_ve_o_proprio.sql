-- A pessoa passa a ler o financeiro DO PRÓPRIO CADASTRO, mesmo sendo sócia.
--
-- ═══════════════════════════════════════════════════════════════════════
-- POR QUE
-- ═══════════════════════════════════════════════════════════════════════
-- `gps.financeiro_pode_ler` (migração ...140) libera o Financeiro por PAPEL:
--
--   exists (select 1 from gps.membros m
--            where m.user_id = auth.uid()
--              and m.aluno_id = p_aluno_id
--              and m.papel = 'titular')
--
-- Isso funciona enquanto "titular do ambiente" e "dono do contrato" forem a
-- mesma pessoa. A conversão de titular em sócio (...287) quebra essa
-- coincidência: o Carlos Alberto Magalhães tem contrato HM PRÓPRIO em
-- `cs.contatos_hm` (R$ 9.658,60, T34, ativo, aluno_id = 62ddfb0b…) e, ao
-- virar sócio do ambiente do Jonas, deixaria de enxergar o próprio extrato.
--
-- Ele estaria pagando um contrato que não pode mais ver. Decisão do Marcio
-- (21/09/2026): o Carlos DEVE continuar vendo o próprio contrato.
--
-- ═══════════════════════════════════════════════════════════════════════
-- 🔴 O DESENHO — e por que o sócio NÃO passa a ver o financeiro do titular
-- ═══════════════════════════════════════════════════════════════════════
-- Há DUAS colunas em `gps.membros` e confundi-las abre o vazamento:
--
--   m.aluno_id        = o AMBIENTE onde a pessoa trabalha (compartilhado
--                       entre titular e sócios)
--   m.pessoa_aluno_id = o CADASTRO da própria pessoa (único dela)
--
-- O ramo novo amarra em **`m.pessoa_aluno_id = p_aluno_id`**, jamais em
-- `m.aluno_id`. A diferença é toda a segurança desta migração:
--
--   • Se fosse `m.aluno_id = p_aluno_id`, QUALQUER membro do ambiente
--     (inclusive sócio comum) passaria a ler o contrato do ambiente — ou
--     seja, o contrato do TITULAR. Vazamento de dado financeiro entre
--     sócios, exatamente o que não pode acontecer.
--
--   • Com `m.pessoa_aluno_id = p_aluno_id`, a pessoa só casa com o PRÓPRIO
--     cadastro. `pessoa_aluno_id` é a identidade dela e não muda quando ela
--     troca de ambiente (a ...287 preserva essa coluna de propósito).
--
-- PROVA POR CASOS, depois da conversão do Carlos:
--
--   Carlos (user 2f406431…, membro socio no ambiente 0c7123f7…,
--           pessoa_aluno_id = 62ddfb0b…):
--     • financeiro_pode_ler('62ddfb0b…')  → TRUE  pelo ramo novo
--       (pessoa_aluno_id dele = 62ddfb0b) ............... vê o PRÓPRIO ✔
--     • financeiro_pode_ler('0c7123f7…')  → FALSE
--       ramo antigo: ele é 'socio', não 'titular'        → falso
--       ramo novo:   pessoa_aluno_id dele é 62ddfb0b,
--                    não 0c7123f7                        → falso
--       ............................. NÃO vê o do Jonas ✔
--
--   Jonas (titular do ambiente 0c7123f7…, pessoa_aluno_id = 0c7123f7…):
--     • financeiro_pode_ler('0c7123f7…')  → TRUE (pelos dois ramos) ✔
--     • financeiro_pode_ler('62ddfb0b…')  → FALSE
--       ramo antigo: ele não é membro do ambiente 62ddfb0b → falso
--       ramo novo:   pessoa_aluno_id dele é 0c7123f7       → falso
--       ..................... NÃO vê o do Carlos (simétrico) ✔
--
--   Sócio comum qualquer (pessoa_aluno_id X, ambiente Y de outro titular):
--     • financeiro_pode_ler(Y) → FALSE nos dois ramos. O ramo novo NÃO
--       amplia o alcance dele em nada — só acrescenta o próprio X.
--
-- 🔴 A AFIRMAÇÃO ACIMA ERA FALSA SOZINHA — corrigida no pentest de 21/09.
--    O texto original dizia: "o ramo novo nunca cruza pessoas; cada
--    `auth.uid()` ganha exatamente UM cadastro a mais — o dele". A prova por
--    casos analisava o dado PARADO e não considerou que **o atacante escolhe
--    o valor da coluna**.
--
--    `gps.socio_cadastro_gravar` (migração ...256) é SECURITY DEFINER com
--    `grant execute to authenticated`: ela NÃO precisa de GRANT de UPDATE em
--    `gps.membros`, roda como owner, e grava `pessoa_aluno_id` a partir de um
--    **CPF digitado no formulário**. A única recusa é para CPF que já seja
--    `pessoa_aluno_id` de OUTRO MEMBRO — cadastro de quem não é membro do GPS
--    passa direto, e `thb_alunos` tem 2.459 linhas contra ~142 membros.
--
--    Exploração medida em 21/09: **3 sócios** com `pessoa_aluno_id IS NULL`
--    podiam apontar para qualquer um de **24 cadastros com contrato** em
--    `cs.contatos_hm` e ler valor, saldo, parcelas e método de pagamento.
--    A trilha (`acao='socio_cadastro_preenchido'`) mostra **1 uso legítimo e
--    nenhuma exploração** — a brecha foi fechada antes de ser usada.
--
-- 🔑 POR ISSO O RAMO NOVO EXIGE PROVA DE POSSE (o `exists` de e-mail, abaixo):
--    o cadastro só conta como "meu" quando carrega o MESMO e-mail do login.
--    `auth.users.email` é escrito pelo GoTrue, não pelo formulário do sócio —
--    digitar o CPF alheio deixa de bastar, porque o e-mail do cadastro alheio
--    não é o do atacante. Aí sim vale: cada `auth.uid()` ganha acesso a no
--    máximo UM cadastro a mais, e só se ele provar que é dele.
--
--    Provado em produção depois da correção: vínculo forjado para o cadastro
--    de terceiro com contrato → `financeiro_pode_ler` devolve **false**;
--    Carlos continua lendo o próprio (true) e não lê o do Jonas (false).
--
-- ⚠️ CUSTO ACEITO: quem tem cadastro com e-mail diferente do login (ou sem
--    e-mail) não lê o próprio financeiro por este ramo — cai no comportamento
--    anterior à ...289 (o ramo do titular). Ninguém fica pior do que estava.
--
-- ⚠️ EFEITO COLATERAL CONHECIDO E ACEITO
--    Um TITULAR cujo `pessoa_aluno_id` seja diferente do `aluno_id` do
--    ambiente (caso de "trocar titular", migração ...155) já lia o contrato
--    do ambiente pelo ramo antigo e passa a ler TAMBÉM o próprio. Isso é o
--    pedido: a pessoa vê o que é dela. Não abre nada para terceiros.
--
-- ═══════════════════════════════════════════════════════════════════════
-- AS 5 PERGUNTAS
-- ═══════════════════════════════════════════════════════════════════════
-- ESCALA ....... `exists` com `or`, sobre `gps.membros` filtrada por
--                `m.user_id = auth.uid()` — a pessoa logada tem 1 ou 2
--                linhas em membros. Não cresce com a base.
-- ÍNDICE ....... O filtro quente continua sendo `m.user_id = auth.uid()`,
--                que é o mesmo do ramo antigo (user_id é UNIQUE em
--                gps.membros). 🔴 Escrito como UM único `exists` com `or`
--                interno, e não dois `exists` encadeados: assim o planner
--                percorre as linhas do usuário UMA vez.
--
--                PLANO MEDIDO EM PRODUÇÃO — 21/09/2026, com o `or` novo:
--                  Result (actual time=1.318..1.319 rows=1 loops=1)
--                    InitPlan 1
--                      ->  Index Scan using membros_user_id_idx on membros m
--                            (actual time=0.034..0.034 rows=1 loops=1)
--                            Index Cond: (user_id = '2f406431-…'::uuid)
--                            Filter: (((aluno_id = '62ddfb0b…') AND (papel =
--                              'titular')) OR ((pessoa_aluno_id IS NOT NULL)
--                              AND (pessoa_aluno_id = '62ddfb0b…')))
--                            Buffers: shared hit=2
--                  Execution Time: 1.398 ms
--
--                🔑 Index Scan por `user_id` (unique). O ramo novo entra como
--                FILTER sobre a(s) linha(s) daquele login — não acrescenta
--                varredura nenhuma. O `or` não degradou o plano.
-- FREQUÊNCIA ... Chamada a cada abertura da tela de Financeiro e pelas
--                policies que a usam. É caminho quente de leitura.
-- REPETIÇÃO .... `stable` (preservado): o Postgres pode reaproveitar o
--                resultado dentro da mesma query em vez de reavaliar por
--                linha. 🔴 Não pode virar `volatile` — perderia isso.
-- REVERSÃO ..... Recriar a função com o corpo de ...140 (está no cabeçalho
--                acima, literal). Nenhum dado muda; é só guarda de leitura.

create or replace function gps.financeiro_pode_ler(p_aluno_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.gp_is_admin()
      or exists (
           select 1
             from gps.membros m
            where m.user_id = auth.uid()
              and (
                -- Ramo ANTIGO (...140): titular lê o contrato do ambiente.
                    (m.aluno_id = p_aluno_id and m.papel = 'titular')
                -- Ramo NOVO (...289): a pessoa lê o contrato do CADASTRO
                -- DELA, qualquer que seja o papel no ambiente.
                -- 🔴 `pessoa_aluno_id`, NUNCA `aluno_id`. Com `aluno_id`
                -- aqui, todo sócio passaria a ler o contrato do titular.
                 or (m.pessoa_aluno_id is not null
                     and m.pessoa_aluno_id = p_aluno_id
                     -- 🔴 PROVA DE POSSE (achado CRITICO do pentest, 21/09).
                     -- `pessoa_aluno_id` NAO e chave confiavel de "sou eu":
                     -- `gps.socio_cadastro_gravar` e SECURITY DEFINER,
                     -- executavel por `authenticated`, e grava essa coluna a
                     -- partir de um CPF DIGITADO NO FORMULARIO. Ela so recusa
                     -- CPF que ja pertenca a OUTRO MEMBRO — CPF de quem nao e
                     -- membro passa. Medido: 3 socios sem pessoa podiam ler o
                     -- extrato de 24 pessoas com contrato em cs.contatos_hm.
                     -- O e-mail do cadastro tem de bater com o do LOGIN, que
                     -- e escrito pelo GoTrue e o atacante nao controla.
                     and exists (
                           select 1
                             from public.thb_alunos t
                             join auth.users u on u.id = m.user_id
                            where t.id = m.pessoa_aluno_id
                              and coalesce(btrim(t.email), '') <> ''
                              and lower(btrim(t.email)) = lower(btrim(u.email))
                         ))
              ));
$$;

comment on function gps.financeiro_pode_ler(uuid) is
  'Guarda de leitura do Financeiro do aluno. TRUE para admin, para o TITULAR do ambiente (ramo da ...140) e -- desde a ...289 (21/09/2026) -- para a PESSOA dona do cadastro, qualquer que seja o papel dela no ambiente. Motivo: a conversao de titular em socio (...287) separou "titular do ambiente" de "dono do contrato"; sem este ramo o Carlos Alberto Magalhaes viraria socio e perderia o proprio extrato HM (R$ 9.658,60, T34, ativo), que ele continua pagando. 🔴 O ramo novo amarra em m.pessoa_aluno_id = p_aluno_id, JAMAIS em m.aluno_id: com aluno_id, todo socio passaria a ler o contrato do TITULAR do ambiente -- vazamento financeiro entre socios. Com pessoa_aluno_id cada login ganha acesso a exatamente UM cadastro a mais, o proprio, e nunca cruza pessoas. Mantida STABLE (nao pode virar volatile: perderia o reaproveitamento dentro da query, e ela e caminho quente da tela de Financeiro).';

-- 🔴 `create or replace` preserva o ACL, mas a assinatura é a MESMA da ...140
-- (uuid → boolean), então não há sobrecarga criada aqui. Os grants são
-- reafirmados por garantia: revogar só de `anon` não pega quando a permissão
-- vem de PUBLIC (toda role herda de PUBLIC), por isso o revoke nomeia os dois.
revoke execute on function gps.financeiro_pode_ler(uuid) from public, anon;
grant  execute on function gps.financeiro_pode_ler(uuid) to authenticated;
