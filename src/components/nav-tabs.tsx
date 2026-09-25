"use client";

import { Fragment } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Users,
  UsersRound,
  BookOpen,
  CalendarDays,
  FolderOpen,
  UserRound,
  NotebookPen,
  Wallet,
  LifeBuoy,
  Stethoscope,
  GraduationCap,
  type LucideIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useUrlDoPainel } from "@/components/admin/voltar-ao-painel";
// 🔑 A allowlist de `?aba=` e o padrão NÃO são recopiados aqui: `SubNavTabs`
// virou o ESCRITOR de `aba` (o `trocar()` de `abas-painel.tsx` foi apagado no
// mesmo dia), e duas cópias da lista divergiriam no dia em que uma aba nova
// entrasse. `ABA_PADRAO` é `"visao"` — e é por isso que o ESCRITOR apaga a
// chave quando o valor é o padrão: `/admin` limpo tem de continuar `/admin`
// (e-2-e `admin-visao-geral` teste 1 e `LINK_LISTA`).
//
// ⚠️ O DESTINO do link não é normalizado aqui. A sub-aba "Visão geral" declara
// `{ href: "/admin", exact: true, abaDoPainel: "visao" }` em `nav.ts` — o
// padrão sai do DESTINO DECLARADO, não de um `if` neste arquivo. Houve uma
// normalização local aqui (24/09, 1ª rodada) e ela era uma SEGUNDA fonte de
// verdade sobre o mesmo endereço: `nav.ts` dizia `/admin?aba=visao` e este
// arquivo reescrevia para `/admin`. Reprovada na revisão; não reintroduzir.
import {
  ABAS,
  ABA_PADRAO,
} from "@/components/admin/alunos-ativos-lista/estado-na-url";

export interface NavItem {
  href: string;
  label: string;
  /** chave do ícone (string, serializável entre server e client). */
  icon?:
    | "inicio"
    | "clientes"
    | "materiais"
    | "pasta"
    | "perfil"
    | "alunos"
    | "diario"
    | "financeiro"
    | "suporte"
    | "resolver"
    | "equipe"
    // 🔴 Exceção deliberada nº 2 à regra "não inventar chave nova de ícone"
    // (23/09/2026, pedido do Marcio: *"a aba da sessão tem que estar um pouco
    // mais visual e mais intuitiva"*). `BookOpen` (a chave "materiais") está
    // em uso em Materiais, Plantão e Vídeos — três abas com ícone de livro.
    // Com ele, "Sessões" não se distinguia de nenhuma delas de relance, que é
    // justamente como um ícone de aba é lido. `CalendarDays` diz o assunto
    // (marcar hora com a equipe jurídica) sem precisar do rótulo.
    //
    // ⚠️ A regra de não inventar chave continua valendo para o resto: ela
    // existe para o vocabulário de ícones não virar um por tela. O que a
    // suspende aqui é um pedido explícito, não conveniência.
    | "sessoes"
    // 🔴 Exceção deliberada à regra "não inventar chave nova de ícone"
    // (repetida 3× neste arquivo): esta é a aba FIXA à direita do header
    // (`app-header.tsx`), fora do trilho que rola — ela precisa de
    // distinção visual do resto das abas, e `BookOpen` (a chave "materiais")
    // já está em uso em Materiais, Plantão e Vídeos. Reaproveitar aqui faria
    // a aba fixa se camuflar entre as que rolam.
    | "tutoriais";
  /** casa exatamente (para o "Início"). */
  exact?: boolean;
  /** Item exclusivo do admin — some na pré-visualização. */
  adminOnly?: boolean;
  /**
   * A aba aparece, mas NÃO é link: vira um rótulo apagado com "em breve".
   *
   * 🔑 Existe para o que ainda não está pronto ficar VISÍVEL como promessa,
   * em vez de sumir. Esconder a aba faria o aluno não saber que aquilo vai
   * existir; deixá-la clicável o levaria a uma tela incompleta.
   */
  emBreve?: boolean;
  /**
   * Contador ao lado do rótulo (ex.: chamados esperando a equipe). `undefined`
   * = a página não sabe o número; 0 = sabe e é zero, e aí a pílula NÃO aparece
   * (badge com "0" é ruído: alerta é fila, não informação).
   *
   * 🔑 Quem passa é a página, e só quando já tem o número em mãos — nunca
   * vale uma consulta a mais só para pintar a aba.
   */
  badge?: number;
  /**
   * Só a aba "Parceiros" do painel do admin. O clique leva à **última URL do
   * painel** (aba, busca, ordem, filtros, lote) em vez de `/admin` pelado —
   * ver `components/admin/painel-url.ts`.
   *
   * `href` continua sendo `/admin`: é ele que decide qual aba está ATIVA
   * (`pathname` não conhece a consulta) e é ele que aparece antes da
   * montagem, quando o `sessionStorage` ainda não foi lido.
   */
  restauraPainel?: boolean;
  /**
   * Sub-abas do item (2º nível da navegação, 24/09/2026). O item com `filhos`
   * é um GRUPO: continua tendo `href` (a rota do clique) e fica ATIVO quando
   * o `pathname` casa o próprio `href` ou qualquer filho. `NavTabs` renderiza
   * só o 1º nível; a 3ª linha do header (`SubNavTabs`) renderiza os filhos do
   * grupo ativo. Ver `src/lib/nav.ts` para o mapa.
   */
  filhos?: NavItem[];
  /**
   * Só nas sub-abas do grupo "Alunos" do admin: qual valor de `?aba=` esta
   * sub-aba representa. Em `/admin` a troca é `history.replaceState` (o
   * conteúdo já está na página — nota de 23/09: `router.replace` re-executa
   * o Server Component inteiro); fora de `/admin` vira `<Link>`.
   */
  abaDoPainel?: "visao" | "ativos" | "solicitacoes" | "etapas";
  /**
   * O item existe (a flag que o autoriza continua em `nav.ts`), mas mora no
   * menu "Sua conta", não no trilho. `NavTabs` NÃO o renderiza; `app-header`
   * o filtra do array e entrega ao `MenuDeContas`. Hoje: "Equipe" do aluno.
   */
  noMenuDeContas?: boolean;
  /**
   * O clique abre o destino em NOVA aba do navegador. Hoje: só a "Pasta" do
   * aluno, cujo `href` é `/pasta/abrir` — um redirect para o Drive (25/09/2026,
   * pedido do João). O GPS fica aberto na aba de origem.
   *
   * ⚠️ Só `NavTabLink` honra a flag. `SubNavTabs` e o `MenuDeContas` usam
   * `<Link>` cru: um item `novaAba` que ganhe `filhos` ou `noMenuDeContas`
   * perde o `target` em silêncio.
   */
  novaAba?: boolean;
  /**
   * Rota que também acende a aba, além do `href`. Existe para a "Pasta" do
   * aluno: o `href` é `/pasta/abrir` (redirect), mas a tela onde o aluno
   * PARA quando não tem link é `/pasta`.
   */
  ativoEm?: string;
}

const ICONES: Record<NonNullable<NavItem["icon"]>, LucideIcon> = {
  inicio: Home,
  clientes: Users,
  materiais: BookOpen,
  sessoes: CalendarDays,
  pasta: FolderOpen,
  perfil: UserRound,
  alunos: Users,
  diario: NotebookPen,
  financeiro: Wallet,
  suporte: LifeBuoy,
  resolver: Stethoscope,
  equipe: UsersRound,
  tutoriais: GraduationCap,
};

/**
 * O item casa o `pathname` por si só — a regra de sempre (`exact` = igualdade,
 * senão prefixo de segmento). Separada para `grupoAtivo` reusá-la em cada
 * filho sem duplicar a comparação.
 *
 * 🔑 `pathname.startsWith(item.href + "/")`, e não `startsWith(item.href)`:
 * sem a barra, `/admin` casaria `/administrativo`.
 */
function casaSozinho(item: NavItem, pathname: string): boolean {
  if (item.ativoEm && pathname === item.ativoEm) return true;
  return item.exact
    ? pathname === item.href
    : pathname === item.href || pathname.startsWith(item.href + "/");
}

/**
 * O item de 1º nível está ATIVO? Pura, sem React — dá para testar sem montar
 * nada e é a MESMA função que `NavTabs` (régua de 2 px) e `TrilhoDeNavegacao`
 * (quem manda a 3ª linha existir) usam. Duas leituras diferentes de "ativo"
 * pintariam a régua num grupo e abririam as sub-abas de outro.
 *
 * Um GRUPO (`filhos`) tem `href` próprio e fica ativo quando o `pathname` casa
 * ele OU qualquer filho, cada um pela sua regra `exact`. É isso que mantém o
 * grupo "Alunos" marcado em `/admin/clientes` (filho) e em `/admin` (o próprio
 * href).
 *
 * ⚠️ Filho com `abaDoPainel` casa por `pathname` também — o `href` dele é
 * `/admin?aba=x`, cuja parte de caminho é `/admin`, o mesmo do grupo. A
 * consulta não entra aqui de propósito: `usePathname()` não a conhece, e QUAL
 * sub-aba está ativa é decisão de `SubNavTabs`, não do trilho de cima.
 */
export function grupoAtivo(item: NavItem, pathname: string): boolean {
  if (casaSozinho(item, pathname)) return true;
  return (item.filhos ?? []).some((f) => casaSozinho(f, pathname));
}

/**
 * Um item da navegação — link normal, "em breve" ou (via `restauraPainel`)
 * destino dinâmico. Extraído do corpo do `.map` para virar a MESMA função
 * usada pelo trilho que rola e pela aba FIXA (`app-header.tsx`): o item fixo
 * não é um `NavItem` diferente, é o item de sempre renderizado fora do
 * scroller. Refatoração pura — o markup de cada ramo não mudou.
 */
function NavTabLink({
  item,
  pathname,
  urlDoPainel,
}: {
  item: NavItem;
  pathname: string;
  urlDoPainel: string | undefined;
}) {
  // 🔴 `grupoAtivo`, não a comparação solta que estava aqui: um GRUPO fica
  // ativo também pelos filhos. Para item sem `filhos` o resultado é idêntico
  // ao de antes (a função cai no `casaSozinho` e o `.some` roda sobre `[]`).
  const ativo = grupoAtivo(item, pathname);
  const Icon = item.icon ? ICONES[item.icon] : null;
  // `ativo` sai do `href` declarado; o destino pode ser mais específico.
  const destino = item.restauraPainel ? urlDoPainel : item.href;
  const temFilhos = (item.filhos?.length ?? 0) > 0;
  // 🔴 Grupo ATIVO não leva `aria-current="page"`: a "página" é a sub-aba da
  // 3ª linha, e dois `aria-current="page"` na mesma tela desfazem o propósito
  // do atributo (o leitor de tela anuncia duas "páginas atuais"). Item sem
  // filhos continua com `page`, como sempre foi.
  const marcaPagina = ativo && !temFilhos;
  // 🔴 Badge do grupo ativo é SUPRIMIDO: o mesmo número reaparece na sub-aba
  // logo abaixo ("Atendimento 3" em cima de "Chamados 3" é o mesmo alerta
  // contado duas vezes, e o de cima não diz onde clicar). Fechado o grupo,
  // ele volta — é o único aviso que sobra de que há fila lá dentro.
  const mostraBadge = !!item.badge && item.badge > 0 && !(ativo && temFilhos);

  if (item.emBreve) {
    return (
      <span
        aria-disabled="true"
        className={cn(
          "-mb-px inline-flex shrink-0 cursor-default items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-sm whitespace-nowrap text-muted-foreground/70",
          item.adminOnly && "previa-oculta",
        )}
      >
        {Icon ? <Icon className="size-4" aria-hidden /> : null}
        {item.label}
        <Badge
          variant="neutral"
          icone={false}
          className="h-5 px-1.5 text-[10px] font-normal"
        >
          em breve
        </Badge>
      </span>
    );
  }

  return (
    <Link
      href={destino ?? item.href}
      aria-current={marcaPagina ? "page" : undefined}
      // Sem prefetch: as abas ficam visíveis em toda tela e o Next
      // pré-buscava todas de uma vez. Como as rotas são dinâmicas, cada
      // pré-busca roda o proxy (getUser) e renderiza a página inteira —
      // a home sozinha dispara ~10 queries. Medido nos logs do Supabase.
      // Nada muda para o usuário: a rota carrega ao clicar.
      prefetch={false}
      target={item.novaAba ? "_blank" : undefined}
      rel={item.novaAba ? "noopener noreferrer" : undefined}
      className={cn(
        // RÉGUA de 2 px, não pílula. A pílula `bg-accent` passava no
        // contraste mas a aba ativa e a inativa tinham quase o mesmo
        // peso visual a 1366 px — não dava para dizer onde se está.
        // A régua é inequívoca e some da área do texto.
        "foco-visivel -mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm whitespace-nowrap transition-colors",
        ativo
          ? "border-primary font-semibold text-foreground [&>svg]:text-accent-foreground"
          : "border-transparent font-medium text-muted-foreground hover:border-borda-forte hover:text-foreground",
        item.adminOnly && "previa-oculta",
      )}
    >
      {Icon ? <Icon className="size-4" aria-hidden /> : null}
      {item.label}
      {item.novaAba ? <span className="sr-only"> (abre em nova aba)</span> : null}
      {mostraBadge ? (
        <Badge
          variant="danger"
          icone={false}
          className="h-5 px-1.5 text-[10px]"
        >
          {item.badge}
        </Badge>
      ) : null}
    </Link>
  );
}

/**
 * `items` é o que ROLA; `fixo` é o que NÃO rola (a aba fixa à direita do
 * header, ver `app-header.tsx`). Propositalmente duas props, não um item a
 * mais no array: `fixo` é renderizado por um `NavTabs` DIFERENTE (com
 * `items={[]}`), fora do contêiner `overflow-x-auto` — é isso que resolve o
 * defeito de `ml-auto` não ter folga para empurrar nada dentro de um
 * scroller `w-max`. Se `fixo` fosse só "o último item do array", toda função
 * de `nav.ts` teria de saber "o último é especial", e um item novo entraria
 * depois dele por acidente.
 */
export function NavTabs({
  items,
  fixo,
  pathname,
  urlDoPainel,
}: {
  items: NavItem[];
  fixo?: NavItem;
  /**
   * 🔴 `pathname` e `urlDoPainel` chegam por PROP, não de `usePathname()` /
   * `useUrlDoPainel()` aqui dentro. O header monta até TRÊS `NavTabs` na
   * mesma tela (trilho, aba fixa) mais `SubNavTabs`; com os hooks na folha,
   * cada um assinava o router por conta própria e `useUrlDoPainel` lia o
   * `sessionStorage` uma vez por instância. Identidade de rota se resolve UMA
   * vez, o mais alto possível (`TrilhoDeNavegacao`), e desce — a mesma regra
   * que já custou um `SELECT` por troca de aba no SIC-HF (nota de 17/09).
   */
  pathname: string;
  urlDoPainel: string | undefined;
}) {
  if (fixo) {
    // O `NavTabs` do bloco fixo (`items={[]}`) só renderiza o item fixo — sem
    // isto, o link apareceria DUAS VEZES no DOM (uma no trilho que rola, uma
    // no bloco fixo), dobrando-o na ordem de tabulação. É exatamente o
    // defeito A11Y4 que a remoção do `hidden md:block`/`md:hidden` já corrigiu
    // uma vez (comentário em `app-header.tsx`) — não reintroduzir por outra via.
    // 🔴 `aria-label` obrigatório: são TRÊS `<nav>` irmãos na mesma tela
    // (trilho, aba fixa, sub-abas). Sem rótulo, o leitor de tela anuncia
    // "navegação" três vezes e a lista de regiões não distingue nenhuma —
    // pular para o trilho vira tentativa e erro. O rótulo do fixo sai do
    // PRÓPRIO item (hoje "Tutoriais"): se a aba fixa mudar de assunto, o
    // rótulo acompanha sem ninguém lembrar de atualizar um literal.
    return (
      <nav aria-label={fixo.label} className="flex items-stretch gap-0.5">
        <NavTabLink item={fixo} pathname={pathname} urlDoPainel={urlDoPainel} />
      </nav>
    );
  }

  // 🔴 `noMenuDeContas` não vai ao trilho. O item continua no array (é
  // `nav.ts` quem decide se ele EXISTE, conforme a flag do usuário); quem
  // decide ONDE ele aparece é esta linha. `app-header.tsx` filtra o mesmo
  // predicado ao contrário e entrega ao `MenuDeContas`.
  const doTrilho = items.filter((i) => !i.noMenuDeContas);
  // Índice do 1º `emBreve` — antes dele entra o separador. NÃO reordenamos
  // nada: `nav.ts` já entrega os "em breve" no fim, e ordenar aqui seria um
  // segundo dono da ordem. Se nenhum item for `emBreve`, é `-1` e o separador
  // nunca aparece (sem divisor órfão).
  const primeiroEmBreve = doTrilho.findIndex((i) => i.emBreve);

  return (
    // `w-max` para o contêiner rolável do header medir a largura real das abas
    // em vez de espremê-las (o pior caso é 8 abas em 360 px).
    //
    // `aria-label` pelo mesmo motivo do bloco `fixo` acima: três `<nav>`
    // irmãos indistinguíveis na lista de regiões.
    <nav
      aria-label="Navegação principal"
      className="flex w-max items-stretch gap-0.5"
    >
      {doTrilho.map((item, i) => (
        <Fragment key={item.href}>
          {i === primeiroEmBreve ? (
            // 🔑 Um fio de 1 px, não um rótulo "Em breve": a promessa já está
            // escrita na pílula de cada item. O que faltava era dizer que
            // dali para a direita NADA é clicável — sem a marca, o usuário
            // tenta clicar e nada acontece, que é como um item desabilitado
            // vira "o sistema travou". `aria-hidden` porque a informação, para
            // quem usa leitor de tela, já vem do `aria-disabled` de cada um.
            <span aria-hidden className="mx-1 my-2 w-px shrink-0 bg-border" />
          ) : null}
          <NavTabLink
            item={item}
            pathname={pathname}
            urlDoPainel={urlDoPainel}
          />
        </Fragment>
      ))}
    </nav>
  );
}

/**
 * A 3ª LINHA do header: as sub-abas do grupo ativo (24/09/2026).
 *
 * Desenho deliberadamente MAIS LEVE que o 1º nível — régua de 1 px (contra
 * 2 px), `corpo-sm` (13 px), sem ícone, `py-1.5`. A hierarquia entre as duas
 * linhas é de POSIÇÃO e peso, não de card ou cor: quem bate o olho tem de
 * saber, sem ler, qual linha é a de cima.
 *
 * 🔴 O MECANISMO de cada sub-aba muda conforme onde o usuário está — e é aqui
 * que mora a razão de este componente existir em vez de um `<Link>` a mais:
 *
 * | onde | sub-aba | mecanismo |
 * |---|---|---|
 * | `/admin` | com `abaDoPainel` | `<button>` + `history.replaceState` |
 * | fora de `/admin` | com `abaDoPainel` | `<Link href="/admin?aba=x">` |
 * | qualquer | sem `abaDoPainel` | `<Link>` normal |
 *
 * 🔴 **Nunca `<Link>` nem `router.replace` para o caso de cima.** `/admin` é
 * `ƒ (Dynamic)` e lê `searchParams`: qualquer navegação, mesmo "suave",
 * re-executa o Server Component inteiro — `getDashboard()` é uma RPC de ~60 ms
 * MEDIDA em 23/09 — para trocar entre conteúdos que **já estão montados na
 * página** (`AbasPainel` recebe as 4 abas por prop). Desde o Next 14.1
 * `useSearchParams()` sincroniza com `history.replaceState` nativo sem ida ao
 * servidor; é a via oficial para "estado na URL que não é navegação".
 * Ver a nota `2026-09-23 - router.replace com searchParams re-executa o
 * Server Component` e o cabeçalho de `dashboard/regua.tsx`.
 *
 * A prova de que é legítimo (a regra da nota: `grep` do parâmetro em
 * `page.tsx`): `src/app/admin/page.tsx:58` tipa `searchParams` como
 * `{ mais?: string }` e lê **só `mais`**. O servidor não conhece `aba`.
 *
 * 🔴 **Um escritor só por parâmetro.** A partir de hoje o escritor de `aba` é
 * ESTE componente; o `trocar()` de `abas-painel.tsx` foi apagado no mesmo
 * commit, e lá ficou só a LEITURA. Dois escritores com estado próprio
 * disputando a mesma chave se sobrescrevem.
 */
export function SubNavTabs({
  itens,
  grupoLabel,
  pathname,
}: {
  itens: NavItem[];
  /**
   * Rótulo do GRUPO ativo — vira o `aria-label` desta região
   * (`Seções de Parceiros`). Vem por prop porque o filho não sabe de quem é
   * filho: quem resolve o grupo ativo é `TrilhoDeNavegacao`, e recalcular
   * aqui seria uma segunda leitura de "quem está ativo" (duas respostas
   * diferentes pintariam a régua num grupo e rotulariam outro).
   */
  grupoLabel: string;
  pathname: string;
}) {
  const searchParams = useSearchParams();

  // 🔑 O caminho do painel sai do `href` do PRÓPRIO item (`/admin?aba=x` →
  // `/admin`), não de um literal `"/admin"` escrito aqui. Duas razões:
  // (1) o dono da rota é `nav.ts`, e um literal a mais neste arquivo seria uma
  // segunda fonte de verdade que ninguém atualiza junto; (2) foi o que
  // permitiu MEDIR esta tela em navegador sem credencial de admin — o harness
  // monta os mesmos componentes sob outro prefixo e o mecanismo se comporta
  // igual. Se nenhum filho tem `abaDoPainel`, `caminhoDoPainel` é `null` e
  // todos os ramos caem em `<Link>`, que é o certo.
  const caminhoDoPainel =
    itens.find((i) => i.abaDoPainel)?.href.split("?")[0] ?? null;
  const noPainel = caminhoDoPainel !== null && pathname === caminhoDoPainel;

  // Allowlist fechada, a MESMA de `estado-na-url.ts` (importada, não
  // recopiada): `?aba=qualquercoisa` cai no padrão, senão nenhuma sub-aba
  // ficaria marcada e a linha inteira pareceria desligada.
  const bruto = searchParams.get("aba");
  const abaAtual = (ABAS as readonly string[]).includes(bruto ?? "")
    ? (bruto as NonNullable<NavItem["abaDoPainel"]>)
    : ABA_PADRAO;

  function trocarAba(valor: NonNullable<NavItem["abaDoPainel"]>) {
    const sp = new URLSearchParams(searchParams.toString());
    // O padrão SAI do endereço: `/admin` limpo tem de continuar `/admin`
    // (os ~15 hrefs do dashboard e o e-2-e dependem disso).
    if (valor === ABA_PADRAO) sp.delete("aba");
    else sp.set("aba", valor);
    // 🔴 Sair da Visão geral leva o `vis` junto: `?aba=ativos&vis=atencao` é
    // estado de uma aba fora da tela, e voltaria a valer numa próxima visita
    // sem ninguém ter escolhido. (Era o que o `trocar()` de `abas-painel.tsx`
    // fazia; veio junto com a responsabilidade.)
    if (valor !== "visao") sp.delete("vis");
    // Os DEMAIS parâmetros ficam: `q`, `ordem`, `f`, `classe`, `mais` são de
    // outros donos e este escritor só passa por cima do que é dele.
    const q = sp.toString().replace(/%2C/g, ",");
    window.history.replaceState(
      null,
      "",
      `${caminhoDoPainel}${q ? `?${q}` : ""}`,
    );
  }

  return (
    // `w-max` pela mesma razão do 1º nível: o contêiner rolável precisa medir
    // a largura real das sub-abas, não espremê-las em 360 px.
    //
    // `aria-label` NOMEIA O GRUPO ("Seções de Parceiros"): esta é a 3ª de três
    // regiões de navegação na mesma tela, e é a única cujo conteúdo muda
    // conforme onde o usuário está — "navegação" sem qualificação não diria de
    // que o menu é.
    <nav
      aria-label={`Seções de ${grupoLabel}`}
      className="flex w-max items-stretch gap-0.5"
    >
      {itens.map((item) => {
        const ativa = item.abaDoPainel
          ? noPainel
            ? abaAtual === item.abaDoPainel
            : // Fora de `/admin` nenhuma sub-aba de `?aba=` está ativa: a
              // consulta não é desta rota. Quem marca é o filho sem
              // `abaDoPainel` cujo caminho casa (ex.: Clientes).
              false
          : casaSozinho(item, pathname);

        const classe = cn(
          // Régua FINA (1 px) — metade da de cima. Mesma linguagem, menos
          // peso: é a marca do 2º nível, não um segundo 1º nível.
          "foco-visivel -mb-px inline-flex shrink-0 items-center gap-1.5 border-b px-3 py-1.5 corpo-sm whitespace-nowrap transition-colors",
          ativa
            ? "border-primary font-semibold text-foreground"
            : "border-transparent text-muted-foreground hover:border-borda-forte hover:text-foreground",
          item.adminOnly && "previa-oculta",
        );

        const conteudo = (
          <>
            {item.label}
            {item.badge && item.badge > 0 ? (
              <Badge
                variant="danger"
                icone={false}
                className="h-5 px-1.5 text-[10px]"
              >
                {item.badge}
              </Badge>
            ) : null}
          </>
        );

        // 1 · Em `/admin`, sub-aba de `?aba=`: troca SEM sair da página.
        // `<button>`, não `<a>`, porque não há navegação — um `<a href>` que
        // o `preventDefault` cancela promete ao usuário um destino (abrir em
        // nova aba, copiar link) que este mecanismo não entrega.
        if (item.abaDoPainel && noPainel) {
          const aba = item.abaDoPainel;
          return (
            <button
              key={item.href}
              type="button"
              aria-current={ativa ? "page" : undefined}
              onClick={() => trocarAba(aba)}
              className={cn(classe, "cursor-pointer")}
            >
              {conteudo}
            </button>
          );
        }

        // 2 · Fora de `/admin` (ex.: `/admin/clientes`) a MESMA sub-aba é
        // navegação de verdade: a página `/admin` ainda não está montada.
        // 3 · Sub-aba sem `abaDoPainel` é sempre `<Link>`.
        //
        // 🔑 `item.href` DIRETO, sem normalizar. A sub-aba "Visão geral"
        // declara `/admin` (sem `?aba=`) em `nav.ts`, porque `visao` é
        // `ABA_PADRAO` e `/admin` limpo tem de continuar `/admin` — o e-2-e
        // `admin-visao-geral` teste 1 exige isso e `RegistrarUrlDoPainel`
        // gravaria a versão suja no `sessionStorage` do "Voltar aos
        // parceiros". Quem decide o endereço é o mapa de rotas; este
        // componente só o segue.
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={ativa ? "page" : undefined}
            // Mesmo motivo do 1º nível: as sub-abas ficam visíveis o tempo
            // todo e o Next pré-buscaria todas, rodando o proxy e a página
            // inteira em cada uma.
            prefetch={false}
            className={classe}
          >
            {conteudo}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * O trilho inteiro do header — linhas 2 e 3 (a linha 1 é marca + conta, e
 * fica em `app-header.tsx`).
 *
 * 🔑 Este componente existe para ser o ÚNICO ponto de `usePathname()` e
 * `useUrlDoPainel()` da navegação. `app-header.tsx` é Server Component: sem
 * ele, a fronteira cliente cairia em cada `NavTabs`/`SubNavTabs`, que são três
 * a quatro instâncias assinando o router separadamente e relendo o
 * `sessionStorage` do painel uma vez cada.
 *
 * A 3ª linha só existe quando o grupo ativo TEM filhos — item solto (o
 * "Fila de ligações" do operador, o parceiro inteiro) não ganha linha vazia.
 */
export function TrilhoDeNavegacao({
  items,
  fixo,
}: {
  items: NavItem[];
  fixo?: NavItem;
}) {
  const pathname = usePathname();
  // Uma leitura por montagem, para o único item que pede (`restauraPainel`).
  // Fora do painel do admin ninguém usa o valor — o hook custa um
  // `useSyncExternalStore`, e some do caminho de quem não marcou a chave.
  const urlDoPainel = useUrlDoPainel();

  // 🔑 `find`, não `filter`: se DOIS grupos casarem o `pathname` (não deveria
  // — seria erro de `nav.ts`), o PRIMEIRO vence. Duas 3ªs linhas empilhadas
  // seriam pior do que a errada: o header dobraria de altura sem aviso.
  const ativo = items.find((i) => !i.noMenuDeContas && grupoAtivo(i, pathname));
  const subItens = ativo?.filhos ?? [];

  // 🔴 A 3ª LINHA INTEIRA some na prévia "como o aluno vê" quando NADA dela
  // sobra. `previa-oculta` é `display:none` em cada `<a>`/`<button>` filho
  // (`globals.css`), mas o wrapper `border-t` continuava pintando um fio de
  // 1 px sobre uma faixa vazia — MEDIDO em `/admin/aluno/<id>/diario`, onde o
  // grupo "Acompanhamento" e os dois filhos (Diário, Resolver) são todos
  // `adminOnly`. Régua sem nada embaixo é pior que régua ausente: parece
  // seção que não carregou.
  //
  // 🔑 A condição é "o grupo é `adminOnly` OU todos os filhos são" — não "o
  // grupo é `adminOnly`" sozinho: grupo público com filhos todos só-admin
  // (que `nav.ts` pode declarar amanhã) deixaria o mesmo fio órfão. E é
  // `.every` sobre uma lista que já sabemos não-vazia (o JSX abaixo só
  // renderiza com `subItens.length > 0`), então não há o `every([]) === true`
  // escondendo a linha de um grupo sem filhos.
  const linhaSoAdmin =
    !!ativo?.adminOnly || subItens.every((f) => f.adminOnly);

  return (
    <>
      {/* Um `NavTabs` só por REGIÃO (A11Y4): antes existiam dois nós para
          as MESMAS abas — `hidden md:block` e `md:hidden` — o que duplicava
          o DOM e punha cada link duas vezes na ordem de tabulação. Aqui
          continua valendo: o trilho rola na horizontal quando não cabe
          (pior caso: 8 abas em 360 px, com fade nas bordas), e a aba FIXA
          (`fixo`) mora num `NavTabs` SEPARADO, fora do scroller — cada
          link do menu aparece exatamente uma vez no DOM, fixo ou não.

          🔑 Por que a fixa não pode viver dentro do scroller: o contêiner é
          `overflow-x-auto` e o `<nav>` interno é `w-max` — ele mede a
          largura do PRÓPRIO CONTEÚDO, não a do contêiner. Um `ml-auto` no
          último item não tem folga nenhuma para consumir ali dentro, então
          não empurra nada: foi tentado e não funcionou. A saída é a aba
          fixa morar num IRMÃO do scroller, dentro de um `flex` que os dois
          compartilham — só assim ela fica de fato fora da rolagem.

          Nenhuma media query: `flex` + `min-w-0` (o scroller cede largura)
          + `shrink-0` (o fixo nunca cede) são o mecanismo para qualquer
          largura, inclusive 360 px — MEDIDO, ver o comentário abaixo. */}
      <div className="border-t">
        <div className="mx-auto flex w-full max-w-6xl items-stretch">
          <div className="scrollbar-none fade-lateral min-w-0 flex-1 overflow-x-auto pl-4">
            <NavTabs
              items={items}
              pathname={pathname}
              urlDoPainel={urlDoPainel}
            />
          </div>
          {fixo ? (
            // 🔑 `bg-background` sólido é obrigatório, não decorativo: o
            // `<header>` é `bg-background/95 backdrop-blur` (translúcido).
            // Sem um fundo OPACO próprio aqui, o momentum scroll do
            // Safari/iOS deixa o conteúdo do trilho (que continua rolando
            // por baixo, fora da viewport visível) aparecer por
            // transparência atrás da aba fixa por uma fração de segundo.
            //
            // ✅ MEDIDO em 15/09/2026, no Chrome, com o CSS compilado de
            // produção e as 9 abas reais do parceiro, em SEIS larguras
            // (320/360/390/414/768/1366), sempre com o trilho **rolado
            // até o fim** — o pior caso:
            //
            //   largura  aba fixa   % da tela   trilho rola   sobrepõe?
            //     320     116,9 px    38,3%         sim          NÃO
            //     360     116,9 px    33,9%         sim          NÃO
            //     390     116,9 px    31,2%         sim          NÃO
            //     414     116,9 px    29,3%         sim          NÃO
            //     768     116,9 px    15,5%         sim          NÃO
            //    1366     116,9 px     8,7%         NÃO          NÃO
            //
            // Em todas: aba fixa inteira dentro da viewport, ZERO overflow
            // horizontal na página, rótulo "Tutoriais" visível (nunca só
            // ícone) e header estável em 98,2 px. Em 1366 o trilho para de
            // rolar e a aba fica colada à direita com o divisor — que é o
            // desenho pedido. Em 360 sobram 227,9 px de trilho rolável.
            //
            // ⚠️ O que a medição NÃO cobre: o momentum scroll do iOS
            // Safari (medido no Chrome desktop, que não o reproduz). O
            // `bg-background` é a defesa, mas só um aparelho iOS fecha
            // essa ponta.
            //
            // ⚠️ 24/09/2026: a medição acima é de DUAS linhas. Com a 3ª
            // linha (grupo com filhos) o header cresce — a altura nova está
            // medida no relatório do dia; a geometria HORIZONTAL (aba fixa
            // inteira, zero overflow) foi remedida e continua valendo.
            //
            // `border-l` some junto quando `fixo` é `undefined`
            // (interruptor desligado): não há divisor órfão — garantia de
            // JSX (renderização condicional), não depende de medição.
            <div className="flex shrink-0 items-stretch border-l bg-background pr-4 pl-1">
              <NavTabs
                items={[]}
                fixo={fixo}
                pathname={pathname}
                urlDoPainel={urlDoPainel}
              />
            </div>
          ) : null}
        </div>
      </div>

      {subItens.length > 0 ? (
        // 3ª linha: mesmo `max-w-6xl` e mesmo `pl-4` das de cima, para as
        // três alinharem na mesma sarjeta esquerda. Sem aba fixa aqui — o
        // 2º nível é curto por construção (2 a 5 itens).
        <div className={cn("border-t", linhaSoAdmin && "previa-oculta")}>
          <div className="mx-auto w-full max-w-6xl">
            <div className="scrollbar-none fade-lateral overflow-x-auto pl-4">
              <SubNavTabs
                itens={subItens}
                grupoLabel={ativo?.label ?? ""}
                pathname={pathname}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
