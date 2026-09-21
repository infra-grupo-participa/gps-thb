-- 🔴 FECHA O ACHADO CRÍTICO DO PENTEST DE 21/09/2026.
--
-- ⚠️ Esta migração NÃO é feature nova: ela CORRIGE a ...289, aplicada horas
-- antes no mesmo dia. Fica como arquivo próprio (em vez de editar a ...289)
-- porque a ...289 já estava em produção quando o furo apareceu — reescrever
-- uma migração aplicada apaga a história de que o furo existiu.
--
-- ═══════════════════════════════════════════════════════════════════════
-- O FURO
-- ═══════════════════════════════════════════════════════════════════════
-- A ...289 liberou o Financeiro para a PESSOA dona do cadastro:
--
--   or (m.pessoa_aluno_id is not null and m.pessoa_aluno_id = p_aluno_id)
--
-- O cabeçalho dela afirmava que "o ramo novo nunca cruza pessoas". A prova
-- por casos analisava o dado PARADO e não considerou quem ESCREVE a coluna.
--
-- `gps.socio_cadastro_gravar` (...256) é SECURITY DEFINER com execute para
-- `authenticated`. Ela não precisa de GRANT de UPDATE em `gps.membros` — roda
-- como owner — e grava `pessoa_aluno_id` a partir de um CPF DIGITADO NO
-- FORMULÁRIO pelo próprio sócio. A única recusa é para CPF que já pertença a
-- OUTRO MEMBRO; cadastro de quem não é membro do GPS passa direto, e
-- `public.thb_alunos` tem 2.459 linhas contra ~142 membros.
--
-- Exploração, em 5 passos:
--   1. ser sócio com `pessoa_aluno_id IS NULL` (medido: 3 pessoas);
--   2. chamar `gravarCadastroSocio` com o CPF de outra pessoa;
--   3. a RPC aceita (o alvo não é membro) e aponta `pessoa_aluno_id` para ela;
--   4. `financeiro_pode_ler(<cadastro da vítima>)` passa a devolver TRUE;
--   5. `financeiro_do_aluno`/`financeiro_extrato_do_aluno` entregam valor,
--      pago, saldo, parcelas, situação, próxima cobrança e método de
--      pagamento — dado de `cs.contatos_hm`/`cs.vw_hm_financeiro`.
--
-- Superfície medida em 21/09: 3 atacantes possíveis × 24 cadastros com
-- contrato e sem membro. A validação de CPF é só de dígito verificador
-- (`gps.cpf_valido`), não de titularidade.
--
-- 🔑 A trilha (`gps.acessos_log`, acao='socio_cadastro_preenchido') mostra
--    UM uso legítimo e NENHUMA exploração. Fechado antes de ser usado.
--
-- ═══════════════════════════════════════════════════════════════════════
-- A CORREÇÃO — prova de posse, não revogação
-- ═══════════════════════════════════════════════════════════════════════
-- Revogar o ramo faria o Carlos Alberto perder o próprio extrato (R$ 9.658,62
-- pagos, T34, ativo), que é justamente a decisão do Marcio de 21/09. Em vez
-- disso, o ramo passa a exigir algo que o atacante NÃO controla: o cadastro
-- tem de carregar o MESMO e-mail do login. `auth.users.email` é escrito pelo
-- GoTrue; o formulário do sócio não o alcança.
--
-- Provado em produção depois de aplicar (ensaios com rollback):
--   • vínculo forjado para cadastro de terceiro com contrato → false ✔
--   • Carlos lê o próprio cadastro                           → true  ✔
--   • Carlos lê o cadastro do Jonas                          → false ✔
--   • Jonas lê o próprio                                     → true  ✔
--   • Jonas lê o do Carlos                                   → false ✔
--
-- ⚠️ CUSTO ACEITO: cadastro com e-mail diferente do login (ou sem e-mail) não
-- lê o próprio financeiro por este ramo — cai no comportamento anterior à
-- ...289 (só o ramo do titular). Ninguém fica pior do que estava antes de
-- 21/09. Conferido nos 2 membros do caso Jonas/Carlos: os dois batem.
--
-- 📌 PENDÊNCIA REGISTRADA, FORA DESTE ESCOPO: `gps.socio_cadastro_gravar`
-- aceitar CPF de terceiro continua sendo um problema por si — ela sobrescreve
-- nome/telefone/endereço de um `thb_alunos` alheio. Esta migração fecha a
-- CONSEQUÊNCIA financeira; a causa (validar posse do CPF) é decisão de
-- produto e merece rodada própria.
--
-- REVERSÃO: recriar com o corpo da ...289 (sem o `exists` de e-mail).
--           ⚠️ Reverter REABRE o vazamento descrito acima.

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
                    (m.aluno_id = p_aluno_id and m.papel = 'titular')
                 or (m.pessoa_aluno_id is not null
                     and m.pessoa_aluno_id = p_aluno_id
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
  'Guarda de leitura do Financeiro. TRUE para admin, para o TITULAR do ambiente (...140) e para a PESSOA dona do cadastro (...289) -- esta ultima SOMENTE quando o cadastro carrega o mesmo e-mail do login (...290). 🔴 A prova de posse por e-mail existe porque gps.socio_cadastro_gravar (SECURITY DEFINER, executavel por authenticated) grava gps.membros.pessoa_aluno_id a partir de um CPF digitado no formulario e so recusa CPF que ja pertenca a outro MEMBRO: sem esta trava, um socio apontava o vinculo para o cadastro de qualquer nao-membro e lia o extrato financeiro dele (medido 21/09: 3 atacantes possiveis x 24 alvos com contrato; 0 exploracoes na trilha). auth.users.email e escrito pelo GoTrue e o atacante nao o controla. Mantida STABLE.';

revoke execute on function gps.financeiro_pode_ler(uuid) from public, anon;
grant  execute on function gps.financeiro_pode_ler(uuid) to authenticated;
