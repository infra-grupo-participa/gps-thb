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
 * própria (o texto "não salvo"), porque a barra fica no rodapé e a régua das
 * abas, no topo.
 *
 * 🔴 **Pendência puxa a folha.** (29/09/2026, pedido do Marcio: *"o sistema
 * poderia guiar ele pra aba do erro, onde está o erro"*.) `pendenciasDaFicha`
 * (puro, em `ficha-abas-estado.ts`) devolve TODAS as pendências de uma vez —
 * antes, 4 guardas soltas paravam na primeira, e duas delas (DISC e link do
 * contrato) só trocavam de aba, sem foco, com o DISC dentro de um pop-up
 * FECHADO. Agora `salvar()` recusa se houver algo que barre e `levarAoCampo`
 * troca a aba, abre o pop-up do DISC se for o caso, abre o `<details>` do
 * link legado, centraliza o campo (a barra sticky não o cobre) e foca. O erro
 * do SERVIDOR com `campo` segue o mesmo caminho.
 */

import { useCallback, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type {
  ClienteEtapa1,
  FaseCliente,
  FunilOrigem,
  GrauRelacao,
} from "@/lib/types";
import type { ClienteMinuta } from "@/lib/minutas-tipos";
import type { ClienteCroqui } from "@/lib/croquis-tipos";
import type { LinkDrive } from "@/lib/links-drive-tipos";
import type { TrajetoriaCliente } from "@/lib/trajetoria-tipos";
import type { AtividadeDrive } from "@/lib/drive-atividade-tipos";
import type { EstadoDrive } from "@/lib/drive-tipos";
import { LinksDrive } from "@/components/clientes/links-drive";
import { FichaTrajetoria } from "@/components/clientes/ficha-trajetoria";
import { PastaAtividade } from "@/components/clientes/pasta-atividade";
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
import { ControleDiscDialogoContexto } from "@/components/clientes/disc-dialogo";
import {
  ABAS_FICHA,
  ROTULO_DA_ABA,
  ROTULO_DO_CAMPO,
  CAMPOS_NO_POPUP_DISC,
  alteradoPorAba,
  camposAlteradosDaFicha,
  contadorDaAba,
  estadoDaAba,
  fraseDaBarra,
  mensagensPorCampo,
  ordenarPendencias,
  pendenciaDoServidor,
  pendenciasDaFicha,
  pendenciasQueBarram,
  resolverAba,
  valorDoCampo,
  type AbaFicha,
  type EstadoDaAba,
  type Pendencia,
  type ValoresDaFicha,
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
  linksDrive,
  estadoDrive,
  trajetoria,
  atividadeDrive,
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
   * Links do Drive deste cliente (`getLinksDriveDoCliente`), com
   * `podeRemover` já resolvido no servidor. Obrigatória pelo mesmo motivo de
   * `croquis`: page que esquecer de buscar não compila, em vez de mostrar
   * "nenhum link" sem ter lido o banco.
   */
  /** `null` = a leitura falhou (a seção avisa; nunca vira "nenhum link"). */
  linksDrive: LinkDrive[] | null;
  /** Criação automática da pasta (`getEstadoDrive`); `null` = a leitura falhou. */
  estadoDrive: EstadoDrive | null;
  /**
   * Trajetória do cliente (`getTrajetoriaDoCliente`), resolvida no MESMO
   * `Promise.all` da page. Obrigatória pelo motivo de `croquis`; `null` = a
   * leitura falhou (o bloco avisa; nunca vira "nada marcado").
   */
  trajetoria: TrajetoriaCliente | null;
  /**
   * Atividade da pasta do cliente no Drive (`getAtividadeDriveDoCliente`), no
   * MESMO `Promise.all` da page. Obrigatória pelo motivo de `croquis`; `null` =
   * a leitura falhou (uma linha discreta; nunca "pasta vazia").
   */
  atividadeDrive: AtividadeDrive | null;
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
  // Funil de origem (…345). `""` = Não informado; vai como `null`.
  const [funilOrigem, setFunilOrigem] = useState<string>(
    cliente.funil_origem ?? "",
  );
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
  const [pendingOutros, startTransition] = useTransition();
  /**
   * 🔴 "Salvar ficha" honesto (Onda 1.5, 02/10/2026). O salvar tem a SUA
   * transição: com uma só, "Salvando…" acendia também quando a pessoa mexia
   * na estrela — o botão dizia que gravava a ficha sem gravar nada. `pending`
   * (a soma) continua travando tudo que travava antes.
   */
  const [salvando, startSalvar] = useTransition();
  const pending = pendingOutros || salvando;
  /**
   * Por que a ficha recusou salvar — a frase EXATA, no `role="alert"` da barra
   * de salvar. Não some sozinha em 4 segundos; some quando ele salva de novo.
   */
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  /** Já houve uma tentativa de salvar? Marca os campos inválidos só depois. */
  const [tentouSalvar, setTentouSalvar] = useState(false);
  /**
   * A recusa do SERVIDOR que apontou um campo (`{ erro, campo }` de
   * `atualizarCliente`), junto com o VALOR que o campo tinha quando foi
   * enviado (`valorDoCampo`). Entra na lista de pendências para seguir o
   * mesmo caminho das locais: aba, foco, mensagem no campo.
   *
   * 🔴 Vale só enquanto o campo continuar com aquele valor (ver
   * `recusaVigente`). Antes ela só sumia no próximo salvar: a pessoa voltava
   * a fase recusada e a tela seguia com "1 para corrigir" e "Ir para o
   * campo", acusando um valor que já não estava lá.
   */
  const [erroServidor, setErroServidor] = useState<{
    pendencia: Pendencia;
    valor: string | null;
  } | null>(null);
  /**
   * O pop-up do DISC, controlado DAQUI para o "Salvar ficha" poder abri-lo
   * quando o erro mora lá dentro. Atravessa a folha pelo
   * `ControleDiscDialogoContexto` (ver `disc-dialogo.tsx`).
   */
  const [discAberto, setDiscAberto] = useState(false);
  /** O campo que recebe o foco quando o pop-up abre por causa de um erro. */
  const [discFoco, setDiscFoco] = useState<string | null>(null);

  const wpp = linkWhatsapp(telefone);
  // O aviso de revisão (minuta e croqui) aponta para a pasta do Drive deste
  // cliente. Um link por cliente; `null` (sem link ou leitura falhou) = só texto.
  const linkDrive = linksDrive?.[0]?.url ?? null;
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
  const valores: ValoresDaFicha = {
    nome,
    telefone,
    grau,
    funilOrigem,
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
  };
  const camposAlterados = camposAlteradosDaFicha(valores, cliente);

  const abasAlteradas = alteradoPorAba(camposAlterados);

  const contratado = fase === "contratado";

  // ═══════════════════════════════════════════════════════════════════════
  // 🔑 FICHA RECÉM-CRIADA (decisões do Marcio, 10/09/2026)
  // ═══════════════════════════════════════════════════════════════════════
  // O diálogo de criação grava nome + fase + grau e abre a ficha em seguida —
  // então "primeira vez" é a ficha que ainda não tem TELEFONE. Assim que ela
  // salva com telefone, os campos abrem: a partir daí toda visita é alteração.
  const fichaNova = !cliente.telefone;

  const honorariosValor = moedaParaNumero(honorarios);

  // ═══════════════════════════════════════════════════════════════════════
  // 🔴 AS PENDÊNCIAS — UMA lista, quatro leitores (salvar, abas, barra, campo)
  // ═══════════════════════════════════════════════════════════════════════
  // O essencial é NOME + TELEFONE (Marcio, 10/09 e 29/09/2026) — é o que faz
  // a ficha contar para os 30. O resto é opcional; o que está preenchido de
  // um jeito que o banco recusa (CNPJ, DISC, link, honorários) também barra,
  // porque o update é um só e o CHECK derrubaria a ficha inteira.
  //
  // ⚠️ Os PROBLEMAS são `sugestao`, nunca barram: 355 dos 879 clientes estão
  // sem nenhum marcado (medido em 10/09), e travar o salvar por causa deles
  // prenderia 39 ambientes.
  /**
   * A recusa do servidor, SE o campo ainda tem o valor recusado; senão
   * `null`. Derivado no render, sem efeito: a pessoa mexeu no campo, a
   * acusação some da aba, da barra e do campo no mesmo quadro. Voltar ao
   * mesmo valor traz a acusação de volta — o banco o recusaria de novo.
   *
   * É o próprio objeto do estado (identidade estável) ou `null`, então serve
   * de dependência do `useMemo` abaixo sem recalcular a cada tecla.
   */
  const recusaVigente =
    erroServidor &&
    valorDoCampo(erroServidor.pendencia.campo, valores) === erroServidor.valor
      ? erroServidor.pendencia
      : null;

  const pendencias = useMemo(() => {
    const locais = pendenciasDaFicha({
      nome,
      telefone,
      cnpjDigitos,
      problemas,
      discConsciencia,
      discGatilhos,
      discRelacionamento,
      honorarios,
      contratoLimpo,
    });
    // A do servidor só entra se a local não já acusar o mesmo campo — senão
    // o campo mostraria duas frases e a aba contaria duas vezes.
    if (recusaVigente && !locais.some((p) => p.campo === recusaVigente.campo)) {
      return ordenarPendencias([...locais, recusaVigente]);
    }
    return locais;
  }, [
    nome,
    telefone,
    cnpjDigitos,
    problemas,
    discConsciencia,
    discGatilhos,
    discRelacionamento,
    honorarios,
    contratoLimpo,
    recusaVigente,
  ]);
  const barram = pendenciasQueBarram(pendencias);
  const temPendencia = (campo: keyof ClienteEtapa1) =>
    pendencias.some((p) => p.campo === campo);

  /**
   * Sugestão (âmbar) só aparece nas abas DEPOIS de uma tentativa de salvar —
   * a mesma regra que o aviso dos problemas já seguia. Antes disso ela
   * repetiria o "0 problemas" do contador em 40% das fichas, e aviso que está
   * sempre lá deixa de ser lido. O que BARRA aparece sempre: é o que a pessoa
   * precisa saber antes de clicar.
   */
  const pendenciasVisiveis = tentouSalvar ? pendencias : barram;

  /**
   * Salvar já foi tentado e o grupo de problemas continua vazio. Não é
   * duplicata de `erros`: `problemas` é SUGESTÃO, e `mensagensPorCampo` deixa
   * sugestão de fora (vira `aria-invalid`). É o aviso âmbar da folha 2.
   */
  const problemasEmFalta = tentouSalvar && temPendencia("problemas");
  /**
   * Link fora da regra — AO VIVO, antes de qualquer tentativa, como sempre
   * foi em `ficha-contrato`. Não é duplicata de `erros.contrato_url`, que só
   * existe depois da 1ª tentativa. (O CNPJ, que só marcava depois da
   * tentativa, virou `erros.cnpj` e deixou de ter prop própria.)
   */
  const contratoInvalido = temPendencia("contrato_url");

  /**
   * A frase de cada campo, para as folhas (prop `erros`). Só depois da
   * primeira tentativa: marcar campo de vermelho enquanto a pessoa ainda
   * digita é cobrar antes da hora.
   */
  const erros = useMemo(
    () => (tentouSalvar ? mensagensPorCampo(pendencias) : {}),
    [tentouSalvar, pendencias],
  );

  /**
   * 🔴 **A PENDÊNCIA PUXA A FOLHA — até o campo.** Troca a aba e:
   *   · campo do DISC → abre o pop-up; o foco cai no campo lá dentro
   *     (`initialFocus` do diálogo, via `discFoco`);
   *   · qualquer outro → `focarQuandoVisivel` (fim do arquivo).
   *
   * Sem isto, quem estivesse no Fechamento veria a recusa e não teria como
   * saber que o campo vive em outra folha — ou, no DISC, dentro de um pop-up
   * fechado.
   */
  function levarAoCampo(p: Pendencia) {
    irParaAba(p.aba);
    if (CAMPOS_NO_POPUP_DISC.has(p.campo)) {
      setDiscFoco(p.idCampo);
      setDiscAberto(true);
      return;
    }
    if (p.idCampo) focarQuandoVisivel(p.idCampo);
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
    setErroServidor(null);
    // 🔴 TODAS as pendências de uma vez (`pendenciasDaFicha`), na ordem das
    // folhas — antes, 4 guardas soltas paravam na primeira. A frase da recusa
    // NÃO vai para `erroSalvar`: ela é calculada ao vivo (`alertaLocal`) e
    // some sozinha quando a pessoa corrige. Uma string gravada aqui
    // continuaria dizendo "falta o telefone" com o telefone já preenchido.
    //
    // A do servidor (da tentativa anterior) fica de fora: acabou de ser
    // limpa, e quem decide de novo é o banco.
    const locais = pendenciasQueBarram(
      pendencias.filter((p) => p !== recusaVigente),
    );
    if (locais.length > 0) {
      levarAoCampo(locais[0]);
      return;
    }
    // 🔑 O nome só vai ao servidor quando MUDOU: a ficha antiga com só a
    // inicial continua salvando telefone e fase; a trava (`erroDeNomeAbreviado`)
    // pega quem DIGITA, e a recusa volta com `campo: "nome"` até o campo.
    const nomeMudou = nome.trim() !== (cliente.nome ?? "").trim();
    // 🔑 A exigência do rótulo dos problemas AVISA, não trava: 355 dos 879
    // clientes (39 ambientes) estão com ZERO problema marcado, dado legado de
    // meses. Travar o salvamento deixaria 40% das fichas sem poder corrigir
    // telefone ou fase. A cobrança é da tarefa 1.1, não do botão Salvar.
    // O QUE vai ser gravado, lido no clique (depois do refresh a comparação
    // volta a zero e não diria mais nada).
    const oQueFoiSalvo = descreverAlteracoes(camposAlterados, abasAlteradas);
    startSalvar(async () => {
      const res = await atualizarCliente(cliente.id, alunoId, {
        ...(nomeMudou ? { nome: nome.trim() } : {}),
        telefone: telefone.trim() || null,
        // `""` (campo esvaziado) vira `null` = NÃO INFORMADO. A action repete
        // esta normalização — aqui é para o `alterado` acima não mentir.
        grau_relacao: (grau as GrauRelacao) || null,
        funil_origem: (funilOrigem as FunilOrigem) || null,
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
        // Contrato da action: `campo` diz QUAL campo o servidor recusou. A
        // frase vai para o campo e a pessoa é levada até ele — o mesmo
        // caminho da recusa local.
        const p = res.campo ? pendenciaDoServidor(res.campo, res.erro) : null;
        if (p) {
          // 🔴 A frase NÃO vai para `erroSalvar`: gravada ali, ela ficaria na
          // barra depois de a pessoa corrigir o campo. Ela mora na pendência,
          // que morre sozinha quando o valor muda (`recusaVigente`), e a
          // barra a mostra inteira via `fraseDaBarra`. `valores` é o do
          // clique — o valor que o servidor recusou.
          setErroServidor({ pendencia: p, valor: valorDoCampo(p.campo, valores) });
          levarAoCampo(p);
        } else {
          // Sem campo, não há o que observar: fica até o próximo salvar.
          setErroSalvar(res.erro);
        }
        return;
      }
      setTentouSalvar(false);
      // 🔴 Diz O QUE foi salvo (Digisac: "disse que salvou mas não salvou").
      // O "Ficha salva." genérico aparecia também quando o que a pessoa tinha
      // feito era anexar um croqui ou um link — que se gravam sozinhos e
      // nunca passaram por este botão.
      toast.success(oQueFoiSalvo);
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

  /** O estado de cada folha: "N para corrigir", sugestão ou "Completa". */
  const estados = Object.fromEntries(
    ABAS_FICHA.map((id) => [id, estadoDaAba(id, pendenciasVisiveis)]),
  ) as Record<AbaFicha, EstadoDaAba>;

  /**
   * A recusa, ao vivo: existe enquanto houver algo barrando depois de uma
   * tentativa — inclusive a do SERVIDOR com `campo`, que entra em `barram`
   * e sai na frase com o nome do campo e a frase dele. Vai no `role="alert"`
   * da barra. `erroSalvar` (recusa do servidor SEM campo) vence, porque é a
   * única pista que existe.
   */
  const alertaLocal =
    tentouSalvar && barram.length > 0
      ? fraseDaBarra({ pendencias: barram, abasAlteradas })
      : null;
  const primeiraQueBarra = barram[0] ?? null;

  return (
    <ControleDiscDialogoContexto.Provider
      value={{
        aberto: discAberto,
        onAbertoChange: (v) => {
          setDiscAberto(v);
          // Fechou: a próxima abertura pelo botão "Ver perfil" usa o foco
          // padrão, não o do último erro.
          if (!v) setDiscFoco(null);
        },
        focoInicial: discFoco,
      }}
    >
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

      {/* Acima das abas: os links valem para a ficha inteira, não para uma
          folha. `souEquipe = admin` — a mesma prop que liga o modo assistência. */}
      <LinksDrive
        clienteId={cliente.id}
        links={linksDrive}
        souEquipe={admin}
        estadoDrive={estadoDrive}
      />

      {/* O mapa do cliente: vale para a ficha inteira, então mora acima das
          abas, junto do Drive — e não desmonta ao trocar de folha. Grava na
          hora, por RPC; não passa pelo "Salvar ficha". */}
      {/* Só com link de pasta: sem ele não há pasta para ler. Fica entre o
          link e a trajetória porque a sugestão marca etapa dela. */}
      {linkDrive ? (
        <PastaAtividade clienteId={cliente.id} atividade={atividadeDrive} />
      ) : null}

      <FichaTrajetoria clienteId={cliente.id} trajetoria={trajetoria} />

      <FichaAbas
        aba={aba}
        onAba={irParaAba}
        contadores={contadores}
        abasAlteradas={abasAlteradas}
        estados={estados}
        dados={
          <FichaAbaDados
            nome={nome}
            onNome={setNome}
            telefone={telefone}
            onTelefone={setTelefone}
            grau={grau}
            onGrau={setGrau}
            funilOrigem={funilOrigem}
            onFunilOrigem={setFunilOrigem}
            razaoSocial={razaoSocial}
            onRazaoSocial={setRazaoSocial}
            cnpj={cnpj}
            onCnpj={setCnpj}
            ramo={ramo}
            onRamo={setRamo}
            regime={regime}
            onRegime={setRegime}
            mascaraTelefone={mascaraTelefone}
            erros={erros}
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
            erros={erros}
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
            linkDrive={linkDrive}
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
            linkDrive={linkDrive}
            contextoObrigatorio={contextoObrigatorio}
            pending={pending}
            aoMudar={() => router.refresh()}
            erros={erros}
          />
        }
      />

      <FichaBarraSalvar
        erroSalvar={erroSalvar ?? alertaLocal}
        aviso={fraseDaBarra({ pendencias: barram, abasAlteradas })}
        pending={pending}
        salvando={salvando}
        onSalvar={salvar}
        onIrParaCampo={
          primeiraQueBarra ? () => levarAoCampo(primeiraQueBarra) : null
        }
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
    </ControleDiscDialogoContexto.Provider>
  );
}

/**
 * A frase do toast de "Salvar ficha": QUAIS campos foram gravados.
 *
 * Até 3 campos, pelo nome ("Telefone e Fase"); mais que isso, pelas folhas
 * ("8 campos em Dados básicos e Reunião preliminar"). Sem alteração nenhuma, o
 * salvar ainda grava (o botão nunca é desabilitado por "há alteração" — ver
 * `ficha-barra-salvar.tsx`), e a frase diz que nada tinha mudado em vez de
 * fingir um salvamento.
 */
function descreverAlteracoes(
  campos: readonly (keyof ClienteEtapa1)[],
  abas: readonly AbaFicha[],
): string {
  if (campos.length === 0) return "Ficha conferida: nenhum campo tinha mudado.";
  const juntar = (xs: string[]) =>
    xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} e ${xs[xs.length - 1]}`;
  if (campos.length <= 3) {
    return `Ficha salva: ${juntar(campos.map((c) => ROTULO_DO_CAMPO[c] ?? String(c)))}.`;
  }
  return `Ficha salva: ${campos.length} campos em ${juntar(abas.map((a) => ROTULO_DA_ABA[a]))}.`;
}

/**
 * Foca o campo `id` assim que ele estiver VISÍVEL — e só então.
 *
 * 🔴 A prova de visibilidade é `offsetParent`, não "existe no DOM": com
 * `keepMounted` o campo de outra folha já está no DOM, dentro de um painel
 * `hidden`, e `focus()` nele é ignorado em silêncio. A troca de aba
 * (`replaceState` → `useSearchParams`) re-renderiza num frame que não dá para
 * prever, então tenta a cada frame, por até ~1 s. Um `requestAnimationFrame`
 * só (o que havia até 28/09) dependia de a troca caber naquele frame.
 *
 * `<details>` fechado em volta do campo é aberto antes (o link legado do
 * contrato mora num): conteúdo de `details` fechado não tem caixa, e o
 * `offsetParent` nunca deixaria de ser `null`.
 *
 * `scrollIntoView({ block: "center" })`: a barra de salvar é `sticky
 * bottom-0` — o `focus()` padrão rola o mínimo e pode deixar o campo
 * EMBAIXO dela. `behavior: "instant"`: rolagem animada é movimento que
 * ninguém pediu. `focus({ preventScroll })` para não rolar de novo por cima.
 */
function focarQuandoVisivel(id: string, frames = 60) {
  const el = document.getElementById(id);
  if (el instanceof HTMLElement) {
    for (
      let d = el.parentElement?.closest("details");
      d;
      d = d.parentElement?.closest("details")
    ) {
      if (!d.open) d.open = true;
    }
    if (el.offsetParent !== null) {
      el.scrollIntoView({ block: "center", behavior: "instant" });
      el.focus({ preventScroll: true });
      return;
    }
  }
  if (frames > 0) {
    requestAnimationFrame(() => focarQuandoVisivel(id, frames - 1));
  }
}
