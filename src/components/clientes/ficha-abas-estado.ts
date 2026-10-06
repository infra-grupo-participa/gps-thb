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
import {
  achatarTrajetoria,
  type TrajetoriaCliente,
} from "@/lib/trajetoria-tipos";
import { rotuloFaseNoCaminho } from "@/lib/etapa1";
import { mascaraTelefone, moedaParaNumero, numeroParaMoeda } from "@/lib/masks";

/**
 * As folhas da pasta, **na ordem em que aparecem** — a ordem é fixa e é a do
 * funil (quem é · a conversa · o que foi apresentado · o fechamento).
 *
 * 🔑 "Trajetória" é a 1ª desde 05/10/2026 (pedido do Marcio: "a ficha é o
 * centro" — o caminho do cliente saiu de cima da ficha e virou folha). É o
 * mapa do caso inteiro, por isso abre a pasta; mas NÃO é a padrão
 * (`abaPadraoPorFase` não a devolve nunca): a pasta continua abrindo onde o
 * caso está. Ela não tem campo de formulário — grava na hora, por RPC.
 *
 * 🔴 Allowlist FECHADA de `?aba=`. Valor fora daqui não vira aba: cai no
 * padrão. Sem isso, `?aba=qualquercoisa` deixaria a pasta com as cinco
 * folhas invisíveis e nenhum conteúdo na tela — o mesmo defeito que
 * `abas-painel.tsx` já evita em `/admin`.
 */
export const ABAS_FICHA = [
  "trajetoria",
  "dados",
  "preliminar",
  "croqui",
  "fechamento",
] as const;

export type AbaFicha = (typeof ABAS_FICHA)[number];

/** Rótulo de cada aba. Mora aqui para o contador e o rótulo saírem juntos. */
export const ROTULO_DA_ABA: Record<AbaFicha, string> = {
  trajetoria: "Trajetória",
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
    case "concluido":
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
 * Contador da aba "Trajetória" — `"Execução · 6 de 11 etapas"`.
 *
 * A fase é a do SERVIDOR (`cliente.fase`, calculada pelo gatilho …353 a
 * partir das etapas); a contagem é da árvore que a page passou. Os dois
 * mudam juntos: as actions da trajetória revalidam a página. `null` = a
 * leitura falhou — o rótulo diz isso, nunca "0 de 11".
 */
export function contadorTrajetoria(
  cliente: Pick<ClienteEtapa1, "fase">,
  trajetoria: TrajetoriaCliente | null,
): string {
  if (!trajetoria) return "Não carregou";
  const todas = achatarTrajetoria(trajetoria.etapas);
  const feitas = todas.filter((e) => e.marcada).length;
  const etapas = `${feitas} de ${todas.length} ${plural(todas.length, "etapa", "etapas")}`;
  return cliente.fase ? `${rotuloFaseNoCaminho(cliente.fase)} · ${etapas}` : etapas;
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
    /** `null` = a leitura falhou. */
    trajetoria: TrajetoriaCliente | null;
  },
): string {
  switch (aba) {
    case "trajetoria":
      return contadorTrajetoria(args.cliente, args.trajetoria);
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
 * 🔴 É a fonte de `alteradoPorAba` e de `abaDoCampo` (a pendência puxa a aba). Um campo que
 * não estiver aqui some das duas coisas em silêncio: a barra diria "alterações
 * não salvas" sem nomear a folha, e a marca de alteração não apareceria em
 * aba nenhuma. **Campo novo na ficha = linha nova aqui.**
 *
 * As chaves são as de `ClienteEtapa1` — as mesmas que `salvar()` manda no
 * `PatchCliente`, para não haver tradução no meio.
 */
export const CAMPOS_POR_ABA: Record<AbaFicha, readonly (keyof ClienteEtapa1)[]> =
  {
    // 🔴 Vazio de propósito: a trajetória (caixas e "O lead entrou por:")
    // grava NA HORA, por RPC, e não passa pelo "Salvar ficha". Se um campo
    // dela entrasse aqui, a barra acusaria "alterações não salvas em
    // Trajetória" sobre algo que já está no banco.
    trajetoria: [],
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
 * não salvas nesta ficha". Com cinco folhas, "nesta ficha" não diz ONDE —
 * a pessoa altera o DISC, vai para Fechamento, lê a barra e não tem como
 * achar o que mudou sem abrir todas. A barra passa a NOMEAR a folha e a
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
 * ═══════════════════════════════════════════════════════════════════════
 * PENDÊNCIAS DA FICHA — UMA fonte para o salvar, as abas, a barra e o campo
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Pedido do Marcio (29/09/2026): a ficha é usada por pessoas idosas; *"o
 * sistema poderia guiar ele pra aba do erro, onde está o erro"*. Até aqui
 * `salvar()` tinha 4 guardas soltas que paravam no PRIMEIRO erro — quem
 * tinha CNPJ pela metade E um campo do DISC curto descobria o segundo só
 * depois de corrigir o primeiro, e as abas não diziam nada.
 *
 * Agora `pendenciasDaFicha` devolve TODAS de uma vez, e os quatro
 * consumidores leem a mesma lista:
 *
 *   · `salvar()` — recusa se houver `bloqueia`/`formato` e leva à 1ª;
 *   · `estadoDaAba` — o "N para corrigir" de cada aba;
 *   · `fraseDaBarra` — a frase da barra sticky;
 *   · `mensagensPorCampo` — a prop `erros` que desce às folhas.
 *
 * Os três níveis:
 *   · `bloqueia` — obrigatório vazio. Só NOME e TELEFONE (decisão do Marcio,
 *     29/09/2026: o resto é opcional). São eles que fazem a ficha contar
 *     para os 30.
 *   · `formato` — campo opcional preenchido de um jeito que o banco recusa
 *     (CNPJ, DISC, link do contrato, honorários). Também barra o salvar:
 *     o update é um só, e o CHECK derrubaria a ficha INTEIRA.
 *   · `sugestao` — não trava nunca. Hoje só "nenhum problema marcado" (355
 *     de 879 fichas estão assim, medido em 10/09 — travar prenderia 39
 *     ambientes).
 *
 * 🔴 **A ordem da lista é a ordem das abas**, e dentro da aba a ordem de
 * `CAMPOS_POR_ABA` (a de cima para baixo na tela). É ela que decide para
 * onde `salvar()` leva a pessoa: a primeira pendência que barra.
 *
 * 🔴 As regras de formato ESPELHAM `validarPatch` de
 * `src/app/clientes/actions.ts` e os CHECK do banco. Aqui é conveniência (a
 * pessoa vê antes de clicar); a garantia continua lá.
 */

/**
 * O `id` do controle de cada campo no DOM — é para ele que a ficha leva o
 * foco. Os valores são os ids que as folhas JÁ usam (`<Label htmlFor>`).
 *
 * 🔑 **Contrato com as folhas** (`ficha-aba-dados`, `ficha-pj`,
 * `ficha-aba-preliminar`, `disc-dialogo`, `ficha-contrato`):
 *   · o controle do campo tem `id={ID_DO_CAMPO[campo]}`;
 *   · a mensagem de erro do campo, quando houver, é um `<p>` com
 *     `id={idDoErro(campo)}` (= `<id>-erro`), e o controle leva
 *     `aria-invalid` + `aria-describedby` apontando para ele;
 *   · o texto vem da prop `erros?: Partial<Record<keyof ClienteEtapa1,
 *     string>>` — a folha NÃO escreve frase própria de erro.
 *
 * ⚠️ `problemas` NÃO está aqui, de propósito: é um grupo de checkboxes
 * (`<fieldset>`) e é só SUGESTÃO — `mensagensPorCampo` nunca preenche
 * `erros.problemas`, e o fieldset não tem id de foco. A pendência dele sai
 * com `idCampo: null`: a ficha troca para a aba e não foca nada. O aviso
 * âmbar da folha (`problemasEmFalta`) é quem mostra.
 *
 * Os quatro passos (`mensagem_padrao_enviada` etc.) não estão aqui: são
 * checkboxes sem id e nunca geram pendência.
 */
export const ID_DO_CAMPO = {
  nome: "f-nome",
  telefone: "f-tel",
  grau_relacao: "f-grau",
  razao_social: "f-razao",
  cnpj: "f-cnpj",
  ramo_atividade: "f-ramo",
  regime_tributario: "f-regime",
  data_reuniao_preliminar: "f-data",
  registro_contato: "f-reg",
  perfil_disc: "f-disc",
  disc_consciencia: "f-disc-consc",
  disc_gatilhos: "f-disc-gat",
  disc_relacionamento: "f-disc-rel",
  valor_honorarios: "f-honorarios",
  contrato_url: "f-contrato",
} as const satisfies Partial<Record<keyof ClienteEtapa1, string>>;

/**
 * A prop `erros` das folhas: campo → frase a mostrar NO campo. Ausente =
 * campo sem erro. Quem monta é `mensagensPorCampo`.
 */
export type ErrosDaFicha = Partial<Record<keyof ClienteEtapa1, string>>;

/** Campo da ficha que tem controle próprio na tela (e portanto um id). */
export type CampoDaFicha = keyof typeof ID_DO_CAMPO;

export function ehCampoDaFicha(c: string): c is CampoDaFicha {
  return Object.prototype.hasOwnProperty.call(ID_DO_CAMPO, c);
}

/** O id da mensagem de erro de um campo: `<id do controle>-erro`. */
export function idDoErro(campo: CampoDaFicha): string {
  return `${ID_DO_CAMPO[campo]}-erro`;
}

/**
 * Os campos que moram DENTRO do pop-up do DISC (`disc-dialogo.tsx`). Com o
 * pop-up fechado eles não estão no DOM — levar a pessoa até um deles exige
 * abrir o diálogo primeiro.
 */
export const CAMPOS_NO_POPUP_DISC: ReadonlySet<keyof ClienteEtapa1> = new Set<
  keyof ClienteEtapa1
>(["perfil_disc", "disc_consciencia", "disc_gatilhos", "disc_relacionamento"]);

/** A aba onde o campo mora (`CAMPOS_POR_ABA`). `null` = campo sem folha. */
export function abaDoCampo(campo: keyof ClienteEtapa1): AbaFicha | null {
  return ABAS_FICHA.find((aba) => CAMPOS_POR_ABA[aba].includes(campo)) ?? null;
}

export type NivelPendencia = "bloqueia" | "formato" | "sugestao";

export interface Pendencia {
  campo: keyof ClienteEtapa1;
  aba: AbaFicha;
  /** `ID_DO_CAMPO[campo]`, ou `null` se o campo não tem controle próprio. */
  idCampo: string | null;
  nivel: NivelPendencia;
  /** A frase que aparece NO CAMPO: o que está errado e o que fazer. */
  frase: string;
  /**
   * A versão curta, que cabe depois de "Para salvar:" na barra e no rótulo
   * da aba (sugestão). Minúscula no início de propósito.
   */
  resumo: string;
  /**
   * `"servidor"` = veio da recusa de `atualizarCliente`, não da conferência
   * local. A barra, nesse caso, mostra a FRASE do servidor (a única que diz o
   * porquê), não o resumo — ver `fraseDaBarra`.
   */
  origem?: "servidor";
}

/** O teto do `numeric(12,2)` de `valor_honorarios` — o mesmo de `validarPatch`. */
const TETO_HONORARIOS = 9_999_999_999.99;

function pendencia(
  campo: CampoDaFicha | "problemas",
  nivel: NivelPendencia,
  frase: string,
  resumo: string,
): Pendencia {
  // `abaDoCampo` nunca é `null` para estes campos (todos estão em
  // `CAMPOS_POR_ABA`); o `?? "dados"` só satisfaz o tipo. `problemas` não
  // tem controle focável (ver `ID_DO_CAMPO`): `idCampo` sai `null`.
  return {
    campo,
    aba: abaDoCampo(campo) ?? "dados",
    idCampo: ehCampoDaFicha(campo) ? ID_DO_CAMPO[campo] : null,
    nivel,
    frase,
    resumo,
  };
}

/** Posição do campo na tela: aba primeiro, depois a ordem dentro da aba. */
function ordemDoCampo(p: Pick<Pendencia, "aba" | "campo">): number {
  const i = CAMPOS_POR_ABA[p.aba].indexOf(p.campo);
  return ABAS_FICHA.indexOf(p.aba) * 100 + (i < 0 ? 99 : i);
}

/** Ordena na ordem da tela. Estável: empate mantém a ordem de chegada. */
export function ordenarPendencias(lista: readonly Pendencia[]): Pendencia[] {
  return [...lista].sort((a, b) => ordemDoCampo(a) - ordemDoCampo(b));
}

/**
 * TODAS as pendências da ficha, na ordem das abas. Função pura: recebe os
 * valores como moram nos `useState` (mascarados) e não consulta nada.
 */
export function pendenciasDaFicha(
  v: Pick<
    ValoresDaFicha,
    | "nome"
    | "telefone"
    | "cnpjDigitos"
    | "problemas"
    | "discConsciencia"
    | "discGatilhos"
    | "discRelacionamento"
    | "honorarios"
    | "contratoLimpo"
  >,
): Pendencia[] {
  const lista: Pendencia[] = [];

  // ── Dados básicos ─────────────────────────────────────────────────────
  if (!v.nome.trim()) {
    lista.push(
      pendencia("nome", "bloqueia", "Escreva o nome do cliente.", "falta o nome"),
    );
  }
  if (!v.telefone.trim()) {
    lista.push(
      pendencia(
        "telefone",
        "bloqueia",
        "Escreva o telefone. Sem ele a ficha não conta para os 30.",
        "falta o telefone",
      ),
    );
  }
  // CHECK `^[0-9]{14}$` com `null` permitido: vazio vale, 14 vale, o resto
  // derruba a ficha inteira com 23514.
  const n = v.cnpjDigitos.length;
  if (n > 0 && n !== 14) {
    if (n === 11) {
      lista.push(
        pendencia(
          "cnpj",
          "formato",
          "Isto parece um CPF. Este campo aceita só CNPJ, com 14 números. Corrija ou apague.",
          "o CNPJ parece um CPF",
        ),
      );
    } else if (n < 14) {
      const faltam = 14 - n;
      lista.push(
        pendencia(
          "cnpj",
          "formato",
          `${faltam === 1 ? "Falta 1 número" : `Faltam ${faltam} números`} no CNPJ. Complete ou apague.`,
          "o CNPJ está incompleto",
        ),
      );
    } else {
      lista.push(
        pendencia(
          "cnpj",
          "formato",
          "O CNPJ tem números a mais. Ele tem 14 números. Confira ou apague.",
          "o CNPJ tem números a mais",
        ),
      );
    }
  }

  // ── Reunião preliminar ────────────────────────────────────────────────
  if (v.problemas.length === 0) {
    lista.push(
      pendencia(
        "problemas",
        "sugestao",
        "Marque ao menos um problema. A ficha salva mesmo assim.",
        "marque um problema",
      ),
    );
  }
  // CHECK 3..2000 sobre `btrim`, `null` permitido: vazio vale (vira `null`),
  // "ok" não. O teto de 2000 já é o `maxLength` do textarea.
  const disc: [CampoDaFicha, string, string][] = [
    ["disc_consciencia", "Consciência", v.discConsciencia],
    ["disc_gatilhos", "Gatilhos", v.discGatilhos],
    ["disc_relacionamento", "Relacionamento", v.discRelacionamento],
  ];
  for (const [campo, rotulo, valor] of disc) {
    const t = valor.trim();
    if (t !== "" && t.length < 3) {
      lista.push(
        pendencia(
          campo,
          "formato",
          `Escreva ao menos 3 letras em "${rotulo}" ou apague o campo.`,
          `"${rotulo}" do DISC está curto demais`,
        ),
      );
    }
  }

  // ── Fechamento da Holding ─────────────────────────────────────────────
  const honorarios = moedaParaNumero(v.honorarios);
  if (honorarios != null && honorarios > TETO_HONORARIOS) {
    lista.push(
      pendencia(
        "valor_honorarios",
        "formato",
        "O valor dos honorários passou do limite. Confira os números.",
        "o valor dos honorários passou do limite",
      ),
    );
  }
  // Mesma regra do CHECK (migração ...090): https, sem espaço, 12..2000.
  const url = v.contratoLimpo;
  if (url !== "") {
    let frase: string | null = null;
    if (/\s/.test(url)) {
      frase = "O link do contrato não pode ter espaços. Apague os espaços.";
    } else if (!/^https:\/\//.test(url)) {
      frase = "O link do contrato precisa começar com https://";
    } else if (url.length < 12) {
      frase = "O link do contrato está incompleto. Cole o endereço inteiro.";
    } else if (url.length > 2000) {
      frase = "O link do contrato é longo demais. Cole o endereço do arquivo.";
    }
    if (frase) {
      lista.push(
        pendencia("contrato_url", "formato", frase, "o link do contrato está errado"),
      );
    }
  }

  return ordenarPendencias(lista);
}

/** As que barram o salvar (`bloqueia` + `formato`), na ordem da tela. */
export function pendenciasQueBarram(
  lista: readonly Pendencia[],
): Pendencia[] {
  return lista.filter((p) => p.nivel !== "sugestao");
}

/**
 * O nome de cada campo como a pessoa o lê na tela (o `<Label>` da folha, sem
 * o "(obrigatório)"). Serve à frase da barra quando é o SERVIDOR que recusa:
 * "o sistema recusou um campo" não diz qual — a pessoa teria de abrir as
 * cinco folhas para achar.
 */
export const ROTULO_DO_CAMPO: Partial<Record<keyof ClienteEtapa1, string>> = {
  nome: "Nome",
  telefone: "Telefone",
  grau_relacao: "Grau de relação",
  razao_social: "Razão social",
  cnpj: "CNPJ",
  ramo_atividade: "Ramo de atividade",
  regime_tributario: "Regime tributário",
  data_reuniao_preliminar: "Data da reunião preliminar",
  problemas: "Problemas",
  mensagem_padrao_enviada: "Mensagem padrão enviada",
  estudo_caso_enviado: "Estudo de caso enviado",
  ligacao_realizada: "Ligação realizada",
  aderiu_reuniao: "Aderiu à reunião",
  registro_contato: "Registro do contato",
  perfil_disc: "Perfil DISC",
  disc_consciencia: "Consciência (DISC)",
  disc_gatilhos: "Gatilhos (DISC)",
  disc_relacionamento: "Relacionamento (DISC)",
  valor_honorarios: "Honorários",
  contrato_url: "Link do contrato",
};

/**
 * Pendência vinda do SERVIDOR (`atualizarCliente` → `{ erro, campo }`).
 *
 * Entra na mesma lista, com o mesmo formato, para seguir o mesmo caminho:
 * aba, foco e mensagem no campo. `null` quando o campo não tem folha — aí
 * a frase fica só na barra.
 *
 * ⚠️ Ela vale só enquanto o campo tiver o valor que foi recusado — quem
 * descarta é a ficha, comparando `valorDoCampo` (ver `cliente-ficha.tsx`).
 */
export function pendenciaDoServidor(
  campo: keyof ClienteEtapa1,
  frase: string,
): Pendencia | null {
  const aba = abaDoCampo(campo);
  if (!aba) return null;
  const rotulo = ROTULO_DO_CAMPO[campo] ?? "um campo";
  return {
    campo,
    aba,
    idCampo: ehCampoDaFicha(campo) ? ID_DO_CAMPO[campo] : null,
    nivel: "formato",
    frase,
    resumo: `o sistema não aceitou "${rotulo}"`,
    origem: "servidor",
  };
}

/**
 * O valor ATUAL de um campo, em forma comparável (string), como mora nos
 * `useState` da ficha. `null` = campo sem valor de formulário.
 *
 * 🔴 Existe para a recusa do servidor morrer quando a pessoa mexe no campo
 * recusado. Caso diário: fase → Prospecção com a equipe acompanhando → 42501
 * → a pessoa volta a fase. Sem isto a tela seguia com "1 para corrigir" e
 * "Ir para o campo" até o próximo salvar — acusando um valor que já não
 * estava lá. A ficha guarda este valor NO MOMENTO da recusa e descarta o
 * erro assim que o atual diverge. Voltar ao MESMO valor recusado traz o erro
 * de volta — e é verdade: o banco o recusaria de novo.
 */
export function valorDoCampo(
  campo: keyof ClienteEtapa1,
  v: ValoresDaFicha,
): string | null {
  switch (campo) {
    case "nome":
      return v.nome;
    case "telefone":
      return v.telefone;
    case "grau_relacao":
      return v.grau;
    case "razao_social":
      return v.razaoSocial;
    case "cnpj":
      return v.cnpjDigitos;
    case "ramo_atividade":
      return v.ramo;
    case "regime_tributario":
      return v.regime;
    case "data_reuniao_preliminar":
      return v.dataReuniao;
    case "problemas":
      return [...v.problemas].sort().join("|");
    case "mensagem_padrao_enviada":
      return String(v.msgPadrao);
    case "estudo_caso_enviado":
      return String(v.estudoCaso);
    case "ligacao_realizada":
      return String(v.ligacao);
    case "aderiu_reuniao":
      return String(v.aderiu);
    case "registro_contato":
      return v.registro;
    case "perfil_disc":
      return v.disc;
    case "disc_consciencia":
      return v.discConsciencia;
    case "disc_gatilhos":
      return v.discGatilhos;
    case "disc_relacionamento":
      return v.discRelacionamento;
    case "valor_honorarios":
      return v.honorarios;
    case "contrato_url":
      return v.contratoLimpo;
    default:
      return null;
  }
}

/**
 * A mensagem de cada campo — o que desce às folhas pela prop `erros`.
 *
 * Só `bloqueia`/`formato`: `erros` vira `aria-invalid` na folha, e sugestão
 * não é inválida. A primeira frase por campo vence (a lista já vem na ordem).
 */
export function mensagensPorCampo(lista: readonly Pendencia[]): ErrosDaFicha {
  const saida: ErrosDaFicha = {};
  for (const p of lista) {
    if (p.nivel === "sugestao") continue;
    if (saida[p.campo] === undefined) saida[p.campo] = p.frase;
  }
  return saida;
}

/**
 * O estado que o rótulo da aba mostra, ao lado do contador.
 *
 *   · `corrigir` — "N para corrigir" (vermelho). Vence tudo.
 *   · `sugestao` — o resumo da sugestão (âmbar), ex. "Marque um problema".
 *   · `completa` — "Completa" (verde), **só na aba Dados**: nome e telefone
 *     preenchidos e nada a corrigir ali. Nas outras abas "completa" não tem
 *     critério — todo o resto é opcional —, então elas não afirmam nada.
 *   · `null` — nada a dizer.
 *
 * 🔴 Sempre TEXTO. O ícone e a cor são reforço; quem informa é a palavra.
 */
export type EstadoDaAba =
  | { tipo: "corrigir"; quantos: number; texto: string }
  | { tipo: "sugestao"; texto: string }
  | { tipo: "completa"; texto: string }
  | null;

export function estadoDaAba(
  aba: AbaFicha,
  pendencias: readonly Pendencia[],
): EstadoDaAba {
  const daAba = pendencias.filter((p) => p.aba === aba);
  const corrigir = daAba.filter((p) => p.nivel !== "sugestao").length;
  if (corrigir > 0) {
    return { tipo: "corrigir", quantos: corrigir, texto: `${corrigir} para corrigir` };
  }
  const sugestoes = daAba.filter((p) => p.nivel === "sugestao");
  if (sugestoes.length === 1) {
    const r = sugestoes[0].resumo;
    return { tipo: "sugestao", texto: r.charAt(0).toUpperCase() + r.slice(1) };
  }
  if (sugestoes.length > 1) {
    return { tipo: "sugestao", texto: `${sugestoes.length} sugestões` };
  }
  if (aba === "dados") return { tipo: "completa", texto: "Completa" };
  return null;
}

/**
 * A frase da barra de salvar — **nomeando a folha**.
 *
 * Três estados, em precedência:
 *   1. algo barra o salvar → "Para salvar: falta o telefone em Dados
 *      básicos." + quantos mais há. Se a primeira é recusa do SERVIDOR:
 *      'Não salvou: o sistema não aceitou "Fase" em Reunião preliminar.'
 *      + a frase que o servidor devolveu;
 *   2. alteração não salva → nomeia a PRIMEIRA folha alterada, na ordem das
 *      abas, e conta as outras;
 *   3. nada pendente → "Tudo salvo."
 *
 * 🔴 Só a primeira é nomeada: quatro nomes numa barra de ~32 px não cabem em
 * 390 px, e cada aba já carrega o próprio "N para corrigir". O texto diz por
 * onde começar; as abas dizem o resto.
 */
export function fraseDaBarra(args: {
  pendencias: readonly Pendencia[];
  abasAlteradas: readonly AbaFicha[];
}): string {
  const barram = pendenciasQueBarram(args.pendencias);
  const primeiraPendencia = barram[0];
  if (primeiraPendencia) {
    const mais = barram.length - 1;
    const extra =
      mais > 0 ? ` E mais ${mais} para corrigir.` : "";
    const aba = ROTULO_DA_ABA[primeiraPendencia.aba];
    // Recusa do SERVIDOR: a frase dele é a única que diz o PORQUÊ (ex.: a
    // equipe acompanha este cliente e a fase não pode voltar). Vai inteira,
    // depois do nome do campo e da folha.
    if (primeiraPendencia.origem === "servidor") {
      const f = primeiraPendencia.frase.trim();
      const ponto = /[.!?]$/.test(f) ? "" : ".";
      return `Não salvou: ${primeiraPendencia.resumo} em ${aba}. ${f}${ponto}${extra}`;
    }
    return `Para salvar: ${primeiraPendencia.resumo} em ${aba}.${extra}`;
  }
  const primeira = args.abasAlteradas[0];
  if (!primeira) return "Tudo salvo.";
  const outras = args.abasAlteradas.length - 1;
  const extra =
    outras > 0 ? ` E em mais ${outras} ${outras === 1 ? "aba" : "abas"}.` : "";
  return `Você tem alterações não salvas em ${ROTULO_DA_ABA[primeira]}.${extra}`;
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
 * mapa das cinco folhas, não um carrossel de uma.
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

  // Faixa que não rola (1366 px: as cinco abas cabem) não tem o que ajustar.
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
