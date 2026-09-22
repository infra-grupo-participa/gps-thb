# Suíte E2E — validar no navegador, não no `tsc`

Pedido do Marcio, 22/09/2026: *"eu preciso que tu valide visualmente, tipo no
browser mesmo, fazendo simulações… quero facilitar os testes E2e, para validar
as features que criamos sempre, a fim de evitar erros em produção"*.

## Por que existe

`tsc`, `eslint` e `next build` passam com a tela quebrada. Esta casa já pagou:
**1.790 testes verdes e a tela errada**, porque jsdom mocka
`getBoundingClientRect` e **não pinta**. Aqui o Chromium pinta de verdade.

O que só esta suíte pega:

| Classe de defeito | Exemplo real deste projeto |
|---|---|
| a feature existe, a porta de entrada some | 3 casos (aba Tutoriais vazia, Inventário, onboarding) |
| geometria | rolagem horizontal no celular, alvo de clique pequeno |
| contraste **composto em runtime** | 6,68:1 que só existia durante uma animação |
| a costura **entre** fatias | 3 dos defeitos de 22/09 nasceram aí, não dentro de uma tela |

## Como rodar

```bash
export QA_ENV_FILE=/caminho/para/.env.qa   # fora do repo!
npm run e2e              # tudo (desktop 1366px + Pixel 7)
npm run e2e:desktop      # só desktop
npm run e2e:ver          # com o navegador visível, para acompanhar
npm run e2e:relatorio    # abre o relatório da última rodada
```

Sem `QA_ENV_FILE`, os testes que precisam de login **se pulam com aviso** — não
falham por falta de segredo, e segredo nenhum entra no git.

### `.env.qa` (fora do repositório)

```
QA_BASE_URL=https://programa.timeholdingbrasil.com.br
QA_PARCEIRO_EMAIL=…
QA_PARCEIRO_SENHA=…
QA_ADMIN_EMAIL=…
QA_ADMIN_SENHA=…
```

## 🔴 Roda contra PRODUÇÃO — as travas que isso exige

Não há ambiente de teste: a suíte usa o site publicado com duas contas de QA
dedicadas. Consequências que **não podem ser afrouxadas**:

1. **`/admin/sessoes` é a agenda INTEIRA da equipe.** A conta de QA é admin e
   enxerga compromissos de parceiros reais com as doutoras.
2. **Cancelar dispara e-mail ao parceiro, com o motivo.** Uma pessoa real
   receberia "sessão cancelada — suíte E2E de QA".
3. Por isso `sessoes-fluxo.spec.ts` só cancela linha que casa com
   `CLIENTE DE TESTE (QA)`, conferido **duas vezes**: na linha da lista e no
   texto do diálogo já aberto. Sem correspondência, não clica.

Em 22/09 a primeira versão cancelava "o primeiro botão da lista" e havia uma
sessão real ao lado ("Graça · Cristiane"). Não foi cancelada por **acaso de
ordenação**, não por desenho. A trava nasceu daí.

4. 🔴 **E-mail sai de verdade, e travar "quem" não basta.** Mesmo com a trava
   acima funcionando, a primeira execução disparou **7 e-mails de cancelamento
   para a Dra. Cristiane** (21:05–21:15 de 22/09): o cron `sessao-emails` roda
   a cada 5 min e não distingue sessão de teste. Por isso
   `sessoes-fluxo.spec.ts` só roda com `QA_PERMITE_EMAIL=1`.
5. **Interruptor é config GLOBAL.** `interruptores.spec.ts` liga/desliga de
   verdade — desligar `chamados_aberto` fecha o suporte para todos enquanto
   estiver desligado. Ele restaura um por vez, e a janela dura segundos. Na
   primeira execução, o **timeout** cortou no meio e deixou
   `slack_mencoes_ativo` trocado em produção (restaurado à mão pela trilha).

**Regra para teste novo que escreve:** ancore no dado de teste, desfaça o que
criou (inclusive no `finally`) **e pergunte que efeito EXTERNO a escrita
dispara** — e-mail, webhook, notificação. Desfazer a linha no banco não desfaz
o e-mail que já saiu.

### Conferir depois de uma execução interrompida

```sql
-- interruptor que ficou trocado (contagem ÍMPAR):
select substring(detalhe from 'interruptor "([a-z_]+)"'), count(*)
  from gps.acessos_log where acao='interruptor_alterado'
   and criado_em > now() - interval '30 minutes' group by 1;

-- sessão de teste ainda agendada:
select a.estado, a.data, a.hora_inicio from gps.sessao_agendamentos a
  join gps.etapa1_clientes c on c.id=a.cliente_id
 where c.nome like 'CLIENTE DE TESTE%' and a.estado='agendado';
```

## Os arquivos

| Arquivo | O que cobre |
|---|---|
| `apoio.ts` | ferramentas reutilizáveis — servem a qualquer feature |
| `sessoes-parceiro.spec.ts` | `/sessoes`: aba, estado vazio, sem date-picker, link |
| `sessoes-equipe.spec.ts` | `/admin/sessoes`: briefing, **resumo**, contraste |
| `sessoes-fluxo.spec.ts` | ponta a ponta: marcar → equipe vê → cancelar |

`apoio.ts` é o que faz a régua subir uma vez e valer para todas: rolagem
horizontal, contraste medido no DOM pintado (fundo composto), alvo de clique
(WCAG 2.5.8), console sem erro, captura anexada ao relatório.

## ⚠️ O teste que está VERMELHO de propósito

`🔴 ACHADO ALTO: 'Registrar/editar resumo' abre COM o texto já gravado`
**falha quando não há sessão concluída na conta de QA.**

Não é regressão do produto — é o teste recusando-se a ficar verde sem ter
exercitado nada. Ele guarda o achado ALTO do pentest de 22/09: o formulário
abria **vazio** e `sessao_resumo_editar` **sobrescreve**, então quem clicasse
numa sessão já resumida apagava texto que nunca leu — e o texto é
**irrecuperável** (a trilha guarda o tamanho, nunca o conteúdo, por LGPD).

**Para destravar:** conclua uma sessão de teste em `/admin/sessoes` (o botão
"Concluir sessão" aparece a partir do horário de início) e rode de novo.

Um teste pulado não protege nada: fica verde para sempre enquanto a regressão
volta. Preferi vermelho honesto a verde vazio.

## Quando um teste falhar

1. `npm run e2e:relatorio` — vídeo, trace e captura do instante do erro.
2. Antes de mexer no produto, pergunte **se o defeito é do teste**: nesta
   primeira rodada, 4 das 4 falhas iniciais eram do teste, não do sistema
   (overlay do onboarding, skip link de 1×1px, `#conteudo` duplicado durante a
   transição de rota, e a regra das 24h para cancelar).
3. Falha intermitente quase sempre é espera mal escrita. `retries: 0` é
   deliberado: teste que só passa na 2ª tentativa esconde defeito real.
