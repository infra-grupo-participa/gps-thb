"use client";

/**
 * A FICHA DO CLIENTE — uma PASTA COM QUATRO FOLHAS (Marcio, 24/09/2026).
 *
 * Este arquivo é o **index**: ele é dono de todo o estado do formulário, da
 * validação, do `salvar()` e dos diálogos da estrela. Saíram daqui:
 *
 * | arquivo | o que é |
 * |---|---|
 * | `ficha-abas.tsx` | a casca das abas (régua, contador, marca) |
 * | `ficha-abas-estado.ts` | **puro, sem React**: allowlist de `?aba=`, padrão por fase, contadores, `camposAlteradosDaFicha`, `alteradoPorAba`, a frase da barra |
 * | `ficha-aba-dados.tsx` · `ficha-pj.tsx` | folha 1 |
 * | `ficha-aba-preliminar.tsx` | folha 2 |
 * | `ficha-croqui.tsx` | folha 3 (**slot da fatia 5**) |
 * | `ficha-aba-fechamento.tsx` | folha 4 (sobre `ficha-contrato` + `minutas-anexo`) |
 * | `ficha-barra-salvar.tsx` | a barra sticky |
 *
 * ⚠️ **O index ficou em ~700 linhas, não em 400** — e a métrica da casa é "até
 * 400". O que sobrou aqui é UMA responsabilidade: os 22 `useState` do
 * formulário, as 5 guardas de validação e o `salvar()` que monta o
 * `PatchCliente`. Cortar por linha separaria a guarda do campo que ela
 * valida e o estado do `salvar()` que o envia — a mesma razão pela qual
 * `slots-actions.ts` ficou com 731. O que era puro (a comparação campo a
 * campo, a frase da barra) **já saiu** para `ficha-abas-estado.ts`, e é lá
 * que a lógica se confere sem montar a tela. Eram 1.033 linhas numa só.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 🔴 POR QUE TODOS OS `useState` FICAM AQUI, E NÃO DENTRO DAS FOLHAS
 * ═══════════════════════════════════════════════════════════════════════
 * `TabsPanel` do Base UI desmonta o painel inativo por padrão (`keepMounted =
 * false`). Estado que morasse numa folha morreria a cada troca de aba, em
 * silêncio, e o "Salvar ficha" mandaria ao banco o valor do servidor por cima
 * do que a pessoa digitou. Aqui, acima das abas, eles sobrevivem.
 *
 * `FichaAbas` ainda passa `keepMounted` por causa do estado PRÓPRIO de
 * `MinutasAnexo`/`ContratoAnexo` (texto de contexto, arquivo escolhido), que
 * não sobe para cá — ver o cabeçalho de lá. As duas travas são
 * independentes: esta protege o formulário, aquela protege os anexos.
 *
 * 🔑 **Zero consulta ao trocar de aba.** Conferido hook a hook em 24/09/2026:
 * nenhuma folha, e nenhum componente que elas montam (`DiscDialogo`,
 * `MinutasAnexo`, `ContratoAnexo`, `PainelEntrevistaPrevia`), chama `fetch`,
 * `useEffect` de carga ou `createClient()` fora de um handler de clique.
 * `painelEntrevista` é markup do SERVIDOR que atravessa por `ReactNode`. A
 * armadilha conhecida (hook com cara de local escondendo `SELECT` por troca
 * de aba) não existe aqui — e a razão está escrita para quem for acrescentar
 * a próxima folha: **folha que desmonta não carrega nada próprio**.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * 🔴 A BARRA STICKY NOMEIA A FOLHA
 * ═══════════════════════════════════════════════════════════════════════
 * "Você tem alterações não salvas em Reunião preliminar." Com quatro folhas,
 * "nesta ficha" não diz ONDE — a pessoa alteraria o DISC, iria ao Fechamento
 * e teria de abrir as quatro para achar. A aba alterada também ganha marca
 * própria (ponto + `sr-only`), porque a barra fica no rodapé e a régua das
 * abas, no topo.
 *
 * 🔴 **Pendência puxa a folha.** `faltaEssencial` (nome/telefone) é da aba 1 e
 * bloqueia o salvar da ficha INTEIRA. Ao tentar salvar com outra folha aberta,
 * a ficha troca para "Dados básicos" e foca o campo vazio — botão morto numa
 * folha, motivo em outra, é o defeito que esta fatia existe para não criar.
 */

import { useCallback, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { ClienteEtapa1, FaseCliente, GrauRelacao } from "@/lib/types";
import type { ClienteMinuta } from "@/lib/minutas-tipos";
import type { ClienteCroqui } from "@/lib/croquis-tipos";
import { FASES_CLIENTE } from "@/lib/etapa1";
import {
  mascaraCpfCnpj,
  mascaraTelefone,
  moedaParaNumero,
  numeroParaMoeda,
  soDigitos,
} from "@/lib/masks";
import { atualizarCliente, definirClienteEquipe } from "@/app/clientes/actions";
import { linkWhatsapp } from "@/lib/whatsapp";
import { DialogoDesfavoritar } from "@/components/clientes/dialogo-desfavoritar";
import { FichaCabecalho } from "@/components/clientes/ficha-cabecalho";
import { DialogoEscolherFavorito } from "@/components/clientes/dialogo-escolher-favorito";
import { FichaAbas } from "@/components/clientes/ficha-abas";
import { FichaAbaDados } from "@/components/clientes/ficha-aba-dados";
import { FichaAbaPreliminar } from "@/components/clientes/ficha-aba-preliminar";
import { FichaCroqui } from "@/components/clientes/ficha-croqui";
import { FichaAbaFechamento } from "@/components/clientes/ficha-aba-fechamento";
import { FichaBarraSalvar } from "@/components/clientes/ficha-barra-salvar";
import {
  ABAS_FICHA,
  ROTULO_DA_ABA,
  abaDaPendencia,
  alteradoPorAba,
  camposAlteradosDaFicha,
  contadorDaAba,
  frasePendenciaDaFicha,
  resolverAba,
  type AbaFicha,
} from "@/components/clientes/ficha-abas-estado";
import {
  fasesDisponiveis,
  estrelaTravada,
} from "@/components/clientes/clientes-manager/ordenacao";

export function ClienteFicha({
  cliente,
  alunoId,
  admin = false,
  outroConfirmadoNome = null,
  outroFavoritoNome = null,
  minutas = [],
  croquis,
  contextoObrigatorio = false,
  painelEntrevista = null,
  qtdDecisores = null,
  temEntrevistaConcluida = false,
}: {
  cliente: ClienteEtapa1;
  alunoId: string;
  /**
   * O painel da Entrevista Prévia, montado no SERVIDOR (decisores +
   * histórico). `null` no modo assistência: quem entrevista é o parceiro,
   * ao telefone com o lead — o admin vê o resultado, não conduz.
   */
  painelEntrevista?: React.ReactNode;
  /**
   * Quantos decisores a Entrevista Prévia registrou para este cliente.
   *
   * Vem do `getDecisoresPendentes` que a page JÁ chama no `Promise.all` — é
   * a contagem do painel, reaproveitada. **Nenhuma consulta nova**.
   *
   * 🔴 `null` = NÃO SABEMOS (modo assistência, que não chama a RPC). Aí a
   * segunda linha do bloco DISC simplesmente não aparece — ausência de dado
   * nunca vira afirmação de que não há decisor. `0` e `1` também não
   * mostram nada: a trava só existe com mais de um.
   */
  qtdDecisores?: number | null;
  /**
   * Já existe pelo menos uma Entrevista Prévia CONCLUÍDA neste cliente.
   * Derivado do `getEntrevistasDoCliente` que a page JÁ resolve — nenhuma
   * consulta nova.
   *
   * 🔴 `false` no modo assistência, e de propósito: a rota `/sessoes` só
   * existe para o ALUNO (`nav.ts` filtra por `basePath === ""`). Um link
   * aqui levaria o admin a um 404, e link que dá erro é pior que link
   * ausente.
   */
  temEntrevistaConcluida?: boolean;
  /**
   * Modo assistência. Só com `true` aparecem "Confirmar acompanhamento" e
   * "Liberar acompanhamento" — quem autoriza mesmo é o `gp_is_admin()` das
   * RPCs `...203`; aqui é a diferença entre oferecer e não oferecer.
   */
  admin?: boolean;
  /**
   * Nome do cliente que a equipe JÁ acompanha no ambiente, quando não é este.
   * `null` = não há outro confirmado.
   */
  outroConfirmadoNome?: string | null;
  /**
   * Nome do cliente que o ALUNO já escolheu no ambiente, quando não é este e a
   * equipe ainda não confirmou. `null` = não há outro escolhido.
   */
  outroFavoritoNome?: string | null;
  /**
   * Histórico de minutas do cliente (mais recente primeiro), vindo do
   * SERVIDOR — mesma regra do anexo de contrato: a escrita é por RPC e não
   * passa pelo "Salvar ficha", então não vira estado local.
   */
  minutas?: ClienteMinuta[];
  /**
   * Versões do CROQUI deste cliente, mais recente primeiro
   * (`getCroquisDoCliente`). Alimenta a aba 3 e o contador do rótulo dela.
   *
   * 🔑 **Obrigatória.** Sem default: as DUAS `page.tsx` da ficha (parceiro e
   * espelho do admin) buscam a lista no servidor e passam aqui. Um default
   * `[]` deixaria a aba dizer "Nenhum croqui" para uma página que esqueceu de
   * buscar — afirmação sobre o banco que a tela não tem como sustentar, e que
   * o `tsc` deixaria passar em silêncio. Sendo obrigatória, page nova que
   * monte a ficha sem os croquis não compila.
   */
  croquis: ClienteCroqui[];
  /**
   * Interruptor `minuta_contexto_obrigatorio`, lido no servidor pela page.
   */
  contextoObrigatorio?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [nome, setNome] = useState(cliente.nome ?? "");
  const [telefone, setTelefone] = useState(
    cliente.telefone ? mascaraTelefone(cliente.telefone) : "",
  );
  const [grau, setGrau] = useState<string>(cliente.grau_relacao ?? "");
  // ── PESSOA JURÍDICA (migração `…308`) ────────────────────────────────
  // 🔴 `cnpj` mora MASCARADO no estado e vai em DÍGITOS PUROS ao banco (o
  // CHECK é `^[0-9]{14}$`). A conversão está em `salvar()` e repetida na
  // comparação de `alterado`, senão a barra mente nos dois sentidos — mesma
  // armadilha do telefone.
  const [razaoSocial, setRazaoSocial] = useState(cliente.razao_social ?? "");
  const [cnpj, setCnpj] = useState(
    cliente.cnpj ? mascaraCpfCnpj(cliente.cnpj) : "",
  );
  const [ramo, setRamo] = useState(cliente.ramo_atividade ?? "");
  const [regime, setRegime] = useState<string>(cliente.regime_tributario ?? "");
  const [problemas, setProblemas] = useState<string[]>(cliente.problemas ?? []);
  const [fase, setFase] = useState<FaseCliente>(cliente.fase ?? "prospeccao");
  const [dataReuniao, setDataReuniao] = useState(
    cliente.data_reuniao_preliminar ?? "",
  );
  const [disc, setDisc] = useState(cliente.perfil_disc ?? "");
  // ═══════════════════════════════════════════════════════════════════════
  // 🔴 O DISC RICO (PRD 2026-09-23) — e a armadilha do `""`
  // ═══════════════════════════════════════════════════════════════════════
  // O CHECK das 3 colunas é **3..2000 caracteres sobre `btrim`, com `null`
  // permitido**: `null` passa, `"ok"` é curto demais, e **`""` ou `"   "`
  // violam o CHECK com 23514**. Campo esvaziado tem de virar `null` antes de
  // ir ao banco — senão quem limpasse um campo levaria "violates check
  // constraint" na ficha INTEIRA, porque o update é um só.
  const [discConsciencia, setDiscConsciencia] = useState(
    cliente.disc_consciencia ?? "",
  );
  const [discGatilhos, setDiscGatilhos] = useState(cliente.disc_gatilhos ?? "");
  const [discRelacionamento, setDiscRelacionamento] = useState(
    cliente.disc_relacionamento ?? "",
  );
  const [aderiu, setAderiu] = useState(cliente.aderiu_reuniao);
  const [msgPadrao, setMsgPadrao] = useState(cliente.mensagem_padrao_enviada);
  const [estudoCaso, setEstudoCaso] = useState(cliente.estudo_caso_enviado);
  const [ligacao, setLigacao] = useState(cliente.ligacao_realizada);
  const [registro, setRegistro] = useState(cliente.registro_contato ?? "");
  const [acompanhado, setAcompanhado] = useState(cliente.acompanhado_equipe);
  /**
   * PL11 — desmarcar a estrela aqui trava os passos 4 a 8 da Etapa 01, igual
   * a desmarcá-la na lista. `true` = diálogo aberto. Só o DESLIGAR pergunta.
   */
  const [desfavoritando, setDesfavoritando] = useState(false);
  /** Diálogo de ESCOLHA do cliente acompanhado (aluno, migração ...215). */
  const [escolhendo, setEscolhendo] = useState(false);
  const [erroDialogo, setErroDialogo] = useState<string | null>(null);
  /**
   * Falha da estrela FORA do diálogo (o caminho de ligar, que é um clique só).
   * Fica na tela, com `role="alert"`: a frase que vem da action já é a
   * traduzida do banco e é a única pista do que aconteceu — um toast a
   * apagaria em 4 segundos.
   */
  const [erroEstrela, setErroEstrela] = useState<string | null>(null);
  // Honorários e link do contrato (Fase 7-B). Ficam no estado mesmo quando a
  // fase não é "contratado": o valor SOBREVIVE à volta de fase (B9-b).
  const [honorarios, setHonorarios] = useState(
    numeroParaMoeda(cliente.valor_honorarios),
  );
  const [contratoUrl, setContratoUrl] = useState(cliente.contrato_url ?? "");
  const [pending, startTransition] = useTransition();
  /**
   * Por que a ficha recusou salvar — a frase EXATA, no `role="alert"` da barra
   * de salvar. Não some sozinha em 4 segundos; some quando ele salva de novo.
   */
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  /** Já houve uma tentativa de salvar? Marca os campos inválidos só depois. */
  const [tentouSalvar, setTentouSalvar] = useState(false);

  const wpp = linkWhatsapp(telefone);
  const contratoLimpo = contratoUrl.trim();
  const faseAtual = FASES_CLIENTE.find((f) => f.id === fase);

  // ═══════════════════════════════════════════════════════════════════════
  // A FOLHA ABERTA — mora na URL (`?aba=`), com allowlist fechada
  // ═══════════════════════════════════════════════════════════════════════
  // Ver o cabeçalho de `ficha-abas.tsx` para o porquê de `replaceState`. A
  // fase que decide o PADRÃO é a do SERVIDOR (`cliente.fase`), não o `fase`
  // do formulário: com o estado local, trocar a fase no `Select` moveria a
  // folha aberta debaixo dos pés de quem está digitando.
  const aba: AbaFicha = resolverAba(searchParams.get("aba"), cliente.fase);

  /**
   * 🔴 **Um escritor só de `aba`.** Esta é a única função em toda a ficha que
   * toca a chave — e ela parte de `searchParams.toString()`, então preserva
   * qualquer outro parâmetro de graça.
   *
   * O padrão SAI do endereço: `/clientes/[id]` limpo continua limpo.
   */
  const irParaAba = useCallback(
    (destino: AbaFicha) => {
      if (!(ABAS_FICHA as readonly string[]).includes(destino)) return;
      const sp = new URLSearchParams(searchParams.toString());
      if (destino === resolverAba(null, cliente.fase)) sp.delete("aba");
      else sp.set("aba", destino);
      const q = sp.toString().replace(/%2C/g, ",");
      window.history.replaceState(null, "", `${pathname}${q ? `?${q}` : ""}`);
    },
    [searchParams, pathname, cliente.fase],
  );

  /**
   * A equipe assumiu ESTE cliente? Vem do dado do servidor, nunca do estado
   * local: a confirmação é escrita da equipe e não passa pelo formulário.
   */
  const confirmado = estrelaTravada(cliente);
  /** As fases que o banco ainda aceita para este cliente (§B.5). */
  const fasesDaFicha = fasesDisponiveis(cliente);
  /**
   * 🔴 Migração ...215 — a escolha do aluno é DEFINITIVA. A leitura é do dado
   * do SERVIDOR, nunca do `acompanhado` otimista: com o otimista, o botão
   * sumiria no clique, antes de o banco confirmar, e a falha deixaria a ficha
   * sem caminho de volta.
   */
  const escolhidoPeloAluno = !admin && cliente.acompanhado_equipe && !confirmado;
  /** Outro cliente do ambiente já é a estrela (confirmado ou só escolhido). */
  const outroNome = outroConfirmadoNome ?? outroFavoritoNome;
  /**
   * A estrela só aparece quando ela pode funcionar. O que a trava de verdade é
   * a CONFIRMAÇÃO da equipe, não a escolha do parceiro (corrigido em
   * 10/09/2026: o parceiro marcava a estrela e no mesmo instante perdia o
   * botão de desmarcar — 5 pessoas abriram chamado no primeiro dia).
   */
  const mostraEstrela = !confirmado && outroConfirmadoNome == null;

  const cnpjDigitos = soDigitos(cnpj);

  /**
   * Quais campos divergem do servidor — a fonte da barra E da marca da aba.
   * A conta inteira (22 comparações, cada uma com a normalização que
   * `salvar()` usa) vive em `ficha-abas-estado.ts`, pura e sem React.
   */
  const camposAlterados = camposAlteradosDaFicha(
    {
      nome,
      telefone,
      grau,
      razaoSocial,
      cnpj,
      ramo,
      regime,
      problemas,
      fase,
      dataReuniao,
      disc,
      discConsciencia,
      discGatilhos,
      discRelacionamento,
      aderiu,
      msgPadrao,
      estudoCaso,
      ligacao,
      registro,
      honorarios,
      contratoLimpo,
      cnpjDigitos,
    },
    cliente,
  );

  const abasAlteradas = alteradoPorAba(camposAlterados);

  /** Salvar já foi tentado e o grupo de problemas continua vazio. */
  const problemasEmFalta = tentouSalvar && problemas.length === 0;

  const contratado = fase === "contratado";

  // ═══════════════════════════════════════════════════════════════════════
  // 🔑 FICHA RECÉM-CRIADA (decisões do Marcio, 10/09/2026)
  // ═══════════════════════════════════════════════════════════════════════
  // O diálogo de criação grava nome + fase + grau e abre a ficha em seguida —
  // então "primeira vez" é a ficha que ainda não tem TELEFONE. Assim que ela
  // salva com telefone, os campos abrem: a partir daí toda visita é alteração.
  const fichaNova = !cliente.telefone;

  // 🔑 O BOTÃO NÃO OFERECE O QUE NÃO VAI DAR CERTO (Marcio, 10/09/2026):
  // *"se não cadastrar tudo, o botão de salvar ficha fica em branco"*. O
  // essencial é NOME + TELEFONE — é o que faz a ficha contar para os 30.
  //
  // ⚠️ Os PROBLEMAS ficam de fora desta trava, de propósito: 355 dos 879
  // clientes estão sem nenhum marcado (medido em 10/09), e travar o salvar por
  // causa deles prenderia 39 ambientes. Eles seguem como aviso âmbar.
  const faltaEssencial = !nome.trim() || !telefone.trim();
  const honorariosValor = moedaParaNumero(honorarios);
  // Mesma regra do CHECK no banco (migração ...090): https, sem espaço, de 12
  // a 2000 caracteres. Aqui é conveniência — a garantia é a do banco.
  const contratoInvalido =
    contratoLimpo !== "" &&
    (!/^https:\/\/[^\s]+$/.test(contratoLimpo) ||
      contratoLimpo.length < 12 ||
      contratoLimpo.length > 2000);

  /**
   * CNPJ digitado pela metade. O CHECK é `^[0-9]{14}$` com `null` permitido:
   * vazio é válido (vira `null`), 14 dígitos é válido, **qualquer coisa entre
   * 1 e 13 derruba a ficha inteira com 23514** — e a pessoa não teria como
   * adivinhar que o culpado foi o CNPJ, porque o update é um só.
   */
  const cnpjInvalido = cnpjDigitos.length > 0 && cnpjDigitos.length !== 14;

  /**
   * O piso de 3 caracteres dos campos ricos do DISC — CONVENIÊNCIA; a
   * garantia é o CHECK do banco. O caso do campo VAZIO não aparece aqui de
   * propósito: vazio é válido (vira `null`). Só o "quase vazio" é recusado.
   */
  const discRicoCurto = [
    { rotulo: "Consciência", valor: discConsciencia },
    { rotulo: "Gatilhos", valor: discGatilhos },
    { rotulo: "Relacionamento", valor: discRelacionamento },
  ].find((c) => {
    const t = c.valor.trim();
    return t !== "" && t.length < 3;
  });

  /**
   * 🔴 **A PENDÊNCIA PUXA A FOLHA.** Troca a aba e põe o foco no campo que
   * está barrando. Sem isto, quem estivesse no Fechamento veria o botão
   * "Salvar ficha" desabilitado, leria uma frase sobre nome e telefone e não
   * teria como saber que os dois campos vivem em outra folha.
   *
   * `requestAnimationFrame`: com `keepMounted` o campo já está no DOM, mas
   * focar antes do render da troca deixaria o foco num elemento com
   * `hidden` — o navegador ignora e o cursor some. Um frame depois a folha
   * já está visível.
   */
  function puxarParaCampo(destino: AbaFicha, idCampo: string) {
    irParaAba(destino);
    requestAnimationFrame(() => {
      const el = document.getElementById(idCampo);
      if (el instanceof HTMLElement) el.focus();
    });
  }

  /**
   * 🔴 Para o ALUNO, marcar a estrela pergunta antes, com a consequência
   * escrita. DESMARCAR, o parceiro faz sozinho enquanto a equipe não assumiu.
   * A trava real é `confirmado` (= `estrelaTravada`), a mesma do banco.
   */
  function toggleEquipe() {
    if (acompanhado) {
      if (!admin && confirmado) return;
      setErroDialogo(null);
      setDesfavoritando(true);
      return;
    }
    if (!admin) {
      setErroDialogo(null);
      setEscolhendo(true);
      return;
    }
    aplicarEquipe(true);
  }

  function aplicarEquipe(ativar: boolean) {
    setErroEstrela(null);
    setAcompanhado(ativar);
    startTransition(async () => {
      const res = await definirClienteEquipe(cliente.id, alunoId, ativar);
      if (res.erro) {
        // Desfaz o otimismo: sem isto a estrela ficaria mentindo na tela.
        setAcompanhado(!ativar);
        // A frase vem TRADUZIDA da action: trocá-la apagaria justamente o que
        // explica a trava e o que fazer.
        setErroDialogo(res.erro);
        setErroEstrela(res.erro);
        return;
      }
      setDesfavoritando(false);
      setEscolhendo(false);
    });
  }

  function toggleProblema(id: string) {
    setProblemas((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  }

  function salvar() {
    setTentouSalvar(true);
    setErroSalvar(null);
    // 🔴 A ordem das guardas segue a ordem das FOLHAS: a pendência da aba 1
    // é conferida primeiro, porque é a que bloqueia o botão. Cada uma leva a
    // pessoa até o campo.
    if (faltaEssencial) {
      setErroSalvar(
        `Preencha o nome e o telefone em ${ROTULO_DA_ABA.dados} — são eles que fazem a ficha contar para os 30.`,
      );
      puxarParaCampo("dados", !nome.trim() ? "f-nome" : "f-tel");
      return;
    }
    if (cnpjInvalido) {
      setErroSalvar(
        `O CNPJ em ${ROTULO_DA_ABA.dados} está incompleto (${cnpjDigitos.length} de 14 dígitos). Complete ou deixe em branco.`,
      );
      puxarParaCampo("dados", "f-cnpj");
      return;
    }
    if (contratoInvalido) {
      setErroSalvar(
        "O link do contrato precisa começar com https:// e não pode ter espaços.",
      );
      irParaAba("fechamento");
      return;
    }
    if (discRicoCurto) {
      // A frase nomeia O CAMPO. Sem isso, o 23514 do banco chegaria como
      // "violates check constraint" sobre uma ficha de 20 campos.
      setErroSalvar(
        `O campo "${discRicoCurto.rotulo}" do DISC precisa de pelo menos 3 caracteres — ou deixe em branco.`,
      );
      irParaAba("preliminar");
      return;
    }
    // 🔑 A exigência do rótulo dos problemas AVISA, não trava: 355 dos 879
    // clientes (39 ambientes) estão com ZERO problema marcado, dado legado de
    // meses. Travar o salvamento deixaria 40% das fichas sem poder corrigir
    // telefone ou fase. A cobrança é da tarefa 1.1, não do botão Salvar.
    startTransition(async () => {
      const res = await atualizarCliente(cliente.id, alunoId, {
        nome: nome.trim(),
        telefone: telefone.trim() || null,
        // `""` (campo esvaziado) vira `null` = NÃO INFORMADO. A action repete
        // esta normalização — aqui é para o `alterado` acima não mentir.
        grau_relacao: (grau as GrauRelacao) || null,
        // 🔴 PJ: `null` quando vazio (o CHECK recusa string vazia) e o CNPJ em
        // DÍGITOS PUROS — a máscara é só da tela.
        razao_social: razaoSocial.trim() || null,
        cnpj: cnpjDigitos || null,
        ramo_atividade: ramo.trim() || null,
        regime_tributario:
          (regime as ClienteEtapa1["regime_tributario"]) || null,
        problemas,
        // `status` congelou na migração 20260909000060 (é o caminho de volta):
        // nenhum caminho de escrita da aplicação pode tocar nele.
        fase,
        data_reuniao_preliminar: dataReuniao || null,
        perfil_disc: (disc as ClienteEtapa1["perfil_disc"]) || null,
        // 🔴 `""` NUNCA vai ao banco: o CHECK é 3..2000 sobre `btrim` com
        // `null` permitido.
        disc_consciencia: discConsciencia.trim() || null,
        disc_gatilhos: discGatilhos.trim() || null,
        disc_relacionamento: discRelacionamento.trim() || null,
        aderiu_reuniao: aderiu,
        mensagem_padrao_enviada: msgPadrao,
        estudo_caso_enviado: estudoCaso,
        ligacao_realizada: ligacao,
        registro_contato: registro.trim() || null,
        // Enviados sempre, inclusive fora de "contratado": o valor não some ao
        // mover o cliente de volta (B9-b). `null` continua `null` — nunca vira
        // R$ 0,00.
        valor_honorarios: honorariosValor,
        contrato_url: contratoLimpo || null,
      });
      if (res.erro) {
        setErroSalvar(res.erro);
        return;
      }
      setTentouSalvar(false);
      toast.success("Ficha salva.");
      // 🔑 `fichaNova` vem de `cliente.telefone`, que é prop do servidor: sem o
      // refresh, quem acabou de salvar o telefone continuaria vendo "Registro
      // do contato" desabilitado até navegar para outra tela. E os contadores
      // das abas leem `cliente`, não o estado local — sem `router.refresh()` o
      // rótulo continuaria mostrando o número velho depois de salvar.
      router.refresh();
    });
  }

  /** O texto do badge de cada folha. Ver `ficha-abas-estado.ts`. */
  const contadores = Object.fromEntries(
    ABAS_FICHA.map((id) => [
      id,
      contadorDaAba(id, { cliente, minutas, croquis }),
    ]),
  ) as Record<AbaFicha, string>;

  /**
   * A folha que BLOQUEIA o salvar, ou `null`. Quem transforma isto (e as abas
   * alteradas) na frase da barra é `frasePendenciaDaFicha`.
   */
  const abaPendente = abaDaPendencia({ faltaEssencial });

  return (
    <div className="grid gap-6">
      <FichaCabecalho
        cliente={cliente}
        alunoId={alunoId}
        admin={admin}
        /* 🔴 O link "abra um chamado" precisa do contexto: absoluto, ele
           ejetava o admin do ambiente do aluno. */
        basePath={admin ? `/admin/aluno/${alunoId}` : ""}
        fase={faseAtual}
        wpp={wpp}
        acompanhado={acompanhado}
        confirmado={confirmado}
        escolhidoPeloAluno={escolhidoPeloAluno}
        mostraEstrela={mostraEstrela}
        outroNome={outroNome}
        outroConfirmado={outroConfirmadoNome != null}
        erroEstrela={erroEstrela}
        pending={pending}
        onToggleEquipe={toggleEquipe}
        aoMudarAcompanhamento={() => router.refresh()}
      />

      <FichaAbas
        aba={aba}
        onAba={irParaAba}
        contadores={contadores}
        abasAlteradas={abasAlteradas}
        dados={
          <FichaAbaDados
            nome={nome}
            onNome={setNome}
            telefone={telefone}
            onTelefone={setTelefone}
            grau={grau}
            onGrau={setGrau}
            razaoSocial={razaoSocial}
            onRazaoSocial={setRazaoSocial}
            cnpj={cnpj}
            onCnpj={setCnpj}
            ramo={ramo}
            onRamo={setRamo}
            regime={regime}
            onRegime={setRegime}
            cnpjInvalido={tentouSalvar && cnpjInvalido}
            mascaraTelefone={mascaraTelefone}
          />
        }
        preliminar={
          <FichaAbaPreliminar
            fase={fase}
            onFase={setFase}
            fasesDaFicha={fasesDaFicha}
            faseAtual={faseAtual}
            confirmado={confirmado}
            faseNoServidor={cliente.fase ?? null}
            dataReuniao={dataReuniao}
            onDataReuniao={setDataReuniao}
            msgPadrao={msgPadrao}
            onMsgPadrao={setMsgPadrao}
            estudoCaso={estudoCaso}
            onEstudoCaso={setEstudoCaso}
            ligacao={ligacao}
            onLigacao={setLigacao}
            aderiu={aderiu}
            onAderiu={setAderiu}
            problemas={problemas}
            onToggleProblema={toggleProblema}
            problemasEmFalta={problemasEmFalta}
            disc={disc}
            setDisc={setDisc}
            discConsciencia={discConsciencia}
            setDiscConsciencia={setDiscConsciencia}
            discGatilhos={discGatilhos}
            setDiscGatilhos={setDiscGatilhos}
            discRelacionamento={discRelacionamento}
            setDiscRelacionamento={setDiscRelacionamento}
            painelEntrevista={painelEntrevista}
            qtdDecisores={qtdDecisores}
            admin={admin}
            temEntrevistaConcluida={temEntrevistaConcluida}
            registro={registro}
            onRegistro={setRegistro}
            fichaNova={fichaNova}
          />
        }
        /* ⚠️ SLOT da fatia 5 — ver o cabeçalho de `ficha-croqui.tsx`. */
        croqui={
          <FichaCroqui
            clienteId={cliente.id}
            croquis={croquis}
            podeAnexar
            desabilitado={pending}
            aoMudar={() => router.refresh()}
          />
        }
        fechamento={
          <FichaAbaFechamento
            cliente={cliente}
            admin={admin}
            contratado={contratado}
            honorarios={honorarios}
            onHonorarios={setHonorarios}
            honorariosValor={honorariosValor}
            contratoUrl={contratoUrl}
            onContratoUrl={setContratoUrl}
            contratoLimpo={contratoLimpo}
            contratoInvalido={contratoInvalido}
            faseRotulo={faseAtual?.rotulo}
            minutas={minutas}
            contextoObrigatorio={contextoObrigatorio}
            pending={pending}
            aoMudar={() => router.refresh()}
          />
        }
      />

      <FichaBarraSalvar
        erroSalvar={erroSalvar}
        aviso={frasePendenciaDaFicha({ abaPendente, abasAlteradas })}
        pending={pending}
        onSalvar={salvar}
      />

      {/* PL11 — o botão da estrela continua montado acima: é para lá que o
          foco volta quando o aluno desiste. */}
      {desfavoritando ? (
        <DialogoDesfavoritar
          desfavoritando={{ ...cliente, nome: nome.trim() || cliente.nome }}
          pending={pending}
          erroDialogo={erroDialogo}
          onConfirmar={() => aplicarEquipe(false)}
          onCancelar={() => {
            setDesfavoritando(false);
            setErroDialogo(null);
          }}
        />
      ) : null}

      {/* 🔴 Escolha ÚNICA do aluno (migração ...215). */}
      {escolhendo ? (
        <DialogoEscolherFavorito
          cliente={{ ...cliente, nome: nome.trim() || cliente.nome }}
          pending={pending}
          erro={erroDialogo}
          onConfirmar={() => aplicarEquipe(true)}
          onCancelar={() => {
            setEscolhendo(false);
            setErroDialogo(null);
          }}
        />
      ) : null}
    </div>
  );
}
