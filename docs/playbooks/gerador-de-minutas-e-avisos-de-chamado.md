# Playbook — Gerador de Minutas dentro do GPS + avisos de chamado no computador

> Atualizado em 07/10/2026. Dois sistemas independentes que cooperam: o **GPS**
> (este repo, Supabase `mbvybujpkwuorhtdzcde`) e o **Gerador de Minutas**
> (`gmthb.holdingmasters.com.br`, Lovable `d460dcf5-c04a-4eb9-b557-1881466219e2`,
> Supabase próprio `cegibbumyaxyhjmnlrgz`). Nenhum lê o banco do outro.

## 1. O que o parceiro vê

Aba **"Gerador de minutas"** (só para o parceiro: titular ou sócio). A aba abre o
gerador **embutido** e já **logado**, sem pedir senha. O botão "Tela cheia" põe a
própria janela em tela cheia (Fullscreen API; o iframe não recarrega), e o Esc volta. Sem a
API (iPhone), a janela cobre a tela por CSS e o botão vira "Sair da tela cheia".
(A rota `/gerador-de-minutas/abrir`, que abria aba nova, foi removida em 07/10.)

A equipe **não** entra por aqui: ela usa o login próprio do gerador.

## 2. Como funciona o acesso único (SSO)

```
GPS (servidor) ──> edge gerador-sso (GPS) ──> gps.gerador_sso_dados()  [quem pode]
      │                     └── assina JWT ES256, 60 s, jti único
      ▼
iframe: https://gmthb.../sso#t=<passe>&next=/dashboard   (fragmento: não vai a log nem Referer)
      ▼
página /sso do gerador ──> edge sso-exchange (gerador) ──> token_hash ──> verifyOtp ──> /dashboard
```

- **Chave privada** só no GPS (secret `GERADOR_SSO_PRIVADA` da edge `gerador-sso`).
  **Chave pública** fixa no código da `sso-exchange`. Não existe segredo compartilhado.
- **Quem recebe passe** (`gps.gerador_sso_dados`): membro titular/sócio com ambiente,
  conta não excluída nem banida, e-mail confirmado, **e-mail do login = e-mail do
  cadastro (`thb_alunos`)**, formato estrito, interruptor ligado. Perfil ativo da
  equipe → recusado. Medido em 07/10: **199 de 207** membros elegíveis; os 8 restantes
  usam o login manual do gerador.
- **No gerador** (`sso-exchange`): recusa assinatura inválida, `alg` diferente de ES256,
  passe vencido e passe reutilizado (`sso_tokens_usados`), com rate limit. A conta é
  achada nesta ordem:
  1. vínculo pelo `sub` do GPS (`sso_vinculos`);
  2. sem conta com aquele e-mail → **cria a conta** (método `criado`);
  3. conta antiga com o mesmo e-mail **e** `desde` < 1791331200 → vincula sozinho (método
     `auto`). Desde a migração **…359**, `desde` só é antigo para o par (conta GPS, e-mail)
     **congelado em 07/10** (`gps.gerador_sso_pares_2026_10_07`, 199 pares). E-mail trocado
     depois, inclusive pela equipe, leva `desde` = agora e cai no passo 4. Achado ALTO do
     kirad: trocar o e-mail de login a pedido do suporte ligaria a conta de outra pessoa;
  4. caso contrário → pede confirmação por e-mail (`/sso/vincular`), e a pessoa **clica em
     "Sim, ligar minha conta"** (nunca liga sozinho). É a trava contra tomada de conta: o
     GPS confirma e-mail sozinho (`mailer_autoconfirm`).
- **Login CSRF:** a página `/sso` só entra sozinha quando o `Referer` é a origem do GPS
  (o iframe manda `strict-origin-when-cross-origin`). Vindo de outro lugar, pergunta
  "Entrar como <e-mail>?".
- Conta da equipe no gerador → 403; conta bloqueada → 403.

**Criar login de quem não tem:** acontece **sozinho na primeira entrada** (passo 2).
Não há carga em lote de propósito: criar 159 contas que talvez nunca sejam usadas
dispararia aviso de cadastro ao admin do gerador e não muda nada para o parceiro.

Números de 07/10/2026 (cruzamento por hash de e-mail): 199 elegíveis no GPS, **40 já
tinham conta** no gerador (vínculo automático na 1ª entrada), **159 sem conta**
(criada na 1ª entrada).

## 2.1 Conciliação dos acessos (07/10/2026) — "indolor para o parceiro"

Regra do João: nenhum parceiro recebe conta duplicada nem e-mail de confirmação; o
trabalho de conciliar é da equipe. Cruzamento GPS × gerador por hash de e-mail, nome
normalizado e últimos 9 dígitos do WhatsApp (207 logins do GPS):

| Grupo | Qtd | Tratamento |
|---|---:|---|
| Conta no gerador com o mesmo e-mail | 41 | vínculo automático na 1ª entrada (pares congelados, …359) |
| Sem nenhuma conta no gerador | 163 | conta criada na 1ª entrada |
| Outra conta com mesmo nome/telefone | 3 | conciliados à mão (abaixo) |

Casos feitos à mão (vínculo `conciliado` em `sso_vinculos`, tipo novo no CHECK do gerador):
- **Luiz Fernando Z. N.:** 2 acessos no GPS criados em 06/10, ambos vazios. Mantido o da
  planilha da Central; o cadastro manual removido (lixeira). Aviso a ele no ClickUp.
- **Luigi G.:** acesso do GPS ligado à conta que ele já tinha no gerador com outro e-mail.
- **Roberta N.:** tinha 2 acessos no GPS. Mantido o de 29/09 (cliente + questionário
  feito); o contrato HM (`cs.contatos_hm`) passou para ele; o acesso vazio de 02/10 foi
  removido (lixeira). No gerador, e-mail com erro de digitação (`.com.br`) corrigido e conta
  ligada. O aviso a ela sobre qual login usar está no ClickUp.
- **Guilherme C. e Leonardo L.:** estavam bloqueados no gerador →
  aprovados, desbloqueados, classificados "Holding Masters".
- **Carita V.:** a 2ª conta (nunca usada) foi bloqueada; ela entra
  pela conta gmail que já usa.
- **7 sócios sem cadastro próprio:** liberados pela …360 e restringidos pela **…361** à lista
  congelada `gps.gerador_sso_socios_2026_10_07` (achado ALTO do kirad: o convite de sócio deixa
  o titular criar sócio com e-mail de terceiro, já confirmado). Sócio sem cadastro criado
  depois usa o login do gerador até a equipe vincular o cadastro dele (Central → Pessoas).
- **Wagner:** NÃO liberado. O e-mail do login dele no GPS pertence, no gerador, a uma conta
  com outro nome completo. Conferir quem é quem antes de qualquer vínculo (card no ClickUp).
- A conta de teste do parceiro de QA foi criada no gerador pelo teste de 07/10.

**Tela (07/10):** a aba virou uma "janela" do Programa: faixa fina com nome e "Abrir em tela
cheia", gerador ocupando a largura (até 1600px) e a altura da tela sem rolagem dupla; o botão
"Falar com a secretaria" some nesta tela (`globals.css`, `data-gerador-minutas`). No gerador,
o **modo embutido** (`src/lib/embutido.ts`, detecta iframe) esconde rodapé, marca, "Sair" e o
botão flutuante; fora do iframe nada muda.

## 3. Avisos de chamado no computador (Web Push)

Sem e-mail, sem Resend. A equipe clica em **/admin/chamados → Configuração → "Ativar
avisos neste computador"**. Quando um **parceiro** escreve num chamado, sai um aviso
nativo do sistema operacional ("Nova mensagem no chamado"), e o clique abre o chamado.

```
gps.chamado_mensagens (autor aluno) ─trigger─> gps.push_chamar ─pg_net─> edge push-enviar
   └── push_preparar (inscrições ativas) ─> cifra aes128gcm + VAPID ─> FCM / Mozilla / Apple / WNS
   └── push_resultado (404/410 ou 5 falhas → inscrição arquivada)
```

- Mensagem da equipe **não** dispara aviso. Texto do aviso: só o primeiro nome do
  parceiro, nunca o conteúdo da mensagem.
- Hosts de push numa lista fechada (`HOSTS_PUSH` + `*.notify.windows.com`), `redirect: manual`.
- "Desligar" e sair do sistema **arquivam** a inscrição (`revogada_em`); nada é apagado.
- `/sw.js` é público no `proxy.ts`: o navegador rebusca o script sem sessão.

## 4. Interruptores (sem deploy)

| Chave em `gps.config` | Efeito |
|---|---|
| `gerador_minutas_ativo` | `false` → ninguém recebe passe; a aba cai no login manual do gerador |
| `push_chamados_ativo` | `false` → nenhum aviso sai (as inscrições continuam guardadas) |

Os dois aparecem na tela de interruptores do admin.

## 5. Como testar localmente

1. `GERADOR_MINUTAS_ORIGEM=<origem do gerador> npx next dev -p 3991` (a origem também
   entra no `frame-src`). A prévia da Lovable (`id-preview--…`) **exige login na Lovable
   e não abre em iframe**: para testar a troca, ler o passe do `src` do iframe em
   `/gerador-de-minutas`, chamar a `sso-exchange` direto e fazer `verifyOtp` (roteiro em §6).
2. **Push não chega em Chrome de automação** (Playwright/CDP): o Google aceita (201) e o
   aviso não aparece, mesmo com a biblioteca de referência `web-push`. Testar com o
   **Microsoft Edge** (`channel: "msedge"`, `ignoreDefaultArgs:
   ["--disable-background-networking"]`), que entrega pelo WNS.
3. Ligar `push_chamados_ativo` só durante o teste e desligar depois.

## 6. Provas registradas (07/10/2026)

- Passe: ES256, validade de 60 s, campos `aud,desde,email,exp,iat,iss,jti,nome,sub`.
- 1ª troca 200 → `verifyOtp` ok → sessão com o e-mail do parceiro → leitura logada ok.
- Reuso do mesmo passe 401 · assinatura adulterada 401 · `alg=none` 401 · passe novo 200.
- Vínculo gravado no gerador: método `criado`.
- Push no Edge: inscrição WNS → parceiro abre chamado → aviso "Nova mensagem no chamado"
  com o link `/admin/chamados/<id>` → desligar arquivou a inscrição.

## 7. Se der problema

| Sintoma | Onde olhar |
|---|---|
| Aba mostra o login do gerador em vez de entrar | `gerador_minutas_ativo`; e-mail do login ≠ cadastro (`thb_alunos.email`); logs da edge `gerador-sso` |
| "Acesso expirado" | relógio/60 s; passe reutilizado (recarregar a aba gera outro) |
| "Confirme no e-mail" | conta antiga do gerador com o mesmo e-mail e conta GPS nova (trava anti-tomada) |
| Aviso não chega | `push_chamados_ativo`; `gps.push_inscricoes` (`revogada_em`, `falhas`); `net._http_response` da `push-enviar`; permissão do navegador |

## 8. Pendências

- `frame-ancestors` do gerador: a hospedagem da Lovable não deixa definir; só por regra
  na Cloudflare.
- API de status das minutas (gerador → GPS): opcional, não feita.
