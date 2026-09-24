/**
 * Estado das QUATRO ABAS da ficha do cliente — "uma pasta com folhas"
 * (pedido do Marcio, 24/09/2026): cada folha é uma aba, e a ficha deixa de ser
 * um formulário de 1.000 px de rolagem.
 *
 * 🔴 A trava que governa tudo, herdada dos blocos recolhíveis (a versão
 * descartada, `ficha-blocos-estado.ts`): **RECOLHIDO NÃO PODE SER INVISÍVEL.**
 * Aba inativa é conteúdo escondido — então TODA aba carrega no rótulo o que
 * tem dentro (`contadorDaAba`), sem exceção. Defeito que este portal já pagou
 * 4 vezes (onboarding com 77 preenchidos, aba Tutoriais, Inventário do SIC-HF,
 * aba Sessões): a informação existe, a pessoa não vê, e ninguém descobre
 * porque a suíte só olha a aba ativa.
 *
 * 🔴 O contador é TEXTO dentro de um `Badge variant="neutral"` — nunca cor
 * sozinha (WCAG 1.4.1). Quem escolhe o badge é `ficha-abas.tsx`; aqui só sai
 * string.
 *
 * Funções PURAS: sem React, sem JSX, sem import de componente, sem acesso a
 * `window`. Tudo é derivado do que a ficha JÁ tem em memória — zero consulta
 * nova. É o que permite testar a regra sem montar a tela (e é a razão de o
 * arquivo não ser `.tsx`).
 */

import type { ClienteEtapa1, FaseCliente } from "@/lib/types";
import type { ClienteMinuta } from "@/lib/minutas-tipos";
import type { ClienteCroqui } from "@/lib/croquis-tipos";
import { mascaraTelefone, numeroParaMoeda } from "@/lib/masks";

/**
 * As quatro folhas da pasta, **na ordem em que aparecem** — a ordem é fixa e
 * é a do funil (quem é · a conversa · o que foi apresentado · o fechamento).
 *
 * 🔴 Allowlist FECHADA de `?aba=`. Valor fora daqui não vira aba: cai no
 * padrão. Sem isso, `?aba=qualquercoisa` deixaria a pasta com as quatro
 * folhas invisíveis e nenhum conteúdo na tela — o mesmo defeito que
 * `abas-painel.tsx` já evita em `/admin`.
 */
export const ABAS_FICHA = [
  "dados",
  "preliminar",
  "croqui",
  "fechamento",
] as const;

export type AbaFicha = (typeof ABAS_FICHA)[number];

/** Rótulo de cada aba. Mora aqui para o contador e o rótulo saírem juntos. */
export const ROTULO_DA_ABA: Record<AbaFicha, string> = {
  dados: "Dados básicos",
  // 🔴 "Reunião preliminar", NUNCA "Sessão de viabilidade" (Marcio,
  // 24/09/2026, literal). São coisas diferentes no produto: a preliminar é a
  // conversa do parceiro com o lead; a sessão de viabilidade é com a equipe
  // jurídica e vive em `/sessoes`.
  preliminar: "Reunião preliminar",
  croqui: "Croqui",
  // 🔴 "Fechamento da Holding", literal do Marcio (24/09/2026). O rótulo é
  // maior que os outros três de propósito: a faixa de abas rola por dentro no
  // celular (medido em 390 px), então o texto inteiro cabe sem cortar a
  // primeira aba.
  fechamento: "Fechamento da Holding",
};

/** Aba padrão quando a URL não manda nada válido — nunca é `null`. */
export const ABA_FICHA_PADRAO: AbaFicha = "dados";

export function ehAbaFicha(v: string | null | undefined): v is AbaFicha {
  return (ABAS_FICHA as readonly string[]).includes(v ?? "");
}

/**
 * A folha que abre quando a URL não diz qual — **pela FASE do cliente**.
 *
 * A pasta abre onde o caso está, não sempre na primeira folha: quem já
 * contratou não quer reler o telefone, quer o contrato; quem está prospectando
 * ou fechando quer a conversa.
 *
 * 🔴 O padrão **NÃO vai para o endereço**. `/clientes/[id]` limpo continua
 * limpo (mesma regra de `abas-painel.tsx`): só a escolha EXPLÍCITA de outra
 * aba escreve `?aba=`. Escrever o padrão faria o link compartilhado congelar
 * uma fase que pode ter mudado.
 */
export function abaPadraoPorFase(fase: FaseCliente | null | undefined): AbaFicha {
  switch (fase) {
    case "contratado":
      return "fechamento";
    case "prospeccao":
    case "fechamento":
      return "preliminar";
    default:
      // Fase desconhecida (coluna nova no banco, tela velha) não pode deixar a
      // pasta sem folha aberta.
      return ABA_FICHA_PADRAO;
  }
}

/**
 * Resolve a aba ativa a partir do que veio na URL + da fase.
 *
 * Um lugar só para as duas regras (allowlist e padrão por fase), porque a
 * ficha precisa da mesma resposta em dois momentos: ao pintar e ao decidir
 * para onde puxar a pessoa quando a validação falha.
 */
export function resolverAba(
  bruto: string | null | undefined,
  fase: FaseCliente | null | undefined,
): AbaFicha {
  return ehAbaFicha(bruto) ? bruto : abaPadraoPorFase(fase);
}

/** Singular/plural: "1 problema" / "3 problemas", "1 versão" / "3 versões". */
function plural(n: number, singular: string, pluralForma: string): string {
  return n === 1 ? singular : pluralForma;
}

/**
 * Contador da aba 1 — **"PJ" quando há razão social**, senão vazio.
 *
 * 🔑 Devolve `""`, não `"—"`: a aba "Dados básicos" sempre tem nome e
 * telefone dentro, então um contador de "quantos campos" não diria nada. O
 * único fato que o rótulo precisa carregar é que existe uma PESSOA JURÍDICA
 * ali dentro — é o que muda a conversa e é o que estava escondido.
 *
 * O critério é `razao_social`, e não `cnpj`: é o campo que define "isto é uma
 * empresa" (o CNPJ pode faltar na prospecção).
 */
export function contadorDados(
  cliente: Pick<ClienteEtapa1, "razao_social">,
): string {
  return cliente.razao_social?.trim() ? "PJ" : "";
}

/**
 * Contador da aba 2 — `"3 problemas · 2 de 4 passos"`.
 *
 * Os dois números que definem se a preliminar pode acontecer: o problema é o
 * que qualifica o cliente (tarefa 1.1 da Etapa 01) e os 4 marcos são o
 * andamento do contato. `0` CONTA e aparece — `problemas: []` é estado real
 * ("ninguém marcou"), não ausência de dado, e é exatamente o caso que precisa
 * ser visto de fora da aba.
 */
export function contadorPreliminar(
  cliente: Pick<
    ClienteEtapa1,
    | "problemas"
    | "mensagem_padrao_enviada"
    | "estudo_caso_enviado"
    | "ligacao_realizada"
    | "aderiu_reuniao"
  >,
): string {
  const nProblemas = (cliente.problemas ?? []).length;
  const passos = [
    cliente.mensagem_padrao_enviada,
    cliente.estudo_caso_enviado,
    cliente.ligacao_realizada,
    cliente.aderiu_reuniao,
  ];
  const feitos = passos.filter(Boolean).length;
  return `${nProblemas} ${plural(nProblemas, "problema", "problemas")} · ${feitos} de ${passos.length} passos`;
}

/**
 * Contador da aba 3 — `"3 versões"` · vazio: `"Nenhum croqui"`.
 *
 * ⚠️ A lista chega por prop do SERVIDOR (`croquis`), e as duas `page.tsx` já
 * a passam: `src/app/clientes/[clienteId]/page.tsx` e
 * `src/app/admin/aluno/[alunoId]/clientes/[clienteId]/page.tsx` chamam
 * `getCroquisDoCliente` e repassam o resultado — a prop é obrigatória em
 * `ClienteFicha`, então montar a ficha sem ela não compila.
 * A limitação que RESTA é a de `getCroquisDoCliente`: ela transforma erro de
 * leitura em lista vazia, e aí o rótulo diz "Nenhum croqui" sendo verdade só
 * sobre o que a tela recebeu, não sobre o banco.
 */
export function contadorCroqui(croquis: readonly ClienteCroqui[]): string {
  const n = croquis.length;
  if (n === 0) return "Nenhum croqui";
  return `${n} ${plural(n, "versão", "versões")}`;
}

/**
 * Contador da aba 4 — `"Contrato · 3 minutas"`.
 *
 * A primeira parte é o ANEXO (`contrato_path`), não o link legado
 * `contrato_url` nem os honorários: o que fecha a holding é o arquivo
 * assinado. Sem anexo: `"Sem contrato"`.
 */
export function contadorFechamento(
  cliente: Pick<ClienteEtapa1, "contrato_path">,
  minutas: readonly ClienteMinuta[],
): string {
  const contrato = cliente.contrato_path ? "Contrato" : "Sem contrato";
  const n = minutas.length;
  const min =
    n === 0 ? "nenhuma minuta" : `${n} ${plural(n, "minuta", "minutas")}`;
  return `${contrato} · ${min}`;
}

/**
 * O contador de UMA aba — despacha para a função certa.
 *
 * Existe para `ficha-abas.tsx` ter UMA chamada por aba, sem precisar saber
 * qual das quatro funções usar (mesmo papel de `resumoDoBloco` na versão em
 * blocos).
 *
 * Devolve `""` só para "Dados básicos" sem PJ — e é o ÚNICO caso em que uma
 * aba fica sem badge. Toda outra aba devolve texto, sempre.
 */
export function contadorDaAba(
  aba: AbaFicha,
  args: {
    cliente: ClienteEtapa1;
    minutas: readonly ClienteMinuta[];
    croquis: readonly ClienteCroqui[];
  },
): string {
  switch (aba) {
    case "dados":
      return contadorDados(args.cliente);
    case "preliminar":
      return contadorPreliminar(args.cliente);
    case "croqui":
      return contadorCroqui(args.croquis);
    case "fechamento":
      return contadorFechamento(args.cliente, args.minutas);
  }
}

/**
 * Quais campos pertencem a qual folha.
 *
 * 🔴 É a fonte de `alteradoPorAba` e de "pendência puxa a aba". Um campo que
 * não estiver aqui some das duas coisas em silêncio: a barra diria "alterações
 * não salvas" sem nomear a folha, e a marca de alteração não apareceria em
 * aba nenhuma. **Campo novo na ficha = linha nova aqui.**
 *
 * As chaves são as de `ClienteEtapa1` — as mesmas que `salvar()` manda no
 * `PatchCliente`, para não haver tradução no meio.
 */
export const CAMPOS_POR_ABA: Record<AbaFicha, readonly (keyof ClienteEtapa1)[]> =
  {
    dados: [
      "nome",
      "telefone",
      "grau_relacao",
      "razao_social",
      "cnpj",
      "ramo_atividade",
      "regime_tributario",
    ],
    preliminar: [
      "fase",
      "data_reuniao_preliminar",
      "problemas",
      "mensagem_padrao_enviada",
      "estudo_caso_enviado",
      "ligacao_realizada",
      "aderiu_reuniao",
      "registro_contato",
      "perfil_disc",
      "disc_consciencia",
      "disc_gatilhos",
      "disc_relacionamento",
    ],
    // O croqui não tem campo de formulário: a escrita é por RPC
    // (`croqui-actions.ts`), como o anexo do contrato. A aba nunca fica
    // "alterada" — e não é esquecimento.
    croqui: [],
    fechamento: ["valor_honorarios", "contrato_url"],
  };

/**
 * Os valores do formulário da ficha, como eles vivem nos `useState` do
 * `ClienteFicha` — mascarados e como string, que é a forma que o usuário vê.
 *
 * ⚠️ **`cnpj` e `telefone` chegam MASCARADOS**; a normalização para o formato
 * do banco acontece dentro de `camposAlteradosDaFicha`, na mesma linha em que
 * a comparação é feita. Normalizar fora traria de volta o defeito que esta
 * função existe para impedir: duas normalizações diferentes para o mesmo
 * campo, e a barra mentindo.
 */
export interface ValoresDaFicha {
  nome: string;
  /** Mascarado: `(11) 98888-7777`. */
  telefone: string;
  grau: string;
  razaoSocial: string;
  /** Mascarado: `00.000.000/0000-00`. */
  cnpj: string;
  ramo: string;
  regime: string;
  problemas: readonly string[];
  fase: FaseCliente;
  dataReuniao: string;
  disc: string;
  discConsciencia: string;
  discGatilhos: string;
  discRelacionamento: string;
  aderiu: boolean;
  msgPadrao: boolean;
  estudoCaso: boolean;
  ligacao: boolean;
  registro: string;
  /** Mascarado: `R$ 1.234,56`. */
  honorarios: string;
  /** Já com `trim` — é o que vai ao banco. */
  contratoLimpo: string;
  /** `soDigitos(cnpj)` — o CNPJ como o banco o guarda. */
  cnpjDigitos: string;
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * QUAIS CAMPOS DIVERGEM DO SERVIDOR — a fonte da barra E da marca da aba
 * ═══════════════════════════════════════════════════════════════════════
 *
 * A comparação é contra o `cliente` que veio do SERVIDOR — a mesma origem dos
 * `useState` iniciais —, campo a campo e na MESMA normalização que `salvar()`
 * envia (`trim`, `|| null`, máscara de telefone, dígitos do CNPJ). Se
 * divergir, a barra mente nos dois sentidos: acusa pendência em quem só
 * encostou num campo e apagou de novo, ou cala sobre alteração real.
 *
 * 🔴 Devolve uma LISTA de chaves, não um `boolean`: é dela que
 * `alteradoPorAba` tira qual folha a barra nomeia. **Campo novo aqui exige
 * linha nova em `CAMPOS_POR_ABA`** — senão a alteração existe, a barra diz
 * que há algo pendente e nenhuma folha se acusa.
 *
 * Função pura, fora do componente, exatamente para poder ser conferida sem
 * montar a tela — 22 comparações de normalização é o tipo de código que erra
 * em silêncio.
 */
export function camposAlteradosDaFicha(
  v: ValoresDaFicha,
  cliente: ClienteEtapa1,
): (keyof ClienteEtapa1)[] {
  const campos: (keyof ClienteEtapa1)[] = [];

  if (v.nome.trim() !== (cliente.nome ?? "").trim()) campos.push("nome");
  if (
    (v.telefone.trim() || null) !==
    (cliente.telefone ? mascaraTelefone(cliente.telefone) : null)
  )
    campos.push("telefone");
  if ((v.grau || null) !== (cliente.grau_relacao ?? null))
    campos.push("grau_relacao");
  if ((v.razaoSocial.trim() || null) !== (cliente.razao_social ?? null))
    campos.push("razao_social");
  // Dígitos contra dígitos: o estado é mascarado, o banco não.
  if ((v.cnpjDigitos || null) !== (cliente.cnpj ?? null)) campos.push("cnpj");
  if ((v.ramo.trim() || null) !== (cliente.ramo_atividade ?? null))
    campos.push("ramo_atividade");
  if ((v.regime || null) !== (cliente.regime_tributario ?? null))
    campos.push("regime_tributario");
  if (
    v.problemas.length !== (cliente.problemas ?? []).length ||
    v.problemas.some((p) => !(cliente.problemas ?? []).includes(p))
  )
    campos.push("problemas");
  if (v.fase !== (cliente.fase ?? "prospeccao")) campos.push("fase");
  if ((v.dataReuniao || null) !== (cliente.data_reuniao_preliminar ?? null))
    campos.push("data_reuniao_preliminar");
  if ((v.disc || null) !== (cliente.perfil_disc ?? null))
    campos.push("perfil_disc");
  // 🔴 `trim` + `|| null`, a MESMA normalização de `salvar()` — o CHECK do
  // banco é 3..2000 sobre `btrim` com `null` permitido, e `""` violaria.
  if ((v.discConsciencia.trim() || null) !== (cliente.disc_consciencia ?? null))
    campos.push("disc_consciencia");
  if ((v.discGatilhos.trim() || null) !== (cliente.disc_gatilhos ?? null))
    campos.push("disc_gatilhos");
  if (
    (v.discRelacionamento.trim() || null) !==
    (cliente.disc_relacionamento ?? null)
  )
    campos.push("disc_relacionamento");
  if (v.aderiu !== cliente.aderiu_reuniao) campos.push("aderiu_reuniao");
  if (v.msgPadrao !== cliente.mensagem_padrao_enviada)
    campos.push("mensagem_padrao_enviada");
  if (v.estudoCaso !== cliente.estudo_caso_enviado)
    campos.push("estudo_caso_enviado");
  if (v.ligacao !== cliente.ligacao_realizada) campos.push("ligacao_realizada");
  if ((v.registro.trim() || null) !== (cliente.registro_contato ?? null))
    campos.push("registro_contato");
  if (v.honorarios !== numeroParaMoeda(cliente.valor_honorarios))
    campos.push("valor_honorarios");
  if ((v.contratoLimpo || null) !== (cliente.contrato_url ?? null))
    campos.push("contrato_url");

  return campos;
}

/**
 * Em QUE aba está cada alteração não salva.
 *
 * Recebe o conjunto de campos que divergem do servidor (quem compara é a
 * ficha, que tem os `useState`) e devolve as abas correspondentes, **na ordem
 * de `ABAS_FICHA`** — a barra nomeia a primeira, e a ordem tem de ser estável
 * senão a frase muda de folha a cada render.
 *
 * 🔴 Por que isto existe: até 24/09 a barra sticky dizia "Você tem alterações
 * não salvas nesta ficha". Com quatro folhas, "nesta ficha" não diz ONDE —
 * a pessoa altera o DISC, vai para Fechamento, lê a barra e não tem como
 * achar o que mudou sem abrir as quatro. A barra passa a NOMEAR a folha e a
 * folha ganha marca própria.
 */
export function alteradoPorAba(
  camposAlterados: readonly (keyof ClienteEtapa1)[],
): AbaFicha[] {
  const set = new Set<string>(camposAlterados as readonly string[]);
  return ABAS_FICHA.filter((aba) =>
    CAMPOS_POR_ABA[aba].some((c) => set.has(c as string)),
  );
}

/**
 * O aviso da barra de salvar — **nomeando a folha**.
 *
 * Três estados, em precedência:
 *   1. pendência que bloqueia (nome/telefone) → diz o que falta E onde;
 *   2. alteração não salva → nomeia a PRIMEIRA folha alterada na ordem das
 *      abas, e conta quantas outras há;
 *   3. nada pendente → "Tudo salvo."
 *
 * 🔴 Por que só a primeira é nomeada: listar quatro nomes numa barra de ~32 px
 * não cabe em 390 px, e cada aba alterada já carrega a própria marca na
 * régua — o texto diz por onde começar, a régua diz o resto.
 */
export function frasePendenciaDaFicha(args: {
  abaPendente: AbaFicha | null;
  abasAlteradas: readonly AbaFicha[];
}): string {
  if (args.abaPendente) {
    return `Preencha o nome e o telefone em ${ROTULO_DA_ABA[args.abaPendente]} para salvar — são eles que fazem a ficha contar para os 30.`;
  }
  const primeira = args.abasAlteradas[0];
  if (!primeira) return "Tudo salvo.";
  const outras = args.abasAlteradas.length - 1;
  const extra =
    outras > 0 ? ` E em mais ${outras} ${outras === 1 ? "aba" : "abas"}.` : "";
  return `Você tem alterações não salvas em ${ROTULO_DA_ABA[primeira]}.${extra}`;
}

/**
 * A aba onde mora a pendência que BLOQUEIA o salvar.
 *
 * Hoje é uma só: `faltaEssencial` (nome ou telefone vazio) é da aba 1 e
 * bloqueia a ficha INTEIRA. Fica como função — e não como constante — porque
 * a regra é "qual folha o usuário precisa abrir", e a resposta passa a
 * depender de mais de um sinal assim que a segunda trava existir.
 *
 * `null` = nada bloqueando; não mexe na aba ativa.
 */
export function abaDaPendencia(args: {
  /** Nome ou telefone vazio — a trava do botão "Salvar ficha". */
  faltaEssencial: boolean;
}): AbaFicha | null {
  return args.faltaEssencial ? "dados" : null;
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * O `scrollLeft` que põe a ABA ATIVA inteira dentro da faixa
 * ═══════════════════════════════════════════════════════════════════════
 *
 * A régua das abas rola por dentro no celular (medido em 390 px:
 * `scrollWidth = 622` contra `clientWidth = 366`) e nasce em `scrollLeft = 0`.
 * A aba ativa NÃO é necessariamente a primeira — `abaPadraoPorFase` abre em
 * "Fechamento da Holding" para quem já contratou, e `?aba=` chega de fora.
 * Sem esta conta, a pessoa via três rótulos e **nenhum marcado**: a régua
 * laranja existia, fora do campo de visão.
 *
 * Entrada em pixels, tudo relativo ao CONTEÚDO da faixa (não ao viewport):
 * `inicio`/`fim` são as bordas do trigger ativo medidas a partir do começo do
 * conteúdo rolável. Quem converte de `getBoundingClientRect` é o componente —
 * aqui não há DOM, e é isso que torna a regra conferível sem montar a tela.
 *
 * Devolve `null` quando **nada precisa mudar**: o alvo já está inteiro na
 * janela visível. É o caso da aba 1, que é o comum — e a diferença entre
 * "não mexer" e "escrever o mesmo valor" importa, porque escrever
 * `scrollLeft` num container é um efeito colateral observável (dispara
 * `scroll`) e não se paga sem necessidade.
 *
 * 🔴 **Alinha pela borda mais próxima, nunca centraliza.** Centralizar moveria
 * a faixa mesmo com a aba já visível e esconderia as vizinhas — a régua é um
 * mapa das quatro folhas, não um carrossel de uma.
 *
 * 🔴 **O resultado é grampeado em `[0, scrollWidth - clientWidth]`.** Sem
 * isso, aba mais larga que a janela (rótulo "Fechamento da Holding" em
 * viewport muito estreito) pediria um `scrollLeft` maior que o máximo; o
 * navegador grampearia sozinho, mas o valor devolvido mentiria para quem o
 * confere em teste. Quando o alvo é mais largo que a janela, o `Math.min`
 * abaixo faz vencer o alinhamento pela ESQUERDA — começo do rótulo visível
 * vale mais que o fim dele.
 */
export function rolarAbaAtivaParaDentro(args: {
  /** Borda esquerda do trigger ativo, a partir do início do conteúdo. */
  inicio: number;
  /** Borda direita do trigger ativo, a partir do início do conteúdo. */
  fim: number;
  /** `scrollLeft` atual da faixa. */
  scrollLeft: number;
  /** Largura VISÍVEL da faixa. */
  clientWidth: number;
  /** Largura TOTAL do conteúdo da faixa. */
  scrollWidth: number;
}): number | null {
  const { inicio, fim, scrollLeft, clientWidth, scrollWidth } = args;

  // Faixa que não rola (1366 px: as quatro abas cabem) não tem o que ajustar.
  const maximo = Math.max(0, scrollWidth - clientWidth);
  if (maximo === 0) return null;

  const visivelInicio = scrollLeft;
  const visivelFim = scrollLeft + clientWidth;

  let destino: number;
  if (inicio < visivelInicio) {
    // Cortado à esquerda: encosta o começo do rótulo na borda esquerda.
    destino = inicio;
  } else if (fim > visivelFim) {
    // Cortado à direita: encosta o fim do rótulo na borda direita — e, se o
    // rótulo for mais largo que a janela, o `min` devolve `inicio` (a
    // esquerda vence).
    destino = Math.min(inicio, fim - clientWidth);
  } else {
    return null;
  }

  const grampeado = Math.max(0, Math.min(maximo, destino));
  // Arredondar para inteiro: `scrollLeft` fracionário em Chromium volta
  // arredondado na leitura, e o teste que compara ida com volta veria
  // diferença de sub-pixel sem nenhum defeito por trás.
  const final = Math.round(grampeado);
  return final === Math.round(scrollLeft) ? null : final;
}
